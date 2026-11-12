import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBracket,
  calcMonthly,
  calcSettlement,
  generalWithholding,
  laborIncomeAmount,
  monthlyToCsv,
  monthlyToText,
  parseMonthly,
  settlementToText,
  LABOR_BRACKETS_3,
  WITHHOLDING_BRACKETS_7,
  SAMPLE_HIGH_TEXT,
  SAMPLE_SUMMER_TEXT,
  SAMPLE_XIAOZHANG_TEXT,
} from '../src/tools/internship-tax-core';
import { tools, currentPage, SYSTEM_TOOL_IDS, PUBLIC_TOOL_COUNT } from '../src/tools/registry';

test('个税：一般按次法官方示例（5000→800/4200；4000→640/3360；30000→5200/24800）', () => {
  assert.equal(generalWithholding(5000), 800);
  assert.equal(generalWithholding(4000), 640);
  assert.equal(generalWithholding(30000), 5200);
  assert.equal(generalWithholding(10000), 1600);
  assert.equal(generalWithholding(800), 0);
  assert.equal(generalWithholding(50000), 10000);
});

test('个税：收入额口径（≤4000 减 800；>4000 减 20%；恰 20000 仍为 20% 档）', () => {
  assert.equal(laborIncomeAmount(4000), 3200);
  assert.equal(laborIncomeAmount(4001), 3200.8);
  assert.equal(laborIncomeAmount(800), 0);
  assert.equal(generalWithholding(25000), 4000);
  assert.equal(generalWithholding(25001), 4000.24);
});

test('个税：PRD 锁定小张示例（8 月 8000：累计法 42，一般法 1280）', () => {
  const r = calcMonthly(parseMonthly(SAMPLE_XIAOZHANG_TEXT));
  assert.equal(r.count, 1);
  assert.equal(r.rows[0].cumulativeTax, 42);
  assert.equal(r.rows[0].cumulativeNet, 7958);
  assert.equal(r.rows[0].generalTax, 1280);
  assert.equal(r.rows[0].generalNet, 6720);
  assert.equal(r.rows[0].saved, 1238);
  assert.equal(r.cumulativeTotal, 42);
  assert.equal(r.generalTotal, 1280);
  assert.equal(r.savedTotal, 1238);
});

test('个税：PRD 锁定小张 7 月 3000（累计法收入额 2400 − 减除 5000 → 预扣 0）', () => {
  const r = calcMonthly(parseMonthly('7月 3000'));
  assert.equal(r.rows[0].cumulativeTax, 0);
  assert.equal(r.rows[0].generalTax, 440);
  assert.equal(r.rows[0].saved, 440);
});

test('个税：PRD 锁定暑期 3 个月每月 8000（累计法每月 42，合计 126）', () => {
  const r = calcMonthly(parseMonthly(SAMPLE_SUMMER_TEXT));
  assert.deepEqual(r.rows.map((x) => x.cumulativeTax), [42, 42, 42]);
  assert.equal(r.cumulativeTotal, 126);
  assert.equal(r.generalTotal, 3840);
  assert.equal(r.savedTotal, 3714);
  assert.equal(r.grossTotal, 24000);
});

test('个税：PRD 锁定高报酬 50000 × 2 个月（累计法 1050、3430，合计 4480，跨档）', () => {
  const r = calcMonthly(parseMonthly(SAMPLE_HIGH_TEXT));
  assert.deepEqual(r.rows.map((x) => x.cumulativeTax), [1050, 3430]);
  assert.equal(r.cumulativeTotal, 4480);
  assert.equal(r.generalTotal, 20000);
  assert.equal(r.savedTotal, 15520);
});

test('个税：七级表档位边界（36000→3% 计 1080；36001 跨入 10% 档）', () => {
  assert.equal(applyBracket(36000, WITHHOLDING_BRACKETS_7), 1080);
  assert.equal(applyBracket(36001, WITHHOLDING_BRACKETS_7), 1080.1);
  assert.equal(applyBracket(0, WITHHOLDING_BRACKETS_7), 0);
  assert.equal(applyBracket(-5, WITHHOLDING_BRACKETS_7), 0);
  assert.equal(applyBracket(20000, LABOR_BRACKETS_3), 4000);
});

test('个税：年度汇算——单笔 50000（全年应纳税 0，一般法已预扣 10000 → 应退 10000）', () => {
  const monthly = calcMonthly(parseMonthly('8月 50000'));
  const s = calcSettlement({
    laborGrossTotal: monthly.grossTotal,
    otherIncomeAmount: 0,
    specialDeduction: 0,
    specialAdditionalDeduction: 0,
    otherDeduction: 0,
    withheldCumulative: monthly.cumulativeTotal,
    withheldGeneral: monthly.generalTotal,
  });
  assert.equal(s.totalIncomeAmount, 40000);
  assert.equal(s.taxable, 0);
  assert.equal(s.annualTax, 0);
  assert.equal(s.refundCumulative, 1050);
  assert.equal(s.refundGeneral, 10000);
});

