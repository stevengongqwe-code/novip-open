// 房贷与利息计算器 · 核心逻辑测试
// 运行：node --import tsx --test tests/finance.test.ts
//
// 覆盖重点：
//  1) 金额以「分」精确换算与格式化；
//  2) 已知样例（100 万 / 4.9% / 30 年，等额本息月供 5307.27 元）复核；
//  3) 两种独立算法互证：闭式公式（核心实现 A）、逐月余额模拟（核心实现 B）、
//     以及本测试文件内另行编写的浮点参考实现（第三方对照）；
//  4) 恒等式：总还款 = 本金 + 总利息；等额本金本金合计 = 贷款额；末期余额 = 0；
//  5) 边界：0 利率、1 期、期限 40 年、利率 24%；
//  6) 提前还款（每月额外还款）与主算法一致、单调性；
//  7) 单利 / 复利已知样例与频率次序；
//  8) 非法输入拒绝（中文错误）、CSV、复制文案；
//  9) 隐私与确定性：核心与 UI 均无网络/存储调用。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMOUNT_UNIT_LABELS,
  COMPOUND_FREQUENCY_DIVISORS,
  DEFAULT_INTEREST_FORM,
  DEFAULT_MORTGAGE_FORM,
  INTEREST_FORMULAS,
  MAX_ANNUAL_RATE_PERCENT,
  MAX_TERM_YEARS,
  MORTGAGE_FORMULAS,
  calculateInterest,
  calculateMortgage,
  centsToAmountText,
  closedFormEqualPaymentTotalInterestCents,
  closedFormEqualPrincipalTotalInterestCents,
  buildAmortizationSchedule,
  equalPaymentMonthlyPaymentCents,
  formatCents,
  formatCentsPlain,
  formatPercentValue,
  formatPeriodsAsTerm,
  interestSummaryText,
  monthlyRateFromAnnual,
  mortgageScheduleCsv,
  mortgageSummaryText,
  parseAmountToCents,
  periodsFromTermYears,
  validateInterestForm,
  validateMortgageForm,
  type CompoundFrequency,
  type InterestParams,
  type MortgageFormValues,
  type MortgageParams,
  type RepaymentMethod,
} from '../src/tools/finance-core.ts';

// ---------------------------------------------------------------------------
// 本测试文件内的独立浮点参考实现（单位：元），用于与核心的「分」整数实现互证。
// 故意不调用核心的任何计算函数，避免自证。
// ---------------------------------------------------------------------------

function refMonthlyPaymentYuan(principalYuan: number, annualRatePercent: number, periods: number): number {
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return principalYuan / periods;
  const factor = Math.pow(1 + r, periods);
  return (principalYuan * r * factor) / (factor - 1);
}

function refEqualPaymentTotalInterestYuan(principalYuan: number, annualRatePercent: number, periods: number): number {
  return refMonthlyPaymentYuan(principalYuan, annualRatePercent, periods) * periods - principalYuan;
}

function refEqualPaymentSimulationYuan(
  principalYuan: number,
  annualRatePercent: number,
  periods: number,
): { totalInterestYuan: number; rows: number; endBalanceYuan: number } {
  const r = annualRatePercent / 100 / 12;
  const payment = refMonthlyPaymentYuan(principalYuan, annualRatePercent, periods);
  let balance = principalYuan;
  let totalInterestYuan = 0;
  let rows = 0;
  for (let k = 0; k < periods && balance > 1e-9; k += 1) {
    const interest = balance * r;
    totalInterestYuan += interest;
    balance = Math.max(0, balance - Math.min(payment - interest, balance));
    rows += 1;
  }
  return { totalInterestYuan, rows, endBalanceYuan: balance };
}

function refEqualPrincipalTotalInterestYuan(principalYuan: number, annualRatePercent: number, periods: number): number {
  const r = annualRatePercent / 100 / 12;
  return (principalYuan * r * (periods + 1)) / 2;
}

/** 断言两个数字在容差内相等（单位：分） */
function nearCents(actual: number, expected: number, toleranceCents: number, label: string): void {
  assert.ok(
    Math.abs(actual - expected) <= toleranceCents,
    `${label}：实际 ${actual} 分，参考 ${expected.toFixed(4)} 分，容差 ${toleranceCents} 分`,
  );
}

/** 断言两个数字在容差内相等（单位：元） */
function nearYuan(actual: number, expected: number, toleranceYuan: number, label: string): void {
  assert.ok(
    Math.abs(actual - expected) <= toleranceYuan,
    `${label}：实际 ${actual.toFixed(4)} 元，参考 ${expected} 元，容差 ${toleranceYuan} 元`,
  );
}

