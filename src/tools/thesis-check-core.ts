/**
 * 毕业论文内容自查助手（Factory Day 13，2026-11-08）。
 * 内容结构层自查：结构完整性、标题编号、图表编号与引用核对、内部重复
 * 段落、摘要/关键词、参考文献引用核对、学校口径字数统计、标点与格式。
 * 与 docx-check 的分工：docx-check 查版式（字体/字号/行距/页边距），
 * 本工具只查内容结构；参考文献序号连续性为两者共享的一个子检查。
 * 纯浏览器本地处理：不上传、不登录、不存 localStorage，刷新即清空。
 * 明确不做：不查查重率（本地算不出真实查重率）、不查参考文献真伪、
 * 不替代学校盲审与知网查重。
 */
import { inspectDocx } from './docx-core';

export interface ParagraphInput {
  text: string;
  heading: number | null;
}

export interface ThesisCheckOptions {
  targetWordsMin: number;
  targetWordsMax: number;
  abstractWordsMin: number;
  abstractWordsMax: number;
  keywordsMin: number;
  keywordsMax: number;
}

export const DEFAULT_THESIS_OPTIONS: ThesisCheckOptions = {
  targetWordsMin: 8000,
  targetWordsMax: 15000,
  abstractWordsMin: 300,
  abstractWordsMax: 500,
  keywordsMin: 3,
  keywordsMax: 8,
};

export interface WordCount {
  chinese: number;
  english: number;
  total: number;
  chars: number;
  charsNoSpace: number;
}

/** 学校口径：总字数 = 汉字数 + 英文单词数；数字与标点不计。 */
export function countWords(text: string): WordCount {
  const chinese = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const english = (text.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) ?? []).length;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;
  return { chinese, english, total: chinese + english, chars, charsNoSpace };
}

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function chineseToNumber(s: string): number | null {
  if (CN_NUM[s] !== undefined) return CN_NUM[s];
  // 十一 ~ 十九、二十、二十一 ~ 二十九
  const m = s.match(/^([一二三四五六七八九]?)十([一二三四五六七八九]?)$/);
  if (!m) return null;
  const tens = m[1] ? CN_NUM[m[1]] : 1;
  return tens * 10 + (m[2] ? CN_NUM[m[2]] : 0);
}

export interface HeadingInfo {
  level: number;
  num: string;
  kind: 'arabic' | 'chapter' | 'chinese1' | 'chinese2' | 'chineseNum';
  label: string;
}

/** 识别标题行：数字体系 / 中文体系 / 章节。行过长或以句末标点结尾时不认标题（避免把正文序号句误判）。 */
export function parseHeadingLine(text: string): HeadingInfo | null {
  const t = text.trim();
  if (!t || t.length > 40) return null;
  if (/[。？！；]$/.test(t)) return null;
  let m = t.match(/^第\s*([一二三四五六七八九十\d]+)\s*[章节]\s*(.*)$/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : chineseToNumber(m[1]);
    if (n === null) return null;
    return { level: 1, num: String(n), kind: 'chapter', label: m[2].trim() };
  }
  m = t.match(/^(\d+(?:\.\d+)*)[\s　.．、]+(.*)$/);
  if (m && m[2].trim()) {
    const segments = m[1].split('.');
    return { level: segments.length, num: m[1], kind: 'arabic', label: m[2].trim() };
  }
  m = t.match(/^([一二三四五六七八九十]+)[、.．]\s*(.*)$/);
  if (m && m[2].trim()) {
    const n = chineseToNumber(m[1]);
    if (n === null) return null;
    return { level: 1, num: String(n), kind: 'chinese1', label: m[2].trim() };
  }
  m = t.match(/^（([一二三四五六七八九十]+)）\s*(.*)$/);
  if (m && m[2].trim()) {
    const n = chineseToNumber(m[1]);
    if (n === null) return null;
    return { level: 2, num: String(n), kind: 'chinese2', label: m[2].trim() };
  }
  m = t.match(/^(\d+)[、]\s*(.*)$/);
  if (m && m[2].trim()) {
    return { level: 2, num: m[1], kind: 'chineseNum', label: m[2].trim() };
  }
  return null;
}

export interface CaptionInfo {
  kind: '图' | '表';
  chapter: number;
  num: number;
}

