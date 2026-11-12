/**
 * DOCX 一键排版（Factory Day 14，2026-11-09）。
 * 上传写好的 .docx，选一套排版预设（标题 1–3 级分级字体字号、正文
 * 字体字号、行距、首行缩进、页边距），一键改好并下载新 .docx +
 * 逐项修改清单。全程浏览器本地，不上传、不调用 AI。
 * 实现：复用 docx-core 的 inspectDocx（标题样式链）与 fixDocxFont
 * 已验证的写回模式（直接格式覆盖 + fflate zipSync 重打包）。
 * 不改范围：表格内段落、图表题注、页眉页脚、脚注、目录域、批注、
 * 公式、图片；只改 word/document.xml 正文段落与节页边距。
 */
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { zipSync } from 'fflate';
import { inspectDocx } from './docx-core';
import { identify, zipEntries } from '../conversion/files';
import { xml } from '../conversion/office';

type X = any;
const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const all = (n: X, name: string): X[] =>
  Array.from(n?.getElementsByTagName?.('*') ?? []).filter((x: any) => x.localName === name);
const child = (n: X, name: string): X =>
  Array.from(n?.childNodes ?? []).find((x: any) => x.nodeType === 1 && x.localName === name);
const attr = (n: X, name: string): string | undefined =>
  (Array.from(n?.attributes ?? []) as X[]).find((x) => x.localName === name)?.value;
const enc = new TextEncoder();

export interface LevelRule {
  font: string;
  sizePt: number;
  bold: boolean;
  align: 'center' | 'both';
  line: number;
  beforePt: number;
  afterPt: number;
  firstLineChars: number;
}

export interface FormatPreset {
  id: string;
  name: string;
  description: string;
  headingFont: string;
  h1: LevelRule;
  h2: LevelRule;
  h3: LevelRule;
  bodyFont: string;
  bodySizePt: number;
  bodyLine: number;
  bodyFirstLineChars: number;
  marginTopCm: number;
  marginBottomCm: number;
  marginLeftCm: number;
  marginRightCm: number;
}

export const FORMAT_PRESETS: FormatPreset[] = [
  {
    id: 'thesis',
    name: '本科毕业论文（通用）',
    description: '一级标题黑体三号居中，二级标题黑体四号，三级标题黑体小四；正文仿宋_GB2312三号、1.5倍行距、首行缩进2字符；页边距上下2.54cm、左右3.17cm。',
    headingFont: '黑体',
    h1: { font: '黑体', sizePt: 16, bold: true, align: 'center', line: 1.5, beforePt: 12, afterPt: 12, firstLineChars: 0 },
    h2: { font: '黑体', sizePt: 14, bold: true, align: 'both', line: 1.5, beforePt: 6, afterPt: 6, firstLineChars: 0 },
    h3: { font: '黑体', sizePt: 12, bold: true, align: 'both', line: 1.5, beforePt: 6, afterPt: 6, firstLineChars: 0 },
    bodyFont: '仿宋_GB2312',
    bodySizePt: 16,
    bodyLine: 1.5,
    bodyFirstLineChars: 2,
    marginTopCm: 2.54,
    marginBottomCm: 2.54,
    marginLeftCm: 3.17,
    marginRightCm: 3.17,
  },
  {
    id: 'course',
    name: '课程报告 / 课程设计',
    description: '一级标题黑体小三居中，二级标题黑体四号，三级标题黑体小四；正文宋体小四、1.5倍行距、首行缩进2字符；页边距上下2.54cm、左右3.17cm。',
    headingFont: '黑体',
    h1: { font: '黑体', sizePt: 15, bold: true, align: 'center', line: 1.5, beforePt: 12, afterPt: 12, firstLineChars: 0 },
    h2: { font: '黑体', sizePt: 14, bold: true, align: 'both', line: 1.5, beforePt: 6, afterPt: 6, firstLineChars: 0 },
    h3: { font: '黑体', sizePt: 12, bold: true, align: 'both', line: 1.5, beforePt: 6, afterPt: 6, firstLineChars: 0 },
    bodyFont: '宋体',
    bodySizePt: 12,
    bodyLine: 1.5,
    bodyFirstLineChars: 2,
    marginTopCm: 2.54,
    marginBottomCm: 2.54,
    marginLeftCm: 3.17,
    marginRightCm: 3.17,
  },
];