const mortgageCases: { label: string; principalYuan: number; annualRatePercent: number; termYears: number }[] = [
  { label: '100 万 / 4.9% / 30 年', principalYuan: 1_000_000, annualRatePercent: 4.9, termYears: 30 },
  { label: '50 万 / 3.85% / 20 年', principalYuan: 500_000, annualRatePercent: 3.85, termYears: 20 },
  { label: '12.345678 万 / 5.5% / 10 年', principalYuan: 123_456.78, annualRatePercent: 5.5, termYears: 10 },
  { label: '1 万 / 0% / 1 年', principalYuan: 10_000, annualRatePercent: 0, termYears: 1 },
  { label: '3000 万 / 6.2% / 40 年', principalYuan: 30_000_000, annualRatePercent: 6.2, termYears: 40 },
];

const methodCases: RepaymentMethod[] = ['equal-payment', 'equal-principal'];

// ===========================================================================
// 1. 金额解析（分单位）
// ===========================================================================
describe('金额解析与格式化（分）', () => {
  it('万元换算为分：100 万 = 100000000 分', () => {
    assert.equal(parseAmountToCents('100', 'wan'), 100_000_000);
    assert.equal(parseAmountToCents('100.5', 'wan'), 100_500_000);
    assert.equal(parseAmountToCents('0.000001', 'wan'), 1);
  });

  it('元换算为分：支持千分位、小数与单位后缀', () => {
    assert.equal(parseAmountToCents('5,307.27元', 'yuan'), 530_727);
    assert.equal(parseAmountToCents('1，000，000', 'yuan'), 100_000_000);
    assert.equal(parseAmountToCents('100.005', 'yuan'), 10_001); // 第三位小数四舍五入
    assert.equal(parseAmountToCents('0.01', 'yuan'), 1);
  });

  it('元 / 万元切换时金额文本可无损往返', () => {
    const samples = [1, 99, 100, 530_727, 100_000_000, 123_456_789];
    for (const cents of samples) {
      for (const unit of ['yuan', 'wan'] as const) {
        const text = centsToAmountText(cents, unit);
        assert.equal(parseAmountToCents(text, unit), cents, `${cents} 分经 ${AMOUNT_UNIT_LABELS[unit]} 往返失败：${text}`);
      }
    }
    assert.equal(centsToAmountText(100_000_000, 'wan'), '100');
    assert.equal(centsToAmountText(530_727, 'yuan'), '5307.27');
  });

  it('分格式化为元字符串（展示用千分位、CSV 用纯数字）', () => {
    assert.equal(formatCents(530_727), '5,307.27');
    assert.equal(formatCents(0), '0.00');
    assert.equal(formatCents(100_000_000), '1,000,000.00');
    assert.equal(formatCentsPlain(530_727), '5307.27');
    assert.equal(formatCentsPlain(100_000_000), '1000000.00');
  });

  it('非法金额抛出中文错误', () => {
    assert.throws(() => parseAmountToCents('', 'yuan'), /请输入金额/);
    assert.throws(() => parseAmountToCents('abc', 'yuan'), /数字/);
    assert.throws(() => parseAmountToCents('-5', 'yuan'), /必须大于 0/);
    assert.throws(() => parseAmountToCents('1.2.3', 'yuan'), /数字/);
  });

  it('利率与期限格式化、月利率换算', () => {
    assert.equal(formatPercentValue(4.9), '4.9');
    assert.equal(formatPercentValue(24), '24');
    assert.equal(formatPeriodsAsTerm(360), '30 年');
    assert.equal(formatPeriodsAsTerm(366), '30 年 6 个月');
    assert.equal(monthlyRateFromAnnual(4.9), 4.9 / 100 / 12);
    assert.equal(periodsFromTermYears(30), 360);
    assert.equal(periodsFromTermYears(30.5), 366);
  });
});

