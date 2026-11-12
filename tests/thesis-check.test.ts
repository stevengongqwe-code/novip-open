import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import {
  checkThesis,
  countWords,
  DEFAULT_THESIS_OPTIONS,
  extractDocxParagraphs,
  findFigureRefs,
  parseCaption,
  parseHeadingLine,
  parseTextToParagraphs,
  reportToText,
  SAMPLE_THESIS_TEXT,
  type ParagraphInput,
} from '../src/tools/thesis-check-core';

const SMALL_OPTIONS = {
  targetWordsMin: 10,
  targetWordsMax: 500,
  abstractWordsMin: 5,
  abstractWordsMax: 20,
  keywordsMin: 1,
  keywordsMax: 8,
};

describe('字数口径（学校口径：汉字 + 英文单词）', () => {
  it('你好世界 hello world 123 → 汉字 4、英文单词 2、总字数 6', () => {
    const c = countWords('你好世界 hello world 123');
    assert.equal(c.chinese, 4);
    assert.equal(c.english, 2);
    assert.equal(c.total, 6);
  });
  it('空串 → 0', () => {
    assert.equal(countWords('').total, 0);
    assert.equal(countWords('   ').total, 0);
  });
});

describe('标题行解析', () => {
  it('数字体系：1.1 → 2 级', () => {
    assert.deepEqual(parseHeadingLine('1.1 研究背景'), { level: 2, num: '1.1', kind: 'arabic', label: '研究背景' });
  });
  it('章节：第2章 → 1 级', () => {
    assert.deepEqual(parseHeadingLine('第2章 文献综述'), { level: 1, num: '2', kind: 'chapter', label: '文献综述' });
  });
  it('中文体系：一、→ 1 级；（一）→ 2 级', () => {
    assert.deepEqual(parseHeadingLine('一、绪论'), { level: 1, num: '1', kind: 'chinese1', label: '绪论' });
    assert.deepEqual(parseHeadingLine('（一）研究背景'), { level: 2, num: '1', kind: 'chinese2', label: '研究背景' });
  });
  it('普通正文 → null；过长行不认标题', () => {
    assert.equal(parseHeadingLine('普通正文'), null);
    assert.equal(parseHeadingLine('1. ' + '随着高等教育普及，毕业论文写作成为必修环节，前人研究指出格式问题普遍存在。'), null);
  });
});

describe('图表题注与引用解析', () => {
  it('图 1-1 / 表2.3 解析', () => {
    assert.deepEqual(parseCaption('图 1-1 写作流程图'), { kind: '图', chapter: 1, num: 1 });
    assert.deepEqual(parseCaption('表2.3 数据表'), { kind: '表', chapter: 2, num: 3 });
    assert.equal(parseCaption('普通段落'), null);
  });
  it('正文引用抽取', () => {
    assert.deepEqual(findFigureRefs('如图 1-2 所示，见表 1-1。'), [
      { kind: '图', chapter: 1, num: 2 },
      { kind: '表', chapter: 1, num: 1 },
    ]);
  });
});

describe('粘贴文本解析', () => {
  it('示例文本 → 18 段，标题层级推断正确', () => {
    const paras = parseTextToParagraphs(SAMPLE_THESIS_TEXT);
    assert.equal(paras.length, 18);
    assert.equal(paras[3].heading, 1);
    assert.equal(paras[4].heading, 2);
    assert.equal(paras[6].heading, 2);
    assert.equal(paras[11].heading, 1);
    assert.equal(paras[12].heading, 2);
    assert.equal(paras[1].heading, null);
  });
  it('空文本明确报错', () => {
    assert.throws(() => parseTextToParagraphs('  \n\n '), /没有可检查的正文/);
  });
});

