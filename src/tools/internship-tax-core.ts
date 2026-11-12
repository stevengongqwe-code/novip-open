/**
 * 实习劳务报酬个税计算 · 纯函数核心（Factory Day 11，2026-11-06）。
 * 本模块不碰 DOM、不联网、不存 localStorage：一般按次预扣法、学生
 * 累计预扣法、年度汇算估算、结果文本与 CSV 均可单测。
 *
 * 口径（与 PRD、页面、单测共同承诺；依据国家税务总局公告 2018 年
 * 第 61 号、2020 年第 13 号；财税〔2018〕164 号）：
 * 适用对象：中国居民个人、正在接受全日制学历教育的学生因实习取得
 * 劳务报酬所得。累计预扣法由扣缴义务人选择适用，"可"不是"必须"。
 * 一般按次法：每次收入 ≤4000 减除费用 800；>4000 减 20%（收入额＝
 * 收入 × 80%）；收入额 ≤20000 预扣率 20%（速算扣除 0）、20000–
 * 50000 为 30%（2000）、>50000 为 40%（7000）；应预扣＝收入额 ×
 * 预扣率 − 速算扣除；同一项目连续性收入以一个月内取得的收入为
 * 一次（本工具按月为"一次"）。
 * 学生累计预扣法：累计收入额＝累计收入 × 80%；累计减除费用＝
 * 5000 元/月 × 本单位实习月份数；累计应纳税所得额＝累计收入额 −
 * 累计减除费用（≤0 则本期预扣 0）；按工资薪金七级预扣率表计税；
 * 本期应预扣＝累计应纳税所得额 × 预扣率 − 速算扣除 − 累计已预扣
 * （不为负）；专项扣除/专项附加扣除在预扣环节暂不扣除。
 * 年度汇算估算：全年收入额＝劳务报酬收入 × 80% ＋ 其他综合所得
 * 收入额（可选填，工资薪金按收入全额）；应纳税所得额＝全年收入
 * 额 − 60000 − 专项扣除 − 专项附加扣除 − 其他扣除（≤0 则全年应
 * 纳税 0）；按七级税率表计税；应退（补）＝全年应纳税额 − 全年已
 * 预扣（两种口径各算一行）。汇算期次年 3 月 1 日–6 月 30 日。
 * 金额保留 2 位小数；不含增值税及附加、社保、非居民、经营所得、
 * 稿酬/特许权使用费；预扣 ≠ 最终税负，最终以税务机关核定为准。
 */

export interface TaxBracket {
  limit: number;
  rate: number;
  quick: number;
}

/** 工资薪金所得预扣率表一（七级超额累进；累计预扣法与年度汇算共用）。 */
export const WITHHOLDING_BRACKETS_7: TaxBracket[] = [
  { limit: 36000, rate: 0.03, quick: 0 },
  { limit: 144000, rate: 0.1, quick: 2520 },
  { limit: 300000, rate: 0.2, quick: 16920 },
  { limit: 420000, rate: 0.25, quick: 31920 },
  { limit: 660000, rate: 0.3, quick: 52920 },
  { limit: 960000, rate: 0.35, quick: 85920 },
  { limit: Infinity, rate: 0.45, quick: 181920 },
];

/** 劳务报酬所得预扣率表二（三级超额累进；一般按次法专用）。 */
export const LABOR_BRACKETS_3: TaxBracket[] = [
  { limit: 20000, rate: 0.2, quick: 0 },
  { limit: 50000, rate: 0.3, quick: 2000 },
  { limit: Infinity, rate: 0.4, quick: 7000 },
];

export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** 按税率表计税：应纳税所得额 ≤0 时税额为 0；命中首个 limit ≥ 所得额的档位；结果保留 2 位小数。 */
export function applyBracket(taxable: number, brackets: TaxBracket[]): number {
  if (!Number.isFinite(taxable) || taxable <= 0) return 0;
  const b = brackets.find((item) => taxable <= item.limit) ?? brackets[brackets.length - 1];
  return round2(taxable * b.rate - b.quick);
}

function assertMoney(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100_000_000) {
    throw new Error(`${label}须为 0–100000000 之间的数字`);
  }
}

/** 劳务报酬收入额：≤4000 减 800；>4000 减 20%。 */
export function laborIncomeAmount(gross: number): number {
  assertMoney(gross, '税前收入');
  return gross <= 4000 ? Math.max(0, gross - 800) : round2(gross * 0.8);
}

/** 一般按次法：单月（一次）应预扣税额。 */
export function generalWithholding(gross: number): number {
  return round2(applyBracket(laborIncomeAmount(gross), LABOR_BRACKETS_3));
}