// ===========================================================================
// 2. 已知样例复核
// ===========================================================================
describe('已知样例：100 万 / 4.9% / 30 年', () => {
  const principalYuan = 1_000_000;
  const periods = 360;
  const base: MortgageParams = { principalCents: 100_000_000, annualRatePercent: 4.9, termYears: 30, method: 'equal-payment' };

  it('等额本息月供约 5307.27 元（±0.02 元）', () => {
    const result = calculateMortgage(base);
    assert.equal(result.monthlyPaymentCents, 530_727);
    nearYuan(result.monthlyPaymentCents! / 100, 5307.27, 0.02, '月供');
    // 测试内独立公式复核同一已知样例
    nearYuan(refMonthlyPaymentYuan(principalYuan, 4.9, periods), 5307.27, 0.02, '独立公式月供');
  });

  it('等额本息总利息约 910616.19 元（闭式公式 ±0.02 元）', () => {
    const closedForm = closedFormEqualPaymentTotalInterestCents(100_000_000, 4.9, periods);
    nearYuan(closedForm / 100, 910_616.19, 0.02, '闭式总利息');
    nearYuan(refEqualPaymentTotalInterestYuan(principalYuan, 4.9, periods), 910_616.19, 0.02, '独立公式总利息');
    // 逐月模拟因「月供四舍五入到分 + 每期利息四舍五入到分」与闭式有 ≤ 每期 1 分的偏差
    const result = calculateMortgage(base);
    nearYuan(result.totalInterestCents / 100, 910_616.19, 2, '逐月模拟总利息');
    assert.equal(result.schedule.length, periods);
    assert.equal(result.schedule[periods - 1].balanceCents, 0);
  });

  it('等额本金首月月供 6861.11 元、总利息约 737041.67 元', () => {
    const result = calculateMortgage({ ...base, method: 'equal-principal' });
    assert.equal(result.monthlyPaymentCents, null);
    assert.equal(result.monthlyPrincipalCents, 277_778);
    assert.equal(result.firstPaymentCents, 686_111);
    nearYuan(result.firstPaymentCents / 100, 6861.11, 0.02, '首月月供');
    const closedForm = closedFormEqualPrincipalTotalInterestCents(100_000_000, 4.9, periods);
    nearYuan(closedForm / 100, 737_041.67, 0.02, '闭式总利息');
    nearYuan(result.totalInterestCents / 100, 737_041.67, 2, '逐月模拟总利息');
    assert.ok(result.lastPaymentCents < result.firstPaymentCents, '等额本金月供应逐月递减');
    assert.equal(result.schedule.length, periods);
    assert.equal(result.totalPrincipalCents, 100_000_000);
  });
});

// ===========================================================================
// 3. 两种独立算法互证
// ===========================================================================
describe('两种独立算法互证（闭式公式 × 逐月模拟 × 测试内浮点参考）', () => {
  for (const c of mortgageCases) {
    const principalCents = Math.round(c.principalYuan * 100);
    const periods = periodsFromTermYears(c.termYears);
    it(`等额本息：${c.label}`, () => {
      const result = calculateMortgage({
        principalCents,
        annualRatePercent: c.annualRatePercent,
        termYears: c.termYears,
        method: 'equal-payment',
      });
      // 核心闭式公式（实现 A）与核心逐月模拟（实现 B）互证：容许每期 ≤1 分的舍入累积
      const closedForm = closedFormEqualPaymentTotalInterestCents(principalCents, c.annualRatePercent, periods);
      nearCents(result.totalInterestCents, closedForm, periods, '闭式 vs 模拟总利息');
      // 测试内独立浮点模拟（第三方）与核心逐月模拟互证
      const ref = refEqualPaymentSimulationYuan(c.principalYuan, c.annualRatePercent, periods);
      nearCents(result.totalInterestCents, ref.totalInterestYuan * 100, periods, '浮点模拟 vs 分模拟总利息');
      // 月供：核心按分取整，与独立公式应相差不超过 1 分
      nearCents(result.monthlyPaymentCents!, refMonthlyPaymentYuan(c.principalYuan, c.annualRatePercent, periods) * 100, 1, '月供');
      assert.equal(result.schedule.length, periods, '无额外还款时应正好还满期数');
    });

    it(`等额本金：${c.label}`, () => {
      const result = calculateMortgage({
        principalCents,
        annualRatePercent: c.annualRatePercent,
        termYears: c.termYears,
        method: 'equal-principal',
      });
      const closedForm = closedFormEqualPrincipalTotalInterestCents(principalCents, c.annualRatePercent, periods);
      // 每期本金四舍五入到分，累积偏差 ≤ 2 分/期
      nearCents(result.totalInterestCents, closedForm, periods * 2, '闭式 vs 模拟总利息');
      nearCents(result.totalInterestCents, refEqualPrincipalTotalInterestYuan(c.principalYuan, c.annualRatePercent, periods) * 100, periods * 2, '浮点公式 vs 分模拟总利息');
      assert.equal(result.totalPrincipalCents, principalCents, '等额本金本金合计必须等于贷款额');
      assert.equal(result.schedule.length, periods);
    });
  }

  it('高利率长周期（24% / 40 年）舍入放大仍在相对 1e-4 内', () => {
    const result = calculateMortgage({ principalCents: 100_000_000, annualRatePercent: 24, termYears: 40, method: 'equal-payment' });
    const closedForm = closedFormEqualPaymentTotalInterestCents(100_000_000, 24, 480);
    assert.ok(
      Math.abs(result.totalInterestCents - closedForm) / closedForm < 1e-4,
      `相对偏差过大：${Math.abs(result.totalInterestCents - closedForm) / closedForm}`,
    );
    assert.equal(result.schedule.length, 480);
    assert.equal(result.schedule[479].balanceCents, 0);
  });

  it('等额本息第 n 期后余额≈0（不依赖最后一期强制清零的独立复核）', () => {
    for (const c of mortgageCases) {
      const principalCents = Math.round(c.principalYuan * 100);
      const periods = periodsFromTermYears(c.termYears);
      const monthlyPayment = equalPaymentMonthlyPaymentCents(principalCents, c.annualRatePercent, periods);
      const r = monthlyRateFromAnnual(c.annualRatePercent);
      let balance = principalCents;
      for (let k = 0; k < periods; k += 1) balance = balance * (1 + r) - monthlyPayment;
      // 已取整的月供在第 n 期后仅余极小的舍入残差（按 40 年上限 ≤ 1 元量级）
      assert.ok(Math.abs(balance) <= 500, `${c.label} 末期残差 ${balance} 分过大`);
    }
  });
});