/** 识别图表题注行：图 1-1 / 表 2.3（支持 - 与 . 两种分隔）。 */
export function parseCaption(text: string): CaptionInfo | null {
  const m = text.trim().match(/^(图|表)\s*(\d+)\s*[-－.．]\s*(\d+)\b/);
  if (!m) return null;
  return { kind: m[1] as '图' | '表', chapter: +m[2], num: +m[3] };
}

/** 正文中的图表引用（图/表 + 编号）。题注段落本身不参与引用扫描。 */
export function findFigureRefs(text: string): CaptionInfo[] {
  const out: CaptionInfo[] = [];
  const re = /(图|表)\s*(\d+)\s*[-－.．]\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ kind: m[1] as '图' | '表', chapter: +m[2], num: +m[3] });
  }
  return out;
}

/** 粘贴文本 / .txt / .md → 段落（按行切分、去空行、按行首模式推断标题层级）。 */
export function parseTextToParagraphs(text: string): ParagraphInput[] {
  const out: ParagraphInput[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = parseHeadingLine(line);
    out.push({ text: line, heading: h ? h.level : null });
  }
  if (!out.length) throw new Error('没有可检查的正文。');
  return out;
}

/** .docx → 段落（复用 docx-core 的段落提取，含 outlineLvl 标题层级）。 */
export function extractDocxParagraphs(bytes: Uint8Array): ParagraphInput[] {
  const report = inspectDocx(bytes, { font: '', size: '', line: '', margin: '' });
  const out = report.paragraphs.map((p) => ({ text: p.text, heading: p.heading }));
  if (!out.some((p) => p.text.trim())) throw new Error('文档没有可检查正文。');
  return out;
}

export interface Finding {
  severity: '错误' | '提醒';
  section: string;
  location: string;
  excerpt: string;
  message: string;
  suggestion: string;
}

export interface StructureItem {
  key: string;
  label: string;
  found: boolean;
  location: string;
}

export interface ThesisReport {
  stats: {
    totalWords: number;
    chineseChars: number;
    englishWords: number;
    paragraphs: number;
    sentences: number;
    figures: number;
    tables: number;
    references: number;
    abstractWords: number | null;
    keywordCount: number | null;
  };
  structure: StructureItem[];
  findings: Finding[];
  passed: string[];
}

function validateOptions(o: ThesisCheckOptions): void {
  const pairs: [number, number, string][] = [
    [o.targetWordsMin, o.targetWordsMax, '目标字数区间'],
    [o.abstractWordsMin, o.abstractWordsMax, '摘要字数区间'],
    [o.keywordsMin, o.keywordsMax, '关键词个数区间'],
  ];
  for (const [min, max, label] of pairs) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 0) {
      throw new Error(`${label}须为非负整数。`);
    }
    if (min > max) throw new Error(`${label}下限不能大于上限。`);
  }
}

