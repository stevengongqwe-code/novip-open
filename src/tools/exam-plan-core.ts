/**
 * 考试倒计时与备考倒排规划 · 纯函数核心（Factory Day 8，2026-11-03）。
 * 本模块不碰 DOM、不联网、不存 localStorage：日期校验、剩余天数、
 * 阶段判定、周计划、模考节点、每日节奏、计划文本与 CSV 导出均可单测。
 *
 * 日期口径（页面与单测共同承诺）：全部按 UTC 日历天计算，
 * 剩余天数 = 考试日 − 今天；考试日当天 = 0 天；考试日当天不计学习日。
 * 阶段边界：<0 已结束；0–7 临考冲刺；8–30 冲刺；31–90 强化；>90 基础。
 * 周计划：从今天起按 7 天切分学习日（不含考试日当天），每周阶段按
 * 该周首日的剩余天数判定；模考节点固定为考前 14 天（第一次模考）与
 * 考前 3 天（全真自测），仅当落在今天至考试日区间内时出现。
 * 与 course/timetable/grades 的区别（模型不同，不可互换）：本模块不给
 * 大作业排进度、不排上课时间、不算要考几分，只做多考试倒计时 +
 * 阶段判定 + 倒排周计划 + 模考节点。
 */

const DAY_MS = 86_400_000;

/** 严格 YYYY-MM-DD 真实日期校验；返回原串，非法抛错。 */
export function parseExamDate(text: string): string {
  const t = text.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) throw new Error('日期格式不对：请用 YYYY-MM-DD，例如 2026-12-19。');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`日期不存在：${t} 不是真实日期，请核对学校/官方通知后再填。`);
  }
  return t;
}

function dateToUtcMs(date: string): number {
  const valid = parseExamDate(date);
  const [y, mo, d] = valid.split('-').map(Number);
  return Date.UTC(y, mo - 1, d);
}