// ===========================================================================
// 4. 恒等式、还款表与 CSV
// ===========================================================================
describe('恒等式、还款表与 CSV', () => {
  for (const c of mortgageCases) {
    const principalCents = Math.round(c.principalYuan * 100);
    for (const method of methodCases) {
      it(`${c.label} · ${method}：总还款 = 本金 + 总利息，末期余额 0`, () => {
        const result = calculateMortgage({ principalCents, annualRatePercent: c.annualRatePercent, termYears: c.termYears, method });
        assert.equal(result.totalPaymentCents, result.principalCents + result.totalInterestCents);
        assert.equal(result.totalPrincipalCents, principalCents);
        assert.equal(result.schedule[result.schedule.length - 1].balanceCents, 0);
        assert.equal(result.firstPaymentCents, result.schedule[0].paymentCents);
        assert.equal(result.lastPaymentCents, result.schedule[result.schedule.length - 1].paymentCents);
        // 每期：月供 = 本金 + 利息；剩余本金单调不增
        let previousBalance = principalCents;
        for (const row of result.schedule) {
          assert.equal(row.paymentCents, row.principalCents + row.interestCents);
          assert.ok(row.balanceCents <= previousBalance);
          previousBalance = row.balanceCents;
        }
        // 利息占比定义
        assert.ok(Math.abs(result.interestRatio - result.totalInterestCents / result.totalPaymentCents) < 1e-12);
        assert.ok(result.interestRatio >= 0 && result.interestRatio < 1);
      });
    }
  }

  it('CSV：表头 + 全部期数，5 列，末期剩余本金为 0.00', () => {
    const result = calculateMortgage({ principalCents: 100_000_000, annualRatePercent: 4.9, termYears: 30, method: 'equal-payment' });
    const csv = mortgageScheduleCsv(result);
    const lines = csv.split('\n');
    assert.equal(lines.length, result.periods + 1);
    assert.equal(lines[0], '期数,月供（元）,本金（元）,利息（元）,剩余本金（元）');
    for (const line of lines.slice(1)) {
      const cells = line.split(',');
      assert.equal(cells.length, 5, `列数异常：${line}`);
      assert.ok(/^\d+$/.test(cells[0]), `期数异常：${cells[0]}`);
      for (const cell of cells.slice(1)) assert.match(cell, /^\d+\.\d{2}$/);
    }
    assert.ok(lines[lines.length - 1].endsWith(',0.00'));
    // 首期月供与结果一致
    const firstCells = lines[1].split(',');
    assert.equal(firstCells[1], formatCentsPlain(result.firstPaymentCents));
  });
});

// ===========================================================================
// 5. 边界：0 利率与 1 期
// ===========================================================================
describe('边界：零利率与 1 期', () => {
  it('0 利率等额本息：利息为 0，总还款 = 本金', () => {
    const result = calculateMortgage({ principalCents: 120_000, annualRatePercent: 0, termYears: 1, method: 'equal-payment' });
    assert.equal(result.monthlyPaymentCents, 10_000);
    assert.equal(result.totalInterestCents, 0);
    assert.equal(result.totalPaymentCents, 120_000);
    assert.equal(result.schedule.length, 12);
    assert.ok(result.schedule.every((row) => row.interestCents === 0));
  });

  it('0 利率等额本金：每月本金相同，利息为 0', () => {
    const result = calculateMortgage({ principalCents: 120_000, annualRatePercent: 0, termYears: 1, method: 'equal-principal' });
    assert.equal(result.monthlyPrincipalCents, 10_000);
    assert.equal(result.totalInterestCents, 0);
    assert.equal(result.totalPrincipalCents, 120_000);
  });

  it('仅 1 期：两种还款方式均一次还清本金 + 当期利息', () => {
    const expectedInterest = Math.round(100_000 * monthlyRateFromAnnual(4.9)); // 408 分
    for (const method of methodCases) {
      const rows = buildAmortizationSchedule({ principalCents: 100_000, annualRatePercent: 4.9, periods: 1, method });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].principalCents, 100_000);
      assert.equal(rows[0].interestCents, expectedInterest);
      assert.equal(rows[0].paymentCents, 100_000 + expectedInterest);
      assert.equal(rows[0].balanceCents, 0);
    }
  });

  it('边界参数可接受：1 年、40 年、0%、24%', () => {
    for (const termYears of [1, 40]) {
      for (const rate of [0, 24]) {
        const outcome = validateMortgageForm({
          amountText: '100',
          amountUnit: 'wan',
          rateText: String(rate),
          termText: String(termYears),
          method: 'equal-payment',
          extraText: '',
        });
        assert.equal(outcome.errors.length, 0, `${termYears} 年 / ${rate}% 应通过：${outcome.errors.join('|')}`);
        assert.ok(outcome.params);
      }
    }
  });
});

