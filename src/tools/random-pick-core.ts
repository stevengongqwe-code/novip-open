/**
 * 随机分组与点名抽签 · 纯函数核心（Factory Day 5，2026-10-31）。
 * 本模块不碰 DOM、不联网：名单解析、洗牌、抽取、分组、导出均可单测。
 * 随机源默认取 crypto.getRandomValues（拒绝采样，避免取模偏差）；
 * 测试可注入确定性随机源。结果由随机数决定，页面无转盘动画。
 */

export type RandomSource = () => number;

function defaultRandom(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 0x100000000;
  }
  return Math.random();
}

/** [0, n) 内的均匀整数；拒绝采样保证等概率。 */
export function secureRandomInt(n: number, rand: RandomSource = defaultRandom): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error('抽取范围必须为正整数。');
  const limit = Math.floor(0x100000000 / n) * n;
  for (;;) {
    let raw: number;
    if (rand === defaultRandom && typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      raw = buf[0];
    } else {
      raw = Math.floor(rand() * 0x100000000);
    }
    if (raw < limit) return raw % n;
  }
}

/** Fisher-Yates 洗牌：返回新数组，不改动入参。 */
export function shuffle<T>(items: readonly T[], rand: RandomSource = defaultRandom): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1, rand);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface ParsedNames {
  names: string[];
  /** 输入中出现 2 次及以上的姓名（原样保留计入抽取池，仅提示）。 */
  duplicates: string[];
}

/**
 * 解析名单：按换行、逗号、中文逗号、分号、顿号切分；去空项与首尾空格；
 * 保留原顺序与重复项（重复姓名按多条计入抽取池，调用方负责提示）。
 */
export function parseNames(input: string): ParsedNames {
  const names = input
    .split(/[\r\n,，;；、]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const seen = new Map<string, number>();
  for (const n of names) seen.set(n, (seen.get(n) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n);
  return { names, duplicates };
}

/** 从池子中无放回抽取 count 个；返回 {picked, remaining}。 */
export function pickWithoutReplacement<T>(
  pool: readonly T[],
  count: number,
  rand: RandomSource = defaultRandom,
): { picked: T[]; remaining: T[] } {
  if (!Number.isInteger(count) || count < 1) throw new Error('抽取人数至少为 1。');
  if (count > pool.length) throw new Error(`抽取人数（${count}）不能超过剩余人数（${pool.length}）。`);
  const shuffled = shuffle(pool, rand);
  return { picked: shuffled.slice(0, count), remaining: shuffled.slice(count) };
}

export interface GroupOptions {
  mode: 'byCount' | 'bySize';
  /** byCount 时为组数；bySize 时为每组人数。 */
  value: number;
}

/**
 * 随机分组：先洗牌再轮流发牌，组间人数差至多 1。
 * byCount：value 为组数（1..人数）；bySize：value 为每组人数（≥1），组数自动算出。
 */
export function makeGroups(
  names: readonly string[],
  options: GroupOptions,
  rand: RandomSource = defaultRandom,
): string[][] {
  if (names.length < 2) throw new Error('分组至少需要 2 人。');
  if (!Number.isInteger(options.value) || options.value < 1) throw new Error('组数或每组人数必须为正整数。');
  let groupCount: number;
  if (options.mode === 'byCount') {
    if (options.value > names.length) throw new Error(`组数（${options.value}）不能超过人数（${names.length}）。`);
    groupCount = options.value;
  } else {
    groupCount = Math.ceil(names.length / options.value);
  }
  const shuffled = shuffle(names, rand);
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  shuffled.forEach((name, i) => {
    groups[i % groupCount].push(name);
  });
  return groups;
}

/** 随机排序：整份名单洗牌后带序号输出。 */
export function randomOrder(names: readonly string[], rand: RandomSource = defaultRandom): string[] {
  if (names.length < 2) throw new Error('排序至少需要 2 人。');
  return shuffle(names, rand);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 分组结果导出为 CSV 文本：每组一列，成员按行排列。 */
export function groupsToCsv(groups: readonly (readonly string[])[]): string {
  const rows = Math.max(0, ...groups.map((g) => g.length));
  const lines: string[] = [groups.map((_, i) => csvCell(`第${i + 1}组`)).join(',')];
  for (let r = 0; r < rows; r++) {
    lines.push(groups.map((g) => csvCell(g[r] ?? '')).join(','));
  }
  return lines.join('\n');
}

/** 分组结果导出为可复制纯文本。 */
export function groupsToText(groups: readonly (readonly string[])[]): string {
  return groups.map((g, i) => `第${i + 1}组（${g.length}人）：${g.join('、')}`).join('\n');
}

export function pickResultText(picked: readonly string[]): string {
  return picked.join('、');
}

/** 供下载文件名使用的日期后缀：YYYYMMDD。 */
export function dateSuffix(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}