function msToDate(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function addDays(date: string, n: number): string {
  return msToDate(dateToUtcMs(date) + n * DAY_MS);
}

/** 今天（UTC 口径 YYYY-MM-DD），供组件默认值与 CSV 文件名使用。 */
export function todayUtc(d = new Date()): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** CSV 文件名日期后缀：2026-11-03 → 20261103。 */
export function csvDateSuffix(d = new Date()): string {
  return todayUtc(d).replace(/-/g, '');
}

/** 剩余天数 = 考试日 − 今天（整日历天，UTC 口径；考试日当天 = 0）。 */
export function daysUntil(examDate: string, today: string): number {
  return Math.round((dateToUtcMs(examDate) - dateToUtcMs(today)) / DAY_MS);
}

export type ExamStageKey = 'ended' | 'final' | 'sprint' | 'intensive' | 'basic';

export interface ExamStage {
  key: ExamStageKey;
  label: string;
  advice: string;
}

/** 阶段判定（边界单测逐项承诺）：-1 已结束；0–7 临考冲刺；8–30 冲刺；31–90 强化；>90 基础。 */
export function stageForDays(days: number): ExamStage {
  if (days < 0) return { key: 'ended', label: '已结束', advice: '已结束，不再排学习计划。' };
  if (days <= 7) return { key: 'final', label: '临考冲刺', advice: '停新学，转自测与错题复盘。' };
  if (days <= 30) return { key: 'sprint', label: '冲刺', advice: '限时套卷为主，错题复盘与查漏补缺。' };
  if (days <= 90) return { key: 'intensive', label: '强化', advice: '章节刷题与真题分块，同步整理错题本。' };
  return { key: 'basic', label: '基础', advice: '通读教材、整理笔记、做课后题打基础。' };
}

export const STAGE_TASKS: Record<Exclude<ExamStageKey, 'ended'>, string[]> = {
  basic: ['通读教材', '整理笔记', '做课后题'],
  intensive: ['章节刷题', '整理错题本', '真题分块练习'],
  sprint: ['限时套卷', '错题复盘', '查漏补缺'],
  final: ['自测', '错题复盘', '作息调整'],
};

export interface Exam {
  name: string;
  date: string;
  subject?: string;
  note?: string;
}

export function validateExam(e: Exam): void {
  if (!e.name.trim()) throw new Error('请给考试起个名字（例如“大学英语四级”）。');
  parseExamDate(e.date);
}

/** 考试清单按日期升序排列（日期相同保持录入顺序）。 */
export function sortedExams(exams: readonly Exam[]): Exam[] {
  for (const e of exams) validateExam(e);
  return [...exams].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 最近一场 = 按日期升序后第一场未结束的考试；全部已结束则返回 null。 */
export function nearestExam(exams: readonly Exam[], today: string): Exam | null {
  for (const e of sortedExams(exams)) {
    if (daysUntil(e.date, today) >= 0) return e;
  }
  return null;
}

export interface WeekPlan {
  index: number;
  startDate: string;
  endDate: string;
  /** 该周首日的剩余天数。 */
  daysLeftAtStart: number;
  stage: ExamStage;
  tasks: string[];
}

/**
 * 倒排周计划：学习日为今天至考试日前一天；按 7 天切分，最后一周不足 7 天
 * 按实际天数收尾。每周阶段按该周首日的剩余天数判定。
 */
export function weeklyPlan(examDate: string, today: string): WeekPlan[] {
  const days = daysUntil(examDate, today);
  if (days <= 0) return [];
  const weeks: WeekPlan[] = [];
  let offset = 0;
  let index = 1;
  while (offset < days) {
    const startDate = addDays(today, offset);
    const span = Math.min(7, days - offset);
    const endDate = addDays(today, offset + span - 1);
    const daysLeftAtStart = days - offset;
    const stage = stageForDays(daysLeftAtStart);
    const tasks = stage.key === 'ended' ? [] : STAGE_TASKS[stage.key];
    weeks.push({ index, startDate, endDate, daysLeftAtStart, stage, tasks });
    offset += span;
    index += 1;
  }
  return weeks;
}

export interface MockNode {
  date: string;
  label: string;
  description: string;
}

/**
 * 模考节点：考前 14 天“第一次模考”与考前 3 天“全真自测”，
 * 仅当落在今天至考试日区间内（含两端）时出现，按日期升序。
 */
export function mockNodes(examDate: string, today: string): MockNode[] {
  const days = daysUntil(examDate, today);
  if (days < 0) return [];
  const nodes: MockNode[] = [];
  if (days >= 14) nodes.push({ date: addDays(examDate, -14), label: '第一次模考', description: '按考试时间完整做一套题，找时间分配问题。' });
  if (days >= 3) nodes.push({ date: addDays(examDate, -3), label: '全真自测', description: '全真自测：按正式考试时间与题量模拟一次。' });
  // days>=14 时考前 14 天节点必然 >= 今天；days<14 时该节点早于今天，已按 days>=14 过滤。
  // days>=3 时考前 3 天节点必然 >= 今天；同理。
  return nodes;
}

function parseIntInRange(text: string, min: number, max: number, label: string): number {
  const t = text.trim();
  if (!/^\d+$/.test(t)) throw new Error(`${label}请填整数（${min}–${max}）。`);
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label}请填 ${min}–${max} 之间的整数。`);
  return n;
}

/** 每日可学分钟数：默认 120，范围 30–600。 */
export function parseDailyMinutes(text: string): number {
  return parseIntInRange(text, 30, 600, '每日可学分钟数');
}

/** 单节时长（分钟）：默认 25，范围 10–120。 */
export function parseSessionMinutes(text: string): number {
  return parseIntInRange(text, 10, 120, '单节时长');
}

export interface DailyRhythm {
  studyDays: number;
  totalMinutes: number;
  totalSessions: number;
}

/**
 * 每日节奏：总分钟数 = 剩余天数 × 每日分钟数；总节数 = floor(总分钟数 ÷ 单节时长)。
 * 考试日当天不计学习日；已结束的考试学习日为 0。
 */
export function dailyRhythm(days: number, minutesPerDay: number, sessionMinutes: number): DailyRhythm {
  if (minutesPerDay < 30 || minutesPerDay > 600) throw new Error('每日可学分钟数请填 30–600 之间的整数。');
  if (sessionMinutes < 10 || sessionMinutes > 120) throw new Error('单节时长请填 10–120 之间的整数。');
  const studyDays = Math.max(0, days);
  const totalMinutes = studyDays * minutesPerDay;
  return { studyDays, totalMinutes, totalSessions: Math.floor(totalMinutes / sessionMinutes) };
}

/** 示例考试（PRD 验收标准；以 2026-11-03 为今天：12 天冲刺 / 46 天强化 / 68 天强化）。 */
export const SAMPLE_EXAMS: Exam[] = [
  { name: '校内期中测验', date: '2026-11-15' },
  { name: '大学英语四级（示例）', date: '2026-12-19' },
  { name: '高等数学期末（示例）', date: '2027-01-10' },
];

export interface PlanTextInput {
  exam: Exam;
  today: string;
  minutesPerDay: number;
  sessionMinutes: number;
}

/** 计划文本：考试名、日期、剩余天数、阶段、模考节点、周计划行，可直接复制。 */
export function planToText(input: PlanTextInput): string {
  const { exam, today, minutesPerDay, sessionMinutes } = input;
  const days = daysUntil(exam.date, today);
  const stage = stageForDays(days);
  const rhythm = dailyRhythm(days, minutesPerDay, sessionMinutes);
  const lines: string[] = [];
  lines.push(`${exam.name}备考计划`);
  lines.push(`考试日期：${exam.date}；剩余 ${days} 天；阶段：${stage.label}（${stage.advice}）`);
  if (exam.subject) lines.push(`科目：${exam.subject}`);
  if (exam.note) lines.push(`备注：${exam.note}`);
  lines.push(`每日节奏：每天 ${minutesPerDay} 分钟，单节 ${sessionMinutes} 分钟；共 ${rhythm.studyDays} 个学习日、${rhythm.totalMinutes} 分钟、约 ${rhythm.totalSessions} 节。`);
  const nodes = mockNodes(exam.date, today);
  lines.push(`模考节点：${nodes.length === 0 ? '无（考前 14 天与考前 3 天均不在今天至考试日区间内）' : nodes.map((n) => `${n.date} ${n.label}`).join('；')}`);
  lines.push('周计划：');
  const weeks = weeklyPlan(exam.date, today);
  if (weeks.length === 0) lines.push('（考试已结束或就是今天，无学习周可排）');
  for (const w of weeks) {
    lines.push(`第 ${w.index} 周 ${w.startDate}～${w.endDate}（${w.stage.label}）：${w.tasks.join('、')}`);
  }
  lines.push('计划为建议节奏，不承诺提分；考试日期请以学校/官方通知为准。');
  return lines.join('\n');
}

/** CSV：考试清单 + 选中场的周计划与模考节点；金额无，UTF-8 BOM 由调用方加。 */
export function examsToCsv(exams: readonly Exam[], selected: Exam | null, today: string, minutesPerDay: number, sessionMinutes: number): string {
  const rows: string[][] = [['考试名', '考试日期', '剩余天数', '阶段', '科目', '备注']];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  for (const e of sortedExams(exams)) {
    const days = daysUntil(e.date, today);
    rows.push([e.name, e.date, String(days), stageForDays(days).label, e.subject ?? '', e.note ?? '']);
  }
  rows.push([]);
  if (selected) {
    const days = daysUntil(selected.date, today);
    const rhythm = dailyRhythm(days, minutesPerDay, sessionMinutes);
    rows.push([`选中场周计划：${selected.name}（${selected.date}，剩余 ${days} 天，${stageForDays(days).label}）`, '', '', '', '', '']);
    rows.push(['每日节奏', `每天 ${minutesPerDay} 分钟`, `单节 ${sessionMinutes} 分钟`, `共 ${rhythm.studyDays} 个学习日`, `${rhythm.totalMinutes} 分钟`, `约 ${rhythm.totalSessions} 节`]);
    rows.push(['周', '开始', '结束', '阶段', '任务', '']);
    for (const w of weeklyPlan(selected.date, today)) {
      rows.push([`第 ${w.index} 周`, w.startDate, w.endDate, w.stage.label, w.tasks.join('、'), '']);
    }
    rows.push(['模考节点', '', '', '', '', '']);
    const nodes = mockNodes(selected.date, today);
    if (nodes.length === 0) rows.push(['（无）', '', '', '', '', '']);
    for (const n of nodes) rows.push([n.label, n.date, '', '', n.description, '']);
  } else {
    rows.push(['（未选中任何一场，无法导出周计划）', '', '', '', '', '']);
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}
