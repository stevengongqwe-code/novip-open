import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGET_PRESETS,
  formatBytes,
  calcCompressionRatio,
  calculateFitDimensions,
  planCompressionSteps,
} from '../src/tools/image-compress-core.ts';

test('NOVIP 图片精准压缩 · 预设与容量格式化', () => {
  assert.equal(TARGET_PRESETS.length, 5);
  assert.equal(TARGET_PRESETS[1].targetKb, 100);
  assert.equal(TARGET_PRESETS[1].name, '标准 ≤ 100KB');

  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1024 * 1024 * 2.5), '2.5 MB');
});

test('NOVIP 图片精准压缩 · 压缩率与节省字节计算', () => {
  const res = calcCompressionRatio(2 * 1024 * 1024, 500 * 1024);
  assert.ok(res.ratio > 70, '2MB 压缩到 500KB 压缩率应超过 70%');
  assert.equal(res.percent.startsWith('-'), true, '体积减少应带有负号');
  assert.equal(res.savedBytes, 2 * 1024 * 1024 - 500 * 1024);

  const noChange = calcCompressionRatio(100, 100);
  assert.equal(noChange.savedBytes, 0);
  assert.equal(noChange.ratio, 0);
});

test('NOVIP 图片精准压缩 · 等比例尺寸计算与边界保护', () => {
  const fit1 = calculateFitDimensions(4000, 3000, 2000, 2000);
  assert.equal(fit1.width, 2000);
  assert.equal(fit1.height, 1500);
  assert.equal(fit1.scale, 0.5);

  const fit2 = calculateFitDimensions(1920, 1080);
  assert.equal(fit2.width, 1920);
  assert.equal(fit2.height, 1080);
  assert.equal(fit2.scale, 1.0);

  assert.throws(() => calculateFitDimensions(0, 100), /原始图片尺寸无效/);
});

test('NOVIP 图片精准压缩 · 二分逼近步长规划', () => {
  // 原图 2.5MB，目标 100KB (极其严苛的学信网标准)
  const plan = planCompressionSteps(2.5 * 1024 * 1024, 100 * 1024, 3000, 4000);
  assert.ok(plan.scaleFactor < 1.0, '大幅压缩应缩放尺寸');
  assert.ok(plan.targetQuality >= 0.45 && plan.targetQuality <= 0.85);

  // 原图 120KB，目标 100KB (轻微微调)
  const mildPlan = planCompressionSteps(120 * 1024, 100 * 1024, 1000, 1000);
  assert.equal(mildPlan.scaleFactor, 1.0, '轻微压缩保留完整分辨率');
  assert.ok(mildPlan.targetQuality > 0.7);
});
