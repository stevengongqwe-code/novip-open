/**
 * 班费账本与公示 · 核心单测（Factory Day 7，2026-11-02）。
 * 覆盖金额解析、名单校验、日期校验、台账汇总恒等式、欠费口径、
 * 公示文本与 CSV；全部断言整数分总和恒等，不做浮点分布断言。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tools, currentPage, SYSTEM_TOOL_IDS, PUBLIC_TOOL_COUNT } from '../src/tools/registry';
import { pageSeo, toolNotes } from '../src/seo';
import {
  computeDues,
  computeFundSummary,
  csvDateSuffix,
  formatCents,
  fundStatementToText,
  fundToCsv,
  parseAmountToCents,
  parseDate,
  parseMembers,
  parseZeroOrPositiveCents,
  todayLocal,
  type FundEntry,
} from '../src/tools/class-fund-core';

const SAMPLE_ENTRIES: FundEntry[] = [
  { date: '2026-10-10', kind: 'income', category: '班费', title: '本学期班费', amountCents: 25000 },
  { date: '2026-10-15', kind: 'expense', category: '打印资料', title: '打印复习资料', amountCents: 6850 },
  { date: '2026-10-20', kind: 'expense', category: '团建活动', title: '团建零食', amountCents: 13200 },
];
const SAMPLE_MEMBERS = ['陈晨', '林晓', '王磊', '赵雨', '刘洋', '孙悦'];
const SAMPLE_PAID = ['陈晨', '林晓', '王磊', '赵雨', '刘洋'];

describe('金额解析', () => {
  it('整数与 2 位小数转分', () => {
    assert.equal(parseAmountToCents('50'), 5000);
    assert.equal(parseAmountToCents('68.50'), 6850);
    assert.equal(parseAmountToCents('¥1,234.56'), 123456);
    assert.equal(parseAmountToCents('0.01'), 1);
  });
  it('非法金额一律报错', () => {
    for (const bad of ['', 'abc', '-5', '12.345', '0', '0.00', '12..5']) {
      assert.throws(() => parseAmountToCents(bad), /金额/);
    }
  });
  it('可为 0 的金额：空串为 0，负数报错', () => {
    assert.equal(parseZeroOrPositiveCents(''), 0);
    assert.equal(parseZeroOrPositiveCents('120'), 12000);
    assert.equal(parseZeroOrPositiveCents('0.00'), 0);
    assert.throws(() => parseZeroOrPositiveCents('-5'), /金额/);
  });
});

describe('名单与日期校验', () => {
  it('按换行/逗号/分号/顿号切分', () => {
    assert.deepEqual(parseMembers('陈晨\n林晓,王磊；赵雨、刘洋'), ['陈晨', '林晓', '王磊', '赵雨', '刘洋']);
  });
  it('少于 2 人或重名报错', () => {
    assert.throws(() => parseMembers('陈晨'), /至少需要 2 人/);
    assert.throws(() => parseMembers('陈晨\n林晓\n陈晨'), /人名重复/);
  });
  it('日期：合法通过，不存在与错格式报错', () => {
    assert.equal(parseDate('2026-10-20'), '2026-10-20');
    assert.throws(() => parseDate('2026-02-30'), /不存在/);
    assert.throws(() => parseDate('2026/10/20'), /格式不对/);
    assert.throws(() => parseDate(''), /格式不对/);
  });
  it('今天与 CSV 日期后缀格式', () => {
    assert.match(todayLocal(new Date(2026, 9, 20)), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(csvDateSuffix(new Date(2026, 9, 20)), '20261020');
  });
});

describe('台账汇总恒等式（示例账本）', () => {
  it('收入 250.00、支出 200.50、结余 169.50 = 120 + 250 − 200.50', () => {
    const s = computeFundSummary(SAMPLE_ENTRIES, 12000);
    assert.equal(s.incomeCents, 25000);
    assert.equal(s.expenseCents, 20050);
    assert.equal(s.balanceCents, 16950);
    assert.equal(s.balanceCents, 12000 + s.incomeCents - s.expenseCents);
    assert.deepEqual(s.expenseByCategory, [
      { category: '团建活动', cents: 13200 },
      { category: '打印资料', cents: 6850 },
    ]);
  });
  it('空账本：结余等于期初结余', () => {
    const s = computeFundSummary([], 12000);
    assert.deepEqual([s.incomeCents, s.expenseCents, s.balanceCents], [0, 0, 12000]);
  });
  it('非法流水不汇总：空标题、非法日期、非正金额', () => {
    assert.throws(() => computeFundSummary([{ date: '2026-10-20', kind: 'expense', category: '其他', title: ' ', amountCents: 100 }], 0), /标题/);
    assert.throws(() => computeFundSummary([{ date: '2026-02-30', kind: 'expense', category: '其他', title: 'x', amountCents: 100 }], 0), /不存在/);
    assert.throws(() => computeFundSummary([{ date: '2026-10-20', kind: 'expense', category: '其他', title: 'x', amountCents: 0 }], 0), /大于 0/);
    assert.throws(() => computeFundSummary([], -1), /不能为负数/);
  });
});

describe('欠费口径', () => {
  it('示例：应收 300、已交 250、未交孙悦 50', () => {
    const d = computeDues(SAMPLE_MEMBERS, 5000, SAMPLE_PAID);
    assert.equal(d.expectedCents, 30000);
    assert.equal(d.collectedCents, 25000);
    assert.deepEqual(d.unpaid, ['孙悦']);
    assert.equal(d.unpaidCents, 5000);
  });
  it('标准为 0：不设欠费，应收/未交均为 0', () => {
    const d = computeDues(SAMPLE_MEMBERS, 0, SAMPLE_PAID);
    assert.deepEqual([d.expectedCents, d.collectedCents, d.unpaidCents], [0, 0, 0]);
    assert.deepEqual(d.unpaid, []);
  });
  it('全部交齐：未交为空；已交含名单外成员报错', () => {
    assert.deepEqual(computeDues(SAMPLE_MEMBERS, 5000, SAMPLE_MEMBERS).unpaid, []);
    assert.throws(() => computeDues(SAMPLE_MEMBERS, 5000, ['陈晨', '外人']), /不在成员名单/);
  });
});

describe('公示文本与 CSV', () => {
  const summary = computeFundSummary(SAMPLE_ENTRIES, 12000);
  const dues = computeDues(SAMPLE_MEMBERS, 5000, SAMPLE_PAID);
  it('公示文本含四数、欠费与分类支出', () => {
    const text = fundStatementToText({
      className: '高数 2 班',
      asOfDate: '2026-10-20',
      openingCents: 12000,
      summary,
      dues,
      standardCents: 5000,
      membersCount: 6,
      entries: SAMPLE_ENTRIES,
    });
    for (const needle of ['高数 2 班班费公示', '¥120.00', '¥250.00', '¥200.50', '¥169.50', '孙悦', '¥50.00', '打印资料 ¥68.50', '团建活动 ¥132.00', '2026-10-10']) {
      assert.ok(text.includes(needle), `公示文本缺：${needle}`);
    }
  });
  it('CSV 含表头、三笔流水与欠费行', () => {
    const csv = fundToCsv(SAMPLE_ENTRIES, dues, 5000);
    assert.ok(csv.includes('日期'));
    assert.ok(csv.includes('本学期班费'));
    assert.ok(csv.includes('打印复习资料'));
    assert.ok(csv.includes('孙悦'));
    assert.ok(csv.includes('50.00'));
  });
});

describe('注册与 SEO 接线', () => {
  it('registry 含 class-fund，路由解析正确', () => {
    assert.equal(tools.length, PUBLIC_TOOL_COUNT + SYSTEM_TOOL_IDS.length);
    assert.ok(tools.some((t) => t.id === 'class-fund' && t.path === '/tools/class-fund'));
    assert.equal(currentPage('/tools/class-fund', ''), 'class-fund');
    assert.equal(currentPage('/tools/class-fund/', ''), 'class-fund');
  });
  it('pageSeo 与 toolNotes 含 class-fund', () => {
    const seo = pageSeo('class-fund');
    assert.equal(seo.title, '班费账本与公示（收支流水·结余·欠费名单·一键公示文本·纯本地）｜NOVIP 大学生工具');
    assert.ok(seo.description.includes('欠费名单'));
    assert.ok((toolNotes['class-fund'] ?? '').includes('欠费名单'));
    assert.equal(formatCents(16950), '¥169.50');
  });
});
