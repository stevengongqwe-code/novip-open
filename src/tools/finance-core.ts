/**
 * 房贷与利息计算器 · 本地纯计算核心
 *
 * 设计原则：
 *  - 纯函数、零网络、零存储：不引用 fetch / XMLHttpRequest / localStorage 等任何上报或持久化 API；
 *  - 金额一律以「分」为单位的整数参与运算：输入用十进制字符串精确换算成分，避免 0.1+0.2
 *    一类浮点误差在逐月累加中放大；利率按百分比小数参与乘除；
 *  - 每期利息四舍五入到分，最后一期本金取「剩余本金」，因此
 *    总还款 = 本金 + 总利息 严格成立（整数分，不产生累计误差）；
 *  - 同一业务提供两套独立实现：
 *      1) 闭式公式（等额本息月供公式、等额本金利息公式）——用于独立校验；
 *      2) 逐月余额模拟——用于逐月还款表与提前还款模拟；
 *    测试中用两者互相验证，并额外用测试文件内的浮点参考实现做第三方对照。
 *
 * 本文件不包含任何 UI 代码，可在 Node 测试环境中直接导入。
 */

// ---------- 类型 ----------

/** 还款方式：等额本息 / 等额本金 */
export type RepaymentMethod = 'equal-payment' | 'equal-principal';
/** 金额输入单位：元 / 万元 */
export type AmountUnit = 'yuan' | 'wan';
/** 复利频率 */
export type CompoundFrequency = 'year' | 'quarter' | 'month' | 'day';
/** 计息方式：单利 / 复利 */
export type InterestMode = 'simple' | 'compound';

/** 房贷计算参数（金额单位：分） */
export interface MortgageParams {
  /** 贷款本金，单位：分（正整数） */
  principalCents: number;
  /** 年利率百分比，如 4.9 表示 4.9% */
  annualRatePercent: number;
  /** 期限（年），支持小数，范围 1–40 */
  termYears: number;
  /** 还款方式 */
  method: RepaymentMethod;
  /** 每月额外还款（分），可选，默认 0，用于提前还款模拟 */
  extraMonthlyCents?: number;
}

/** 逐月还款表中的一行（金额单位：分） */
export interface ScheduleRow {
  /** 期数，从 1 开始 */
  period: number;
  /** 当期月供（含利息与额外还款） */
  paymentCents: number;
  /** 当期归还本金 */
  principalCents: number;
  /** 当期利息 */
  interestCents: number;
  /** 当期期末剩余本金 */
  balanceCents: number;
}

/** 房贷计算结果 */
export interface MortgageResult {
  principalCents: number;
  annualRatePercent: number;
  termYears: number;
  /** 实际期数（年 × 12，四舍五入） */
  periods: number;
  method: RepaymentMethod;
  /** 月利率（小数，如 0.0040833…） */
  monthlyRate: number;
  /** 等额本息的固定月供（分）；等额本金为 null */
  monthlyPaymentCents: number | null;
  /** 等额本金每月应还本金（分）；等额本息为 null */
  monthlyPrincipalCents: number | null;
  /** 首月月供（分） */
  firstPaymentCents: number;
  /** 末月月供（分） */
  lastPaymentCents: number;
  /** 用户填写的每月额外还款（分） */
  extraMonthlyCents: number;
  /** 总利息（分） */
  totalInterestCents: number;
  /** 总还款（分） */
  totalPaymentCents: number;
  /** 总归还本金（分），应恒等于 principalCents */
  totalPrincipalCents: number;
  /** 利息占比 = 总利息 / 总还款，0–1 */
  interestRatio: number;
  /** 完整逐月还款表 */
  schedule: ScheduleRow[];
  /** 相比不提前还款缩短的期数 */
  monthsSaved: number;
  /** 相比不提前还款节省的利息（分） */
  interestSavedCents: number;
}