describe('示例论文自查（PRD 手算锚点）', () => {
  const paras = parseTextToParagraphs(SAMPLE_THESIS_TEXT);
  const report = checkThesis(paras, DEFAULT_THESIS_OPTIONS);
  const errors = report.findings.filter((f) => f.severity === '错误');
  const warns = report.findings.filter((f) => f.severity === '提醒');

  it('共 8 项问题：错误 2 项、提醒 6 项', () => {
    assert.equal(report.findings.length, 8);
    assert.equal(errors.length, 2);
    assert.equal(warns.length, 6);
  });
  it('摘要 52 字低于下限 300；关键词 3 个通过', () => {
    assert.equal(report.stats.abstractWords, 52);
    assert.equal(report.stats.keywordCount, 3);
    assert.ok(report.findings.some((f) => f.message.includes('摘要共 52 字')));
  });
  it('结构：结论缺失，其余齐全', () => {
    const conclusion = report.structure.find((s) => s.key === 'conclusion');
    assert.equal(conclusion?.found, false);
    assert.ok(report.structure.filter((s) => s.key !== 'conclusion').every((s) => s.found));
  });
  it('标题编号跳号：1.1 之后是 1.3，缺少 1.2', () => {
    assert.ok(errors.some((f) => f.message.includes('1.1 之后是 1.3') && f.message.includes('缺少 1.2')));
  });
  it('图表：图 1-1 无正文引用（提醒）；图 1-2 引用无题注（错误）；表 1-1 双向一致', () => {
    assert.ok(warns.some((f) => f.message.includes('图 1-1') && f.message.includes('正文未引用')));
    assert.ok(errors.some((f) => f.message.includes('图 1-2') && f.message.includes('没有对应题注')));
    assert.ok(!report.findings.some((f) => f.message.includes('表 1-1')));
    assert.equal(report.stats.figures, 1);
    assert.equal(report.stats.tables, 1);
  });
  it('参考文献：[2] 从未被正文引用；列表共 2 条', () => {
    assert.ok(warns.some((f) => f.message.includes('[2]') && f.message.includes('从未被正文引用')));
    assert.equal(report.stats.references, 2);
  });
  it('内部重复：同一句子出现 2 次，恰 1 组', () => {
    const dups = report.findings.filter((f) => f.section === '内部重复');
    assert.equal(dups.length, 1);
    assert.ok(dups[0].message.includes('2 次'));
  });
  it('标点：示例中无英文句号误用与连续空格', () => {
    assert.equal(report.findings.filter((f) => f.section === '标点与格式').length, 0);
  });
  it('全文总字数低于目标下限 8000', () => {
    assert.ok(warns.some((f) => f.section === '字数统计' && f.message.includes('低于目标下限 8000')));
  });
});

describe('干净论文：0 问题', () => {
  it('结构齐全、编号连续、引用一致、无重复 → 无问题', () => {
    const paras: ParagraphInput[] = parseTextToParagraphs(
      [
        '摘要',
        '本研究分析了问题。',
        '关键词：测试；自查',
        '第1章 引言',
        '1.1 背景',
        '如图 1-1 所示，流程清晰。前人指出[1]方法可行。',
        '图 1-1 流程图',
        '第2章 结论',
        '参考文献',
        '[1] 张三. 测试指南[M]. 北京：出版社，2024.',
        '致谢',
        '感谢指导。',
      ].join('\n'),
    );
    const report = checkThesis(paras, SMALL_OPTIONS);
    assert.equal(report.findings.length, 0);
    assert.equal(report.stats.totalWords, 69);
    assert.ok(report.passed.length > 0);
  });
});

describe('选项校验与报告文本', () => {
  it('下限大于上限明确报错', () => {
    assert.throws(
      () => checkThesis([{ text: '摘要', heading: null }], { ...DEFAULT_THESIS_OPTIONS, targetWordsMin: 20000, targetWordsMax: 8000 }),
      /目标字数区间下限不能大于上限/,
    );
  });
  it('reportToText 含统计、结构与问题数', () => {
    const report = checkThesis(parseTextToParagraphs(SAMPLE_THESIS_TEXT), DEFAULT_THESIS_OPTIONS);
    const text = reportToText(report);
    assert.match(text, /全文 \d+ 字/);
    assert.match(text, /结构清单/);
    assert.match(text, /共 8 项（错误 2 项、提醒 6 项）/);
    assert.match(text, /不查查重率/);
  });
});

describe('DOCX 输入（现场构造最小 docx）', () => {
  const docXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:r><w:t>第1章 引言</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>正文内容。</w:t></w:r></w:p>' +
    '</w:body></w:document>';
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';
  const bytes = zipSync({
    '[Content_Types].xml': new TextEncoder().encode(contentTypes),
    'word/document.xml': new TextEncoder().encode(docXml),
  });

  it('标题段 heading=1、正文段 heading=null', () => {
    const paras = extractDocxParagraphs(bytes);
    assert.equal(paras.length, 2);
    assert.equal(paras[0].text, '第1章 引言');
    assert.equal(paras[0].heading, 1);
    assert.equal(paras[1].text, '正文内容。');
    assert.equal(paras[1].heading, null);
  });
  it('非 docx 字节明确报错', () => {
    assert.throws(() => extractDocxParagraphs(new Uint8Array([1, 2, 3])), /文件为空|不是有效|不支持/);
  });
});