export interface FormatOptions {
  presetId: string;
  bodyFont?: string;
  bodySizePt?: number;
  line?: number;
  marginMm?: number;
  detectNumberedHeadings?: boolean;
}

export interface ParagraphChange {
  index: number;
  level: 0 | 1 | 2 | 3;
  excerpt: string;
  changes: string[];
}

export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FormatReport {
  presetName: string;
  totalParagraphs: number;
  headings: { 1: number; 2: number; 3: number };
  bodyFormatted: number;
  skipped: { table: number; caption: number; empty: number; textbox: number };
  marginsBefore: Margins | null;
  marginsAfter: Margins | null;
  sections: number;
  changes: ParagraphChange[];
  changesTruncated: boolean;
  warnings: string[];
}

const FIXED_HEADINGS = new Set(['摘要', '关键词', '引言', '绪论', '结论', '参考文献', '致谢', '附录', '目录']);
const CHINESE_NUM = '[一二三四五六七八九十百千\\d]+';
const CAPTION_RE = /^\s*(图|表)\s*\d+\s*[-.．]\s*\d+/;

/** 标题识别：样式层级优先；编号正则兜底（仅短行、无句末标点）。 */
export function detectHeadingLevel(text: string, styledLevel: number | null, detectNumbered: boolean): 0 | 1 | 2 | 3 {
  if (styledLevel !== null && styledLevel >= 1 && styledLevel <= 3) return styledLevel as 1 | 2 | 3;
  if (!detectNumbered) return 0;
  const t = text.trim();
  if (!t || t.length > 40) return 0;
  if (/[。；：，、]$/.test(t) || t.includes('。')) return 0;
  if (FIXED_HEADINGS.has(t)) return 1;
  if (/^附录\s*[A-Za-z]?/.test(t)) return 1;
  if (new RegExp(`^第${CHINESE_NUM}章`).test(t)) return 1;
  if (new RegExp(`^第${CHINESE_NUM}节`).test(t)) return 2;
  if (/^（[一二三四五六七八九十]+）/.test(t) || /^\([一二三四五六七八九十]+\)/.test(t)) return 2;
  if (/^一、/.test(t) || new RegExp(`^[${'一二三四五六七八九十'}]+、`).test(t)) return 1;
  const arabic = t.match(/^(\d+(?:\.\d+){0,2})[.\s、，,]+(\S.*)$/);
  if (arabic) {
    const depth = arabic[1].split('.').length;
    if (depth >= 1 && depth <= 3 && arabic[2].length >= 1) return depth as 1 | 2 | 3;
  }
  return 0;
}

export function isCaption(text: string): boolean {
  return CAPTION_RE.test(text);
}

function hasAncestor(p: X, names: string[]): boolean {
  let n = p.parentNode;
  while (n) {
    if (n.nodeType === 1 && names.includes(n.localName)) return true;
    n = n.parentNode;
  }
  return false;
}

function readPPr(p: X): { jc?: string; line?: number; before?: number; after?: number; firstLine?: number } {
  const pp = child(p, 'pPr');
  if (!pp) return {};
  const jc = attr(child(pp, 'jc'), 'val');
  const sp = child(pp, 'spacing');
  const ind = child(pp, 'ind');
  return {
    jc,
    line: sp && attr(sp, 'line') ? +attr(sp, 'line')! : undefined,
    before: sp && attr(sp, 'before') ? +attr(sp, 'before')! : undefined,
    after: sp && attr(sp, 'after') ? +attr(sp, 'after')! : undefined,
    firstLine: ind && attr(ind, 'firstLine') ? +attr(ind, 'firstLine')! : undefined,
  };
}

