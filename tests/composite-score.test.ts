import assert from 'node:assert/strict';
import test from 'node:test';
import {
  batchToCsv,
  batchToText,
  calcBatch,
  calcIntellectual,
  calcSingle,
  parseCourses,
  singleToText,
  DEFAULT_SETTINGS,
  SAMPLE_BATCH_TEXT,
  SAMPLE_SINGLE,
} from '../src/tools/composite-score-core';
import { tools, currentPage, SYSTEM_TOOL_IDS, PUBLIC_TOOL_COUNT } from '../src/tools/registry';

test('综测：PRD 锁定单人示例（88/86/92/附加 6，默认权重 → 加权 87.00、总分 93.00、一等）', () => {
  const r = calcSingle(SAMPLE_SINGLE, DEFAULT_SETTINGS);
  assert.equal(r.weighted, 87);
  assert.equal(r.bonusApplied, 6);
  assert.equal(r.total, 93);
  assert.equal(r.tier, '一等');
  assert.equal(r.nextTierLabel, null);
  assert.equal(r.nextTierGap, null);
});

test('综测：权重可调、附加分封顶、总分封顶与到下一档缺口', () => {
  // 权重改 30/50/20：88×0.3＋86×0.5＋92×0.2＝87.8；附加分 15 封顶 10 → 97.8。
  const r = calcSingle(
    { moral: 88, intellectual: 86, physical: 92, bonus: 15 },
    { ...DEFAULT_SETTINGS, weights: { moral: 30, intellectual: 50, physical: 20 } },
  );
  assert.equal(r.weighted, 87.8);
  assert.equal(r.bonusApplied, 10);
  assert.equal(r.total, 97.8);
  // 总分封顶 95 时压到 95，仍为一等。
  const capped = calcSingle(
    { moral: 88, intellectual: 86, physical: 92, bonus: 15 },
    { ...DEFAULT_SETTINGS, weights: { moral: 30, intellectual: 50, physical: 20 }, totalCap: 95 },
  );
  assert.equal(capped.total, 95);
  assert.equal(capped.tier, '一等');
  // 未入围到三等缺口：60 分 → 到 70 差 10。
  const low = calcSingle({ moral: 60, intellectual: 60, physical: 60, bonus: 0 }, DEFAULT_SETTINGS);
  assert.equal(low.total, 60);
  assert.equal(low.tier, '未入围');
  assert.equal(low.nextTierLabel, '三等');
  assert.equal(low.nextTierGap, 10);
  // 二等到一等缺口：85 分 → 到 90 差 5。
  const mid = calcSingle({ moral: 85, intellectual: 85, physical: 85, bonus: 0 }, DEFAULT_SETTINGS);
  assert.equal(mid.tier, '二等');
  assert.equal(mid.nextTierLabel, '一等');
  assert.equal(mid.nextTierGap, 5);
});

test('综测：权重和非 100、分档不递减、分项越界一律报错', () => {
  assert.throws(() => calcSingle(SAMPLE_SINGLE, { ...DEFAULT_SETTINGS, weights: { moral: 20, intellectual: 70, physical: 20 } }), /权重之和须为 100/);
  assert.throws(() => calcSingle(SAMPLE_SINGLE, { ...DEFAULT_SETTINGS, tiers: { first: 80, second: 90, third: 70 } }), /递减/);
  assert.throws(() => calcSingle({ moral: 101, intellectual: 86, physical: 92, bonus: 6 }, DEFAULT_SETTINGS), /德育分/);
  assert.throws(() => calcSingle({ moral: 88, intellectual: 86, physical: 92, bonus: -1 }, DEFAULT_SETTINGS), /附加分不能为负/);
});

test('综测：智育子算（高数 92×5、英语 85×4、线代 78×3 → 86.17）', () => {
  assert.equal(calcIntellectual(parseCourses('高数 92 5\n英语 85 4\n线代 78 3')), 86.17);
  assert.throws(() => parseCourses('高数 92'), /格式不对/);
  assert.throws(() => calcIntellectual([{ name: '高数', score: 92, credit: 0 }]), /学分须大于 0/);
});

test('综测：PRD 锁定班级示例（5 人，名次 1–5，平均 89.42）', () => {
  const b = calcBatch(SAMPLE_BATCH_TEXT, DEFAULT_SETTINGS);
  assert.equal(b.count, 5);
  assert.deepEqual(b.rows.map((r) => r.rank), [1, 2, 3, 4, 5]);
  assert.deepEqual(b.rows.map((r) => r.result.total), [96.2, 93, 92, 85.4, 80.5]);
  assert.deepEqual(b.rows.map((r) => r.result.tier), ['一等', '一等', '一等', '二等', '二等']);
  assert.equal(b.average, 89.42);
  assert.equal(b.max, 96.2);
  assert.equal(b.min, 80.5);
  assert.match(batchToText(b), /第 1 名 陈晨：总分 96\.20 分/);
  assert.match(batchToCsv(b), /"1","陈晨"/);
  assert.match(singleToText(SAMPLE_SINGLE, calcSingle(SAMPLE_SINGLE, DEFAULT_SETTINGS), DEFAULT_SETTINGS), /综合测评总分：93\.00 分；档次：一等/);
});

test('综测：并列名次（93、93、88.10 → 1、1、3）与错误行定位', () => {
  const b = calcBatch('甲 90 90 90 3\n乙 90 90 90 3\n丙 85 88 85 1', DEFAULT_SETTINGS);
  assert.deepEqual(b.rows.map((r) => r.rank), [1, 1, 3]);
  assert.deepEqual(b.rows.map((r) => r.result.total), [93, 93, 88.1]);
  assert.throws(() => calcBatch('甲 90 90 90', DEFAULT_SETTINGS), /第 1 行格式不对/);
  assert.throws(() => calcBatch('甲 90 90 90 x', DEFAULT_SETTINGS), /第 1 行分数不是数字/);
  assert.throws(() => calcBatch('', DEFAULT_SETTINGS), /至少粘贴一行/);
});

test('综测：注册与 SEO 接线', () => {
  assert.equal(tools.length, PUBLIC_TOOL_COUNT + SYSTEM_TOOL_IDS.length);
  assert.ok(tools.some((t) => t.id === 'composite-score' && t.path === '/tools/composite-score' && t.group === '学习写作'));
  assert.equal(currentPage('/tools/composite-score', ''), 'composite-score');
  assert.equal(currentPage('/tools/composite-score/', ''), 'composite-score');
});