export interface MonthInput {
  label: string;
  gross: number;
}

/** 解析月度粘贴文本：每行「月份 金额」或只填金额（自动按顺序编月）。 */
export function parseMonthly(text: string): MonthInput[] {
  const rows: MonthInput[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[\s,，\t]+/);
    if (parts.length === 1) {
      const gross = Number(parts[0]);
      if (!Number.isFinite(gross)) throw new Error(`第 ${idx + 1} 行金额不是数字`);
      rows.push({ label: `第${rows.length + 1}个月`, gross });
      return;
    }
    if (parts.length !== 2) throw new Error(`第 ${idx + 1} 行格式不对，应为「月份 金额」或只填金额`);
    const gross = Number(parts[1]);
    if (!Number.isFinite(gross)) throw new Error(`第 ${idx + 1} 行金额不是数字`);
    if (parts[0].length > 20) throw new Error(`第 ${idx + 1} 行月份过长`);
    rows.push({ label: parts[0], gross });
  });
  if (rows.length === 0) throw new Error('请至少填一个月的税前实习报酬');
  if (rows.length > 24) throw new Error('一次最多算 24 个月');
  for (const r of rows) assertMoney(r.gross, `「${r.label}」税前收入`);
  return rows;
}

export interface MonthRow extends MonthInput {
  cumulativeTax: number;
  cumulativeNet: number;
  generalTax: number;
  generalNet: number;
  saved: number; // 累计法比一般法少扣的税（可为 0，不为负）
}

export interface MonthlyResult {
  rows: MonthRow[];
  count: number;
  grossTotal: number;
  cumulativeTotal: number;
  generalTotal: number;
  savedTotal: number;
  cumulativeNetTotal: number;
  generalNetTotal: number;
}

/** 逐月对比：累计预扣法（学生实习）vs 一般按次法。 */
export function calcMonthly(months: MonthInput[]): MonthlyResult {
  if (months.length === 0) throw new Error('请至少填一个月的税前实习报酬');
  let cumGross = 0;
  let cumTaxPrev = 0;
  const rows: MonthRow[] = months.map((m, i) => {
    cumGross = round2(cumGross + m.gross);
    const cumIncomeAmount = round2(cumGross * 0.8);
    const cumDeduction = 5000 * (i + 1);
    const cumTaxable = Math.max(0, round2(cumIncomeAmount - cumDeduction));
    const cumTax = round2(applyBracket(cumTaxable, WITHHOLDING_BRACKETS_7));
    const cumulativeTax = round2(Math.max(0, cumTax - cumTaxPrev));
    cumTaxPrev = cumTax;
    const generalTax = generalWithholding(m.gross);
    return {
      ...m,
      cumulativeTax,
      cumulativeNet: round2(m.gross - cumulativeTax),
      generalTax,
      generalNet: round2(m.gross - generalTax),
      saved: round2(Math.max(0, generalTax - cumulativeTax)),
    };
  });
  const sum = (pick: (r: MonthRow) => number) => round2(rows.reduce((a, r) => a + pick(r), 0));
  return {
    rows,
    count: rows.length,
    grossTotal: sum((r) => r.gross),
    cumulativeTotal: sum((r) => r.cumulativeTax),
    generalTotal: sum((r) => r.generalTax),
    savedTotal: sum((r) => r.saved),
    cumulativeNetTotal: sum((r) => r.cumulativeNet),
    generalNetTotal: sum((r) => r.generalNet),
  };
}

export interface SettlementInput {
  laborGrossTotal: number;
  otherIncomeAmount: number;
  specialDeduction: number;
  specialAdditionalDeduction: number;
  otherDeduction: number;
  withheldCumulative: number;
  withheldGeneral: number;
}

export interface SettlementResult {
  totalIncomeAmount: number;
  taxable: number;
  annualTax: number;
  /** 正数 = 应退税，负数 = 应补税（两种口径各一行）。 */
  refundCumulative: number;
  refundGeneral: number;
}

/** 年度汇算估算：劳务报酬并入综合所得，多退少补。 */
export function calcSettlement(input: SettlementInput): SettlementResult {
  assertMoney(input.laborGrossTotal, '劳务报酬总额');
  assertMoney(input.otherIncomeAmount, '其他综合所得收入额');
  assertMoney(input.specialDeduction, '专项扣除');
  assertMoney(input.specialAdditionalDeduction, '专项附加扣除');
  assertMoney(input.otherDeduction, '其他扣除');
  assertMoney(input.withheldCumulative, '累计法已预扣');
  assertMoney(input.withheldGeneral, '一般法已预扣');
  const totalIncomeAmount = round2(input.laborGrossTotal * 0.8 + input.otherIncomeAmount);
  const taxable = Math.max(
    0,
    round2(totalIncomeAmount - 60000 - input.specialDeduction - input.specialAdditionalDeduction - input.otherDeduction),
  );
  const annualTax = round2(applyBracket(taxable, WITHHOLDING_BRACKETS_7));
  return {
    totalIncomeAmount,
    taxable,
    annualTax,
    refundCumulative: round2(input.withheldCumulative - annualTax),
    refundGeneral: round2(input.withheldGeneral - annualTax),
  };
}

