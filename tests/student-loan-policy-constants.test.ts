/**
 * 生源地信用助学贷款还款计算 · 政策常量与标签契约单测（EVERGREEN Round 89，2026-11-07）。
 * 只锁定 student-loan-core.ts 四项零直接引用的导出，不改生产代码。
 * 锚点均为 Factory Day 12（PR #130）上线口径：LPR5Y 3.50%（2026-10-20 期）
 * − 70 个基点 = 默认执行利率 2.80%；多笔上限 6 笔；四档阶段标签。
 * 交叉契约：默认利率由 LPR 与加点算出、结果文本/CSV 中的利率与阶段
 * 文案由同一常量生成——改常量不改文案即失败，防止口径漂移。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcPlan,
  DEFAULT_ANNUAL_RATE_PERCENT,
  LPR5Y_PERCENT,
  MAX_LOANS,
  planToCsv,
  planToText,
  RATE_SPREAD_BP,
  SAMPLE_SINGLE_8000,
  STAGE_LABELS,
  type PlanInput,
  type RepayStage,
} from '../src/tools/student-loan-core.ts';

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  enrollYear: 2025,
  studyYears: 4,
  annualRatePercent: DEFAULT_ANNUAL_RATE_PERCENT,
  loans: [{ amountYuan: 8000, termYears: 17 }],
  ...over,
});

const sixLoans = (): PlanInput =>
  base({ loans: Array.from({ length: 6 }, () => ({ amountYuan: 8000, termYears: 17 })) });

describe('student-loan 政策常量与标签契约', () => {
  it('LPR5Y 现值 3.50%（2026-10-20 期）', () => {
    assert.equal(LPR5Y_PERCENT, 3.5);
  });

  it('助学贷款利率加点 70 个基点', () => {
    assert.equal(RATE_SPREAD_BP, 70);
  });

  it('默认执行利率由 LPR 与加点算出：3.50% − 0.70% = 2.80%', () => {
    assert.equal(DEFAULT_ANNUAL_RATE_PERCENT, LPR5Y_PERCENT - RATE_SPREAD_BP / 100);
    assert.equal(DEFAULT_ANNUAL_RATE_PERCENT, 2.8);
  });

  it('多笔贷款上限 MAX_LOANS 为 6', () => {
    assert.equal(MAX_LOANS, 6);
    assert.ok(Number.isInteger(MAX_LOANS) && MAX_LOANS > 0);
  });

  it('恰好 6 笔通过：笔数、本金合计与行数', () => {
    const plan = calcPlan(sixLoans());
    assert.equal(plan.loanCount, 6);
    assert.equal(plan.totalPrincipal, 48000);
    assert.equal(plan.rows.length, 14);
  });

  it('第 7 笔拒绝且报错文案由 MAX_LOANS 生成', () => {
    assert.throws(
      () =>
        calcPlan(
          base({ loans: Array.from({ length: 7 }, () => ({ amountYuan: 8000, termYears: 17 })) }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, `一次最多算 ${MAX_LOANS} 笔贷款`);
        return true;
      },
    );
  });

  it('STAGE_LABELS 键恰好四档', () => {
    assert.deepEqual(Object.keys(STAGE_LABELS).sort(), [
      'grace',
      'graduation',
      'maturity',
      'principal',
    ]);
  });

  it('STAGE_LABELS 四档标签逐字锁定', () => {
    assert.equal(STAGE_LABELS.graduation, '毕业当年·只还息');
    assert.equal(STAGE_LABELS.grace, '宽限期·只还息');
    assert.equal(STAGE_LABELS.principal, '还本期');
    assert.equal(STAGE_LABELS.maturity, '到期结清');
  });

  it('官方示例计划 14 行、四阶段按顺序出现', () => {
    const plan = calcPlan(SAMPLE_SINGLE_8000);
    assert.equal(plan.rows.length, 14);
    const stages: RepayStage[] = plan.rows.map((r) => r.stage);
    assert.deepEqual(stages, [
      'graduation',
      'grace',
      'grace',
      'grace',
      'grace',
      'principal',
      'principal',
      'principal',
      'principal',
      'principal',
      'principal',
      'principal',
      'principal',
      'maturity',
    ]);
  });

  it('官方示例计划每行 stageLabel 取自 STAGE_LABELS', () => {
    const plan = calcPlan(SAMPLE_SINGLE_8000);
    for (const row of plan.rows) {
      assert.equal(row.stageLabel, STAGE_LABELS[row.stage]);
    }
    assert.equal(plan.rows[0].stageLabel, '毕业当年·只还息');
    assert.equal(plan.rows[plan.rows.length - 1].stageLabel, '到期结清');
  });

  it('多笔合并计划每行标签仍取自 STAGE_LABELS', () => {
    const plan = calcPlan(
      base({
        loans: [
          { amountYuan: 8000, termYears: 17 },
          { amountYuan: 8000, termYears: 8 },
        ],
      }),
    );
    assert.equal(plan.rows.length, 15);
    assert.equal(plan.maturityYear, 2042);
    for (const row of plan.rows) {
      assert.equal(row.stageLabel, STAGE_LABELS[row.stage]);
    }
  });

  it('结果文本中的利率口径与常量一致', () => {
    const plan = calcPlan(SAMPLE_SINGLE_8000);
    const text = planToText(plan, SAMPLE_SINGLE_8000);
    assert.match(text, new RegExp(`LPR5Y − ${RATE_SPREAD_BP} 个基点`));
    assert.match(text, new RegExp(`当前 LPR5Y ${LPR5Y_PERCENT.toFixed(2)}%`));
    assert.match(text, new RegExp(`年利率 ${DEFAULT_ANNUAL_RATE_PERCENT.toFixed(2)}%`));
  });

  it('CSV 含四档阶段标签', () => {
    const plan = calcPlan(SAMPLE_SINGLE_8000);
    const csv = planToCsv(plan);
    for (const label of Object.values(STAGE_LABELS)) {
      assert.ok(csv.includes(label), `CSV 缺阶段标签：${label}`);
    }
  });
});
