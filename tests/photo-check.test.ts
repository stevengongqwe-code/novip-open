import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  colorDistance,
  identifyBgColorType,
  diagnosePhoto,
  setPhotoTransfer,
  consumePhotoTransfer,
  getPendingPhotoTransfer,
  type RgbColor,
} from '../src/features/id-photo/photo-check-core';

describe('证件照体检核心逻辑', () => {
  it('colorDistance 正确计算欧式色彩距离', () => {
    const c1: RgbColor = {r: 0, g: 0, b: 0};
    const c2: RgbColor = {r: 0, g: 0, b: 0};
    assert.equal(colorDistance(c1, c2), 0);

    const c3: RgbColor = {r: 3, g: 4, b: 0};
    assert.equal(colorDistance(c1, c3), 5);
  });

  it('底色检测：纯白底识别', () => {
    const whiteSamples: RgbColor[] = [
      {r: 250, g: 250, b: 252},
      {r: 248, g: 249, b: 250},
      {r: 255, g: 255, b: 255},
    ];
    const res = identifyBgColorType(whiteSamples);
    assert.equal(res.type, '白底');
    assert.equal(res.isUniform, true);
  });

  it('底色检测：标准蓝底识别', () => {
    const blueSamples: RgbColor[] = [
      {r: 60, g: 140, b: 220},
      {r: 65, g: 142, b: 225},
      {r: 62, g: 138, b: 218},
    ];
    const res = identifyBgColorType(blueSamples);
    assert.equal(res.type, '蓝底');
    assert.equal(res.isUniform, true);
  });

  it('底色检测：标准红底识别', () => {
    const redSamples: RgbColor[] = [
      {r: 210, g: 30, b: 30},
      {r: 215, g: 35, b: 35},
      {r: 205, g: 28, b: 28},
    ];
    const res = identifyBgColorType(redSamples);
    assert.equal(res.type, '红底');
    assert.equal(res.isUniform, true);
  });

  it('底色检测：杂色/生活照非纯色底识别', () => {
    const messySamples: RgbColor[] = [
      {r: 250, g: 250, b: 250},
      {r: 30, g: 50, b: 70},
      {r: 180, g: 100, b: 50},
    ];
    const res = identifyBgColorType(messySamples);
    assert.equal(res.type, '复杂/非纯色底');
    assert.equal(res.isUniform, false);
  });

  it('完美标准证件照（480x640, 50KB, JPG, 白底）给出满分 100 与 pass', () => {
    const whiteSamples: RgbColor[] = [
      {r: 252, g: 252, b: 252},
      {r: 250, g: 250, b: 250},
    ];
    const report = diagnosePhoto(480, 640, 50 * 1024, 'image/jpeg', whiteSamples);
    assert.equal(report.score, 100);
    assert.equal(report.overall, 'pass');
    assert.equal(report.checks.every(c => c.status === 'pass'), true);
  });

  it('标准1寸证件照（295x413, 30KB, JPG, 蓝底）规格通过', () => {
    const blueSamples: RgbColor[] = [
      {r: 60, g: 140, b: 220},
      {r: 62, g: 138, b: 218},
    ];
    const report = diagnosePhoto(295, 413, 30 * 1024, 'image/jpeg', blueSamples);
    assert.equal(report.overall, 'pass');
    const dimCheck = report.checks.find(c => c.id === 'dimension')!;
    assert.equal(dimCheck.status, 'pass');
    assert.ok(dimCheck.summary.includes('1 寸'));
  });

  it('横向照片被直接判定为 fail', () => {
    const samples: RgbColor[] = [{r: 250, g: 250, b: 250}];
    const report = diagnosePhoto(640, 480, 50 * 1024, 'image/jpeg', samples);
    assert.equal(report.overall, 'need_fix');
    const dimCheck = report.checks.find(c => c.id === 'dimension')!;
    assert.equal(dimCheck.status, 'fail');
    assert.ok(dimCheck.summary.includes('横向照片'));
  });

  it('体积小于 10KB 判定为 fail（过于模糊风险）', () => {
    const samples: RgbColor[] = [{r: 250, g: 250, b: 250}];
    const report = diagnosePhoto(480, 640, 6 * 1024, 'image/jpeg', samples);
    const sizeCheck = report.checks.find(c => c.id === 'size')!;
    assert.equal(sizeCheck.status, 'fail');
    assert.ok(sizeCheck.summary.includes('小于 10KB'));
  });

  it('超大体积与非 JPG（PNG, 350KB, 正方形）给出明确缺陷与修复建议', () => {
    const samples: RgbColor[] = [{r: 100, g: 100, b: 100}];
    const report = diagnosePhoto(800, 800, 350 * 1024, 'image/png', samples);
    assert.equal(report.overall, 'need_fix');
    assert.ok(report.score < 60);

    const formatCheck = report.checks.find(c => c.id === 'format')!;
    assert.equal(formatCheck.status, 'fail');

    const sizeCheck = report.checks.find(c => c.id === 'size')!;
    assert.equal(sizeCheck.status, 'fail');

    const dimCheck = report.checks.find(c => c.id === 'dimension')!;
    assert.equal(dimCheck.status, 'warn');
  });

  it('照片流转跨工具参数带出与消费机制', () => {
    // 初始应为空
    assert.equal(consumePhotoTransfer(), null);

    // 设置流转数据
    const dummyFile = new File([new Uint8Array(10)], 'test.jpg', {type: 'image/jpeg'});
    setPhotoTransfer({
      file: dummyFile,
      width: 480,
      height: 640,
      limitKB: 100,
      source: 'photo-check',
    });

    // 查询当前待消费数据
    const pending = getPendingPhotoTransfer();
    assert.ok(pending);
    assert.equal(pending.width, 480);
    assert.equal(pending.height, 640);
    assert.equal(pending.limitKB, 100);
    assert.equal(pending.file?.name, 'test.jpg');

    // 第一次消费得到完整参数
    const consumed = consumePhotoTransfer();
    assert.deepEqual(consumed, pending);

    // 第二次消费返回 null（一次性内存传递，防止脏数据污染）
    assert.equal(consumePhotoTransfer(), null);
    assert.equal(getPendingPhotoTransfer(), null);
  });
});
