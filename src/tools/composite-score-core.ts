/**
 * 综合测评计算 · 纯函数核心（Factory Day 10，2026-11-05）。
 * 本模块不碰 DOM、不联网、不存 localStorage：单人加权、智育子算、
 * 班级排名（并列名次）、评奖分档、公示文本与 CSV 均可单测。
 *
 * 口径（与 PRD、页面、单测共同承诺）：
 * 默认权重德育 20 / 智育 70 / 体育 10（取自高校常见综测细则公开表述，
 * 如北京印刷学院机电工程学院 2022 版细则：德育 20%＋智育 70%＋体育
 * 10%＋附加分）；三项权重之和必须为 100，页面允许按本校文件改。
 * 附加分默认封顶 10（可调 0–20）；总分默认封顶 100（可关）。
 * 总分 = Σ(分项 × 权重) ＋ min(附加分, 附加分上限)，再 min(总分上限)。
 * 分档默认一等 ≥90、二等 ≥80、三等 ≥70（可调，须递减）；到下一档
 * 的缺口按当前总分与下一档阈值之差计。
 * 显示保留 2 位小数；名次比较用全精度总分，并列判定按取整后总分
 * 相等（避免 0.001 级浮点差拆散并列）；名次为并列名次（1, 1, 3）。
 * 各校细则不同，最终以学校公布结果为准；本工具不宣称全国统一标准。
 */

export interface CompositeWeights {
  moral: number;
  intellectual: number;
  physical: number;
}

export interface TierThresholds {
  first: number;
  second: number;
  third: number;
}

export interface CompositeSettings {
  weights: CompositeWeights;
  bonusCap: number;
  totalCap: number | null; // null = 不封顶
  tiers: TierThresholds;
}

export const DEFAULT_SETTINGS: CompositeSettings = {
  weights: { moral: 20, intellectual: 70, physical: 10 },
  bonusCap: 10,
  totalCap: 100,
  tiers: { first: 90, second: 80, third: 70 },
};

export type TierLabel = '一等' | '二等' | '三等' | '未入围';

export interface SingleResult {
  weighted: number;
  bonusApplied: number;
  total: number;
  tier: TierLabel;
  nextTierLabel: TierLabel | null;
  nextTierGap: number | null;
}

