/**
 * 生源地信用助学贷款还款计算 · 纯函数核心（Factory Day 12，2026-11-07）。
 * 本模块不碰 DOM、不联网、不存 localStorage：逐年还款计划、总利息、
 * 结果文本与 CSV 均可单测。
 *
 * 口径（与 PRD、页面、单测共同承诺；依据国开行生源地信用助学贷款
 * 2025 版申请还款指南折页、财政部 2021-09-14 吹风会、2024 年 11 月
 * 四部门调整通知、银发[2005]129 号）：
 * 适用对象：国家助学贷款借款学生（生源地信用助学贷款；校园地国家
 * 助学贷款还款规则相同，可同样参考；具体以《借款合同》为准）。
 * 在校期间利息全部由财政补贴，学生无需偿还本金与利息。
 * 毕业后不再继续攻读学位的，自毕业当年起自付利息，可享受 5 年还本
 * 宽限期，期间只需偿还利息、暂缓偿还本金；如毕业后剩余贷款期限小
 * 于 5 年，则按《借款合同》约定的还款计划还款。
 * 利率：LPR5Y − 70 个基点；每年 12 月 21 日根据最新 LPR5Y 调整一次。
 * 现值 LPR5Y 3.50%（2026-10-20 期）→ 执行利率 2.80%（默认，可改）。
 * 贷款期限：最长为剩余学制加 15 年、最长不超过 22 年。
 * 额度：全日制普通本专科每人每年不超过 20000 元、不低于 1000 元；
 * 全日制研究生每人每年不超过 25000 元、不低于 1000 元（2025 年现行）。
 * 还款日：每年 12 月 20 日；最后一年 9 月 20 日。逾期罚息为合同借
 * 款利率的 130%。
 * 还本方式：宽限期后按等额本金方式分期偿还贷款本金（每年应还本金
 * 以合同约定为准，工具明示为估算口径）；本金按分计，前 n−1 次取
 * floor(总本金分 / n)，最后一次为余数，分总和精确等于本金。
 * 利息：完整年度＝剩余本金 × 年利率；不足一年的零头天数＝剩余本金
 * × 年利率 × 实际天数 ÷ 360（银发[2005]129 号：日利率＝年利率÷360）；
 * 天数按含首尾两日计，与官方示例「9 月 1 日–12 月 20 日共 111 天」
 * 口径一致。毕业当年 111 天为官方示例锁定值；到期年为上一年度
 * 12 月 21 日–到期年 9 月 20 日（含首尾），平年 274 天、闰年 275 天。
 * 官方示例结构（潮安折页）：2025 年入学大一新生、4 年学制、期限
 * 17 年 → 毕业当年（2029 年）12 月 20 日还 111 天利息；2030–2033
 * 年每年 12 月 20 日只还利息；2034–2041 年每年 12 月 20 日还一年
 * 本金 + 利息；2042 年 9 月 20 日还剩余本金 + 利息。
 * 金额保留 2 位小数；本计算为估算，利率每年重定价、每年应还本金以
 * 合同约定为准，最终以学生在线系统/国家助学贷款 APP 查询的当期额
 * 度为准；不含逾期罚息与提前还款重算。
 */

/** LPR5Y 现值（2026-10-20 期，人民银行授权全国银行间同业拆借中心公布）。 */
export const LPR5Y_PERCENT = 3.5;
/** 助学贷款利率 = LPR5Y − 70 个基点。 */
export const RATE_SPREAD_BP = 70;
/** 默认执行年利率 %（3.50% − 0.70%）。 */
export const DEFAULT_ANNUAL_RATE_PERCENT = 2.8;
/** 毕业当年计息天数：9 月 1 日–12 月 20 日（含首尾），官方示例锁定值。 */
export const GRADUATION_YEAR_DAYS = 111;
/** 最长贷款期限（年）。 */
export const MAX_TERM_YEARS = 22;
/** 多笔贷款上限。 */
export const MAX_LOANS = 6;

export type RepayStage = 'graduation' | 'grace' | 'principal' | 'maturity';