test('个税：年度汇算——8000 × 12 个月（全年应纳税 504，累计法已预扣 504 → 应退 0）', () => {
  const text = Array.from({ length: 12 }, (_, i) => `${i + 1}月 8000`).join('\n');
  const monthly = calcMonthly(parseMonthly(text));
  const s = calcSettlement({
    laborGrossTotal: monthly.grossTotal,
    otherIncomeAmount: 0,
    specialDeduction: 0,
    specialAdditionalDeduction: 0,
    otherDeduction: 0,
    withheldCumulative: monthly.cumulativeTotal,
    withheldGeneral: monthly.generalTotal,
  });
  assert.equal(s.totalIncomeAmount, 76800);
  assert.equal(s.taxable, 16800);
  assert.equal(s.annualTax, 504);
  assert.equal(s.refundCumulative, 0);
  assert.equal(s.refundGeneral, 14856);
});

test('个税：年度汇算——含其他综合所得与专项附加扣除（应补为负数表示）', () => {
  const s = calcSettlement({
    laborGrossTotal: 96000,
    otherIncomeAmount: 60000,
    specialDeduction: 0,
    specialAdditionalDeduction: 12000,
    otherDeduction: 0,
    withheldCumulative: 504,
    withheldGeneral: 15360,
  });
  // 全年收入额 76800 + 60000 = 136800；应纳税所得额 136800 − 60000 − 12000 = 64800；
  // 七级表：64800 × 10% − 2520 = 3960。
  assert.equal(s.totalIncomeAmount, 136800);
  assert.equal(s.taxable, 64800);
  assert.equal(s.annualTax, 3960);
  assert.equal(s.refundCumulative, -3456);
  assert.equal(s.refundGeneral, 11400);
});

test('个税：粘贴解析（只填金额自动编月；行格式错误定位到行；负数与超限报错）', () => {
  assert.deepEqual(parseMonthly('8000\n9000').map((x) => [x.label, x.gross]), [
    ['第1个月', 8000],
    ['第2个月', 9000],
  ]);
  assert.throws(() => parseMonthly('8月 8000 9000'), /第 1 行格式不对/);
  assert.throws(() => parseMonthly('8月 abc'), /第 1 行金额不是数字/);
  assert.throws(() => parseMonthly('8月 -100'), /税前收入须为/);
  assert.throws(() => parseMonthly(''), /请至少填一个月/);
  assert.throws(() => calcMonthly([]), /请至少填一个月/);
});

test('个税：结果文本与 CSV 含两种口径合计与少扣数', () => {
  const r = calcMonthly(parseMonthly(SAMPLE_XIAOZHANG_TEXT));
  const text = monthlyToText(r);
  assert.match(text, /累计预扣法（学生实习）：预扣合计 42\.00 元/);
  assert.match(text, /一般按次法：预扣合计 1280\.00 元/);
  assert.match(text, /累计法比一般法少扣 1238\.00 元/);
  const csv = monthlyToCsv(r);
  assert.match(csv, /"8月","8000\.00","42\.00","7958\.00","1280\.00","6720\.00","1238\.00"/);
  assert.match(csv, /"合计","8000\.00","42\.00","7958\.00","1280\.00","6720\.00","1238\.00"/);
  const s = calcSettlement({
    laborGrossTotal: 8000,
    otherIncomeAmount: 0,
    specialDeduction: 0,
    specialAdditionalDeduction: 0,
    otherDeduction: 0,
    withheldCumulative: 42,
    withheldGeneral: 1280,
  });
  assert.match(settlementToText(s, r), /全年应纳税额：0\.00 元/);
  assert.match(settlementToText(s, r), /应退 42\.00 元/);
});

test('个税：注册与 SEO 接线', () => {
  assert.equal(tools.length, PUBLIC_TOOL_COUNT + SYSTEM_TOOL_IDS.length);
  const tool = tools.find((t) => t.id === 'internship-tax');
  assert.ok(tool);
  assert.equal(tool?.path, '/tools/internship-tax');
  assert.equal(tool?.group, '实用计算');
  assert.equal(currentPage('/tools/internship-tax', ''), 'internship-tax');
  assert.equal(currentPage('/tools/internship-tax/', ''), 'internship-tax');
});
