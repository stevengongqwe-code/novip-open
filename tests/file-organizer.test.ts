/**
 * tests/file-organizer.test.ts — 批量文件整理器命名逻辑测试
 * 覆盖：扩展名拆分 / 非法字符清理 / 三种重命名模式 / 冲突去重 / 排序 / ZIP 条目名
 * 运行：node --import tsx --test tests/file-organizer.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitName, sanitizeFileName, applyRule, planNames, sortIndices,
  zipEntryName, defaultRule, type RenameRule,
} from '../src/tools/file-organizer-core.ts';

const pat = (pattern: string, start = 1): RenameRule => ({ ...defaultRule(), mode: 'pattern', pattern, start });

// ---------- splitName ----------
test('splitName 正常拆分扩展名', () => {
  assert.deepEqual(splitName('实验报告.pdf'), { base: '实验报告', ext: 'pdf' });
  assert.deepEqual(splitName('a.b.docx'), { base: 'a.b', ext: 'docx' });
});
test('splitName 无扩展名与点文件', () => {
  assert.deepEqual(splitName('README'), { base: 'README', ext: '' });
  assert.deepEqual(splitName('.gitignore'), { base: '.gitignore', ext: '' });
  assert.deepEqual(splitName('name.'), { base: 'name.', ext: '' });
});

// ---------- sanitizeFileName ----------
test('sanitize 清理非法字符并告警', () => {
  const r = sanitizeFileName('报告:终稿/第一版?');
  assert.equal(r.name, '报告_终稿_第一版_');
  assert.ok(r.changed && r.warnings.length > 0);
});
test('sanitize 去掉结尾点与空格', () => {
  const r = sanitizeFileName('报告. ');
  assert.equal(r.name, '报告');
});
test('sanitize 系统保留名', () => {
  assert.equal(sanitizeFileName('con').name, 'con_');
  assert.equal(sanitizeFileName('COM1').name, 'COM1_');
});
test('sanitize 空名兜底', () => {
  const r = sanitizeFileName('...   ');
  assert.equal(r.name, '未命名文件');
});

// ---------- applyRule: pattern ----------
test('pattern 智能编号：实验报告_001.pdf', () => {
  const r1 = applyRule('a.pdf', pat('实验报告_{nnn}'), 0);
  const r2 = applyRule('b.docx', pat('实验报告_{nnn}'), 1);
  assert.equal(r1.name, '实验报告_001.pdf');
  assert.equal(r2.name, '实验报告_002.docx');
});
test('pattern 起始编号与补零宽度', () => {
  assert.equal(applyRule('a.pdf', pat('材料_{nn}', 9), 0).name, '材料_09.pdf');
  assert.equal(applyRule('a.pdf', pat('材料_{nn}', 9), 1).name, '材料_10.pdf');
  assert.equal(applyRule('a.pdf', pat('x_{n}', 1), 0).name, 'x_1.pdf');
});
test('pattern 支持 {name} 原名占位', () => {
  assert.equal(applyRule('旧名字.pdf', pat('{name}_终稿_{nn}'), 0).name, '旧名字_终稿_01.pdf');
});
test('pattern 无编号占位符自动追加', () => {
  const r = applyRule('a.pdf', pat('实验报告'), 0);
  assert.equal(r.name, '实验报告_001.pdf');
  assert.ok(r.note.length > 0);
});

// ---------- applyRule: affix / replace ----------
test('affix 前后缀', () => {
  const rule: RenameRule = { ...defaultRule(), mode: 'affix', prefix: '2026-', suffix: '-终稿' };
  assert.equal(applyRule('报告.pdf', rule, 0).name, '2026-报告-终稿.pdf');
});
test('replace 查找替换', () => {
  const rule: RenameRule = { ...defaultRule(), mode: 'replace', find: '草稿', replaceWith: '终稿' };
  assert.equal(applyRule('实验草稿v1草稿.pdf', rule, 0).name, '实验终稿v1终稿.pdf');
});
test('replace 查找为空不改名', () => {
  const rule: RenameRule = { ...defaultRule(), mode: 'replace', find: '', replaceWith: 'x' };
  assert.equal(applyRule('a.pdf', rule, 0).name, 'a.pdf');
});

// ---------- planNames 冲突去重 ----------
test('planNames 重名自动加 _2 _3 避让（大小写不敏感）', () => {
  const files = [{ name: 'a.pdf', size: 10 }, { name: 'b.pdf', size: 20 }, { name: 'c.pdf', size: 30 }];
  const out = planNames(files, pat('报告_{nn}'), [0, 1, 2]);
  assert.deepEqual(out.map(p => p.newName), ['报告_01.pdf', '报告_02.pdf', '报告_03.pdf']);
  const dup = planNames(
    [{ name: 'x.pdf', size: 1 }, { name: 'X.PDF', size: 2 }],
    { ...defaultRule(), mode: 'affix', prefix: '同名', suffix: '' }, [0, 1]);
  assert.equal(dup[0].newName, '同名x.pdf');
  assert.equal(dup[1].newName, '同名X_2.PDF');
  assert.ok(dup[1].deduped);
});
test('planNames 特殊字符清理进 warnings', () => {
  const out = planNames([{ name: 'a.pdf', size: 1 }], pat('报告:终稿_{nn}'), [0]);
  assert.equal(out[0].newName, '报告_终稿_01.pdf');
  assert.ok(out[0].warnings.some(w => w.includes('特殊字符')));
});

// ---------- sortIndices ----------
test('sortIndices 按名称/大小/类型', () => {
  const files = [
    { name: 'b.docx', size: 300 },
    { name: 'a.pdf', size: 100 },
    { name: 'c.pdf', size: 200 },
  ];
  assert.deepEqual(sortIndices(files, 'name', true), [1, 0, 2]);
  assert.deepEqual(sortIndices(files, 'size', false), [0, 2, 1]);
  assert.deepEqual(sortIndices(files, 'type', true), [0, 1, 2]); // docx < pdf，同类按名
});

// ---------- zipEntryName ----------
test('zipEntryName 去掉路径分隔', () => {
  assert.equal(zipEntryName('a/b\\c.pdf'), 'a_b_c.pdf');
  assert.equal(zipEntryName('  '), '未命名文件');
});
