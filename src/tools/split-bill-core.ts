/**
* AA 分账与聚餐结算 · 纯函数核心（Factory Day 6，2026-11-01）。
* 本模块不碰 DOM、不联网：金额解析、分摊、余额、转账清单、导出均可单测。
*
* 金额口径：全程以“分”为整数单位计算，杜绝浮点误差；每笔分摊之和
* 恒等于该笔金额，全部费用结清后每人余额之和恒为 0。
* 余数规则（页面与单测共同承诺）：均分取整后剩余的几分按分摊人顺序
* 依次补 1 分；按权重分摊时按精确整数余数从大到小补，余数相同按顺序。
* 转账清单用贪心配对：每笔至少结清一方，最多 n-1 笔（n 为有余额人数），
* 不承诺全局最少笔数——子集和最优解不稳定，页面文案不夸大。
*/

export const MAX_AMOUNT_CENTS = 99_999_999_999; // ¥999,999,999.99

export function formatCents(cents: number): string {
const sign = cents < 0? '-': '';
return `${sign}¥${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** 金额文本转分：支持 ¥/￥ 前缀与千分位逗号；最多 2 位小数；必须大于 0。 */
export function parseAmountToCents(text: string): number {
const cleaned = text.trim().replace(/^[¥￥]/, '').replace(/[,，\s]/g, '');
if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
throw new Error('金额格式不对：请输入数字，最多保留 2 位小数（例如 480 或 60.50）。');
}
const [intPart, fracPart = ''] = cleaned.split('.');
const cents = Number(intPart) * 100 + Number((fracPart + '00').slice(0, 2));
if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('金额必须大于 0。');
if (cents > MAX_AMOUNT_CENTS) throw new Error('单笔金额过大：请拆成多笔记录。');
return cents;
}

/** 解析成员名单：按换行、逗号、分号、顿号切分；至少 2 人；人名不得重复。 */
export function parseMembers(input: string): string[] {
const names = input
.split(/[\r\n,，;；、]+/)
.map((s) => s.trim())
.filter((s) => s.length > 0);
if (names.length < 2) throw new Error('分账至少需要 2 人：请在名单里写 2 个及以上人名。');
const seen = new Map<string, number>();
for (const n of names) seen.set(n, (seen.get(n)?? 0) + 1);
const dup = [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n);
if (dup.length > 0) throw new Error(`人名重复：${dup.join('、')} 出现了多次，分账按人名区分，请改名或加后缀区分。`);
return names;
}

/** 均分：取整后剩余的几分按顺序依次补 1 分，总和恒等于 total。 */
export function allocateEqual(totalCents: number, count: number): number[] {
if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error('分摊总额必须为正整数分。');
if (!Number.isInteger(count) || count < 1) throw new Error('分摊人数至少为 1。');
const base = Math.floor(totalCents / count);
const rest = totalCents - base * count;
return Array.from({ length: count}, (_, i) => base + (i < rest? 1: 0));
}

/**
* 按权重分摊：权重为正整数（1 表示 1 份）。用整数分子/分母算取整份额，
* 剩余分数按余数从大到小补 1 分，余数相同按分摊人顺序；总和恒等于 total。
*/
export function allocateByShares(totalCents: number, weights: readonly number[]): number[] {
if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error('分摊总额必须为正整数分。');
if (weights.length < 1) throw new Error('按权重分摊至少需要 1 人。');
for (const w of weights) {
if (!Number.isInteger(w) || w <= 0) throw new Error('权重必须为正整数（例如 1、2）。');
}
const sum = weights.reduce((a, b) => a + b, 0);
const floors = weights.map((w) => Math.floor((totalCents * w) / sum));
const remainders = weights.map((w, i) => ({ i, rem: (totalCents * w) % sum}));
let rest = totalCents - floors.reduce((a, b) => a + b, 0);
remainders.sort((a, b) => b.rem - a.rem || a.i - b.i);
const out = [...floors];
for (let k = 0; k < rest; k++) out[remainders[k].i] += 1;
return out;
}

/** 按指定金额分摊：每人金额均 ≥0 且之和必须等于总额，否则报错。 */
export function allocateExact(totalCents: number, exactCents: readonly number[]): number[] {
if (exactCents.length < 1) throw new Error('按指定金额分摊至少需要 1 人。');
for (const c of exactCents) {
if (!Number.isInteger(c) || c < 0) throw new Error('指定金额必须为 ≥0 的分（页面输入保留 2 位小数）。');
}
const sum = exactCents.reduce((a, b) => a + b, 0);
if (sum!== totalCents) {
throw new Error(`指定金额之和（${formatCents(sum)}）不等于本笔金额（${formatCents(totalCents)}），请核对后再添加。`);
}
return [...exactCents];
}

export type SplitMode = 'equal' | 'shares' | 'exact';

export interface SplitExpense {
title: string;
/** 付款人姓名，必须在成员名单中。 */
payer: string;
amountCents: number;
/** 分摊人姓名（顺序即余数补位顺序），可不含付款人。 */
participants: string[];
mode: SplitMode;
/** mode=shares 时与 participants 一一对应。 */
weights?: number[];
/** mode=exact 时与 participants 一一对应（单位：分）。 */
exactCents?: number[];
}

/** 计算单笔费用每位分摊人的份额（与 participants 顺序一一对应）。 */
export function expenseShares(expense: SplitExpense): number[] {
if (!expense.title.trim()) throw new Error('请给这笔费用写个标题（例如“聚餐”）。');
if (expense.participants.length < 1) throw new Error(`「${expense.title}」至少需要 1 位分摊人。`);
if (new Set(expense.participants).size!== expense.participants.length) {
throw new Error(`「${expense.title}」的分摊人有重复，请去掉重复项。`);
}
if (expense.mode === 'equal') return allocateEqual(expense.amountCents, expense.participants.length);
if (expense.mode === 'shares') {
if (!expense.weights || expense.weights.length!== expense.participants.length) {
throw new Error(`「${expense.title}」的权重数量与分摊人数不一致。`);
}
return allocateByShares(expense.amountCents, expense.weights);
}
if (!expense.exactCents || expense.exactCents.length!== expense.participants.length) {
throw new Error(`「${expense.title}」的指定金额数量与分摊人数不一致。`);
}
return allocateExact(expense.amountCents, expense.exactCents);
}

export interface MemberBalance {
name: string;
paidCents: number;
shareCents: number;
/** 已付 − 应付：>0 为别人欠他（应收），<0 为他欠别人（应付），=0 已结清。 */
balanceCents: number;
}

/** 多笔费用汇总：每人已付、应付、结余；结余之和恒为 0。 */
export function computeBalances(members: readonly string[], expenses: readonly SplitExpense[]): MemberBalance[] {
const index = new Map(members.map((m, i) => [m, i]));
const paid = members.map(() => 0);
const share = members.map(() => 0);
for (const e of expenses) {
if (!index.has(e.payer)) throw new Error(`费用「${e.title}」的付款人 ${e.payer} 不在成员名单中。`);
paid[index.get(e.payer)!] += e.amountCents;
const shares = expenseShares(e);
e.participants.forEach((p, k) => {
if (!index.has(p)) throw new Error(`费用「${e.title}」的分摊人 ${p} 不在成员名单中。`);
share[index.get(p)!] += shares[k];
});
}
return members.map((name, i) => ({
name,
paidCents: paid[i],
shareCents: share[i],
balanceCents: paid[i] - share[i],
}));
}

export interface Transfer {
from: string;
to: string;
amountCents: number;
}

/**
* 转账清单（贪心配对）：应付方按欠款从大到小、应收方按应收从大到小配对，
* 每笔取双方剩余较小值；每笔至少结清一方，最多 n-1 笔。
*/
export function settle(balances: readonly MemberBalance[]): Transfer[] {
const debtors = balances
.filter((b) => b.balanceCents < 0)
.map((b) => ({ name: b.name, rest: -b.balanceCents}))
.sort((a, b) => b.rest - a.rest || a.name.localeCompare(b.name));
const creditors = balances
.filter((b) => b.balanceCents > 0)
.map((b) => ({ name: b.name, rest: b.balanceCents}))
.sort((a, b) => b.rest - a.rest || a.name.localeCompare(b.name));
const out: Transfer[] = [];
let i = 0;
let j = 0;
while (i < debtors.length && j < creditors.length) {
const amount = Math.min(debtors[i].rest, creditors[j].rest);
out.push({ from: debtors[i].name, to: creditors[j].name, amountCents: amount});
debtors[i].rest -= amount;
creditors[j].rest -= amount;
if (debtors[i].rest === 0) i++;
if (creditors[j].rest === 0) j++;
}
return out;
}

function csvCell(value: string): string {
return /[",\n]/.test(value)? `"${value.replace(/"/g, '""')}"`: value;
}