export const STAGE_LABELS: Record<RepayStage, string> = {
  graduation: '毕业当年·只还息',
  grace: '宽限期·只还息',
  principal: '还本期',
  maturity: '到期结清',
};

export interface LoanInput {
  /** 本笔贷款本金（元）。 */
  amountYuan: number;
  /** 本笔贷款期限（年）。 */
  termYears: number;
}

export interface PlanInput {
  enrollYear: number;
  studyYears: number;
  /** 年利率（%，如 2.8 表示 2.80%）。 */
  annualRatePercent: number;
  loans: LoanInput[];
}

export interface ScheduleRow {
  /** 还款日，如 '2029-12-20'。 */
  payDate: string;
  year: number;
  stage: RepayStage;
  stageLabel: string;
  /** 本期本金（元，2 位小数）。 */
  principal: number;
  /** 本期利息（元，2 位小数）。 */
  interest: number;
  /** 本期应还（元，2 位小数）。 */
  due: number;
  /** 支付后剩余本金（元，2 位小数）。 */
  remaining: number;
  /** 零头天数（毕业当年/到期年）；完整年度为 null。 */
  days: number | null;
}

export interface LoanPlan {
  rows: ScheduleRow[];
  totalPrincipal: number;
  totalInterest: number;
  totalDue: number;
  gradYear: number;
  /** 最晚一笔的到期年份（还清年份）。 */
  maturityYear: number;
  /** 宽限期节点数（取各笔最大值；单笔时即该笔的值）。 */
  graceYears: number;
  /** 第一笔还款日（如 '2029-12-20'）。 */
  firstPayDate: string;
  loanCount: number;
}

