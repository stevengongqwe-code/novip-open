/**
 * 生源地信用助学贷款还款计算 · 单测（Factory Day 12，2026-11-07）。
 * 锚点均为手算（利率 2.80% = LPR5Y 3.50% − 0.70%）；官方示例结构：
 * 2025 年入学、4 年制、期限 17 年 → 毕业 2029 年，宽限期 5 个节点
 * （2029 + 2030–2033），还本 9 次（2034–2041 + 2042 到期）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcPlan,
  csvDateSuffix,
  DEFAULT_ANNUAL_RATE_PERCENT,
  GRADUATION_YEAR_DAYS,
  inclusiveDays,
  maturityYearDays,
  money,
  planToCsv,
  planToText,
  SAMPLE_SINGLE_20000,
  SAMPLE_SINGLE_8000,
  type PlanInput,
} from '../src/tools/student-loan-core.ts';

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  enrollYear: 2025,
  studyYears: 4,
  annualRatePercent: DEFAULT_ANNUAL_RATE_PERCENT,
  loans: [{ amountYuan: 8000, termYears: 17 }],
  ...over,
});

describe('生源地助学贷款还款计划（官方示例结构）', () => {
  it('8000 元 17 年期：14 行、毕业当年 69.07 元、宽限期年 224 元', () => {
    const plan = calcPlan(base());
    assert.equal(plan.gradYear, 2029);
    assert.equal(plan.maturityYear, 2042);
    assert.equal(plan.graceYears, 5);
    assert.equal(plan.rows.length, 14);
    assert.equal(plan.firstPayDate, '2029-12-20');
    const [first] = plan.rows;
    assert.equal(first.payDate, '2029-12-20');
    assert.equal(first.stage, 'graduation');
    assert.equal(first.days, 111);
    assert.equal(first.principal, 0);
    assert.equal(first.interest, 69.07);
    assert.equal(first.due, 69.07);
    assert.equal(first.remaining, 8000);
    const grace = plan.rows[1];
    assert.equal(grace.payDate, '2030-12-20');
    assert.equal(grace.stage, 'grace');
    assert.equal(grace.interest, 224);
    assert.equal(grace.principal, 0);
  });

  it('8000 元 17 年期：还本期首行与次行、到期行、总利息 2079.13 元', () => {
    const plan = calcPlan(base());
    const row2034 = plan.rows.find((r) => r.payDate === '2034-12-20');
    assert.ok(row2034);
    assert.equal(row2034.stage, 'principal');
    assert.equal(row2034.principal, 888.88);
    assert.equal(row2034.interest, 224);
    assert.equal(row2034.due, 1112.88);
    assert.equal(row2034.remaining, 7111.12);
    const row2035 = plan.rows.find((r) => r.payDate === '2035-12-20');
    assert.ok(row2035);
    assert.equal(row2035.interest, 199.11);
    assert.equal(row2035.due, 1087.99);
    assert.equal(row2035.remaining, 6222.24);
    const last = plan.rows[plan.rows.length - 1];
    assert.equal(last.payDate, '2042-09-20');
    assert.equal(last.stage, 'maturity');
    assert.equal(last.days, 274);
    assert.equal(last.principal, 888.96);
    assert.equal(last.interest, 18.94);
    assert.equal(last.due, 907.9);
    assert.equal(last.remaining, 0);
    assert.equal(plan.totalPrincipal, 8000);
    assert.equal(plan.totalInterest, 2079.13);
    assert.equal(plan.totalDue, 10079.13);
  });

  it('本金分总和精确等于本金、剩余本金最终为 0', () => {
    for (const amount of [8000, 20000, 32000, 12345]) {
      const plan = calcPlan(base({ loans: [{ amountYuan: amount, termYears: 17 }] }));
      const sum = plan.rows.reduce((a, r) => a + r.principal, 0);
      assert.equal(Math.round(sum * 100) / 100, amount);
      assert.equal(plan.rows[plan.rows.length - 1].remaining, 0);
    }
  });

  it('32000 元单笔：毕业当年 276.27 元、宽限期年 896 元', () => {
    const plan = calcPlan(base({ loans: [{ amountYuan: 32000, termYears: 17 }] }));
    assert.equal(plan.rows[0].interest, 276.27);
    assert.equal(plan.rows[1].interest, 896);
  });

  it('20000 元单笔（本科年上限）：毕业当年 172.67 元、宽限期年 560 元', () => {
    const plan = calcPlan(base({ loans: [{ amountYuan: 20000, termYears: 17 }] }));
    assert.equal(plan.rows[0].interest, 172.67);
    assert.equal(plan.rows[1].interest, 560);
  });

  it('短期限 8 年：宽限期 4 个节点、到期年一次还清本金', () => {
    const plan = calcPlan(base({ loans: [{ amountYuan: 8000, termYears: 8 }] }));
    assert.equal(plan.graceYears, 4);
    assert.equal(plan.maturityYear, 2033);
    assert.equal(plan.rows.length, 5);
    const last = plan.rows[plan.rows.length - 1];
    assert.equal(last.payDate, '2033-09-20');
    assert.equal(last.stage, 'maturity');
    assert.equal(last.principal, 8000);
    assert.equal(last.interest, 170.49);
    assert.equal(last.due, 8170.49);
  });

  it('闰年到期：2044 年到期零头天数为 275 天', () => {
    assert.equal(maturityYearDays(2044), 275);
    assert.equal(maturityYearDays(2042), 274);
    assert.equal(inclusiveDays(2029, 9, 1, 2029, 12, 20), GRADUATION_YEAR_DAYS);
    const plan = calcPlan(base({ enrollYear: 2027, loans: [{ amountYuan: 8000, termYears: 17 }] }));
    assert.equal(plan.maturityYear, 2044);
    const last = plan.rows[plan.rows.length - 1];
    assert.equal(last.days, 275);
  });

  it('多笔合并：8000 元 17 年 + 8000 元 8 年按还款日合并', () => {
    const plan = calcPlan(
      base({ loans: [{ amountYuan: 8000, termYears: 17 }, { amountYuan: 8000, termYears: 8 }] }),
    );
    assert.equal(plan.loanCount, 2);
    assert.equal(plan.totalPrincipal, 16000);
    assert.equal(plan.rows[0].payDate, '2029-12-20');
    assert.equal(plan.rows[0].interest, 138.14);
    const sep2033 = plan.rows.find((r) => r.payDate === '2033-09-20');
    assert.ok(sep2033);
    assert.equal(sep2033.principal, 8000);
    assert.equal(sep2033.interest, 170.49);
    const dec2033 = plan.rows.find((r) => r.payDate === '2033-12-20');
    assert.ok(dec2033);
    assert.equal(dec2033.principal, 0);
    assert.equal(dec2033.interest, 224);
    assert.equal(plan.rows.length, 15);
  });

  it('利率为 0 时总利息为 0、应还等于本金', () => {
    const plan = calcPlan(base({ annualRatePercent: 0 }));
    assert.equal(plan.totalInterest, 0);
    assert.equal(plan.totalDue, 8000);
    assert.equal(plan.rows[0].interest, 0);
  });

  it('校验：期限须大于学制、且不超过学制+15/22 年上限', () => {
    assert.throws(() => calcPlan(base({ loans: [{ amountYuan: 8000, termYears: 4 }] })), /须大于学制/);
    assert.throws(() => calcPlan(base({ loans: [{ amountYuan: 8000, termYears: 20 }] })), /最长为剩余学制加 15 年/);
    assert.throws(() => calcPlan(base({ loans: [{ amountYuan: 8000, termYears: 23 }] })), /须为 1–22 之间的整数/);
  });

  it('校验：本金、入学年份、学制、利率与笔数越界时报错', () => {
    assert.throws(() => calcPlan(base({ loans: [{ amountYuan: 50, termYears: 17 }] })), /100–10000000/);
    assert.throws(() => calcPlan(base({ enrollYear: 1999 })), /入学年份/);
    assert.throws(() => calcPlan(base({ studyYears: 9 })), /学制/);
    assert.throws(() => calcPlan(base({ annualRatePercent: 21 })), /年利率/);
    assert.throws(() => calcPlan(base({ loans: [] })), /至少填一笔贷款/);
    assert.throws(
      () => calcPlan(base({ loans: Array.from({ length: 7 }, () => ({ amountYuan: 8000, termYears: 17 })) })),
      /最多算 6 笔贷款/,
    );
  });

  it('默认利率 2.80% = LPR5Y 3.50% − 70bp；示例常量与官方示例结构一致', () => {
    assert.equal(DEFAULT_ANNUAL_RATE_PERCENT, 2.8);
    assert.equal(GRADUATION_YEAR_DAYS, 111);
    const a = calcPlan(SAMPLE_SINGLE_8000);
    assert.equal(a.rows[0].interest, 69.07);
    assert.equal(a.totalInterest, 2079.13);
    const b = calcPlan(SAMPLE_SINGLE_20000);
    assert.equal(b.rows[0].interest, 172.67);
    assert.equal(b.totalPrincipal, 20000);
  });

  it('结果文本与 CSV 含关键数字', () => {
    const plan = calcPlan(base());
    const text = planToText(plan, base());
    assert.match(text, /总利息 2079\.13 元/);
    assert.match(text, /2042 年 9 月 20 日还清/);
    assert.match(text, /2029-12-20/);
    const csv = planToCsv(plan);
    assert.match(csv, /还款日/);
    assert.match(csv, /2042-09-20/);
    assert.match(csv, /2079\.13/);
    assert.equal(money(69.066), '69.07');
    assert.match(csvDateSuffix(new Date('2026-11-07T00:00:00Z')), /^20261107$/);
  });
});