/** 逐月对比结果文本（复制用）。 */
export function monthlyToText(result: MonthlyResult): string {
  const lines = [
    'NOVIP 实习劳务报酬个税计算结果（两种口径对比）',
    `共 ${result.count} 个月；税前合计 ${result.grossTotal.toFixed(2)} 元`,
    `累计预扣法（学生实习）：预扣合计 ${result.cumulativeTotal.toFixed(2)} 元，到手合计 ${result.cumulativeNetTotal.toFixed(2)} 元`,
    `一般按次法：预扣合计 ${result.generalTotal.toFixed(2)} 元，到手合计 ${result.generalNetTotal.toFixed(2)} 元`,
    `累计法比一般法少扣 ${result.savedTotal.toFixed(2)} 元。`,
    ...result.rows.map(
      (r) =>
        `${r.label}：税前 ${r.gross.toFixed(2)} 元；累计法预扣 ${r.cumulativeTax.toFixed(2)} 元、到手 ${r.cumulativeNet.toFixed(2)} 元；一般法预扣 ${r.generalTax.toFixed(2)} 元、到手 ${r.generalNet.toFixed(2)} 元`,
    ),
    '累计预扣法由扣缴义务人选择适用；预扣不等于最终税负，年度汇算多退少补，最终以税务机关核定为准。',
  ];
  return lines.join('\n');
}

/** 逐月对比 CSV（下载用，含 BOM 由组件加）。 */
export function monthlyToCsv(result: MonthlyResult): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    ['月份', '税前收入（元）', '累计法预扣（元）', '累计法到手（元）', '一般法预扣（元）', '一般法到手（元）', '累计法少扣（元）'],
    ...result.rows.map((r) => [
      r.label,
      r.gross.toFixed(2),
      r.cumulativeTax.toFixed(2),
      r.cumulativeNet.toFixed(2),
      r.generalTax.toFixed(2),
      r.generalNet.toFixed(2),
      r.saved.toFixed(2),
    ]),
    ['合计', result.grossTotal.toFixed(2), result.cumulativeTotal.toFixed(2), result.cumulativeNetTotal.toFixed(2), result.generalTotal.toFixed(2), result.generalNetTotal.toFixed(2), result.savedTotal.toFixed(2)],
  ];
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

/** 汇算结果文本（复制用）。 */
export function settlementToText(settlement: SettlementResult, monthly: MonthlyResult): string {
  const refundLine = (v: number) => (v >= 0 ? `应退 ${v.toFixed(2)} 元` : `应补 ${(-v).toFixed(2)} 元`);
  return [
    'NOVIP 实习劳务报酬年度汇算估算',
    `全年收入额：${settlement.totalIncomeAmount.toFixed(2)} 元（劳务报酬按 80% 计入）`,
    `全年应纳税所得额：${settlement.taxable.toFixed(2)} 元（已减 60000 元基本减除费用及所填扣除）`,
    `全年应纳税额：${settlement.annualTax.toFixed(2)} 元`,
    `按累计法已预扣 ${monthly.cumulativeTotal.toFixed(2)} 元，${refundLine(settlement.refundCumulative)}；按一般法已预扣 ${monthly.generalTotal.toFixed(2)} 元，${refundLine(settlement.refundGeneral)}。`,
    '汇算期为次年 3 月 1 日–6 月 30 日；本估算不含未填的专项扣除细节，最终以税务机关核定为准。',
  ].join('\n');
}

/** PRD 锁定示例：小张 8 月实习 8000 元（官方示例）。 */
export const SAMPLE_XIAOZHANG_TEXT = '8月 8000';

/** PRD 锁定示例：暑期 3 个月，每月 8000 元。 */
export const SAMPLE_SUMMER_TEXT = ['7月 8000', '8月 8000', '9月 8000'].join('\n');

/** PRD 锁定示例：高报酬 50000 元 × 2 个月。 */
export const SAMPLE_HIGH_TEXT = ['7月 50000', '8月 50000'].join('\n');

export function csvDateSuffix(d = new Date()): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${day}`;
}