function assertInt(value: number, label: string, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label}须为 ${min}–${max} 之间的整数`);
  }
}

function assertMoney(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 100 || value > 10_000_000) {
    throw new Error(`${label}须为 100–10000000 之间的数字`);
  }
}

/** 含首尾两日的实际天数（UTC，避免夏令时干扰）。 */
export function inclusiveDays(y1: number, m1: number, d1: number, y2: number, m2: number, d2: number): number {
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000) + 1;
}

/** 到期年零头天数：上一年度 12 月 21 日–到期年 9 月 20 日（含首尾）。 */
export function maturityYearDays(maturityYear: number): number {
  return inclusiveDays(maturityYear - 1, 12, 21, maturityYear, 9, 20);
}

interface CentsRow {
  payDate: string;
  year: number;
  stage: RepayStage;
  principalCents: number;
  interestCents: number;
  remainingCents: number;
  days: number | null;
}

/** 单笔贷款的逐年还款计划（分币整数运算）。 */
function calcSingleLoan(loan: LoanInput, shared: Omit<PlanInput, 'loans'>): CentsRow[] {
  const gradYear = shared.enrollYear + shared.studyYears;
  const maturityYear = shared.enrollYear + loan.termYears;
  const rate = shared.annualRatePercent / 100;
  const principalCents = Math.round(loan.amountYuan * 100);
  const graceTotal = Math.min(5, maturityYear - gradYear);
  const principalPayments = maturityYear - gradYear - graceTotal + 1;
  const baseSlice = Math.floor(principalCents / principalPayments);

  const rows: CentsRow[] = [];
  let remaining = principalCents;

  const interestFor = (balanceCents: number, days: number | null): number =>
    days === null
      ? Math.round(balanceCents * rate)
      : Math.round((balanceCents * rate * days) / 360);

  // 毕业当年：9 月 1 日–12 月 20 日 111 天利息，只还息。
  {
    const interestCents = interestFor(remaining, GRADUATION_YEAR_DAYS);
    rows.push({
      payDate: `${gradYear}-12-20`,
      year: gradYear,
      stage: 'graduation',
      principalCents: 0,
      interestCents,
      remainingCents: remaining,
      days: GRADUATION_YEAR_DAYS,
    });
  }
  // 宽限期完整年度：每年 12 月 20 日，只还利息。
  for (let y = gradYear + 1; y <= gradYear + graceTotal - 1; y++) {
    rows.push({
      payDate: `${y}-12-20`,
      year: y,
      stage: 'grace',
      principalCents: 0,
      interestCents: interestFor(remaining, null),
      remainingCents: remaining,
      days: null,
    });
  }
  // 还本期：每年 12 月 20 日，本金 + 利息（最后一次本金为余数）。
  let paid = 0;
  for (let y = gradYear + graceTotal; y <= maturityYear - 1; y++) {
    const isLast = paid === principalPayments - 1;
    const slice = isLast ? principalCents - baseSlice * (principalPayments - 1) : baseSlice;
    const interestCents = interestFor(remaining, null);
    remaining -= slice;
    paid++;
    rows.push({
      payDate: `${y}-12-20`,
      year: y,
      stage: 'principal',
      principalCents: slice,
      interestCents,
      remainingCents: remaining,
      days: null,
    });
  }
  // 到期年：9 月 20 日，剩余本金 + 零头天数利息。
  {
    const days = maturityYearDays(maturityYear);
    const interestCents = interestFor(remaining, days);
    const slice = remaining;
    remaining = 0;
    rows.push({
      payDate: `${maturityYear}-09-20`,
      year: maturityYear,
      stage: 'maturity',
      principalCents: slice,
      interestCents,
      remainingCents: 0,
      days,
    });
  }
  return rows;
}

/** 校验共用输入；返回毕业年份。 */
function validateShared(input: PlanInput): number {
  assertInt(input.enrollYear, '入学年份', 2000, 2030);
  assertInt(input.studyYears, '学制', 1, 8);
  if (!Number.isFinite(input.annualRatePercent) || input.annualRatePercent < 0 || input.annualRatePercent > 20) {
    throw new Error('年利率须为 0–20 之间的数字');
  }
  if (input.loans.length === 0) throw new Error('请至少填一笔贷款');
  if (input.loans.length > MAX_LOANS) throw new Error(`一次最多算 ${MAX_LOANS} 笔贷款`);
  const maxTerm = Math.min(input.studyYears + 15, MAX_TERM_YEARS);
  for (const [i, loan] of input.loans.entries()) {
    assertMoney(loan.amountYuan, `第 ${i + 1} 笔贷款本金`);
    assertInt(loan.termYears, `第 ${i + 1} 笔贷款期限`, 1, MAX_TERM_YEARS);
    if (loan.termYears <= input.studyYears) {
      throw new Error(`第 ${i + 1} 笔贷款期限须大于学制（${input.studyYears} 年），否则毕业当年即到期`);
    }
    if (loan.termYears > maxTerm) {
      throw new Error(`第 ${i + 1} 笔贷款期限最长为剩余学制加 15 年、不超过 22 年（当前学制下最长 ${maxTerm} 年）`);
    }
  }
  return input.enrollYear + input.studyYears;
}

/** 多笔贷款合并逐年还款计划（按还款日合并，金额相加）。 */
export function calcPlan(input: PlanInput): LoanPlan {
  const gradYear = validateShared(input);
  const shared = { enrollYear: input.enrollYear, studyYears: input.studyYears, annualRatePercent: input.annualRatePercent };

  const merged = new Map<string, CentsRow>();
  let maturityYear = 0;
  let graceYears = 0;
  for (const loan of input.loans) {
    const loanMaturity = input.enrollYear + loan.termYears;
    maturityYear = Math.max(maturityYear, loanMaturity);
    graceYears = Math.max(graceYears, Math.min(5, loanMaturity - gradYear));
    for (const r of calcSingleLoan(loan, shared)) {
      const hit = merged.get(r.payDate);
      if (!hit) {
        merged.set(r.payDate, { ...r });
        continue;
      }
      // 同一还款日多笔合并：阶段取「更靠后」者（到期结清 > 还本期 > 宽限期 > 毕业当年）。
      const order: RepayStage[] = ['graduation', 'grace', 'principal', 'maturity'];
      hit.stage = order[Math.max(order.indexOf(hit.stage), order.indexOf(r.stage))];
      hit.principalCents += r.principalCents;
      hit.interestCents += r.interestCents;
      hit.remainingCents += r.remainingCents;
      hit.days = hit.days ?? r.days;
    }
  }

  const rows: ScheduleRow[] = [...merged.values()]
    .sort((a, b) => (a.payDate < b.payDate ? -1 : 1))
    .map((r) => ({
      payDate: r.payDate,
      year: r.year,
      stage: r.stage,
      stageLabel: STAGE_LABELS[r.stage],
      principal: r.principalCents / 100,
      interest: r.interestCents / 100,
      due: (r.principalCents + r.interestCents) / 100,
      remaining: r.remainingCents / 100,
      days: r.days,
    }));

  const sumCents = (pick: (r: CentsRow) => number) =>
    [...merged.values()].reduce((a, r) => a + pick(r), 0);
  const totalPrincipalCents = sumCents((r) => r.principalCents);
  const totalInterestCents = sumCents((r) => r.interestCents);
  return {
    rows,
    totalPrincipal: totalPrincipalCents / 100,
    totalInterest: totalInterestCents / 100,
    totalDue: (totalPrincipalCents + totalInterestCents) / 100,
    gradYear,
    maturityYear,
    graceYears,
    firstPayDate: rows[0]?.payDate ?? '',
    loanCount: input.loans.length,
  };
}

/** 默认示例：2025 年入学、4 年制、贷款 8000 元、期限 17 年（官方示例结构）。 */
export const SAMPLE_SINGLE_8000: PlanInput = {
  enrollYear: 2025,
  studyYears: 4,
  annualRatePercent: DEFAULT_ANNUAL_RATE_PERCENT,
  loans: [{ amountYuan: 8000, termYears: 17 }],
};

/** 示例：2025 年入学、4 年制、贷款 20000 元（本科年上限）、期限 17 年。 */
export const SAMPLE_SINGLE_20000: PlanInput = {
  enrollYear: 2025,
  studyYears: 4,
  annualRatePercent: DEFAULT_ANNUAL_RATE_PERCENT,
  loans: [{ amountYuan: 20000, termYears: 17 }],
};

export function money(n: number): string {
  return n.toFixed(2);
}

/** 还款计划结果文本（复制用）。 */
export function planToText(plan: LoanPlan, input: PlanInput): string {
  const lines = [
    'NOVIP 生源地信用助学贷款还款计划（估算）',
    `共 ${plan.loanCount} 笔贷款；本金合计 ${money(plan.totalPrincipal)} 元；入学 ${input.enrollYear} 年、学制 ${input.studyYears} 年、毕业 ${plan.gradYear} 年；年利率 ${input.annualRatePercent.toFixed(2)}%（LPR5Y − 70 个基点，当前 LPR5Y 3.50%）；在校期间利息由财政全额补贴。`,
    `总利息 ${money(plan.totalInterest)} 元；总还款 ${money(plan.totalDue)} 元；${plan.maturityYear} 年 9 月 20 日还清。`,
    ...plan.rows.map(
      (r) =>
        `${r.payDate}（${r.stageLabel}${r.days !== null ? `，${r.days} 天` : ''}）：本金 ${money(r.principal)} 元、利息 ${money(r.interest)} 元、应还 ${money(r.due)} 元、剩余本金 ${money(r.remaining)} 元`,
    ),
    '本计算为估算：利率每年 12 月 21 日随 LPR5Y 重定价，每年应还本金以合同约定为准；最终以学生在线系统/国家助学贷款 APP 查询的当期额度为准。还款日前 5 个自然日内存足应还金额；逾期罚息为合同借款利率的 130%。',
  ];
  return lines.join('\n');
}

/** 还款计划 CSV（下载用，含 BOM 由组件加）。 */
export function planToCsv(plan: LoanPlan): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    ['还款日', '阶段', '计息天数', '本金（元）', '利息（元）', '应还（元）', '剩余本金（元）'],
    ...plan.rows.map((r) => [
      r.payDate,
      r.stageLabel,
      r.days === null ? '整年' : String(r.days),
      money(r.principal),
      money(r.interest),
      money(r.due),
      money(r.remaining),
    ]),
    ['合计', '', '', money(plan.totalPrincipal), money(plan.totalInterest), money(plan.totalDue), '0.00'],
  ];
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

export function csvDateSuffix(d = new Date()): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${day}`;
}
