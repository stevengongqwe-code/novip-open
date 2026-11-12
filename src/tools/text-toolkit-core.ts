/**
 * NOVIP 文本工具箱 · 纯函数核心逻辑
 * 全部在浏览器本地运行，不访问网络、不读写存储；不依赖 DOM，可在 Node 中直接单测。
 * 独立实现，未复制 ToolKnit 源码；表单事件与渲染在 TextToolkit.tsx，这里只做「文本进、文本出」的计算。
 */

/** 输入上限：50 万字符（按 Unicode 码点计） */
export const MAX_CHARS = 500_000;
/** 输入上限：2MB（按 UTF-8 编码字节计） */
export const MAX_BYTES = 2 * 1024 * 1024;

/** 统一换行为 LF（CRLF / CR 都算一个换行）。 */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** 按 Unicode 码点计数字符（代理对算 1 个，emoji 不会被算成 2 个）。 */
export function countCharacters(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) i++;
    }
    count++;
  }
  return count;
}

function forEachCodePoint(text: string, visit: (codePoint: number) => void): void {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        visit(text.codePointAt(i) as number);
        i++;
        continue;
      }
    }
    visit(code);
  }
}

/** JS \s 的等价空白集合（含全角空格 U+3000、不换行空格 U+00A0）。 */
function isWhitespaceCodePoint(cp: number): boolean {
  return (
    cp === 0x20 ||
    (cp >= 0x09 && cp <= 0x0d) ||
    cp === 0xa0 ||
    cp === 0x1680 ||
    (cp >= 0x2000 && cp <= 0x200a) ||
    cp === 0x2028 ||
    cp === 0x2029 ||
    cp === 0x202f ||
    cp === 0x205f ||
    cp === 0x3000 ||
    cp === 0xfeff
  );
}

/** 常用汉字区（基本区 + 扩展 A/B 等）与兼容汉字区。 */
const HAN_RANGES: readonly (readonly [number, number])[] = [
  [0x3400, 0x4dbf], // 扩展 A
  [0x4e00, 0x9fff], // 基本区
  [0xf900, 0xfaff], // 兼容汉字
  [0x20000, 0x2fa1f], // 扩展 B–F + 兼容补充
  [0x30000, 0x323af], // 扩展 G/H
];

function isHanCodePoint(cp: number): boolean {
  for (const [start, end] of HAN_RANGES) {
    if (cp >= start && cp <= end) return true;
  }
  return false;
}

export interface TextStats {
  /** 字符数（按码点，含空格与换行） */
  chars: number;
  /** 字符数（按码点，不含任何空白字符） */
  charsNoSpaces: number;
  /** 中文汉字数（常用汉字区，兼容扩展区） */
  chineseChars: number;
  /** 英文单词数（连续英文字母，允许内部撇号，如 don't） */
  englishWords: number;
  /** 行数（CRLF/CR/LF 都算一个换行；末尾换行不额外算一行；空文本 0 行） */
  lines: number;
  /** 段落数（由空行分隔的非空段落） */
  paragraphs: number;
  /** UTF-8 编码字节数（按原始文本计，CRLF 占 2 字节） */
  utf8Bytes: number;
  /** 预计阅读分钟数，保留 1 位小数；空文本为 0 */
  readingMinutes: number;
}

/** 逐码点扫描的实时统计；不抛错，空文本返回全 0。 */
export function textStats(text: string): TextStats {
  const normalized = normalizeNewlines(text);
  let chars = 0;
  let charsNoSpaces = 0;
  let chineseChars = 0;
  forEachCodePoint(normalized, (cp) => {
    chars++;
    if (!isWhitespaceCodePoint(cp)) charsNoSpaces++;
    if (isHanCodePoint(cp)) chineseChars++;
  });
  const englishWords = normalized.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)?.length ?? 0;

  let lines = 0;
  if (normalized !== '') {
    const withoutTrailingBreak = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
    lines = withoutTrailingBreak.split('\n').length;
  }

  let paragraphs = 0;
  let inParagraph = false;
  for (const line of normalized.split('\n')) {
    const blank = line.trim() === '';
    if (blank) {
      inParagraph = false;
    } else if (!inParagraph) {
      paragraphs++;
      inParagraph = true;
    }
  }

  const utf8Bytes = new TextEncoder().encode(text).length;

  // 阅读速度估算：中文 300 字/分钟、英文 220 词/分钟；纯数字/符号按 400 字符/分钟兜底。
  const weighted = chineseChars / 300 + englishWords / 220;
  const rawMinutes = weighted > 0 ? weighted : charsNoSpaces / 400;
  const readingMinutes =
    charsNoSpaces === 0 ? 0 : Math.max(0.1, Math.round(rawMinutes * 10) / 10);

  return { chars, charsNoSpaces, chineseChars, englishWords, lines, paragraphs, utf8Bytes, readingMinutes };
}