function setTag(parent: X, doc: X, tag: string, attrs: Record<string, string>): X {
  let e = child(parent, tag);
  if (!e) {
    e = doc.createElementNS(NS, 'w:' + tag);
    parent.appendChild(e);
  }
  for (const [k, v] of Object.entries(attrs)) e.setAttributeNS(NS, 'w:' + k, v);
  return e;
}

function applyParagraph(p: X, doc: X, rule: LevelRule): void {
  let pp = child(p, 'pPr');
  if (!pp) {
    pp = doc.createElementNS(NS, 'w:pPr');
    p.insertBefore(pp, p.firstChild);
  }
  const jc = setTag(pp, doc, 'jc', { val: rule.align });
  void jc;
  const spacing = setTag(pp, doc, 'spacing', {
    line: String(Math.round(rule.line * 240)),
    lineRule: 'auto',
    before: String(Math.round(rule.beforePt * 20)),
    after: String(Math.round(rule.afterPt * 20)),
  });
  void spacing;
  const ind = setTag(pp, doc, 'ind', { firstLine: String(Math.round(rule.firstLineChars * rule.sizePt * 20)) });
  void ind;
  for (const r of all(p, 'r')) {
    if (!all(r, 't').length) continue;
    let rp = child(r, 'rPr');
    if (!rp) {
      rp = doc.createElementNS(NS, 'w:rPr');
      r.insertBefore(rp, r.firstChild);
    }
    const fonts = setTag(rp, doc, 'rFonts', { ascii: rule.font, hAnsi: rule.font, eastAsia: rule.font, cs: rule.font });
    for (const a of Array.from(fonts.attributes) as X[]) {
      if (/theme/i.test(a.localName)) fonts.removeAttributeNS(NS, a.localName);
    }
    if (rule.bold) {
      for (const tag of ['b', 'bCs']) {
        let b = child(rp, tag);
        if (!b) {
          b = doc.createElementNS(NS, 'w:' + tag);
          rp.appendChild(b);
        }
        b.removeAttributeNS(NS, 'val');
      }
    }
    setTag(rp, doc, 'sz', { val: String(Math.round(rule.sizePt * 2)) });
    setTag(rp, doc, 'szCs', { val: String(Math.round(rule.sizePt * 2)) });
  }
}

function resolvePreset(options: FormatOptions): FormatPreset {
  const preset = FORMAT_PRESETS.find((p) => p.id === options.presetId);
  if (!preset) throw new Error('请选择排版预设。');
  return preset;
}

function validateOptions(options: FormatOptions): void {
  if (options.bodyFont !== undefined && !options.bodyFont.trim()) throw new Error('正文字体不能为空。');
  if (options.bodySizePt !== undefined) {
    if (!Number.isFinite(options.bodySizePt) || options.bodySizePt < 5 || options.bodySizePt > 72 || Math.round(options.bodySizePt * 2) !== options.bodySizePt * 2)
      throw new Error('正文字号须为 5–72pt 且为 0.5pt 的整数倍。');
  }
  if (options.line !== undefined && (!Number.isFinite(options.line) || options.line < 1 || options.line > 3))
    throw new Error('行距倍数须在 1–3 之间。');
  if (options.marginMm !== undefined && (!Number.isFinite(options.marginMm) || options.marginMm < 10 || options.marginMm > 50))
    throw new Error('页边距须在 10–50mm 之间。');
}

const cmToTwips = (cm: number) => Math.round(cm * 567);
const mmToTwips = (mm: number) => Math.round((mm / 25.4) * 1440);
const twipsToCm = (twips: number) => Math.round((twips / 567) * 100) / 100;

function ruleForLevel(preset: FormatPreset, level: 0 | 1 | 2 | 3, options: FormatOptions): LevelRule {
  if (level === 1) return preset.h1;
  if (level === 2) return preset.h2;
  if (level === 3) return preset.h3;
  return {
    font: options.bodyFont ?? preset.bodyFont,
    sizePt: options.bodySizePt ?? preset.bodySizePt,
    bold: false,
    align: 'both',
    line: options.line ?? preset.bodyLine,
    beforePt: 0,
    afterPt: 0,
    firstLineChars: preset.bodyFirstLineChars,
  };
}