// ===========================================================================
// 6. 提前还款（每月额外还款）模拟
// ===========================================================================
describe('提前还款：每月额外还款模拟', () => {
  const base: MortgageParams = { principalCents: 100_000_000, annualRatePercent: 4.9, termYears: 30, method: 'equal-payment' };

  it('额外还款为 0 时与主算法完全一致', () => {
    const withoutExtra = calculateMortgage(base);
    const withZeroExtra = calculateMortgage({ ...base, extraMonthlyCents: 0 });
    assert.deepEqual(withZeroExtra, withoutExtra);
    assert.equal(withZeroExtra.monthsSaved, 0);
    assert.equal(withZeroExtra.interestSavedCents, 0);
  });

  it('每月多还 1000 元：期限缩短、利息减少，且恒等式仍成立', () => {
    const result = calculateMortgage({ ...base, extraMonthlyCents: 100_000 });
    assert.equal(result.schedule.length, 256);
    assert.equal(result.monthsSaved, 360 - 256);
    assert.equal(result.interestSavedCents, 29_716_044);
    assert.ok(result.interestSavedCents > 0);
    assert.equal(result.totalPaymentCents, result.principalCents + result.totalInterestCents);
    assert.equal(result.totalPrincipalCents, 100_000_000);
    assert.equal(result.schedule[result.schedule.length - 1].balanceCents, 0);
    assert.equal(result.firstPaymentCents, result.monthlyPaymentCents! + 100_000);
    assert.ok(result.extraMonthlyCents === 100_000);
  });

  it('额外还款越多，节省利息越多、期限越短（单调性）', () => {
    const small = calculateMortgage({ ...base, extraMonthlyCents: 50_000 });
    const large = calculateMortgage({ ...base, extraMonthlyCents: 200_000 });
    assert.ok(large.schedule.length < small.schedule.length, '多还期限应更短');
    assert.ok(large.interestSavedCents > small.interestSavedCents, '多还利息应更少');
    assert.equal(small.totalPrincipalCents, 100_000_000);
    assert.equal(large.totalPrincipalCents, 100_000_000);
  });

  it('等额本金 + 额外还款：与主算法同一套舍入规则', () => {
    const withoutExtra = calculateMortgage({ ...base, method: 'equal-principal' });
    const withExtra = calculateMortgage({ ...base, method: 'equal-principal', extraMonthlyCents: 100_000 });
    assert.ok(withExtra.schedule.length < withoutExtra.schedule.length);
    assert.ok(withExtra.interestSavedCents > 0);
    assert.equal(withExtra.totalPrincipalCents, 100_000_000);
    assert.equal(withExtra.totalPaymentCents, withExtra.principalCents + withExtra.totalInterestCents);
    assert.equal(withExtra.schedule[withExtra.schedule.length - 1].balanceCents, 0);
  });

  it('额外还款足够大时可在极少期数内结清', () => {
    const result = calculateMortgage({ ...base, extraMonthlyCents: 50_000_000 }); // 每月多还 50 万元
    assert.ok(result.schedule.length <= 3, `应很快结清，实际 ${result.schedule.length} 期`);
    assert.equal(result.totalPrincipalCents, 100_000_000);
  });
});