export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export function assertScore(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label}须在 0–100 之间`);
  }
}

export function validateSettings(s: CompositeSettings): void {
  const { moral, intellectual, physical } = s.weights;
  for (const [v, label] of [
    [moral, '德育权重'],
    [intellectual, '智育权重'],
    [physical, '体育权重'],
  ] as const) {
    if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`${label}须在 0–100 之间`);
  }
  if (Math.abs(moral + intellectual + physical - 100) > 1e-9) {
    throw new Error('三项权重之和须为 100');
  }
  if (!Number.isFinite(s.bonusCap) || s.bonusCap < 0 || s.bonusCap > 20) {
    throw new Error('附加分上限须在 0–20 之间');
  }
  if (s.totalCap !== null && (!Number.isFinite(s.totalCap) || s.totalCap < 0 || s.totalCap > 100)) {
    throw new Error('总分上限须在 0–100 之间，或关闭封顶');
  }
  const { first, second, third } = s.tiers;
  for (const [v, label] of [
    [first, '一等阈值'],
    [second, '二等阈值'],
    [third, '三等阈值'],
  ] as const) {
    if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`${label}须在 0–100 之间`);
  }
  if (!(first > second && second > third)) throw new Error('分档阈值须递减：一等＞二等＞三等');
}

export function tierOf(total: number, tiers: TierThresholds): TierLabel {
  if (total >= tiers.first) return '一等';
  if (total >= tiers.second) return '二等';
  if (total >= tiers.third) return '三等';
  return '未入围';
}

export function nextTierGap(total: number, tiers: TierThresholds): { label: TierLabel | null; gap: number | null } {
  if (total >= tiers.first) return { label: null, gap: null };
  if (total >= tiers.second) return { label: '一等', gap: round2(tiers.first - total) };
  if (total >= tiers.third) return { label: '二等', gap: round2(tiers.second - total) };
  return { label: '三等', gap: round2(tiers.third - total) };
}

export interface SingleInput {
  moral: number;
  intellectual: number;
  physical: number;
  bonus: number;
}

export function calcSingle(input: SingleInput, settings: CompositeSettings): SingleResult {
  validateSettings(settings);
  assertScore(input.moral, '德育分');
  assertScore(input.intellectual, '智育分');
  assertScore(input.physical, '体育分');
  if (!Number.isFinite(input.bonus) || input.bonus < 0) throw new Error('附加分不能为负数');
  const { moral, intellectual, physical } = settings.weights;
  const weightedRaw = (input.moral * moral + input.intellectual * intellectual + input.physical * physical) / 100;
  const bonusApplied = Math.min(input.bonus, settings.bonusCap);
  const totalRaw = weightedRaw + bonusApplied;
  const capped = settings.totalCap === null ? totalRaw : Math.min(totalRaw, settings.totalCap);
  const total = round2(capped);
  const tier = tierOf(total, settings.tiers);
  const next = nextTierGap(total, settings.tiers);
  return { weighted: round2(weightedRaw), bonusApplied: round2(bonusApplied), total, tier, nextTierLabel: next.label, nextTierGap: next.gap };
}

/** 智育子算：课程成绩按学分加权平均（2 位小数）。 */
export interface CourseRow {
  name: string;
  score: number;
  credit: number;
}

export function calcIntellectual(courses: CourseRow[]): number {
  if (courses.length === 0) throw new Error('请至少填一门课程');
  let weighted = 0;
  let credits = 0;
  for (const c of courses) {
    assertScore(c.score, `课程「${c.name || '未命名'}」成绩`);
    if (!Number.isFinite(c.credit) || c.credit <= 0) throw new Error(`课程「${c.name || '未命名'}」学分须大于 0`);
    weighted += c.score * c.credit;
    credits += c.credit;
  }
  return round2(weighted / credits);
}

/** 解析智育子算粘贴文本：每行「课程 成绩 学分」（空格/逗号/制表分隔）。 */
export function parseCourses(text: string): CourseRow[] {
  const rows: CourseRow[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[\s,，\t]+/);
    if (parts.length !== 3) throw new Error(`智育课程第 ${idx + 1} 行格式不对，应为「课程 成绩 学分」`);
    const score = Number(parts[1]);
    const credit = Number(parts[2]);
    if (!Number.isFinite(score) || !Number.isFinite(credit)) throw new Error(`智育课程第 ${idx + 1} 行成绩或学分不是数字`);
    rows.push({ name: parts[0], score, credit });
  });
  if (rows.length === 0) throw new Error('请至少填一门课程');
  return rows;
}

export interface BatchRow extends SingleInput {
  name: string;
  result: SingleResult;
  rank: number;
}

export interface BatchResult {
  rows: BatchRow[];
  count: number;
  average: number;
  max: number;
  min: number;
}

/** 解析班级粘贴文本：每行「姓名 德育 智育 体育 附加分」。 */
export function calcBatch(text: string, settings: CompositeSettings): BatchResult {
  validateSettings(settings);
  const parsed: (SingleInput & { name: string })[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[\s,，\t]+/);
    if (parts.length !== 5) throw new Error(`第 ${idx + 1} 行格式不对，应为「姓名 德育 智育 体育 附加分」共 5 列`);
    const nums = parts.slice(1).map(Number);
    if (nums.some((n) => !Number.isFinite(n))) throw new Error(`第 ${idx + 1} 行分数不是数字`);
    const [moral, intellectual, physical, bonus] = nums;
    assertScore(moral, `第 ${idx + 1} 行德育分`);
    assertScore(intellectual, `第 ${idx + 1} 行智育分`);
    assertScore(physical, `第 ${idx + 1} 行体育分`);
    if (bonus < 0) throw new Error(`第 ${idx + 1} 行附加分不能为负数`);
    parsed.push({ name: parts[0], moral, intellectual, physical, bonus });
  });
  if (parsed.length === 0) throw new Error('请至少粘贴一行班级数据');
  const withResult = parsed.map((p) => ({ ...p, result: calcSingle(p, settings) }));
  withResult.sort((a, b) => b.result.total - a.result.total || a.name.localeCompare(b.name, 'zh-CN'));
  // 并列名次（1, 1, 3）：总分相等（取整后）共享名次，下一名次顺延。
  const rows: BatchRow[] = withResult.map((r) => ({ ...r, rank: 0 }));
  let prevTotal: number | null = null;
  let prevRank = 1;
  rows.forEach((r, i) => {
    if (prevTotal !== null && r.result.total === prevTotal) {
      r.rank = prevRank;
    } else {
      r.rank = i + 1;
      prevRank = i + 1;
    }
    prevTotal = r.result.total;
  });
  const totals = rows.map((r) => r.result.total);
  return {
    rows,
    count: rows.length,
    average: round2(totals.reduce((a, b) => a + b, 0) / totals.length),
    max: Math.max(...totals),
    min: Math.min(...totals),
  };
}

/** 单人结果文本（复制用）。 */
export function singleToText(input: SingleInput, result: SingleResult, settings: CompositeSettings): string {
  const lines = [
    'NOVIP 综合测评计算结果',
    `德育 ${input.moral} 分、智育 ${input.intellectual} 分、体育 ${input.physical} 分、附加分 ${input.bonus} 分`,
    `权重：德育 ${settings.weights.moral}%、智育 ${settings.weights.intellectual}%、体育 ${settings.weights.physical}%；附加分上限 ${settings.bonusCap} 分；总分上限 ${settings.totalCap === null ? '不封顶' : `${settings.totalCap} 分`}`,
    `加权分：${result.weighted.toFixed(2)} 分；计入附加分：${result.bonusApplied.toFixed(2)} 分；综合测评总分：${result.total.toFixed(2)} 分；档次：${result.tier}`,
  ];
  if (result.nextTierLabel !== null && result.nextTierGap !== null) {
    lines.push(`到${result.nextTierLabel}还差 ${result.nextTierGap.toFixed(2)} 分。`);
  } else {
    lines.push('已达一等，保持就好。');
  }
  lines.push('权重、附加分上限与分档阈值各校不同，最终以学校公布结果为准。');
  return lines.join('\n');
}

/** 班级公示文本（复制发群用）。 */
export function batchToText(batch: BatchResult): string {
  const lines = [
    'NOVIP 综合测评班级排名公示（仅供参考，最终以学校公布结果为准）',
    `共 ${batch.count} 人；班级平均分 ${batch.average.toFixed(2)} 分；最高 ${batch.max.toFixed(2)} 分；最低 ${batch.min.toFixed(2)} 分`,
    ...batch.rows.map(
      (r) =>
        `第 ${r.rank} 名 ${r.name}：总分 ${r.result.total.toFixed(2)} 分（德育 ${r.moral}、智育 ${r.intellectual}、体育 ${r.physical}、附加分 ${r.bonus}），档次 ${r.result.tier}`,
    ),
  ];
  return lines.join('\n');
}

/** 班级排名 CSV（下载用，含 BOM 由组件加）。 */
export function batchToCsv(batch: BatchResult): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    ['名次', '姓名', '德育', '智育', '体育', '附加分', '加权分', '综合测评总分', '档次'],
    ...batch.rows.map((r) => [
      String(r.rank),
      r.name,
      String(r.moral),
      String(r.intellectual),
      String(r.physical),
      String(r.bonus),
      r.result.weighted.toFixed(2),
      r.result.total.toFixed(2),
      r.result.tier,
    ]),
    ['班级平均分', '', '', '', '', '', '', batch.average.toFixed(2), ''],
  ];
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

/** PRD 锁定单人示例：德育 88、智育 86、体育 92、附加分 6 → 加权 87.00、总分 93.00、一等。 */
export const SAMPLE_SINGLE: SingleInput = { moral: 88, intellectual: 86, physical: 92, bonus: 6 };

/** PRD 锁定班级示例（默认权重/封顶/分档）：名次 1–5，总分 96.20 / 93.00 / 92.00 / 85.40 / 80.50，平均 89.42。 */
export const SAMPLE_BATCH_TEXT = [
  '陈晨 90 92 88 5',
  '林晓 88 86 92 6',
  '王磊 85 90 80 4',
  '赵雨 80 84 86 2',
  '孙阳 78 82 75 0',
].join('\n');

/** 智育子算示例：高数 5 学分 92、英语 4 学分 85、线代 3 学分 78 → 86.17。 */
export const SAMPLE_COURSES_TEXT = ['高数 92 5', '英语 85 4', '线代 78 3'].join('\n');

export function csvDateSuffix(d = new Date()): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${day}`;
}
