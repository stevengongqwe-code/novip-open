// 批量文件整理器 · 纯命名逻辑（无 DOM 依赖，可单元测试）
// 原则：只改文件名，不动文件内容；所有处理在本机内存完成。

export type RenameMode = 'pattern' | 'affix' | 'replace';

export interface RenameRule {
  mode: RenameMode;
  /** pattern 模式：支持 {name} {n} {nn} {nnn} {nnnn}，如 "实验报告_{nnn}" */
  pattern: string;
  /** 编号起始值 */
  start: number;
  /** affix 模式 */
  prefix: string;
  suffix: string;
  /** replace 模式 */
  find: string;
  replaceWith: string;
}

export const defaultRule = (): RenameRule => ({
  mode: 'pattern',
  pattern: '文件_{nnn}',
  start: 1,
  prefix: '',
  suffix: '',
  find: '',
  replaceWith: '',
});

const MAX_BASE_LEN = 120;
const ILLEGAL_RE = /[\\/:*?"<>|\x00-\x1f]/g;
const RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

export function splitName(filename: string): { base: string; ext: string } {
  const i = filename.lastIndexOf('.');
  // 无点、首字符是点（如 .gitignore）、末尾是点 → 视为无扩展名
  if (i <= 0 || i === filename.length - 1) return { base: filename, ext: '' };
  return { base: filename.slice(0, i), ext: filename.slice(i + 1) };
}

export interface SanitizeResult { name: string; changed: boolean; warnings: string[] }

/** 清理文件名中的非法字符（Windows/zip 通用），返回清理后的名字与提示 */
export function sanitizeFileName(name: string): SanitizeResult {
  const warnings: string[] = [];
  let out = name.replace(ILLEGAL_RE, '_');
  if (out !== name) warnings.push('含特殊字符，已替换为下划线');
  out = out.replace(/[.\s]+$/g, ''); // 去掉结尾的点/空格（Windows 会吞掉）
  if (out !== name && !warnings.length) warnings.push('结尾多余的点/空格已去掉');
  if (!out) { out = '未命名文件'; warnings.push('文件名为空，已用默认名'); }
  if (out.length > MAX_BASE_LEN) { out = out.slice(0, MAX_BASE_LEN); warnings.push(`文件名过长，已截断至${MAX_BASE_LEN}字符`); }
  if (RESERVED.has(out.toLowerCase())) { out = out + '_'; warnings.push('与系统保留名冲突，已加后缀'); }
  return { name: out, changed: warnings.length > 0, warnings };
}

const NUM_TOKEN = /\{(n+)\}/;
const NAME_TOKEN = /\{name\}/g;

/** pattern 是否包含编号占位符 */
export function patternHasNumberToken(pattern: string): boolean {
  return NUM_TOKEN.test(pattern);
}

/** 把规则应用到单个原文件名（不含冲突处理），index 为当前排序下的序号（0 起） */
export function applyRule(original: string, rule: RenameRule, index: number): { name: string; note: string } {
  const { base, ext } = splitName(original);
  const extSuffix = ext ? '.' + ext : '';
  let newBase = base;
  let note = '';
  if (rule.mode === 'pattern') {
    let p = rule.pattern.trim() || '文件_{nnn}';
    if (!patternHasNumberToken(p)) {
      p = p.replace(/\{(n+)\}/g, '').replace(NAME_TOKEN, '').trim() || '文件';
      p = `${p}_{nnn}`;
      note = '模板无编号，已自动追加编号';
    }
    const num = String(rule.start + index);
    newBase = p.replace(NUM_TOKEN, (m) => num.padStart(m.length - 2, '0')).replace(NAME_TOKEN, base);
  } else if (rule.mode === 'affix') {
    newBase = `${rule.prefix}${base}${rule.suffix}`;
  } else {
    newBase = rule.find ? base.split(rule.find).join(rule.replaceWith) : base;
    if (!rule.find) note = '查找内容为空，未改名';
  }
  return { name: newBase + extSuffix, note };
}

export interface PlannedFile {
  original: string;
  size: number;
  newName: string;
  warnings: string[];
  deduped: boolean;
  note: string;
}

/**
 * 对一批文件计算最终文件名：应用规则 → 清理非法字符 → 大小写不敏感去重。
 * 去重策略：在扩展名前追加 _2、_3……，保证 ZIP 内不覆盖。
 */
export function planNames(files: { name: string; size: number }[], rule: RenameRule, order: number[]): PlannedFile[] {
  const planned: PlannedFile[] = order.map((fi, idx) => {
    const f = files[fi];
    const { name: raw, note } = applyRule(f.name, rule, idx);
    const { base, ext } = splitName(raw);
    const s = sanitizeFileName(base);
    const warnings = [...s.warnings];
    if (note) warnings.push(note);
    return {
      original: f.name, size: f.size,
      newName: s.name + (ext ? '.' + ext : ''),
      warnings, deduped: false, note,
    };
  });
  // 大小写不敏感去重（ZIP/Windows 友好）
  const seen = new Map<string, number>();
  for (const p of planned) {
    const key = p.newName.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count > 0) {
      const { base, ext } = splitName(p.newName);
      p.newName = `${base}_${count + 1}${ext ? '.' + ext : ''}`;
      p.deduped = true;
      p.warnings.push(`与第${count + 1}个重名文件区分，已加后缀 _${count + 1}`);
      seen.set(p.newName.toLowerCase(), 1);
    }
  }
  return planned;
}

export type SortKey = 'name' | 'size' | 'type';
export function sortIndices(files: { name: string; size: number }[], key: SortKey, asc: boolean): number[] {
  const idx = files.map((_, i) => i);
  const dir = asc ? 1 : -1;
  idx.sort((a, b) => {
    const fa = files[a], fb = files[b];
    let c = 0;
    if (key === 'name') c = fa.name.localeCompare(fb.name, 'zh');
    else if (key === 'size') c = fa.size - fb.size;
    else c = splitName(fa.name).ext.localeCompare(splitName(fb.name).ext, 'zh') || fa.name.localeCompare(fb.name, 'zh');
    return c * dir;
  });
  return idx;
}

/** 人类可读的文件大小 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 导出 ZIP 用的条目名再保险：去掉路径分隔与首尾空白 */
export function zipEntryName(name: string): string {
  let n = name.replace(/[\\/]/g, '_').trim();
  if (!n) n = '未命名文件';
  return n;
}