/** 利息计算参数（金额单位：分） */
export interface InterestParams {
  mode: InterestMode;
  /** 本金，单位：分（正整数） */
  principalCents: number;
  /** 年利率百分比，如 3 表示 3% */
  annualRatePercent: number;
  /** 年限，支持小数，范围 (0, 100] */
  years: number;
  /** 复利频率（单利模式下仅用于展示与对照） */
  frequency: CompoundFrequency;
}

/** 利息计算结果 */
export interface InterestResult extends InterestParams {
  /** 单利利息（分） */
  simpleInterestCents: number;
  /** 单利本息合计（分） */
  simpleTotalCents: number;
  /** 复利利息（分） */
  compoundInterestCents: number;
  /** 复利本息合计（分） */
  compoundTotalCents: number;
  /** 按所选计息方式的利息（分） */
  selectedInterestCents: number;
  /** 按所选计息方式的本息合计（分） */
  selectedTotalCents: number;
  /** 与单利的差额（分）：复利本息合计 − 单利本息合计 */
  diffVsSimpleCents: number;
  /** 实际年化利率百分比（按所选复利频率） */
  effectiveAnnualRatePercent: number;
}

/** 房贷表单的原始文本值（直接来自输入框） */
export interface MortgageFormValues {
  amountText: string;
  amountUnit: AmountUnit;
  rateText: string;
  termText: string;
  method: RepaymentMethod;
  extraText: string;
}

/** 利息表单的原始文本值 */
export interface InterestFormValues {
  mode: InterestMode;
  principalText: string;
  rateText: string;
  yearsText: string;
  frequency: CompoundFrequency;
}

/** 表单校验结果：params 为 null 表示有错误 */
export interface ValidationOutcome<T> {
  params: T | null;
  errors: string[];
}

// ---------- 常量 ----------

export const MIN_TERM_YEARS = 1;
export const MAX_TERM_YEARS = 40;
export const MIN_ANNUAL_RATE_PERCENT = 0;
export const MAX_ANNUAL_RATE_PERCENT = 24;
export const MAX_INTEREST_YEARS = 100;
/** 金额上限 10 亿元（分），避免超出安全整数与无意义输入 */
export const MAX_PRINCIPAL_CENTS = 100_000_000_000;
export const PERIODS_PER_YEAR = 12;

export const REPAYMENT_METHOD_LABELS: Record<RepaymentMethod, string> = {
  'equal-payment': '等额本息',
  'equal-principal': '等额本金',
};

export const AMOUNT_UNIT_LABELS: Record<AmountUnit, string> = {
  yuan: '元',
  wan: '万元',
};

export const COMPOUND_FREQUENCY_LABELS: Record<CompoundFrequency, string> = {
  year: '按年（每年 1 次）',
  quarter: '按季（每年 4 次）',
  month: '按月（每年 12 次）',
  day: '按日（每年 365 次）',
};

/** 每年复利次数 */
export const COMPOUND_FREQUENCY_DIVISORS: Record<CompoundFrequency, number> = {
  year: 1,
  quarter: 4,
  month: 12,
  day: 365,
};

export const INTEREST_MODE_LABELS: Record<InterestMode, string> = {
  simple: '单利',
  compound: '复利',
};

export const DEFAULT_MORTGAGE_FORM: MortgageFormValues = {
  amountText: '100',
  amountUnit: 'wan',
  rateText: '4.9',
  termText: '30',
  method: 'equal-payment',
  extraText: '',
};

export const DEFAULT_INTEREST_FORM: InterestFormValues = {
  mode: 'compound',
  principalText: '10000',
  rateText: '3',
  yearsText: '3',
  frequency: 'year',
};

// ---------- 金额解析与格式化（分） ----------