/** 人类可读的字节数（1024 进制）。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export type InputErrorReason = 'empty' | 'too-many-chars' | 'too-many-bytes';

export interface TextInputCheck {
  ok: boolean;
  chars: number;
  bytes: number;
  reason?: InputErrorReason;
  /** 中文错误提示；ok 时为空字符串 */
  message: string;
}

/**
 * 校验输入：空文本、超 50 万字符、超 2MB 时返回中文错误。
 * 不抛异常，便于 UI 实时提示；需要抛错时用 assertTextInput。
 */
export function checkTextInput(text: string): TextInputCheck {
  const chars = countCharacters(text);
  const bytes = new TextEncoder().encode(text).length;
  if (text.length === 0) {
    return { ok: false, chars, bytes, reason: 'empty', message: '请先输入文本后再处理。' };
  }
  if (bytes > MAX_BYTES) {
    return {
      ok: false,
      chars,
      bytes,
      reason: 'too-many-bytes',
      message: `输入约 ${formatBytes(bytes)}，超过 2MB 上限，请精简后再处理。`,
    };
  }
  if (chars > MAX_CHARS) {
    return {
      ok: false,
      chars,
      bytes,
      reason: 'too-many-chars',
      message: `输入 ${chars} 字符，超过 50 万字符上限，请精简后再处理。`,
    };
  }
  return { ok: true, chars, bytes, message: '' };
}

/** 校验输入，不合格时抛出中文错误（核心 API 的显式拒绝入口）。 */
export function assertTextInput(text: string): void {
  const check = checkTextInput(text);
  if (!check.ok) throw new Error(check.message);
}

export type SortDirection = 'none' | 'asc' | 'desc';
export type CaseMode = 'none' | 'upper' | 'lower' | 'title';
export type WidthMode = 'none' | 'half' | 'full';

export interface TextTransformOptions {
  /** 去除整段首尾空白 */
  trimText: boolean;
  /** 删除每行行首行尾空白 */
  trimLines: boolean;
  /** 去除行首常见编号（1. / 1、/ 1) /（1）/ 1 内容） */
  removeLineNumbers: boolean;
  /** 删除空行 */
  removeBlankLines: boolean;
  /** 合并连续空行（与删除空行同时勾选时，删除空行优先） */
  collapseBlankLines: boolean;
  /** 去重行（保留首次出现，按整行完全一致比较） */
  dedupeLines: boolean;
  /** 行排序（localeCompare zh，稳定排序） */
  sortDirection: SortDirection;
  /** 反转行序 */
  reverseLines: boolean;
  /** 添加行号，格式「1. 内容」 */
  addLineNumbers: boolean;
  /** 每行前缀 */
  prefix: string;
  /** 每行后缀 */
  suffix: string;
  /** 查找内容（字面量，不是正则） */
  find: string;
  /** 替换为 */
  replaceWith: string;
  /** 全部替换；关闭时只替换第一处 */
  replaceAll: boolean;
  /** 英文大小写转换 */
  caseMode: CaseMode;
  /** 全角↔半角转换（ASCII 可见字符与空格） */
  widthMode: WidthMode;
  /** 中文标点→英文标点（仅常见一批，不处理全部 Unicode 标点） */
  chinesePunctuation: boolean;
}

/** 每次返回新对象，避免默认值被共享修改。 */
export function createDefaultTransformOptions(): TextTransformOptions {
  return {
    trimText: false,
    trimLines: false,
    removeLineNumbers: false,
    removeBlankLines: false,
    collapseBlankLines: false,
    dedupeLines: false,
    sortDirection: 'none',
    reverseLines: false,
    addLineNumbers: false,
    prefix: '',
    suffix: '',
    find: '',
    replaceWith: '',
    replaceAll: true,
    caseMode: 'none',
    widthMode: 'none',
    chinesePunctuation: false,
  };
}

// 行首编号：明确闭合符号（括号、方括号、顿号）可直接删除；
// 句点/冒号有歧义（3.14、12:30），只有后面跟空白时才删除；纯数字 + 空白限 1–3 位，避免误删年份。
const LINE_NUMBER_PATTERNS: readonly RegExp[] = [
  /^\s*[（(]\s*\d{1,6}\s*[)）]\s*/,
  /^\s*\d{1,6}\s*[)）\]】、]\s*/,
  /^\s*\d{1,6}\s*[.．:：]\s+/,
  /^\s*\d{1,3}[ \t]+/,
  /^\s*\d{1,6}\s*$/,
];

/** 去掉一行开头的常见编号，只处理行首，不做其他清理。 */
export function stripLineNumber(line: string): string {
  for (const pattern of LINE_NUMBER_PATTERNS) {
    const next = line.replace(pattern, '');
    if (next !== line) return next;
  }
  return line;
}

/** 字面量查找替换：不解析正则、不解析 $& 等替换占位符。 */
export function replaceLiteral(text: string, find: string, replacement: string, replaceAll = true): string {
  if (find === '') return text;
  if (replaceAll) return text.split(find).join(replacement);
  const index = text.indexOf(find);
  return index < 0 ? text : text.slice(0, index) + replacement + text.slice(index + find.length);
}

