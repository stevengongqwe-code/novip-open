import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import {
  FORMAT_PRESETS,
  buildSampleDocx,
  detectHeadingLevel,
  formatDocx,
  isCaption,
} from '../src/tools/docx-format-core';
import { inspectDocx } from '../src/tools/docx-core';

const THESIS = FORMAT_PRESETS.find((p) => p.id === 'thesis')!;
const COURSE = FORMAT_PRESETS.find((p) => p.id === 'course')!;

describe('预设值锁定', () => {
  it('本科毕业论文预设：正文仿宋三号 1.5 倍行距、标题黑体分级', () => {
    assert.equal(THESIS.bodyFont, '仿宋_GB2312');
    assert.equal(THESIS.bodySizePt, 16);
    assert.equal(THESIS.bodyLine, 1.5);
    assert.equal(THESIS.bodyFirstLineChars, 2);
    assert.equal(THESIS.h1.font, '黑体');
    assert.equal(THESIS.h1.sizePt, 16);
    assert.equal(THESIS.h1.bold, true);
    assert.equal(THESIS.h1.align, 'center');
    assert.equal(THESIS.h2.sizePt, 14);
    assert.equal(THESIS.h3.sizePt, 12);
    assert.equal(THESIS.marginTopCm, 2.54);
    assert.equal(THESIS.marginLeftCm, 3.17);
  });
  it('课程报告预设：正文宋体小四 12pt', () => {
    assert.equal(COURSE.bodyFont, '宋体');
    assert.equal(COURSE.bodySizePt, 12);
    assert.equal(COURSE.bodyLine, 1.5);
    assert.equal(COURSE.h1.sizePt, 15);
  });
});

describe('标题识别', () => {
  it('数字体系：1 → 1 级；1.1 → 2 级；1.1.1 → 3 级', () => {
    assert.equal(detectHeadingLevel('1 绪论', null, true), 1);
    assert.equal(detectHeadingLevel('1.1 研究背景', null, true), 2);
    assert.equal(detectHeadingLevel('1.1.1 定义', null, true), 3);
  });
  it('章节与中文体系：第2章 → 1 级；一、→ 1 级；（一）→ 2 级', () => {
    assert.equal(detectHeadingLevel('第2章 文献综述', null, true), 1);
    assert.equal(detectHeadingLevel('一、绪论', null, true), 1);
    assert.equal(detectHeadingLevel('（一）研究背景', null, true), 2);
  });
  it('固定标题词：摘要/参考文献 → 1 级', () => {
    assert.equal(detectHeadingLevel('摘要', null, true), 1);
    assert.equal(detectHeadingLevel('参考文献', null, true), 1);
  });
  it('样式层级优先于编号；关闭编号识别则只认样式', () => {
    assert.equal(detectHeadingLevel('随便文字', 2, true), 2);
    assert.equal(detectHeadingLevel('1.1 研究背景', null, false), 0);
    assert.equal(detectHeadingLevel('1.1 研究背景', 1, true), 1);
  });
  it('普通正文、过长行、句末标点 → 0 级', () => {
    assert.equal(detectHeadingLevel('普通正文内容', null, true), 0);
    assert.equal(detectHeadingLevel('1.1 研究背景。', null, true), 0);
    assert.equal(detectHeadingLevel('1. ' + '随着高等教育普及，毕业论文写作成为必修环节，前人研究指出格式问题普遍存在。', null, true), 0);
  });
  it('题注识别：图 1-1 / 表 2.3 → 题注', () => {
    assert.equal(isCaption('图 1-1 写作流程图'), true);
    assert.equal(isCaption('表2.3 数据表'), true);
    assert.equal(isCaption('如图 1-1 所示'), false);
  });
});