/** 十进制字符串按指定小数位数精确换算为整数；超出位数时四舍五入（half-up）。 */
function decimalToScaledInt(text: string, scaleDigits: number): number | null {
  const [intRaw = '', fracRaw = ''] = text.split('.');
  if (!/^\d*$/.test(intRaw) || !/^\d*$/.test(fracRaw)) return null;
  if (intRaw === '' && fracRaw === '') return null;
  const intPart = intRaw === '' ? '0' : intRaw;
  const keptFraction = fracRaw.slice(0, scaleDigits).padEnd(scaleDigits, '0');
  const carry = fracRaw.length > scaleDigits && fracRaw.charCodeAt(scaleDigits) >= 53 ? 1n : 0n; // '5' = 53
  const scaled = BigInt(intPart) * 10n ** BigInt(scaleDigits) + BigInt(keptFraction) + carry;
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(scaled);
}

/**
 * 把用户输入的金额文本换算为「分」。
 * - 元：小数最多 2 位（分），更多位四舍五入；
 * - 万元：小数最多 6 位（万元 × 10000 元 × 100 分），更多位四舍五入；
 * - 允许千分位逗号、空白、末尾「元 / 万元」；
 * - 负数、非数字、空输入抛出中文错误。
 */
export function parseAmountToCents(text: string, unit: AmountUnit): number {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error('请输入金额。');
  const cleaned = raw.replace(/[,\s，]/g, '').replace(/万元|元/g, '');
  if (!cleaned) throw new Error('请输入金额。');
  if (/^-/.test(cleaned)) throw new Error('金额必须大于 0。');
  if (!/^\d+(?:\.\d*)?$|^\.\d+$/.test(cleaned)) throw new Error('金额只能填写数字，可带小数。');
  const cents = decimalToScaledInt(cleaned, unit === 'wan' ? 6 : 2);
  if (cents === null) throw new Error('金额超出可计算范围。');
  return cents;
}