export function settlementToText(
balances: readonly MemberBalance[],
transfers: readonly Transfer[],
expenses: readonly SplitExpense[],
): string {
const lines: string[] = ['NOVIP AA 分账结算单（浏览器本地计算，不含任何真实转账操作）'];
lines.push(`共 ${expenses.length} 笔费用，总额 ${formatCents(expenses.reduce((a, e) => a + e.amountCents, 0))}。`);
lines.push('');
lines.push('');
for (const b of balances) {
const state = b.balanceCents > 0? `应收 ${formatCents(b.balanceCents)}`: b.balanceCents < 0? `应付 ${formatCents(-b.balanceCents)}`: '已结清';
lines.push(`${b.name}：已付 ${formatCents(b.paidCents)}，应付 ${formatCents(b.shareCents)}，${state}`);
}
lines.push('');
lines.push('');
if (transfers.length === 0) lines.push('无需转账：每人已付与应付相等。');
else transfers.forEach((t) => lines.push(`${t.from} → ${t.to} ${formatCents(t.amountCents)}`));
lines.push('');
lines.push('说明：本页只算账、不经手资金；请按清单自行用微信/支付宝等转账，转账后请自行核对。');
return lines.join('\n');
}

export function settlementToCsv(
members: readonly string[],
expenses: readonly SplitExpense[],
balances: readonly MemberBalance[],
transfers: readonly Transfer[],
): string {
const lines: string[] = [];
lines.push('费用清单');
lines.push(['标题', '付款人', '金额', '分摊方式', '分摊人', '每人份额'].map(csvCell).join(','));
for (const e of expenses) {
const shares = expenseShares(e);
const modeLabel = e.mode === 'equal'? '均分': e.mode === 'shares'? '按权重': '指定金额';
e.participants.forEach((p, k) => {
lines.push([e.title, e.payer, formatCents(e.amountCents), modeLabel, p, formatCents(shares[k])].map(csvCell).join(','));
});
}
lines.push('');
lines.push('每人结算');
lines.push(['姓名', '已付', '应付', '结余（正为应收）'].map(csvCell).join(','));
for (const b of balances) {
lines.push([b.name, formatCents(b.paidCents), formatCents(b.shareCents), formatCents(b.balanceCents)].map(csvCell).join(','));
}
lines.push('');
lines.push('转账清单');
lines.push(['付款人', '收款人', '金额'].map(csvCell).join(','));
if (transfers.length === 0) lines.push(['—', '—', '无需转账'].map(csvCell).join(','));
else transfers.forEach((t) => lines.push([t.from, t.to, formatCents(t.amountCents)].map(csvCell).join(',')));
void members;
return lines.join('\n');
}

/** 供下载文件名使用的日期后缀：YYYYMMDD。 */
export function dateSuffix(date = new Date()): string {
const p = (n: number) => String(n).padStart(2, '0');
return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}