/** 全角（U+FF01–U+FF5E、U+3000）→ 半角 ASCII。 */
export function toHalfWidth(text: string): string {
  const out: string[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) as number;
    if (cp === 0x3000) out.push(' ');
    else if (cp >= 0xff01 && cp <= 0xff5e) out.push(String.fromCodePoint(cp - 0xfee0));
    else out.push(char);
  }
  return out.join('');
}

/** 半角 ASCII 可见字符与空格 → 全角。 */
export function toFullWidth(text: string): string {
  const out: string[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) as number;
    if (cp === 0x20) out.push('\u3000');
    else if (cp >= 0x21 && cp <= 0x7e) out.push(String.fromCodePoint(cp + 0xfee0));
    else out.push(char);
  }
  return out.join('');
}

/** 每个英文单词首字母大写，其余字母保持原样（不破坏全大写缩写）。 */
export function toTitleCase(text: string): string {
  return text.replace(/[A-Za-z]+(?:['’][A-Za-z]+)*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

const CHINESE_PUNCTUATION: Readonly<Record<string, string>> = {
  '，': ',',
  '。': '.',
  '；': ';',
  '：': ':',
  '！': '!',
  '？': '?',
  '、': ',',
  '（': '(',
  '）': ')',
  '【': '[',
  '】': ']',
  '「': '"',
  '」': '"',
  '『': "'",
  '』': "'",
  '《': '<',
  '》': '>',
  '—': '-',
  '…': '...',
};

/** 常见中文标点→英文标点；范围有限，不处理全部 Unicode 标点。 */
export function toEnglishPunctuation(text: string): string {
  const out: string[] = [];
  for (const char of text) out.push(CHINESE_PUNCTUATION[char] ?? char);
  return out.join('');
}

function hasLineOperations(options: TextTransformOptions): boolean {
  return (
    options.trimLines ||
    options.removeLineNumbers ||
    options.removeBlankLines ||
    options.collapseBlankLines ||
    options.dedupeLines ||
    options.sortDirection !== 'none' ||
    options.reverseLines ||
    options.addLineNumbers ||
    options.prefix !== '' ||
    options.suffix !== ''
  );
}

/**
 * 按固定顺序叠加处理（纯函数，不修改输入与 options）：
 * 1 去整段首尾空白 → 2 行内整理（行首尾空白 / 去行号 / 空行 / 去重 / 排序 / 反转 / 前后缀 / 行号）
 * → 3 全半角 → 4 大小写 → 5 中文标点 → 6 查找替换。
 * 行处理会忽略末尾换行产生的空行；结果统一使用 LF 换行。
 */
export function applyTextTransform(input: string, options: TextTransformOptions): string {
  let text = normalizeNewlines(input);
  if (options.trimText) text = text.trim();
  if (text === '') return '';

  if (hasLineOperations(options)) {
    let lines = text.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    if (options.trimLines) lines = lines.map((line) => line.trim());
    if (options.removeLineNumbers) lines = lines.map(stripLineNumber);
    if (options.removeBlankLines) {
      lines = lines.filter((line) => line.trim() !== '');
    } else if (options.collapseBlankLines) {
      const collapsed: string[] = [];
      for (const line of lines) {
        if (line.trim() === '' && collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === '') continue;
        collapsed.push(line);
      }
      lines = collapsed;
    }
    if (options.dedupeLines) {
      const seen = new Set<string>();
      lines = lines.filter((line) => {
        if (seen.has(line)) return false;
        seen.add(line);
        return true;
      });
    }
    if (options.sortDirection !== 'none') {
      const direction = options.sortDirection === 'asc' ? 1 : -1;
      lines = lines
        .map((line, index) => ({ line, index }))
        .sort((a, b) => {
          const compared = a.line.localeCompare(b.line, 'zh') * direction;
          return compared !== 0 ? compared : a.index - b.index;
        })
        .map((item) => item.line);
    }
    if (options.reverseLines) lines.reverse();
    if (options.prefix !== '' || options.suffix !== '') {
      lines = lines.map((line) => `${options.prefix}${line}${options.suffix}`);
    }
    if (options.addLineNumbers) {
      const width = String(lines.length).length;
      lines = lines.map((line, index) => `${String(index + 1).padStart(width, ' ')}. ${line}`);
    }
    text = lines.join('\n');
  }

  if (options.widthMode === 'half') text = toHalfWidth(text);
  else if (options.widthMode === 'full') text = toFullWidth(text);

  if (options.caseMode === 'upper') text = text.toUpperCase();
  else if (options.caseMode === 'lower') text = text.toLowerCase();
  else if (options.caseMode === 'title') text = toTitleCase(text);

  if (options.chinesePunctuation) text = toEnglishPunctuation(text);

  if (options.find !== '') text = replaceLiteral(text, options.find, options.replaceWith, options.replaceAll);

  return text;
}