/** 把「分」格式化为带千分位的元字符串，如 530727 → "5,307.27"。 */
export function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  const yuanText = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${yuanText}.${String(fen).padStart(2, '0')}`;
}

/** 把「分」格式化为不带千分位的元字符串，如 530727 → "5307.27"（用于 CSV）。 */
export function formatCentsPlain(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 把「分」换算成表单输入文本（切换元/万元时保持金额不变）。 */
export function centsToAmountText(cents: number, unit: AmountUnit): string {
  if (unit === 'wan') {
    const value = cents / 1_000_000;
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  }
  const yuan = Math.floor(cents / 100);
  const fen = cents % 100;
  return fen === 0 ? String(yuan) : `${yuan}.${String(fen).padStart(2, '0')}`;
}

/** 百分数去掉多余的 0，如 4.90 → "4.9"，24 → "24"。 */
export function formatPercentValue(value: number): string {
  return String(Number(value.toFixed(4)));
}

/** 期数转中文期限，如 366 → "30 年 6 个月"。 */
export function formatPeriodsAsTerm(periods: number): string {
  const years = Math.floor(periods / 12);
  const months = periods % 12;
  if (years <= 0) return `${months} 个月`;
  return months === 0 ? `${years} 年` : `${years} 年 ${months} 个月`;
}

// ---------- 利率与期限 ----------

/** 年利率百分比 → 月利率（小数） */
export function monthlyRateFromAnnual(annualRatePercent: number): number {
  return annualRatePercent / 100 / PERIODS_PER_YEAR;
}

/** 期限（年，可小数）→ 期数（月，四舍五入，最少 1 期） */
export function periodsFromTermYears(termYears: number): number {
  return Math.max(1, Math.round(termYears * PERIODS_PER_YEAR));
}

/** 把表单里的数字文本解析为有限数字；允许 %、年、空格等修饰符。 */
function parseNumericText(text: string): number | null {
  const cleaned = String(text ?? '').replace(/[%％\s]/g, '').replace(/[年个月]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

// ---------- 闭式公式（独立实现 A） ----------

/**
 * 等额本息月供（分，四舍五入到分）：
 *   月供 = 本金 × 月利率 × (1 + 月利率)^期数 ÷ ((1 + 月利率)^期数 − 1)
 * 月利率为 0 时退化为 本金 ÷ 期数。
 */
export function equalPaymentMonthlyPaymentCents(
  principalCents: number,
  annualRatePercent: number,
  periods: number,
): number {
  if (!Number.isFinite(principalCents) || principalCents <= 0) throw new Error('本金必须是大于 0 的数字。');
  if (!Number.isInteger(periods) || periods < 1) throw new Error('期数必须是不小于 1 的整数。');
  const monthlyRate = monthlyRateFromAnnual(annualRatePercent);
  if (monthlyRate === 0) return Math.round(principalCents / periods);
  const factor = Math.pow(1 + monthlyRate, periods);
  return Math.round((principalCents * monthlyRate * factor) / (factor - 1));
}

/** 等额本息闭式总利息（分，未取整，用于与逐月模拟互证）：月供 × 期数 − 本金。 */
export function closedFormEqualPaymentTotalInterestCents(
  principalCents: number,
  annualRatePercent: number,
  periods: number,
): number {
  const monthlyRate = monthlyRateFromAnnual(annualRatePercent);
  if (monthlyRate === 0) return 0;
  const factor = Math.pow(1 + monthlyRate, periods);
  const exactMonthlyPayment = (principalCents * monthlyRate * factor) / (factor - 1);
  return exactMonthlyPayment * periods - principalCents;
}

/**
 * 等额本金闭式总利息（分，未取整）：
 * 每期利息按递减的剩余本金计算，总利息 = 本金 × 月利率 × (期数 + 1) ÷ 2。
 */
export function closedFormEqualPrincipalTotalInterestCents(
  principalCents: number,
  annualRatePercent: number,
  periods: number,
): number {
  const monthlyRate = monthlyRateFromAnnual(annualRatePercent);
  if (monthlyRate === 0) return 0;
  return (principalCents * monthlyRate * (periods + 1)) / 2;
}

// ---------- 逐月余额模拟（独立实现 B） ----------

export interface ScheduleParams {
  principalCents: number;
  annualRatePercent: number;
  /** 期数（月），不小于 1 */
  periods: number;
  method: RepaymentMethod;
  extraMonthlyCents?: number;
}

/**
 * 逐月余额模拟，生成还款表。
 * 舍入规则：
 *  - 每期利息 = round(期初剩余本金 × 月利率)，四舍五入到分；
 *  - 等额本息每期还固定月供（已四舍五入到分），等额本金每期还固定本金（四舍五入到分）；
 *  - 每月额外还款全部冲减本金，与常规月供在同一期结算；
 *  - 最后一期（或余额不足一期时）本金 = 剩余本金，保证期末余额恰好为 0。
 */
export function buildAmortizationSchedule(params: ScheduleParams): ScheduleRow[] {
  const { principalCents, periods, method } = params;
  if (!Number.isInteger(principalCents) || principalCents <= 0) throw new Error('本金必须是大于 0 的分单位整数。');
  if (!Number.isInteger(periods) || periods < 1) throw new Error('期数必须是不小于 1 的整数。');
  if (method !== 'equal-payment' && method !== 'equal-principal') throw new Error('还款方式无效。');
  const extraMonthlyCents = params.extraMonthlyCents ?? 0;
  if (!Number.isInteger(extraMonthlyCents) || extraMonthlyCents < 0) throw new Error('每月额外还款必须是不小于 0 的分单位整数。');

  const monthlyRate = monthlyRateFromAnnual(params.annualRatePercent);
  const equalPaymentCents =
    method === 'equal-payment'
      ? equalPaymentMonthlyPaymentCents(principalCents, params.annualRatePercent, periods)
      : 0;
  const equalPrincipalCents = method === 'equal-principal' ? Math.round(principalCents / periods) : 0;

  const rows: ScheduleRow[] = [];
  let balanceCents = principalCents;
  for (let period = 1; period <= periods && balanceCents > 0; period += 1) {
    const interestCents = Math.round(balanceCents * monthlyRate);
    let principalPart =
      method === 'equal-payment' ? equalPaymentCents - interestCents + extraMonthlyCents : equalPrincipalCents + extraMonthlyCents;
    if (principalPart < 0 || period === periods || principalPart >= balanceCents) principalPart = balanceCents;
    const paymentCents = principalPart + interestCents;
    balanceCents -= principalPart;
    rows.push({ period, paymentCents, principalCents: principalPart, interestCents, balanceCents });
  }
  if (balanceCents !== 0) throw new Error('还款计划未能在期限内结清，请检查输入参数。');
  return rows;
}

/** 汇总若干金额（分），避免浮点误差。 */
function sumCents(values: number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

// ---------- 房贷计算（对外主入口） ----------

/** 校验已解析的房贷参数；非法时抛出中文错误。 */
export function assertMortgageParams(params: MortgageParams): void {
  if (!Number.isInteger(params.principalCents) || params.principalCents <= 0) {
    throw new Error('贷款金额必须大于 0。');
  }
  if (params.principalCents > MAX_PRINCIPAL_CENTS) throw new Error('贷款金额过大，上限为 10 亿元。');
  if (!Number.isFinite(params.annualRatePercent) || params.annualRatePercent < MIN_ANNUAL_RATE_PERCENT || params.annualRatePercent > MAX_ANNUAL_RATE_PERCENT) {
    throw new Error('年利率需在 0–24% 之间。');
  }
  if (!Number.isFinite(params.termYears) || params.termYears < MIN_TERM_YEARS || params.termYears > MAX_TERM_YEARS) {
    throw new Error('期限需在 1–40 年之间。');
  }
  if (params.method !== 'equal-payment' && params.method !== 'equal-principal') throw new Error('请选择还款方式。');
  const extra = params.extraMonthlyCents ?? 0;
  if (!Number.isInteger(extra) || extra < 0) throw new Error('每月额外还款必须是不小于 0 的金额。');
}

/**
 * 房贷主计算：闭式参数 + 逐月模拟，返回月供、总利息、总还款与完整还款表。
 * 额外还款（提前还款模拟）与主算法共用同一套舍入规则；比较基准为「不额外还款」。
 */
export function calculateMortgage(params: MortgageParams): MortgageResult {
  assertMortgageParams(params);
  const periods = periodsFromTermYears(params.termYears);
  const extraMonthlyCents = params.extraMonthlyCents ?? 0;
  const schedule = buildAmortizationSchedule({
    principalCents: params.principalCents,
    annualRatePercent: params.annualRatePercent,
    periods,
    method: params.method,
    extraMonthlyCents,
  });
  const baselineSchedule =
    extraMonthlyCents > 0
      ? buildAmortizationSchedule({
          principalCents: params.principalCents,
          annualRatePercent: params.annualRatePercent,
          periods,
          method: params.method,
        })
      : schedule;

  const totalInterestCents = sumCents(schedule.map((row) => row.interestCents));
  const totalPaymentCents = sumCents(schedule.map((row) => row.paymentCents));
  const totalPrincipalCents = sumCents(schedule.map((row) => row.principalCents));
  const baselineInterestCents = sumCents(baselineSchedule.map((row) => row.interestCents));
  const monthlyPaymentCents =
    params.method === 'equal-payment'
      ? equalPaymentMonthlyPaymentCents(params.principalCents, params.annualRatePercent, periods)
      : null;

  return {
    principalCents: params.principalCents,
    annualRatePercent: params.annualRatePercent,
    termYears: params.termYears,
    periods,
    method: params.method,
    monthlyRate: monthlyRateFromAnnual(params.annualRatePercent),
    monthlyPaymentCents,
    monthlyPrincipalCents: params.method === 'equal-principal' ? Math.round(params.principalCents / periods) : null,
    firstPaymentCents: schedule[0].paymentCents,
    lastPaymentCents: schedule[schedule.length - 1].paymentCents,
    extraMonthlyCents,
    totalInterestCents,
    totalPaymentCents,
    totalPrincipalCents,
    interestRatio: totalPaymentCents > 0 ? totalInterestCents / totalPaymentCents : 0,
    schedule,
    monthsSaved: baselineSchedule.length - schedule.length,
    interestSavedCents: baselineInterestCents - totalInterestCents,
  };
}

// ---------- 房贷表单校验 ----------

/** 校验房贷表单文本；收集全部错误（中文），全部合法时返回解析后的参数。 */
export function validateMortgageForm(values: MortgageFormValues): ValidationOutcome<MortgageParams> {
  const errors: string[] = [];
  let principalCents: number | null = null;
  try {
    principalCents = parseAmountToCents(values.amountText, values.amountUnit);
    if (principalCents <= 0) throw new Error('贷款金额必须大于 0。');
    if (principalCents > MAX_PRINCIPAL_CENTS) throw new Error('贷款金额过大，上限为 10 亿元。');
  } catch (error) {
    errors.push((error as Error).message);
  }

  const rate = parseNumericText(values.rateText);
  if (rate === null) errors.push('请输入年利率（0–24%）。');
  else if (rate < MIN_ANNUAL_RATE_PERCENT || rate > MAX_ANNUAL_RATE_PERCENT) errors.push('年利率需在 0–24% 之间。');

  const termYears = parseNumericText(values.termText);
  if (termYears === null) errors.push('请输入贷款期限（年）。');
  else if (termYears < MIN_TERM_YEARS || termYears > MAX_TERM_YEARS) errors.push('期限需在 1–40 年之间。');

  if (values.method !== 'equal-payment' && values.method !== 'equal-principal') errors.push('请选择还款方式。');

  let extraMonthlyCents = 0;
  if (values.extraText.trim()) {
    try {
      extraMonthlyCents = parseAmountToCents(values.extraText, 'yuan');
      if (extraMonthlyCents < 0) throw new Error('每月额外还款不能为负数。');
    } catch (error) {
      errors.push((error as Error).message);
    }
  }

  if (errors.length > 0 || principalCents === null || rate === null || termYears === null) {
    return { params: null, errors };
  }
  return {
    params: {
      principalCents,
      annualRatePercent: rate,
      termYears,
      method: values.method,
      extraMonthlyCents,
    },
    errors: [],
  };
}

// ---------- 单利 / 复利 ----------

/** 校验已解析的利息参数；非法时抛出中文错误。 */
export function assertInterestParams(params: InterestParams): void {
  if (params.mode !== 'simple' && params.mode !== 'compound') throw new Error('请选择计息方式。');
  if (!Number.isInteger(params.principalCents) || params.principalCents <= 0) throw new Error('本金必须大于 0。');
  if (params.principalCents > MAX_PRINCIPAL_CENTS) throw new Error('本金过大，上限为 10 亿元。');
  if (!Number.isFinite(params.annualRatePercent) || params.annualRatePercent < MIN_ANNUAL_RATE_PERCENT || params.annualRatePercent > MAX_ANNUAL_RATE_PERCENT) {
    throw new Error('年利率需在 0–24% 之间。');
  }
  if (!Number.isFinite(params.years) || params.years <= 0 || params.years > MAX_INTEREST_YEARS) {
    throw new Error('年限需大于 0 且不超过 100 年。');
  }
  if (!(params.frequency in COMPOUND_FREQUENCY_DIVISORS)) throw new Error('复利频率无效。');
}

/**
 * 利息主计算：单利与复利都算，返回所选方式的结果、另一方式的结果与差额。
 * 舍入：仅最终结果四舍五入到分（单利利息与复利本息合计各舍入一次）。
 */
export function calculateInterest(params: InterestParams): InterestResult {
  assertInterestParams(params);
  const annualRate = params.annualRatePercent / 100;
  const simpleInterestCents = Math.round(params.principalCents * annualRate * params.years);
  const simpleTotalCents = params.principalCents + simpleInterestCents;

  const divisor = COMPOUND_FREQUENCY_DIVISORS[params.frequency];
  const compoundTotalCents = Math.round(params.principalCents * Math.pow(1 + annualRate / divisor, divisor * params.years));
  const compoundInterestCents = compoundTotalCents - params.principalCents;

  const selectedInterestCents = params.mode === 'simple' ? simpleInterestCents : compoundInterestCents;
  const selectedTotalCents = params.mode === 'simple' ? simpleTotalCents : compoundTotalCents;

  return {
    ...params,
    simpleInterestCents,
    simpleTotalCents,
    compoundInterestCents,
    compoundTotalCents,
    selectedInterestCents,
    selectedTotalCents,
    diffVsSimpleCents: compoundTotalCents - simpleTotalCents,
    effectiveAnnualRatePercent: (Math.pow(1 + annualRate / divisor, divisor) - 1) * 100,
  };
}

/** 校验利息表单文本；收集全部错误（中文），全部合法时返回解析后的参数。 */
export function validateInterestForm(values: InterestFormValues): ValidationOutcome<InterestParams> {
  const errors: string[] = [];
  if (values.mode !== 'simple' && values.mode !== 'compound') errors.push('请选择计息方式。');
  if (!(values.frequency in COMPOUND_FREQUENCY_DIVISORS)) errors.push('请选择复利频率。');

  let principalCents: number | null = null;
  try {
    principalCents = parseAmountToCents(values.principalText, 'yuan');
    if (principalCents <= 0) throw new Error('本金必须大于 0。');
    if (principalCents > MAX_PRINCIPAL_CENTS) throw new Error('本金过大，上限为 10 亿元。');
  } catch (error) {
    errors.push((error as Error).message);
  }

  const rate = parseNumericText(values.rateText);
  if (rate === null) errors.push('请输入年利率（0–24%）。');
  else if (rate < MIN_ANNUAL_RATE_PERCENT || rate > MAX_ANNUAL_RATE_PERCENT) errors.push('年利率需在 0–24% 之间。');

  const years = parseNumericText(values.yearsText);
  if (years === null) errors.push('请输入年限。');
  else if (years <= 0 || years > MAX_INTEREST_YEARS) errors.push('年限需大于 0 且不超过 100 年。');

  if (errors.length > 0 || principalCents === null || rate === null || years === null) {
    return { params: null, errors };
  }
  return {
    params: {
      mode: values.mode,
      principalCents,
      annualRatePercent: rate,
      years,
      frequency: values.frequency,
    },
    errors: [],
  };
}

// ---------- CSV 与复制文案 ----------

/** 完整逐月还款表 CSV（UTF-8 文本，不含 BOM；下载时由调用方补 BOM）。 */
export function mortgageScheduleCsv(result: MortgageResult): string {
  const header = '期数,月供（元）,本金（元）,利息（元）,剩余本金（元）';
  const lines = result.schedule.map((row) =>
    [
      row.period,
      formatCentsPlain(row.paymentCents),
      formatCentsPlain(row.principalCents),
      formatCentsPlain(row.interestCents),
      formatCentsPlain(row.balanceCents),
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

const REPAYMENT_HINTS =
  '说明：月供与利息均为本地估算，四舍五入到分；实际利率、手续费、保险、提前还款规则以贷款合同和银行账单为准。';

/** 房贷结果的纯文本摘要（用于「复制结果」）。 */
export function mortgageSummaryText(result: MortgageResult): string {
  const lines: string[] = [
    '【房贷计算结果】',
    `贷款金额：${formatCents(result.principalCents)} 元`,
    `年利率：${formatPercentValue(result.annualRatePercent)}%`,
    `期限：${formatPercentValue(result.termYears)} 年（共 ${result.periods} 期）`,
    `还款方式：${REPAYMENT_METHOD_LABELS[result.method]}`,
  ];
  if (result.method === 'equal-payment' && result.monthlyPaymentCents !== null) {
    lines.push(`月供：${formatCents(result.monthlyPaymentCents)} 元`);
  } else {
    if (result.monthlyPrincipalCents !== null) lines.push(`每月本金：${formatCents(result.monthlyPrincipalCents)} 元`);
    lines.push(`首月月供：${formatCents(result.firstPaymentCents)} 元`, `末月月供：${formatCents(result.lastPaymentCents)} 元`);
  }
  lines.push(
    `总利息：${formatCents(result.totalInterestCents)} 元`,
    `总还款：${formatCents(result.totalPaymentCents)} 元`,
    `利息占比：${(result.interestRatio * 100).toFixed(2)}%`,
  );
  if (result.extraMonthlyCents > 0) {
    lines.push(
      `每月额外还款：${formatCents(result.extraMonthlyCents)} 元（估算）`,
      `节省利息：${formatCents(result.interestSavedCents)} 元`,
      `缩短期限：${formatPeriodsAsTerm(result.monthsSaved)}（${result.monthsSaved} 期）`,
    );
  }
  lines.push('', '前 12 期还款：');
  for (const row of result.schedule.slice(0, 12)) {
    lines.push(
      `第${row.period}期：月供 ${formatCentsPlain(row.paymentCents)}，本金 ${formatCentsPlain(row.principalCents)}，利息 ${formatCentsPlain(row.interestCents)}，剩余 ${formatCentsPlain(row.balanceCents)}`,
    );
  }
  lines.push('', '完整逐月还款表请下载 CSV。', REPAYMENT_HINTS);
  return lines.join('\n');
}

/** 利息结果的纯文本摘要（用于「复制结果」）。 */
export function interestSummaryText(result: InterestResult): string {
  return [
    '【利息计算结果】',
    `本金：${formatCents(result.principalCents)} 元`,
    `年利率：${formatPercentValue(result.annualRatePercent)}%`,
    `年限：${formatPercentValue(result.years)} 年`,
    `计息方式：${INTEREST_MODE_LABELS[result.mode]}`,
    `复利频率：${result.frequency === 'year' && result.mode === 'simple' ? '不适用（单利）' : COMPOUND_FREQUENCY_LABELS[result.frequency]}`,
    `本息合计：${formatCents(result.selectedTotalCents)} 元`,
    `利息：${formatCents(result.selectedInterestCents)} 元`,
    `单利本息合计：${formatCents(result.simpleTotalCents)} 元`,
    `复利本息合计：${formatCents(result.compoundTotalCents)} 元`,
    `复利比单利多：${formatCents(result.diffVsSimpleCents)} 元`,
    `实际年化利率：${formatPercentValue(result.effectiveAnnualRatePercent)}%`,
    '',
    '说明：结果仅按输入的利率与期限做本地估算，不含税费；实际收益/利息以产品条款为准。',
  ].join('\n');
}

// ---------- 公式说明 ----------

export const MORTGAGE_FORMULAS: string[] = [
  '等额本息：月供 = 本金 × 月利率 × (1 + 月利率)^期数 ÷ ((1 + 月利率)^期数 − 1)，其中月利率 = 年利率 ÷ 12。',
  '等额本金：每期本金 = 本金 ÷ 期数（四舍五入到分，最后一期取剩余本金）；每期利息 = 期初剩余本金 × 月利率；月供逐月递减。',
  '金额以「分」为单位做整数运算；每期利息四舍五入到分，最后一期本金取剩余本金，因此总还款 = 本金 + 总利息 严格成立。',
  '提前还款：每月额外还款全部冲减本金，与主算法共用同一套逐月舍入规则；节省的利息与缩短的期限均为估算。',
  '本工具只做本地估算，不含手续费、保险、税费等；实际金额以贷款合同和银行账单为准。',
];

export const INTEREST_FORMULAS: string[] = [
  '单利：利息 = 本金 × 年利率 × 年限。',
  '复利：本息合计 = 本金 × (1 + 年利率 ÷ 每年复利次数)^(每年复利次数 × 年限)。',
  '复利次数：按年 = 1、按季 = 4、按月 = 12、按日 = 365。',
  '实际年化利率（EAR）= (1 + 年利率 ÷ 每年复利次数)^每年复利次数 − 1。',
  '结果四舍五入到分；差额 = 复利本息合计 − 单利本息合计。',
];