// ===========================================================================
// 7. 单利 / 复利
// ===========================================================================
describe('单利与复利计算', () => {
  const simpleParams: InterestParams = { mode: 'simple', principalCents: 1_000_000, annualRatePercent: 3, years: 3, frequency: 'year' };

  it('单利已知样例：1 万元 / 3% / 3 年 → 利息 900 元', () => {
    const result = calculateInterest(simpleParams);
    assert.equal(result.simpleInterestCents, 90_000);
    assert.equal(result.simpleTotalCents, 1_090_000);
    assert.equal(result.selectedInterestCents, 90_000);
    assert.equal(result.selectedTotalCents, 1_090_000);
    assert.equal(result.diffVsSimpleCents, result.compoundTotalCents - result.simpleTotalCents);
  });

  it('复利已知样例：1 万元 / 3% / 3 年按年复利 → 本息 10927.27 元', () => {
    const result = calculateInterest({ ...simpleParams, mode: 'compound', frequency: 'year' });
    assert.equal(result.compoundTotalCents, 1_092_727);
    assert.equal(result.compoundInterestCents, 92_727);
    assert.equal(result.selectedTotalCents, 1_092_727);
    assert.equal(result.diffVsSimpleCents, 2_727); // 比单利多 27.27 元
  });

  it('复利频率次序：按日 > 按月 > 按季 > 按年 > 单利', () => {
    const totals: Record<CompoundFrequency, number> = {
      year: calculateInterest({ ...simpleParams, mode: 'compound', frequency: 'year' }).compoundTotalCents,
      quarter: calculateInterest({ ...simpleParams, mode: 'compound', frequency: 'quarter' }).compoundTotalCents,
      month: calculateInterest({ ...simpleParams, mode: 'compound', frequency: 'month' }).compoundTotalCents,
      day: calculateInterest({ ...simpleParams, mode: 'compound', frequency: 'day' }).compoundTotalCents,
    };
    assert.ok(totals.day > totals.month && totals.month > totals.quarter && totals.quarter > totals.year);
    assert.ok(totals.year > calculateInterest(simpleParams).simpleTotalCents);
    assert.equal(totals.year, 1_092_727);
    assert.equal(totals.quarter, 1_093_807);
    assert.equal(totals.month, 1_094_051);
    assert.equal(totals.day, 1_094_170);
    // 复利次数常量与展示一致
    assert.equal(COMPOUND_FREQUENCY_DIVISORS.year, 1);
    assert.equal(COMPOUND_FREQUENCY_DIVISORS.quarter, 4);
    assert.equal(COMPOUND_FREQUENCY_DIVISORS.month, 12);
    assert.equal(COMPOUND_FREQUENCY_DIVISORS.day, 365);
  });

  it('实际年化利率：按年复利等于名义利率，按月复利略高', () => {
    const yearly = calculateInterest({ ...simpleParams, mode: 'compound', frequency: 'year' });
    const monthly = calculateInterest({ ...simpleParams, mode: 'compound', frequency: 'month' });
    nearYuan(yearly.effectiveAnnualRatePercent, 3, 1e-9, '按年 EAR');
    nearYuan(monthly.effectiveAnnualRatePercent, 3.0416, 1e-3, '按月 EAR');
    assert.ok(monthly.effectiveAnnualRatePercent > yearly.effectiveAnnualRatePercent);
  });

  it('小数年限：1 万 / 2.5% / 2.5 年单利利息 625 元', () => {
    const result = calculateInterest({ mode: 'simple', principalCents: 1_000_000, annualRatePercent: 2.5, years: 2.5, frequency: 'year' });
    assert.equal(result.simpleInterestCents, 62_500);
  });

  it('单利已知样例：10 万 / 5% / 2 年利息 1 万元', () => {
    const result = calculateInterest({ mode: 'simple', principalCents: 10_000_000, annualRatePercent: 5, years: 2, frequency: 'month' });
    assert.equal(result.simpleInterestCents, 1_000_000);
    assert.equal(result.simpleTotalCents, 11_000_000);
  });

  it('0 利率：单利与复利利息都为 0', () => {
    const zero = calculateInterest({ mode: 'compound', principalCents: 1_000_000, annualRatePercent: 0, years: 5, frequency: 'month' });
    assert.equal(zero.simpleInterestCents, 0);
    assert.equal(zero.compoundInterestCents, 0);
    assert.equal(zero.selectedTotalCents, 1_000_000);
    assert.equal(zero.effectiveAnnualRatePercent, 0);
  });

  it('单利模式下 selected 为单利结果，复利模式下 selected 为复利结果', () => {
    const simple = calculateInterest({ ...simpleParams, mode: 'simple' });
    assert.equal(simple.selectedTotalCents, simple.simpleTotalCents);
    const compound = calculateInterest({ ...simpleParams, mode: 'compound', frequency: 'month' });
    assert.equal(compound.selectedTotalCents, compound.compoundTotalCents);
    assert.ok(compound.compoundTotalCents >= compound.simpleTotalCents);
  });
});