describe('排版 round-trip（示例文档）', () => {
  const sample = buildSampleDocx();
  const { bytes, report } = formatDocx(sample, { presetId: 'thesis' });

  it('示例文档 7 段：标题 3 个一级 + 1 个二级，正文 1 段，表格与题注各跳过 1 段', () => {
    assert.equal(report.totalParagraphs, 7);
    assert.deepEqual(report.headings, { 1: 3, 2: 1, 3: 0 });
    assert.equal(report.bodyFormatted, 1);
    assert.deepEqual(report.skipped, { table: 1, caption: 1, empty: 0, textbox: 0 });
  });
  it('修改清单不含表格与题注段落', () => {
    const excerpts = report.changes.map((c) => c.excerpt).join('|');
    assert.ok(!excerpts.includes('表格内文字'));
    assert.ok(!excerpts.includes('图 1-1'));
    assert.ok(excerpts.includes('第1章 绪论'));
  });
  it('输出重新解析：正文仿宋 16pt、1.5 倍行距；一级标题黑体 16pt', () => {
    const out = inspectDocx(bytes, { font: '', size: '', line: '', margin: '' });
    const body = out.paragraphs[2];
    assert.equal(body.font, '仿宋_GB2312');
    assert.equal(body.size, 16);
    assert.equal(body.line, 1.5);
    const h1 = out.paragraphs[0];
    assert.equal(h1.heading, 1);
    assert.equal(h1.font, '黑体');
    assert.equal(h1.size, 16);
  });
  it('表格内文字与题注原文未变；非 document.xml 条目字节一致', () => {
    const out = inspectDocx(bytes, { font: '', size: '', line: '', margin: '' });
    assert.equal(out.paragraphs[4].text, '表格内文字不应被改动');
    assert.equal(out.paragraphs[3].text, '图 1-1 写作流程图');
    const before = unzipSync(sample);
    const after = unzipSync(bytes);
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    for (const name of Object.keys(before)) {
      if (name === 'word/document.xml') continue;
      assert.deepEqual(after[name], before[name], `${name} 不应变化`);
    }
  });
  it('页边距：示例上下 2.54、左右 3.17，与预设一致', () => {
    assert.deepEqual(report.marginsBefore, { top: 2.54, bottom: 2.54, left: 3.17, right: 3.17 });
    assert.deepEqual(report.marginsAfter, { top: 2.54, bottom: 2.54, left: 3.17, right: 3.17 });
    assert.equal(report.sections, 1);
  });
});

describe('自定义覆盖', () => {
  it('正文字号 12pt、行距 2 倍、页边距 25mm 生效', () => {
    const { bytes, report } = formatDocx(buildSampleDocx(), { presetId: 'thesis', bodySizePt: 12, line: 2, marginMm: 25 });
    assert.deepEqual(report.marginsAfter, { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 });
    const out = inspectDocx(bytes, { font: '', size: '', line: '', margin: '' });
    assert.equal(out.paragraphs[2].size, 12);
    assert.equal(out.paragraphs[2].line, 2);
  });
  it('课程报告预设：正文宋体 12pt 生效', () => {
    const { bytes } = formatDocx(buildSampleDocx(), { presetId: 'course' });
    const out = inspectDocx(bytes, { font: '', size: '', line: '', margin: '' });
    assert.equal(out.paragraphs[2].font, '宋体');
    assert.equal(out.paragraphs[2].size, 12);
  });
});

describe('选项与输入校验', () => {
  it('非 docx 字节明确报错', () => {
    assert.throws(() => formatDocx(new Uint8Array([1, 2, 3]), { presetId: 'thesis' }), /请选择真实DOCX/);
  });
  it('未知预设、非法字号/行距/页边距明确报错', () => {
    const sample = buildSampleDocx();
    assert.throws(() => formatDocx(sample, { presetId: 'nope' }), /请选择排版预设/);
    assert.throws(() => formatDocx(sample, { presetId: 'thesis', bodySizePt: 100 }), /正文字号/);
    assert.throws(() => formatDocx(sample, { presetId: 'thesis', line: 5 }), /行距倍数/);
    assert.throws(() => formatDocx(sample, { presetId: 'thesis', marginMm: 5 }), /页边距/);
  });
});
