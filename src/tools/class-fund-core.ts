/**
 * 班费账本与公示 · 纯函数核心（Factory Day 7，2026-11-02）。
 * 本模块不碰 DOM、不联网：金额解析、名单校验、台账汇总、欠费、公示文本、
 * CSV 导出均可单测。
 *
 * 金额口径：全程以“分”为整数单位计算，杜绝浮点误差；结余恒等式：
 * 结余 = 期初结余 + 总收入 − 总支出。
 * 与 split-bill 的区别（模型不同，不可互换）：本模块没有“人际欠款网”
 * 与转账清单；钱属于班级整体资金池，另有“每人应交/已交/欠费” dues 模型。
 * 欠费口径（页面与单测共同承诺）：只按“应交标准 × 人数”算，不把流水
 * 中的收入行重复计入已交，避免双重计数；已交是班委手工勾选，不是支付凭证。
 */

export const MAX_AMOUNT_CENTS = 99_999_999_999; // ¥999,999,999.99

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}¥${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function formatYuan(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** 金额文本转分：支持 ¥/￥ 前缀与千分位逗号；最多 2 位小数；必须大于 0。 */
export function parseAmountToCents(text: string): number {
  const cleaned = text.trim().replace(/^[¥￥]/, '').replace(/[,，\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error('金额格式不对：请输入数字，最多保留 2 位小数（例如 50 或 68.50）。');
  }
  const [intPart, fracPart = ''] = cleaned.split('.');
  const cents = Number(intPart) * 100 + Number((fracPart + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('金额必须大于 0。');
  if (cents > MAX_AMOUNT_CENTS) throw new Error('单笔金额过大：请拆成多笔记录。');
  return cents;
}

/** 可为 0 的金额文本转分：空串视为 0；格式与 parseAmountToCents 同口径，但允许 0。 */
export function parseZeroOrPositiveCents(text: string): number {
  const cleaned = text.trim().replace(/^[¥￥]/, '').replace(/[,，\s]/g, '');
  if (cleaned === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error('金额格式不对：请输入数字，最多保留 2 位小数（例如 50 或 68.50），不填则按 0 算。');
  }
  const [intPart, fracPart = ''] = cleaned.split('.');
  const cents = Number(intPart) * 100 + Number((fracPart + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('金额不能为负数。');
  if (cents > MAX_AMOUNT_CENTS) throw new Error('金额过大：请拆成多笔记录。');
  return cents;
}

/** 解析成员名单：按换行、逗号、分号、顿号切分；至少 2 人；人名不得重复。 */
export function parseMembers(input: string): string[] {
  const names = input
    .split(/[\r\n,，;；、]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (names.length < 2) throw new Error('班费名单至少需要 2 人：请在名单里写 2 个及以上人名。');
  const seen = new Map<string, number>();
  for (const n of names) seen.set(n, (seen.get(n) ?? 0) + 1);
  const dup = [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n);
  if (dup.length > 0) throw new Error(`人名重复：${dup.join('、')} 出现了多次，班费按人名区分，请改名或加后缀区分。`);
  return names;
}

/** 校验日期：严格 YYYY-MM-DD 且为真实日期；返回原串。 */
export function parseDate(text: string): string {
  const t = text.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) throw new Error('日期格式不对：请用 YYYY-MM-DD，例如 2026-10-20。');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`日期不存在：${t} 不是真实日期，请核对后再记。`);
  }
  return t;
}

/** 本地今天（YYYY-MM-DD），供组件默认值与 CSV 文件名使用。 */
export function todayLocal(d = new Date()): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** CSV 文件名日期后缀：2026-10-20 → 20261020。 */
export function csvDateSuffix(d = new Date()): string {
  return todayLocal(d).replace(/-/g, '');
}

export type FundKind = 'income' | 'expense';

export const INCOME_CATEGORIES = ['班费', '赞助', '退款', '其他'] as const;
export const EXPENSE_CATEGORIES = ['打印资料', '团建活动', '奖品', '场地', '交通', '其他'] as const;

export interface FundEntry {
  date: string;
  kind: FundKind;
  category: string;
  title: string;
  amountCents: number;
  handler?: string;
  note?: string;
}

export function validateEntry(e: FundEntry): void {
  parseDate(e.date);
  if (!e.title.trim()) throw new Error('请给这笔流水写个标题（例如“打印复习资料”）。');
  if (!e.category.trim()) throw new Error('请给这笔流水选个分类。');
  if (!Number.isSafeInteger(e.amountCents) || e.amountCents <= 0) throw new Error(`「${e.title}」的金额必须大于 0。`);
  if (e.amountCents > MAX_AMOUNT_CENTS) throw new Error(`「${e.title}」的金额过大，请拆成多笔记录。`);
}

/** 台账序时排序：按日期升序，日期相同保持记入顺序。 */
export function sortedEntries(entries: readonly FundEntry[]): FundEntry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface FundSummary {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  /** 支出分类合计（按金额降序）。 */
  expenseByCategory: { category: string; cents: number }[];
}

/** 汇总：结余 = 期初结余 + 总收入 − 总支出（恒等式，单测断言）。 */
export function computeFundSummary(entries: readonly FundEntry[], openingCents: number): FundSummary {
  if (!Number.isSafeInteger(openingCents) || openingCents < 0) throw new Error('期初结余不能为负数。');
  for (const e of entries) validateEntry(e);
  let incomeCents = 0;
  let expenseCents = 0;
  const byCat = new Map<string, number>();
  for (const e of entries) {
    if (e.kind === 'income') incomeCents += e.amountCents;
    else {
      expenseCents += e.amountCents;
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amountCents);
    }
  }
  const expenseByCategory = [...byCat.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category));
  return { incomeCents, expenseCents, balanceCents: openingCents + incomeCents - expenseCents, expenseByCategory };
}

export interface Dues {
  expectedCents: number;
  collectedCents: number;
  paidCount: number;
  unpaid: string[];
  unpaidCents: number;
}

/**
 * 欠费：应收 = 标准 × 人数；已交 = 标准 × 已交人数；未交 = 未勾选成员。
 * 标准为 0 表示不设应交标准：此时应收/已交/未交金额均为 0、未交名单为空。
 */
export function computeDues(members: readonly string[], standardCents: number, paidNames: readonly string[]): Dues {
  if (!Number.isSafeInteger(standardCents) || standardCents < 0) throw new Error('每人应交标准不能为负数。');
  const seen = new Set<string>();
  for (const p of paidNames) {
    if (!members.includes(p)) throw new Error(`已交名单里的「${p}」不在成员名单中，请重新勾选。`);
    if (seen.has(p)) throw new Error(`已交名单里的「${p}」重复勾选了。`);
    seen.add(p);
  }
  if (standardCents === 0) {
    return { expectedCents: 0, collectedCents: 0, paidCount: paidNames.length, unpaid: [], unpaidCents: 0 };
  }
  const unpaid = members.filter((m) => !seen.has(m));
  return {
    expectedCents: standardCents * members.length,
    collectedCents: standardCents * paidNames.length,
    paidCount: paidNames.length,
    unpaid,
    unpaidCents: standardCents * unpaid.length,
  };
}

export interface StatementInput {
  className: string;
  asOfDate: string;
  openingCents: number;
  summary: FundSummary;
  dues: Dues;
  standardCents: number;
  membersCount: number;
  entries: readonly FundEntry[];
}

/** 公示文本：可直接复制发群；含四数、欠费、分类支出与序时明细。 */
export function fundStatementToText(input: StatementInput): string {
  const { className, asOfDate, openingCents, summary, dues, standardCents, membersCount, entries } = input;
  const lines: string[] = [];
  lines.push(`${className}班费公示（截至 ${asOfDate}）`);
  lines.push(`期初结余：${formatCents(openingCents)}；本期收入：${formatCents(summary.incomeCents)}；本期支出：${formatCents(summary.expenseCents)}；结余：${formatCents(summary.balanceCents)}`);
  if (standardCents > 0) {
    lines.push(
      `应收班费：${formatCents(dues.expectedCents)}（${membersCount} 人 × ${formatCents(standardCents)}）；已交：${formatCents(dues.collectedCents)}（${dues.paidCount} 人）；未交：${dues.unpaid.length === 0 ? '无' : `${dues.unpaid.join('、')} ${formatCents(dues.unpaidCents)}`}`,
    );
  } else {
    lines.push('应收班费：未设每人应交标准（只公示流水与结余）。');
  }
  if (summary.expenseByCategory.length > 0) {
    lines.push(`分类支出：${summary.expenseByCategory.map((c) => `${c.category} ${formatCents(c.cents)}`).join('；')}`);
  }
  lines.push('明细：');
  const ordered = sortedEntries(entries);
  if (ordered.length === 0) lines.push('（暂无流水）');
  for (const e of ordered) {
    const who = e.handler ? `（经手人：${e.handler}）` : '';
    const note = e.note ? `（备注：${e.note}）` : '';
    lines.push(`${e.date} ${e.kind === 'income' ? '收入' : '支出'} ${e.category} ${e.title} ${formatCents(e.amountCents)}${who}${note}`);
  }
  lines.push('以上账目由班委手工记录，金额为班级内部公示口径；收钱请自行核对实际收款，勿凭本页截图转账。');
  return lines.join('\n');
}

/** CSV：流水（序时）+ 空行 + 欠费名单；金额用元（2 位小数），UTF-8 BOM 由调用方加。 */
export function fundToCsv(entries: readonly FundEntry[], dues: Dues, standardCents: number): string {
  const rows: string[][] = [['日期', '收支', '分类', '标题', '金额（元）', '经手人', '备注']];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  for (const e of sortedEntries(entries)) {
    rows.push([
      e.date,
      e.kind === 'income' ? '收入' : '支出',
      e.category,
      e.title,
      formatYuan(e.amountCents),
      e.handler ?? '',
      e.note ?? '',
    ]);
  }
  rows.push([]);
  rows.push(['欠费名单', '', '', '', '', '', '']);
  rows.push(['姓名', '状态', '金额（元）', '', '', '', '']);
  if (standardCents > 0) {
    for (const name of dues.unpaid) rows.push([name, '未交', formatYuan(standardCents), '', '', '', '']);
    rows.push(['合计未交', '', formatYuan(dues.unpaidCents), '', '', '', '']);
  } else {
    rows.push(['（未设每人应交标准）', '', '', '', '', '', '']);
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}