// ===========================================================================
// 8. 非法输入拒绝
// ===========================================================================
describe('非法输入拒绝（中文错误）', () => {
  const validMortgageForm: MortgageFormValues = { ...DEFAULT_MORTGAGE_FORM };

  it('房贷表单：金额为 0 被拒绝', () => {
    const { params, errors } = validateMortgageForm({ ...validMortgageForm, amountText: '0' });
    assert.equal(params, null);
    assert.ok(errors.some((e) => e.includes('贷款金额必须大于 0')), errors.join('|'));
  });

  it('房贷表单：利率超过 24% 被拒绝', () => {
    const { params, errors } = validateMortgageForm({ ...validMortgageForm, rateText: '24.01' });
    assert.equal(params, null);
    assert.ok(errors.some((e) => e.includes('年利率需在 0–24%')), errors.join('|'));
  });

  it('房贷表单：期限小于 1 年或大于 40 年被拒绝', () => {
    for (const termText of ['0.5', '0', '-3', '40.01']) {
      const { params, errors } = validateMortgageForm({ ...validMortgageForm, termText });
      assert.equal(params, null, `期限 ${termText} 应被拒绝`);
      assert.ok(errors.some((e) => e.includes('期限需在 1–40 年')), `${termText}: ${errors.join('|')}`);
    }
  });

  it('房贷表单：金额非数字被拒绝', () => {
    const { errors } = validateMortgageForm({ ...validMortgageForm, amountText: 'abc' });
    assert.ok(errors.some((e) => e.includes('金额只能填写数字')), errors.join('|'));
  });

  it('房贷表单：额外还款为负数被拒绝', () => {
    const { errors } = validateMortgageForm({ ...validMortgageForm, extraText: '-100' });
    assert.ok(errors.length > 0);
  });

  it('房贷表单：合法输入返回解析后的分单位参数', () => {
    const { params, errors } = validateMortgageForm({
      ...validMortgageForm,
      amountText: '100.5',
      amountUnit: 'wan',
      rateText: '4.9%',
      termText: '30 年',
      method: 'equal-principal',
      extraText: '',
    });
    assert.equal(errors.length, 0, errors.join('|'));
    assert.ok(params);
    assert.equal(params!.principalCents, 100_500_000);
    assert.equal(params!.annualRatePercent, 4.9);
    assert.equal(params!.termYears, 30);
    assert.equal(params!.method, 'equal-principal');
    assert.equal(params!.extraMonthlyCents, 0);
  });

  it('calculateMortgage 对非法参数抛出中文错误', () => {
    const valid: MortgageParams = { principalCents: 100_000_000, annualRatePercent: 4.9, termYears: 30, method: 'equal-payment' };
    assert.throws(() => calculateMortgage({ ...valid, principalCents: 0 }), /贷款金额必须大于 0/);
    assert.throws(() => calculateMortgage({ ...valid, annualRatePercent: 25 }), /年利率需在 0–24%/);
    assert.throws(() => calculateMortgage({ ...valid, termYears: 0.5 }), /期限需在 1–40 年/);
    assert.throws(() => calculateMortgage({ ...valid, termYears: 41 }), /期限需在 1–40 年/);
    assert.throws(() => calculateMortgage({ ...valid, method: 'unknown' as RepaymentMethod }), /请选择还款方式/);
    assert.throws(() => calculateMortgage({ ...valid, extraMonthlyCents: -1 }), /额外还款/);
  });

  it('利息表单：空本金 / 超限利率 / 0 年限被拒绝', () => {
    const validForm = { ...DEFAULT_INTEREST_FORM };
    assert.ok(validateInterestForm({ ...validForm, principalText: '' }).errors.length > 0);
    assert.ok(validateInterestForm({ ...validForm, principalText: '0' }).errors.some((e) => e.includes('本金必须大于 0')));
    assert.ok(validateInterestForm({ ...validForm, rateText: '25' }).errors.some((e) => e.includes('年利率需在 0–24%')));
    assert.ok(validateInterestForm({ ...validForm, yearsText: '0' }).errors.some((e) => e.includes('年限需大于 0')));
    const ok = validateInterestForm({ ...validForm, principalText: '10000', rateText: '3%', yearsText: '3年' });
    assert.equal(ok.errors.length, 0, ok.errors.join('|'));
    assert.equal(ok.params!.principalCents, 1_000_000);
  });

  it('calculateInterest 对非法参数抛出中文错误', () => {
    const valid: InterestParams = { mode: 'compound', principalCents: 1_000_000, annualRatePercent: 3, years: 3, frequency: 'year' };
    assert.throws(() => calculateInterest({ ...valid, years: 0 }), /年限需大于 0/);
    assert.throws(() => calculateInterest({ ...valid, annualRatePercent: 25 }), /年利率需在 0–24%/);
    assert.throws(() => calculateInterest({ ...valid, principalCents: 0 }), /本金必须大于 0/);
    assert.throws(() => calculateInterest({ ...valid, frequency: 'week' as CompoundFrequency }), /复利频率无效/);
  });

  it('表单默认值本身合法', () => {
    assert.equal(validateMortgageForm(DEFAULT_MORTGAGE_FORM).errors.length, 0);
    assert.equal(validateInterestForm(DEFAULT_INTEREST_FORM).errors.length, 0);
    assert.ok(MAX_TERM_YEARS === 40 && MAX_ANNUAL_RATE_PERCENT === 24);
  });
});

