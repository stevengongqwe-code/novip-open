/**
 * tests/text-toolkit.test.ts — 文本工具箱核心逻辑测试
 * 覆盖：实时统计（中文/英文/emoji 代理对/CRLF/空行段落/字节/阅读时间）、输入上限拒绝、
 *       行整理（空白/空行/去重/排序稳定性/反转/行号/前后缀/查找替换）、大小写、全半角边界、中文标点。
 * 运行：node --import tsx --test tests/text-toolkit.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BYTES,
  MAX_CHARS,
  applyTextTransform,
  assertTextInput,
  checkTextInput,
  countCharacters,
  createDefaultTransformOptions,
  formatBytes,
  normalizeNewlines,
  replaceLiteral,
  stripLineNumber,
  textStats,
  toEnglishPunctuation,
  toFullWidth,
  toHalfWidth,
  toTitleCase,
  type TextTransformOptions,
} from '../src/tools/text-toolkit-core.ts';

const options = (patch: Partial<TextTransformOptions> = {}): TextTransformOptions => ({
  ...createDefaultTransformOptions(),
  ...patch,
});
const run = (input: string, patch: Partial<TextTransformOptions> = {}) => applyTextTransform(input, options(patch));

// ---------- 换行与码点 ----------
test('normalizeNewlines：CRLF/CR 都归一为 LF', () => {
  assert.equal(normalizeNewlines('a\r\nb\rc\n'), 'a\nb\nc\n');
  assert.equal(normalizeNewlines('无换行'), '无换行');
});

test('countCharacters：按 Unicode 码点计数，emoji 不拆成两个', () => {
  assert.equal(countCharacters(''), 0);
  assert.equal(countCharacters('abc'), 3);
  assert.equal(countCharacters('中文'), 2);
  assert.equal(countCharacters('😀'), 1);
  assert.equal(countCharacters('a😀b'), 3);
  // 家庭 emoji（ZWJ 连接）逐码点为 5 个码点
  assert.equal(countCharacters('👨‍👩‍👧'), 5);
  // 孤立代理项按 1 个字符兜底，不抛错
  assert.equal(countCharacters('\ud800'), 1);
});

// ---------- 实时统计 ----------
test('textStats：中文/英文/emoji/CRLF 混合统计', () => {
  const text = '你好 world😀\r\n第二行';
  const stats = textStats(text);
  assert.equal(stats.chars, 13);
  // 不含空白：去掉 1 个空格与 1 个换行
  assert.equal(stats.charsNoSpaces, 11);
  assert.equal(stats.chineseChars, 5);
  assert.equal(stats.englishWords, 1);
  assert.equal(stats.lines, 2);
  assert.equal(stats.paragraphs, 1);
  // 原始字节：中文 3×5 + 空格 1 + 英文 5 + emoji 4 + CRLF 2 = 27
  assert.equal(stats.utf8Bytes, 27);
  assert.equal(stats.readingMinutes, 0.1);
});

test('textStats：CRLF 只算一个换行，字符数按码点不按 UTF-16 单元', () => {
  const stats = textStats('a\r\nb');
  assert.equal(stats.chars, 3);
  assert.equal(stats.lines, 2);
  assert.equal(stats.utf8Bytes, 4);
  assert.equal(textStats('😀').chars, 1);
  assert.equal(textStats('😀').utf8Bytes, 4);
  assert.equal(textStats('😀').charsNoSpaces, 1);
});

test('textStats：行数忽略末尾换行，空文本全为 0', () => {
  assert.equal(textStats('a\n').lines, 1);
  assert.equal(textStats('a\n\n').lines, 2);
  assert.equal(textStats('\n').lines, 1);
  assert.deepEqual(textStats(''), {
    chars: 0,
    charsNoSpaces: 0,
    chineseChars: 0,
    englishWords: 0,
    lines: 0,
    paragraphs: 0,
    utf8Bytes: 0,
    readingMinutes: 0,
  });
});

test('textStats：段落数按空行分隔，纯空白行不算段落', () => {
  assert.equal(textStats('第一段\n继续\n\n第二段\n\n\n第三段').paragraphs, 3);
  assert.equal(textStats('a\n   \nb').paragraphs, 2);
  assert.equal(textStats('a\nb\nc').paragraphs, 1);
  assert.equal(textStats('\n\n').paragraphs, 0);
});

test('textStats：中文与英文阅读时间估算', () => {
  assert.equal(textStats('中'.repeat(300)).readingMinutes, 1);
  assert.equal(textStats(Array.from({ length: 220 }, () => 'word').join(' ')).readingMinutes, 1);
  assert.equal(textStats('中'.repeat(300) + ' ' + Array.from({ length: 110 }, () => 'word').join(' ')).readingMinutes, 1.5);
  assert.equal(textStats('abc').readingMinutes, 0.1);
  assert.equal(textStats('').readingMinutes, 0);
});

test('formatBytes：1024 进制展示', () => {
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(MAX_BYTES), '2.00 MB');
});

// ---------- 输入校验与上限拒绝 ----------
test('checkTextInput：空输入返回中文错误', () => {
  const check = checkTextInput('');
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'empty');
  assert.match(check.message, /请先输入文本/);
  assert.throws(() => assertTextInput(''), /请先输入文本/);
});

test('checkTextInput：纯空白不算空输入（交给整理操作处理）', () => {
  const check = checkTextInput('   \n\t');
  assert.equal(check.ok, true);
  assert.equal(check.message, '');
});

test('checkTextInput：50 万字符上限，边界值放行、越界拒绝', () => {
  const okEdge = checkTextInput('a'.repeat(MAX_CHARS));
  assert.equal(okEdge.ok, true);
  assert.equal(okEdge.chars, MAX_CHARS);

  const over = checkTextInput('a'.repeat(MAX_CHARS + 1));
  assert.equal(over.ok, false);
  assert.equal(over.reason, 'too-many-chars');
  assert.match(over.message, /50 万字符上限/);
  assert.throws(() => assertTextInput('a'.repeat(MAX_CHARS + 1)), /50 万字符上限/);
});

test('checkTextInput：2MB 上限拒绝', () => {
  const over = checkTextInput('x'.repeat(MAX_BYTES + 1));
  assert.equal(over.ok, false);
  assert.equal(over.reason, 'too-many-bytes');
  assert.match(over.message, /2MB 上限/);
  assert.throws(() => assertTextInput('x'.repeat(MAX_BYTES + 1)), /2MB 上限/);
});

// ---------- 去除行号 ----------
test('stripLineNumber：常见行首编号', () => {
  assert.equal(stripLineNumber('1. 吃饭'), '吃饭');
  assert.equal(stripLineNumber('2、睡觉'), '睡觉');
  assert.equal(stripLineNumber('3) 学习'), '学习');
  assert.equal(stripLineNumber('（4）运动'), '运动');
  assert.equal(stripLineNumber('5 读书'), '读书');
  assert.equal(stripLineNumber('12: 内容'), '内容');
  assert.equal(stripLineNumber('42'), '');
  assert.equal(stripLineNumber('1、'), '');
});

test('stripLineNumber：不误删年份、小数与「第 N 章」', () => {
  assert.equal(stripLineNumber('2026 年度总结'), '2026 年度总结');
  assert.equal(stripLineNumber('3.14 是圆周率'), '3.14 是圆周率');
  assert.equal(stripLineNumber('12：30 开会'), '12：30 开会');
  assert.equal(stripLineNumber('第3章 标题'), '第3章 标题');
});

// ---------- 字面量查找替换 ----------
test('replaceLiteral：不解析正则与 $& 占位符', () => {
  assert.equal(replaceLiteral('a.b.c', '.', '$&'), 'a$&b$&c');
  assert.equal(replaceLiteral('a.b.c', '.', '$&', false), 'a$&b.c');
  assert.equal(replaceLiteral('x[.*]y', '[.*]', '-'), 'x-y');
  assert.equal(replaceLiteral('abc', '', 'x'), 'abc');
  assert.equal(replaceLiteral('abc', 'z', 'x'), 'abc');
});

// ---------- 大小写与全半角 ----------
test('大小写转换：大写/小写/英文首字母大写', () => {
  assert.equal(toTitleCase('hello world'), 'Hello World');
  assert.equal(toTitleCase("don't stop"), "Don't Stop");
  assert.equal(toTitleCase('HELLO WORLD'), 'HELLO WORLD');
  assert.equal(toTitleCase('中文 mixed'), '中文 Mixed');
  assert.equal(run('Hello World', { caseMode: 'upper' }), 'HELLO WORLD');
  assert.equal(run('Hello World', { caseMode: 'lower' }), 'hello world');
  assert.equal(run('hello 世界', { caseMode: 'title' }), 'Hello 世界');
});

test('全角→半角：ASCII 可见字符与全角空格边界', () => {
  assert.equal(toHalfWidth('！'), '!');
  assert.equal(toHalfWidth('～'), '~');
  assert.equal(toHalfWidth('\u3000'), ' ');
  assert.equal(toHalfWidth('Ａ１'), 'A1');
  assert.equal(toHalfWidth('中文ＡＢＣ'), '中文ABC');
  assert.equal(toHalfWidth('中文\n'), '中文\n');
});

test('半角→全角：ASCII 可见字符与空格边界', () => {
  assert.equal(toFullWidth('!'), '！');
  assert.equal(toFullWidth('~'), '～');
  assert.equal(toFullWidth(' '), '\u3000');
  assert.equal(toFullWidth('A1'), 'Ａ１');
  assert.equal(toFullWidth('中文\n'), '中文\n');
});

test('中文标点→英文标点：只转换常见一批', () => {
  const input = '「你好」。，；：！？、（）【】《》…—';
  const expected = '"你好".' + ',;:!?,()[]<>...-';
  assert.equal(toEnglishPunctuation(input), expected);
  // 未勾选时保持原样
  assert.equal(run('「你好」。'), '「你好」。');
  assert.equal(run('「你好」。', { chinesePunctuation: true }), '"你好".');
  // 转换范围有限：不处理省略号以外的生僻标点
  assert.equal(toEnglishPunctuation('～'), '～');
});

test('全半角与大小写可叠加：先全角→半角，再转大写', () => {
  assert.equal(run('ｈｅｌｌｏ　ｗｏｒｌｄ', { widthMode: 'half', caseMode: 'upper' }), 'HELLO WORLD');
  assert.equal(run('hello world', { widthMode: 'full' }), 'ｈｅｌｌｏ　ｗｏｒｌｄ');
});

// ---------- 行整理 ----------
test('行整理：首尾空白 / 行首尾空白', () => {
  assert.equal(run('\u3000  你好  \n', { trimText: true }), '你好');
  assert.equal(run('  a  \n\tb\t', { trimLines: true }), 'a\nb');
});

test('行整理：删除空行与合并连续空行', () => {
  assert.equal(run('a\n\n  \n\nb', { removeBlankLines: true }), 'a\nb');
  assert.equal(run('a\n\n\n\nb\n\nc', { collapseBlankLines: true }), 'a\n\nb\n\nc');
  // 两者同时勾选时删除空行优先
  assert.equal(run('a\n\nb', { removeBlankLines: true, collapseBlankLines: true }), 'a\nb');
});

test('行整理：去重行保留首次出现', () => {
  assert.equal(run('b\na\nb\n\nc\nb', { dedupeLines: true }), 'b\na\n\nc');
});

test('行整理：反转行序', () => {
  assert.equal(run('a\nb\nc', { reverseLines: true }), 'c\nb\na');
  assert.equal(run('a\nb\n', { reverseLines: true }), 'b\na');
});

test('行整理：添加行号与去除行号', () => {
  assert.equal(run('a\nb', { addLineNumbers: true }), '1. a\n2. b');
  // 两位行号补齐空格对齐
  const numbered = run(Array.from({ length: 12 }, (_, i) => `行${i + 1}`).join('\n'), { addLineNumbers: true });
  assert.ok(numbered.startsWith(' 1. 行1\n'));
  assert.ok(numbered.includes('\n12. 行12'));
  assert.equal(run('1. 甲\n2) 乙\n（3）丙\n2026 年终', { removeLineNumbers: true }), '甲\n乙\n丙\n2026 年终');
  // 去行号 + 添加行号 = 重新编号
  assert.equal(run('3. 甲\n7. 乙', { removeLineNumbers: true, addLineNumbers: true }), '1. 甲\n2. 乙');
});

test('行整理：每行前缀/后缀（空行也加）', () => {
  assert.equal(run('a\n\nb', { prefix: '> ', suffix: ' <' }), '> a <\n>  <\n> b <');
  assert.equal(run('a\nb', { suffix: '；' }), 'a；\nb；');
});

test('行整理：可叠加且顺序固定（空白→去重→排序→行号）', () => {
  assert.equal(
    run(' b \na\nb', { trimLines: true, dedupeLines: true, sortDirection: 'asc', addLineNumbers: true }),
    '1. a\n2. b',
  );
});

test('行整理：末尾换行不产生多余空行', () => {
  assert.equal(run('b\na\n', { sortDirection: 'asc' }), 'a\nb');
});

// ---------- 排序 ----------
test('排序：localeCompare zh 拼音升序/降序', () => {
  // 丙(bing) < 甲(jia) < 乙(yi)
  assert.equal(run('乙\n甲\n丙', { sortDirection: 'asc' }), '丙\n甲\n乙');
  assert.equal(run('乙\n甲\n丙', { sortDirection: 'desc' }), '乙\n甲\n丙');
  // 默认按字符串排序，不是按数值大小
  assert.equal(run('10\n2\n1', { sortDirection: 'asc' }), '1\n10\n2');
});

test('排序：稳定排序（collator 判定相等的行保持原有先后）', () => {
  // 'é'(U+00E9) 与 'e'+U+0301 在 zh collator 下比较为 0，属于稳定排序用例
  assert.equal(run('b\né\na\ne\u0301', { sortDirection: 'asc' }), 'a\nb\né\ne\u0301');
  assert.equal(run('b\né\na\ne\u0301', { sortDirection: 'desc' }), 'é\ne\u0301\nb\na');
});

// ---------- 组合与纯函数性质 ----------
test('默认不勾选任何操作时结果等于输入（统一 LF 换行）', () => {
  const opts = createDefaultTransformOptions();
  assert.equal(applyTextTransform('第一行\n第二行', opts), '第一行\n第二行');
  assert.equal(applyTextTransform('a\r\nb', opts), 'a\nb');
  assert.equal(applyTextTransform('', opts), '');
  assert.equal(applyTextTransform('abc', opts), 'abc');
});

test('applyTextTransform 是纯函数：不修改输入与 options', () => {
  const opts = createDefaultTransformOptions();
  const snapshot = JSON.stringify(opts);
  const input = 'b\na\nb';
  const output = applyTextTransform(input, opts);
  assert.equal(input, 'b\na\nb');
  assert.equal(JSON.stringify(opts), snapshot);
  assert.equal(output, input);
});

test('createDefaultTransformOptions：每次返回独立对象', () => {
  const a = createDefaultTransformOptions();
  const b = createDefaultTransformOptions();
  assert.notEqual(a, b);
  a.find = 'x';
  assert.equal(b.find, '');
});

test('组合：查找替换作用在整理后的最终文本上', () => {
  assert.equal(run('a.b\nc.d', { find: '.', replaceWith: '-' }), 'a-b\nc-d');
  assert.equal(run('a.b', { find: '.', replaceWith: '-' }), 'a-b');
});