const SENTENCE_SPLIT = /[。；？！!?\n]+/;
const NORMALIZE_STRIP = /[\s，。、；：？！·…—\-_()\[\]《》""'''""]/g;

function normalizeSentence(s: string): string {
  return s.replace(NORMALIZE_STRIP, '');
}

function isStructureMarker(text: string): boolean {
  const t = text.trim();
  return (
    t === '摘要' ||
    t === '参考文献' ||
    t === '致谢' ||
    t === '目录' ||
    /^关键词[：:]/.test(t) ||
    /^摘要[：:]/.test(t)
  );
}

export function checkThesis(paragraphs: ParagraphInput[], options: ThesisCheckOptions): ThesisReport {
  validateOptions(options);
  const findings: Finding[] = [];
  const passed: string[] = [];
  const add = (
    severity: Finding['severity'],
    section: string,
    location: string,
    excerpt: string,
    message: string,
    suggestion: string,
  ) => findings.push({ severity, section, location, excerpt: excerpt.slice(0, 80), message, suggestion });

  const total = paragraphs.reduce(
    (acc, p) => {
      const c = countWords(p.text);
      return {
        chinese: acc.chinese + c.chinese,
        english: acc.english + c.english,
        total: acc.total + c.total,
      };
    },
    { chinese: 0, english: 0, total: 0 },
  );

  // ---- 结构检测 ----
  const findBy = (pred: (p: ParagraphInput, i: number) => boolean) => {
    const i = paragraphs.findIndex(pred);
    return i < 0 ? null : { index: i, text: paragraphs[i].text.trim() };
  };
  const abstractAt = findBy((p) => p.text.trim() === '摘要' || /^摘要[：:]/.test(p.text.trim()));
  const keywordAt = findBy((p) => /^关键词[：:]/.test(p.text.trim()));
  const introAt = findBy((p) => {
    const h = parseHeadingLine(p.text);
    if (h && /引言|绪论/.test(h.label)) return true;
    const t = p.text.trim();
    return t.length <= 12 && /^(第.*[章节]\s*)?(引言|绪论)$/.test(t);
  });
  const conclusionAt = findBy((p) => {
    const h = parseHeadingLine(p.text);
    if (h && /结论|结语/.test(h.label)) return true;
    const t = p.text.trim();
    return t.length <= 12 && /^(第.*[章节]\s*)?(结论|结语|总结)$/.test(t);
  });
  const refsAt = findBy((p) => {
    const h = parseHeadingLine(p.text);
    return p.text.trim() === '参考文献' || h?.label === '参考文献';
  });
  const thanksAt = findBy((p) => {
    const h = parseHeadingLine(p.text);
    return p.text.trim() === '致谢' || p.text.trim().startsWith('致谢') || h?.label.startsWith('致谢') === true;
  });
  const contentsAt = findBy((p) => p.text.trim() === '目录' || parseHeadingLine(p.text)?.label === '目录');

  const structure: StructureItem[] = [
    { key: 'abstract', label: '摘要', found: !!abstractAt, location: abstractAt ? `第 ${abstractAt.index + 1} 段` : '' },
    { key: 'keywords', label: '关键词', found: !!keywordAt, location: keywordAt ? `第 ${keywordAt.index + 1} 段` : '' },
    { key: 'intro', label: '引言/绪论', found: !!introAt, location: introAt ? `第 ${introAt.index + 1} 段` : '' },
    { key: 'conclusion', label: '结论/结语', found: !!conclusionAt, location: conclusionAt ? `第 ${conclusionAt.index + 1} 段` : '' },
    { key: 'references', label: '参考文献', found: !!refsAt, location: refsAt ? `第 ${refsAt.index + 1} 段` : '' },
    { key: 'thanks', label: '致谢', found: !!thanksAt, location: thanksAt ? `第 ${thanksAt.index + 1} 段` : '' },
  ];
  for (const item of structure) {
    if (item.found) passed.push(`结构：已找到「${item.label}」（${item.location}）。`);
    else
      add(
        '提醒',
        '结构完整性',
        '全文',
        '',
        `未找到「${item.label}」`,
        '请确认论文是否缺少这一部分；学校模板要求的结构请以模板为准。',
      );
  }
  if (contentsAt)
    add(
      '提醒',
      '结构完整性',
      `第 ${contentsAt.index + 1} 段`,
      contentsAt.text,
      '已找到「目录」，请在 Word/WPS 中核对目录页码是否与正文一致',
      '本工具不校验页码；目录须在定稿后更新域/手动核对。',
    );

  // ---- 摘要字数与关键词个数 ----
  let abstractWords: number | null = null;
  if (abstractAt) {
    const end = keywordAt && keywordAt.index > abstractAt.index ? keywordAt.index : paragraphs.length;
    let n = 0;
    for (let i = abstractAt.index + 1; i < end; i++) {
      const p = paragraphs[i];
      if (p.heading !== null && p.heading <= 1) break;
      if (/^关键词[：:]/.test(p.text.trim())) break;
      n += countWords(p.text).total;
    }
    abstractWords = n;
    if (n < options.abstractWordsMin)
      add('提醒', '摘要与关键词', `第 ${abstractAt.index + 1} 段起`, '', `摘要共 ${n} 字，低于下限 ${options.abstractWordsMin} 字`, '请按学校要求补足摘要字数（常见要求 300–500 字）。');
    else if (n > options.abstractWordsMax)
      add('提醒', '摘要与关键词', `第 ${abstractAt.index + 1} 段起`, '', `摘要共 ${n} 字，超过上限 ${options.abstractWordsMax} 字`, '请按学校要求精简摘要。');
    else passed.push(`摘要共 ${n} 字，在 ${options.abstractWordsMin}–${options.abstractWordsMax} 字区间内。`);
  }
  let keywordCount: number | null = null;
  if (keywordAt) {
    const body = keywordAt.text.replace(/^关键词[：:]\s*/, '');
    keywordCount = body.split(/[；;、，,]/).map((s) => s.trim()).filter(Boolean).length;
    if (keywordCount < options.keywordsMin || keywordCount > options.keywordsMax)
      add('提醒', '摘要与关键词', `第 ${keywordAt.index + 1} 段`, keywordAt.text, `关键词 ${keywordCount} 个，不在 ${options.keywordsMin}–${options.keywordsMax} 个区间内`, '请按学校要求调整关键词个数（常见要求 3–8 个，以分号分隔）。');
    else passed.push(`关键词 ${keywordCount} 个，在 ${options.keywordsMin}–${options.keywordsMax} 个区间内。`);
  }

  // ---- 标题编号连续性 ----
  const headings: { index: number; info: HeadingInfo }[] = [];
  paragraphs.forEach((p, i) => {
    const h = parseHeadingLine(p.text);
    if (h) headings.push({ index: i, info: h });
  });
  let lastLevel = 0;
  for (const { index, info } of headings) {
    if (lastLevel > 0 && info.level > lastLevel + 1) {
      add('错误', '标题编号', `第 ${index + 1} 段`, paragraphs[index].text, `标题层级跳级：上一级标题为 ${lastLevel} 级，本行为 ${info.level} 级`, '标题层级应逐级递进，请检查是否漏了一级标题。');
    }
    lastLevel = info.level;
  }
  const groups = new Map<string, { label: string; idx: number; loc: number; prefix: string }[]>();
  for (const { index, info } of headings) {
    let key: string;
    let idx: number;
    let prefix = '';
    if (info.kind === 'arabic') {
      const segs = info.num.split('.');
      const parent = segs.slice(0, -1).join('.');
      key = `arabic:${parent}`;
      idx = +segs[segs.length - 1];
      prefix = parent ? `${parent}.` : '';
    } else if (info.kind === 'chapter') {
      key = 'chapter:';
      idx = +info.num;
    } else if (info.kind === 'chinese1') {
      key = 'chinese1:';
      idx = +info.num;
    } else if (info.kind === 'chinese2') {
      key = 'chinese2:';
      idx = +info.num;
    } else {
      key = 'chineseNum:';
      idx = +info.num;
    }
    const list = groups.get(key) ?? [];
    list.push({ label: info.num, idx, loc: index, prefix });
    groups.set(key, list);
  }
  for (const [, list] of groups) {
    const seen = new Set<number>();
    let prev: { label: string; idx: number; loc: number; prefix: string } | null = null;
    for (const item of list) {
      if (seen.has(item.idx)) {
        add('错误', '标题编号', `第 ${item.loc + 1} 段`, paragraphs[item.loc].text, `标题编号重复：${item.label} 出现了两次`, '请检查重复的标题编号，逐一修正。');
        continue;
      }
      seen.add(item.idx);
      if (prev && item.idx !== prev.idx + 1) {
        const missing = Array.from({ length: item.idx - prev.idx - 1 }, (_, k) => `${item.prefix}${prev!.idx + k + 1}`);
        add(
          '错误',
          '标题编号',
          `第 ${item.loc + 1} 段`,
          paragraphs[item.loc].text,
          `标题编号跳号：${prev.label} 之后是 ${item.label}，缺少 ${missing.join('、')}`,
          '请按顺序补齐缺失的编号，或重新编号。',
        );
      }
      prev = item;
    }
  }
  if (!headings.length) add('提醒', '标题编号', '全文', '', '未识别到任何标题编号', '如论文使用 Word 标题样式，请上传 .docx；粘贴文本请保留「第 X 章」「1.1」等编号。');
  else if (!findings.some((f) => f.section === '标题编号')) passed.push(`标题编号连续，未发现跳号、重复编号与层级跳级（共 ${headings.length} 个标题）。`);

  // ---- 图表编号与引用核对 ----
  const captions: { index: number; info: CaptionInfo }[] = [];
  paragraphs.forEach((p, i) => {
    const c = parseCaption(p.text);
    if (c) captions.push({ index: i, info: c });
  });
  const capGroups = new Map<string, { num: number; loc: number }[]>();
  for (const { index, info } of captions) {
    const key = `${info.kind}:${info.chapter}`;
    const list = capGroups.get(key) ?? [];
    list.push({ num: info.num, loc: index });
    capGroups.set(key, list);
  }
  for (const [key, list] of capGroups) {
    const [kind, chapter] = key.split(':');
    const seen = new Set<number>();
    let prev: { num: number; loc: number } | null = null;
    for (const item of list) {
      if (seen.has(item.num)) {
        add('错误', '图表编号', `第 ${item.loc + 1} 段`, paragraphs[item.loc].text, `${kind} ${chapter}-${item.num} 编号重复`, '请检查重复的图表编号，逐一修正。');
        continue;
      }
      seen.add(item.num);
      if (prev && item.num !== prev.num + 1) {
        const missing = Array.from({ length: item.num - prev.num - 1 }, (_, k) => prev!.num + k + 1);
        add('错误', '图表编号', `第 ${item.loc + 1} 段`, paragraphs[item.loc].text, `${kind} ${chapter} 章编号跳号：${prev.num} 之后是 ${item.num}，缺少 ${missing.join('、')}`, '请按顺序补齐缺失的图表编号，或重新编号。');
      }
      prev = item;
    }
  }
  const capSet = new Set(captions.map((c) => `${c.info.kind}:${c.info.chapter}-${c.info.num}`));
  const refSet = new Map<string, number[]>();
  paragraphs.forEach((p, i) => {
    if (parseCaption(p.text)) return;
    for (const r of findFigureRefs(p.text)) {
      const key = `${r.kind}:${r.chapter}-${r.num}`;
      const list = refSet.get(key) ?? [];
      list.push(i);
      refSet.set(key, list);
    }
  });
  for (const { index, info } of captions) {
    const key = `${info.kind}:${info.chapter}-${info.num}`;
    if (!refSet.has(key))
      add('提醒', '图表引用', `第 ${index + 1} 段`, paragraphs[index].text, `${info.kind} ${info.chapter}-${info.num} 有题注，但正文未引用`, '请在正文相关处写「如图 X-X 所示」或「见表 X-X」引用它；确无引用时请删除该图/表。');
  }
  for (const [key, locs] of refSet) {
    if (!capSet.has(key)) {
      const [kind, rest] = key.split(':');
      add('错误', '图表引用', `第 ${locs[0] + 1} 段`, paragraphs[locs[0]].text, `正文引用了${kind} ${rest}，但全文没有对应题注`, '请检查编号是否写错，或补上对应的图/表题注。');
    }
  }
  const figures = captions.filter((c) => c.info.kind === '图').length;
  const tables = captions.filter((c) => c.info.kind === '表').length;
  if (!findings.some((f) => f.section === '图表编号' || f.section === '图表引用')) {
    if (captions.length) passed.push(`图表编号与引用一致（图 ${figures} 个、表 ${tables} 个，均有正文引用且编号连续）。`);
    else passed.push('全文未检测到图/表题注（无图无表的论文可忽略本项）。');
  }

  // ---- 参考文献引用核对 ----
  const refsStart = refsAt ? refsAt.index : -1;
  const refEntries: { num: number; loc: number }[] = [];
  if (refsStart >= 0) {
    for (let i = refsStart + 1; i < paragraphs.length; i++) {
      const m = paragraphs[i].text.match(/^\s*\[(\d+)\]/);
      if (m) refEntries.push({ num: +m[1], loc: i });
    }
  }
  const cited = new Set<number>();
  const bodyEnd = refsStart >= 0 ? refsStart : paragraphs.length;
  for (let i = 0; i < bodyEnd; i++) {
    const re = /\[(\d+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(paragraphs[i].text)) !== null) cited.add(+m[1]);
  }
  if (refsStart >= 0) {
    const listed = new Set(refEntries.map((e) => e.num));
    const seenNums = new Set<number>();
    let prevNum: number | null = null;
    for (const e of refEntries) {
      if (seenNums.has(e.num)) {
        add('错误', '参考文献', `第 ${e.loc + 1} 段`, paragraphs[e.loc].text, `参考文献序号重复：[${e.num}] 出现了两次`, '请检查重复的文献序号，逐一修正。');
        continue;
      }
      seenNums.add(e.num);
      if (prevNum !== null && e.num !== prevNum + 1) {
        add('错误', '参考文献', `第 ${e.loc + 1} 段`, paragraphs[e.loc].text, `参考文献序号跳号：[${prevNum}] 之后是 [${e.num}]`, '请按顺序补齐缺失的序号，或重新编号。');
      }
      prevNum = e.num;
    }
    for (const n of cited) {
      if (!listed.has(n))
        add('错误', '参考文献', '正文', '', `正文引用了 [${n}]，但文末参考文献列表中没有该条`, '请检查引用编号是否写错，或补上对应的文献条目。');
    }
    for (const e of refEntries) {
      if (!cited.has(e.num))
        add('提醒', '参考文献', `第 ${e.loc + 1} 段`, paragraphs[e.loc].text, `参考文献 [${e.num}] 从未被正文引用`, '请确认该文献是否确实被引用；未引用的文献请从列表中删除。');
    }
    if (!findings.some((f) => f.section === '参考文献')) passed.push(`参考文献引用与列表一致（${refEntries.length} 条，均被正文引用且序号连续）。`);
  } else if (cited.size) {
    add('提醒', '参考文献', '正文', '', `正文引用了 ${[...cited].join('、')}，但全文未找到「参考文献」一节`, '请确认是否漏写了参考文献一节。');
  }

  // ---- 内部重复段落检测（正文区：参考文献节之前，排除标题/题注/结构标记行）----
  const bodyParas: { index: number; text: string }[] = [];
  for (let i = 0; i < bodyEnd; i++) {
    const p = paragraphs[i];
    if (p.heading !== null) continue;
    if (parseCaption(p.text)) continue;
    if (isStructureMarker(p.text)) continue;
    if (!p.text.trim()) continue;
    bodyParas.push({ index: i, text: p.text });
  }
  const sentenceOccur = new Map<string, { count: number; first: string; locs: number[] }>();
  let sentenceTotal = 0;
  for (const { index, text } of bodyParas) {
    for (const raw of text.split(SENTENCE_SPLIT)) {
      const s = raw.trim();
      if (!s) continue;
      sentenceTotal++;
      const norm = normalizeSentence(s);
      if (norm.length < 12) continue;
      const hit = sentenceOccur.get(norm);
      if (hit) {
        hit.count++;
        hit.locs.push(index);
      } else {
        sentenceOccur.set(norm, { count: 1, first: s, locs: [index] });
      }
    }
  }
  let repeatGroups = 0;
  for (const [, hit] of sentenceOccur) {
    if (hit.count < 2) continue;
    repeatGroups++;
    if (repeatGroups <= 10)
      add(
        '提醒',
        '内部重复',
        hit.locs.map((l) => `第 ${l + 1} 段`).join('、'),
        hit.first,
        `疑似重复的句子出现了 ${hit.count} 次`,
        '请检查是否为无意重复；确需重复表述时可改写其中一处。',
      );
  }
  const paraOccur = new Map<string, { count: number; first: string; locs: number[] }>();
  for (const { index, text } of bodyParas) {
    const norm = normalizeSentence(text);
    if (norm.length < 20) continue;
    const hit = paraOccur.get(norm);
    if (hit) {
      hit.count++;
      hit.locs.push(index);
    } else {
      paraOccur.set(norm, { count: 1, first: text, locs: [index] });
    }
  }
  let repeatParas = 0;
  for (const [, hit] of paraOccur) {
    if (hit.count < 2) continue;
    repeatParas++;
    if (repeatParas <= 5)
      add('提醒', '内部重复', hit.locs.map((l) => `第 ${l + 1} 段`).join('、'), hit.first, `疑似重复的段落出现了 ${hit.count} 次`, '请检查是否为无意粘贴重复；确需保留时可忽略本项。');
  }
  if (!repeatGroups && !repeatParas) passed.push('未发现内部重复的句子或段落。');
  else if (repeatGroups + repeatParas > 10)
    add('提醒', '内部重复', '全文', '', `另有 ${repeatGroups + repeatParas - 10} 组重复未逐条列出`, '请逐段检查上表之外的重复内容。');

  // ---- 标点与格式 ----
  let punctFindings = 0;
  for (const { index, text } of bodyParas) {
    if (/[\u3400-\u9fff]\.(?=[\u3400-\u9fff]|$)/.test(text) && punctFindings < 3) {
      punctFindings++;
      add('提醒', '标点与格式', `第 ${index + 1} 段`, text, '英文句号「.」用于中文句', '中文句子请用中文句号「。」；英文句号只用于英文句子与小数。');
    }
  }
  let spaceFindings = 0;
  for (const { index, text } of bodyParas) {
    if (/ {2,}|　{2,}/.test(text) && spaceFindings < 3) {
      spaceFindings++;
      add('提醒', '标点与格式', `第 ${index + 1} 段`, text, '连续两个以上空格', '请删除多余空格；需要对齐时请用制表位或表格。');
    }
  }
  if (!punctFindings && !spaceFindings) passed.push('未发现英文句号误用于中文句、连续多空格等标点问题。');

  // ---- 字数目标 ----
  if (total.total < options.targetWordsMin)
    add('提醒', '字数统计', '全文', '', `全文共 ${total.total} 字，低于目标下限 ${options.targetWordsMin} 字`, '请按学校对正文字数的要求补足；目标区间可在上方调整。');
  else if (total.total > options.targetWordsMax)
    add('提醒', '字数统计', '全文', '', `全文共 ${total.total} 字，超过目标上限 ${options.targetWordsMax} 字`, '请按学校对正文字数的要求精简；目标区间可在上方调整。');
  else passed.push(`全文共 ${total.total} 字，在目标区间 ${options.targetWordsMin}–${options.targetWordsMax} 字内。`);

  return {
    stats: {
      totalWords: total.total,
      chineseChars: total.chinese,
      englishWords: total.english,
      paragraphs: paragraphs.length,
      sentences: sentenceTotal,
      figures,
      tables,
      references: refEntries.length,
      abstractWords,
      keywordCount,
    },
    structure,
    findings,
    passed,
  };
}

export const SAMPLE_THESIS_TEXT = [
  '摘要',
  '本研究以兰州某高校为例，分析了本科生毕业论文的写作现状。本研究以兰州某高校为例，分析了本科生毕业论文的写作现状。',
  '关键词：毕业论文；格式自查；本地工具',
  '第1章 引言',
  '1.1 研究背景',
  '随着高等教育普及，毕业论文写作成为必修环节。前人研究指出[1]格式问题普遍存在。',
  '1.3 研究意义',
  '图 1-1 写作流程图',
  '如图 1-2 所示，流程分为三步。',
  '表 1-1 样本分布表',
  '见表 1-1，样本共 120 份。',
  '第2章 文献综述',
  '2.1 国内研究现状',
  '参考文献',
  '[1] 张三. 论文写作指南[M]. 北京：教育出版社，2024.',
  '[2] 李四. 学术规范手册[J]. 高等教育研究，2023.',
  '致谢',
  '感谢导师的指导。',
].join('\n');

export function reportToText(report: ThesisReport): string {
  const lines: string[] = [];
  lines.push('毕业论文内容自查报告（NOVIP 毕业论文内容自查助手，纯本地规则自查）');
  lines.push('');
  lines.push(`全文 ${report.stats.totalWords} 字（汉字 ${report.stats.chineseChars}、英文单词 ${report.stats.englishWords}），${report.stats.paragraphs} 段、${report.stats.sentences} 句；图 ${report.stats.figures} 个、表 ${report.stats.tables} 个、参考文献 ${report.stats.references} 条。`);
  if (report.stats.abstractWords !== null) lines.push(`摘要 ${report.stats.abstractWords} 字；关键词 ${report.stats.keywordCount ?? 0} 个。`);
  lines.push('');
  lines.push('结构清单：');
  for (const s of report.structure) lines.push(`- ${s.found ? '✓' : '✗'} ${s.label}${s.location ? `（${s.location}）` : ''}`);
  lines.push('');
  const errors = report.findings.filter((f) => f.severity === '错误');
  const warns = report.findings.filter((f) => f.severity === '提醒');
  lines.push(`问题清单：共 ${report.findings.length} 项（错误 ${errors.length} 项、提醒 ${warns.length} 项）`);
  for (const f of report.findings) {
    lines.push(`- [${f.severity}] ${f.section} · ${f.location}：${f.message}（${f.suggestion}）`);
  }
  if (report.passed.length) {
    lines.push('');
    lines.push('通过项：');
    for (const p of report.passed) lines.push(`- ${p}`);
  }
  lines.push('');
  lines.push('说明：本报告只做规则自查，不查查重率、不查参考文献真伪、不替代学校盲审与知网查重；版式检查请用站内 DOCX格式检查，参考文献著录格式请用参考文献格式化。');
  return lines.join('\n');
}