function marginTarget(preset: FormatPreset, options: FormatOptions): Margins {
  if (options.marginMm !== undefined) {
    const t = mmToTwips(options.marginMm);
    return { top: t, bottom: t, left: t, right: t };
  }
  return {
    top: cmToTwips(preset.marginTopCm),
    bottom: cmToTwips(preset.marginBottomCm),
    left: cmToTwips(preset.marginLeftCm),
    right: cmToTwips(preset.marginRightCm),
  };
}

function readMargins(doc: X): { margins: Margins | null; sections: number } {
  const sects = all(doc, 'sectPr');
  if (!sects.length) return { margins: null, sections: 0 };
  const m = child(sects[0], 'pgMar');
  if (!m) return { margins: null, sections: sects.length };
  const v = (k: string) => {
    const s = attr(m, k);
    return s === undefined ? null : +s;
  };
  const top = v('top');
  const bottom = v('bottom');
  const left = v('left');
  const right = v('right');
  if (top === null || bottom === null || left === null || right === null) return { margins: null, sections: sects.length };
  return { margins: { top, bottom, left, right }, sections: sects.length };
}

function verifyFormatted(bytes: Uint8Array, preset: FormatPreset, options: FormatOptions, expectedCount: number): void {
  const entries = zipEntries(bytes);
  const doc = xml(entries['word/document.xml']);
  const paras = all(doc, 'p');
  let checked = 0;
  const problems: string[] = [];
  const inspect = inspectDocx(bytes, { font: '', size: '', line: '', margin: '' });
  paras.forEach((p, i) => {
    const text = inspect.paragraphs[i]?.text ?? '';
    if (!text.trim()) return;
    if (hasAncestor(p, ['tbl', 'tc', 'txbxContent'])) return;
    if (isCaption(text)) return;
    const level = detectHeadingLevel(text, inspect.paragraphs[i]?.heading ?? null, options.detectNumberedHeadings !== false);
    const rule = ruleForLevel(preset, level, options);
    const before = readPPr(p);
    const wantJc = rule.align === 'center' ? 'center' : 'both';
    if (before.jc !== wantJc) problems.push(`段落${i + 1}对齐方式未生效`);
    if (before.line !== Math.round(rule.line * 240)) problems.push(`段落${i + 1}行距未生效`);
    if (before.before !== Math.round(rule.beforePt * 20) || before.after !== Math.round(rule.afterPt * 20))
      problems.push(`段落${i + 1}段间距未生效`);
    if (before.firstLine !== Math.round(rule.firstLineChars * rule.sizePt * 20))
      problems.push(`段落${i + 1}首行缩进未生效`);
    const runs = all(p, 'r').filter((r: X) => all(r, 't').length);
    for (const r of runs) {
      const rp = child(r, 'rPr');
      const fonts = rp ? child(rp, 'rFonts') : undefined;
      const sz = rp ? attr(child(rp, 'sz'), 'val') : undefined;
      if (!fonts || attr(fonts, 'eastAsia') !== rule.font) problems.push(`段落${i + 1}字体未生效`);
      if (sz !== String(Math.round(rule.sizePt * 2))) problems.push(`段落${i + 1}字号未生效`);
      break;
    }
    checked++;
  });
  if (checked !== expectedCount) problems.push(`自检段落数 ${checked} 与排版段落数 ${expectedCount} 不一致`);
  if (problems.length) throw new Error('排版自检未通过：' + problems.slice(0, 3).join('；'));
}