// ===========================================================================
// 9. 复制文案与公式说明
// ===========================================================================
describe('复制文案与公式说明', () => {
  it('等额本息复制文案含月供、总利息与公式提示', () => {
    const result = calculateMortgage({ principalCents: 100_000_000, annualRatePercent: 4.9, termYears: 30, method: 'equal-payment' });
    const text = mortgageSummaryText(result);
    assert.ok(text.includes('【房贷计算结果】'));
    assert.ok(text.includes('月供：5,307.27 元'));
    assert.ok(text.includes('总利息：910,615.12 元'));
    assert.ok(text.includes('还款方式：等额本息'));
    assert.ok(text.includes('前 12 期还款'));
    assert.ok(text.includes('完整逐月还款表请下载 CSV'));
    assert.ok(text.includes('以贷款合同和银行账单为准'));
  });

  it('等额本金复制文案含首月 / 末月月供与每月本金', () => {
    const result = calculateMortgage({ principalCents: 100_000_000, annualRatePercent: 4.9, termYears: 30, method: 'equal-principal' });
    const text = mortgageSummaryText(result);
    assert.ok(text.includes('首月月供：6,861.11 元'));
    assert.ok(text.includes('末月月供：'));
    assert.ok(text.includes('每月本金：2,777.78 元'));
  });

  it('提前还款复制文案含节省利息与缩短期限', () => {
    const result = calculateMortgage({ principalCents: 100_000_000, annualRatePercent: 4.9, termYears: 30, method: 'equal-payment', extraMonthlyCents: 100_000 });
    const text = mortgageSummaryText(result);
    assert.ok(text.includes('每月额外还款：1,000.00 元'));
    assert.ok(text.includes('节省利息：297,160.44 元'));
    assert.ok(text.includes('缩短期限：8 年 8 个月（104 期）'));
  });

  it('利息复制文案含所选方式、差额与实际年化', () => {
    const result = calculateInterest({ mode: 'compound', principalCents: 1_000_000, annualRatePercent: 3, years: 3, frequency: 'month' });
    const text = interestSummaryText(result);
    assert.ok(text.includes('计息方式：复利'));
    assert.ok(text.includes('本息合计：10,940.51 元'));
    assert.ok(text.includes('复利比单利多：40.51 元'));
    assert.ok(text.includes('实际年化利率：3.0416%'));
  });

  it('公式说明覆盖两种还款方式、单利与复利', () => {
    assert.ok(MORTGAGE_FORMULAS.length >= 4);
    assert.ok(INTEREST_FORMULAS.length >= 4);
    const mortgageText = MORTGAGE_FORMULAS.join('\n');
    assert.ok(mortgageText.includes('等额本息'));
    assert.ok(mortgageText.includes('等额本金'));
    assert.ok(mortgageText.includes('分'));
    assert.ok(mortgageText.includes('总还款 = 本金 + 总利息'));
    const interestText = INTEREST_FORMULAS.join('\n');
    assert.ok(interestText.includes('单利'));
    assert.ok(interestText.includes('复利'));
    assert.ok(interestText.includes('365'));
  });
});

// ===========================================================================
// 10. 隐私与纯函数（零网络、零存储、确定性）
// ===========================================================================
describe('隐私与纯函数', () => {
  it('核心与 UI 源码不含网络 / 存储 / 上报调用', async () => {
    const fs = await import('node:fs');
    const sources = [
      new URL('../src/tools/finance-core.ts', import.meta.url),
      new URL('../src/tools/Finance.tsx', import.meta.url),
    ];
    const forbidden = ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'analytics', 'umami', 'localStorage', 'sessionStorage', 'WebSocket', 'http://', 'https://'];
    // 只扫描代码（去掉注释），避免文档注释里的「不调用 fetch」等说明造成误报
    const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const url of sources) {
      const code = stripComments(fs.readFileSync(url, 'utf8'));
      for (const token of forbidden) {
        assert.ok(!code.includes(token), `${url.pathname.split('/').pop()} 不应包含 ${token}`);
      }
    }
  });

  it('纯函数确定性：同一输入两次结果完全一致且互不影响', () => {
    const params: MortgageParams = { principalCents: 100_000_000, annualRatePercent: 4.9, termYears: 30, method: 'equal-payment' };
    const first = calculateMortgage(params);
    const second = calculateMortgage(params);
    assert.deepEqual(first, second);
    assert.notEqual(first.schedule, second.schedule, '应返回独立的还款表对象');
    // 修改返回值不影响下一次计算
    first.schedule[0].paymentCents = 1;
    assert.equal(calculateMortgage(params).schedule[0].paymentCents, 530_727);
  });
});