export function formatDocx(bytes: Uint8Array, options: FormatOptions): { bytes: Uint8Array; report: FormatReport } {
  validateOptions(options);
  const preset = resolvePreset(options);
  if (bytes.length > 20 * 1024 * 1024) throw new Error('DOCX最多20MB。');
  let kind: string | undefined;
  try {
    kind = identify(bytes);
  } catch {
    kind = undefined;
  }
  if (kind !== 'docx') throw new Error('请选择真实DOCX。');
  const entries = zipEntries(bytes);
  const doc = xml(entries['word/document.xml']);
  const inspect = inspectDocx(bytes, { font: '', size: '', line: '', margin: '' });
  const paras = all(doc, 'p');
  if (paras.length > 20000) throw new Error('DOCX段落超过2万，请拆分。');
  if (!inspect.paragraphs.some((p) => p.text.trim())) throw new Error('文档没有可排版正文。');

  const detectNumbered = options.detectNumberedHeadings !== false;
  const report: FormatReport = {
    presetName: preset.name,
    totalParagraphs: paras.length,
    headings: { 1: 0, 2: 0, 3: 0 },
    bodyFormatted: 0,
    skipped: { table: 0, caption: 0, empty: 0, textbox: 0 },
    marginsBefore: null,
    marginsAfter: null,
    sections: 0,
    changes: [],
    changesTruncated: false,
    warnings: [],
  };

  const beforeMargins = readMargins(doc);
  report.sections = beforeMargins.sections;
  report.marginsBefore = beforeMargins.margins
    ? {
        top: twipsToCm(beforeMargins.margins.top),
        bottom: twipsToCm(beforeMargins.margins.bottom),
        left: twipsToCm(beforeMargins.margins.left),
        right: twipsToCm(beforeMargins.margins.right),
      }
    : null;

  const target = marginTarget(preset, options);
  let formattedCount = 0;
  paras.forEach((p, i) => {
    const info = inspect.paragraphs[i];
    const text = info?.text ?? '';
    if (!text.trim()) {
      report.skipped.empty++;
      return;
    }
    if (hasAncestor(p, ['tbl', 'tc'])) {
      report.skipped.table++;
      return;
    }
    if (hasAncestor(p, ['txbxContent'])) {
      report.skipped.textbox++;
      return;
    }
    if (isCaption(text)) {
      report.skipped.caption++;
      return;
    }
    const level = detectHeadingLevel(text, info?.heading ?? null, detectNumbered);
    const rule = ruleForLevel(preset, level, options);
    const before = readPPr(p);
    const changes: string[] = [];
    const fmtLine = (v?: number) => (v === undefined ? '未知' : v === 240 ? '单倍' : `${+(v / 240).toFixed(2)}倍`);
    if (info?.font && info.font !== '未知' && !String(info.font).startsWith('混合') && info.font !== rule.font)
      changes.push(`字体：${info.font}→${rule.font}`);
    else if (info?.font === '未知' || String(info.font ?? '').startsWith('混合')) changes.push(`字体→${rule.font}（原值未知/混合）`);
    if (info?.size !== null && info?.size !== undefined && Math.abs(info.size - rule.sizePt) > 0.03)
      changes.push(`字号：${info.size}pt→${rule.sizePt}pt`);
    else if (info?.size === null || info?.size === undefined) changes.push(`字号→${rule.sizePt}pt（原值未知）`);
    if (fmtLine(before.line) !== fmtLine(Math.round(rule.line * 240))) changes.push(`行距：${fmtLine(before.line)}→${rule.line}倍`);
    const wantFirstLine = Math.round(rule.firstLineChars * rule.sizePt * 20);
    if ((before.firstLine ?? 0) !== wantFirstLine)
      changes.push(rule.firstLineChars > 0 ? `首行缩进：${before.firstLine ?? 0}→${wantFirstLine}（${rule.firstLineChars}字符）` : '首行缩进→0');
    const wantJc = rule.align === 'center' ? 'center' : 'both';
    if ((before.jc ?? '') !== wantJc) changes.push(`对齐：${before.jc ?? '未设置'}→${wantJc === 'center' ? '居中' : '两端对齐'}`);
    if ((before.before ?? 0) !== Math.round(rule.beforePt * 20) || (before.after ?? 0) !== Math.round(rule.afterPt * 20))
      changes.push(`段间距→段前${rule.beforePt}pt/段后${rule.afterPt}pt`);
    if (level > 0) changes.push(`识别为${level}级标题${rule.bold ? '（加粗）' : ''}`);
    applyParagraph(p, doc, rule);
    formattedCount++;
    if (level > 0) report.headings[level as 1 | 2 | 3]++;
    else report.bodyFormatted++;
    if (report.changes.length < 200) {
      report.changes.push({ index: i + 1, level, excerpt: text.slice(0, 30), changes: changes.length ? changes : ['已按预设统一（原值与目标一致）'] });
    }
  });
  report.changesTruncated = formattedCount > 200;

  for (const sect of all(doc, 'sectPr')) {
    let m = child(sect, 'pgMar');
    if (!m) {
      m = doc.createElementNS(NS, 'w:pgMar');
      sect.appendChild(m);
    }
    m.setAttributeNS(NS, 'w:top', String(target.top));
    m.setAttributeNS(NS, 'w:bottom', String(target.bottom));
    m.setAttributeNS(NS, 'w:left', String(target.left));
    m.setAttributeNS(NS, 'w:right', String(target.right));
  }
  report.marginsAfter = {
    top: twipsToCm(target.top),
    bottom: twipsToCm(target.bottom),
    left: twipsToCm(target.left),
    right: twipsToCm(target.right),
  };

  if (report.skipped.table > 0) report.warnings.push(`表格内 ${report.skipped.table} 段未改动（表格格式请在 Word 中单独调整）。`);
  if (report.skipped.caption > 0) report.warnings.push(`图表题注 ${report.skipped.caption} 段未改动。`);
  if (report.skipped.textbox > 0) report.warnings.push(`文本框内 ${report.skipped.textbox} 段未改动。`);
  if (report.sections === 0) report.warnings.push('文档无节设置，页边距未写入（请在 Word 中检查页面设置）。');
  if (formattedCount === 0) throw new Error('没有可排版的段落（仅表格/题注/空段）。');

  entries['word/document.xml'] = enc.encode(new XMLSerializer().serializeToString(doc));
  const out = zipSync(entries, { level: 6 });

  // 自检：条目集合一致、非 document.xml 条目字节一致、排版规则逐段生效。
  const outEntries = zipEntries(out);
  const inNames = Object.keys(entries).sort();
  const outNames = Object.keys(outEntries).sort();
  if (inNames.join('|') !== outNames.join('|')) throw new Error('排版自检未通过：文档条目集合发生变化。');
  for (const name of inNames) {
    if (name === 'word/document.xml') continue;
    const a = entries[name];
    const b = outEntries[name];
    if (a.length !== b.length || !a.every((v, j) => v === b[j])) throw new Error(`排版自检未通过：${name} 内容发生变化。`);
  }
  verifyFormatted(out, preset, options, formattedCount);
  return { bytes: out, report };
}

/** 现场构造示例论文 .docx（样式标题 + 编号标题 + 杂乱正文 + 表格 + 题注）。 */
export function buildSampleDocx(): Uint8Array {
  const docXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr><w:t>第1章 绪论</w:t></w:r></w:p>' +
    '<w:p><w:r><w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr><w:t>1.1 研究背景</w:t></w:r></w:p>' +
    '<w:p><w:r><w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr><w:t>随着高等教育普及，毕业论文写作成为每位毕业生的必修环节，格式问题普遍存在，手动排版耗时耗力。</w:t></w:r></w:p>' +
    '<w:p><w:r><w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr><w:t>图 1-1 写作流程图</w:t></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格内文字不应被改动</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第2章 结论</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>参考文献</w:t></w:r></w:p>' +
    '<w:sectPr><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';
  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>' +
    '</w:styles>';
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';
  return zipSync({
    '[Content_Types].xml': enc.encode(contentTypes),
    'word/document.xml': enc.encode(docXml),
    'word/styles.xml': enc.encode(stylesXml),
  });
}
