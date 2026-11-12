/**
 * 二维码编解码上限契约（EVERGREEN Round 86，2026-11-06）：
 * qr-core 三个上限常量此前在主分支测试中零直接引用——
 * tests/qr-tool.test.ts 只经 validateQrPayload 间接走了 H（1273/1274）与 M（2331）
 * 两个边界点，L/Q 两档容量表、MAX_DECODE_BYTES、MAX_DECODE_DIMENSION 从未被断言。
 * 本文件只锁常量表与守卫行为，不改生产代码。
 * 运行：npm test（node --import tsx --test tests/*.test.ts）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  QR_BYTE_CAPACITY,
  MAX_DECODE_BYTES,
  MAX_DECODE_DIMENSION,
  validateQrPayload,
  byteLength,
  type QrErrorCorrection,
} from '../src/tools/qr-core';

const LEVELS: QrErrorCorrection[] = ['L', 'M', 'Q', 'H'];

describe('二维码容量表 QR_BYTE_CAPACITY', () => {
  it('四档纠错级别容量逐字锁定（版本 40 字节模式 toolio 公开口径）', () => {
    assert.deepEqual(QR_BYTE_CAPACITY, { L: 2953, M: 2331, Q: 1663, H: 1273 });
  });

  it('键恰好为 L/M/Q/H 四档，无多余键', () => {
    assert.deepEqual(Object.keys(QR_BYTE_CAPACITY).sort(), ['H', 'L', 'M', 'Q']);
  });

  it('容量随纠错级别严格递减且均为正整数', () => {
    const caps = LEVELS.map((l) => QR_BYTE_CAPACITY[l]);
    for (const cap of caps) assert.ok(Number.isInteger(cap) && cap > 0, `容量应为正整数，实得 ${cap}`);
    assert.ok(caps[0] > caps[1] && caps[1] > caps[2] && caps[2] > caps[3], 'L > M > Q > H');
  });
});

describe('解码守卫上限常量', () => {
  it('MAX_DECODE_BYTES 恰为 10 MiB（QrTool「图片超过 10MB」文案的阈值）', () => {
    assert.equal(MAX_DECODE_BYTES, 10 * 1024 * 1024);
    assert.equal(MAX_DECODE_BYTES, 10485760);
  });

  it('MAX_DECODE_DIMENSION 恰为 2000 像素（QrTool 下采样长边目标）', () => {
    assert.equal(MAX_DECODE_DIMENSION, 2000);
  });
});

describe('validateQrPayload 四档边界（以常量表为准）', () => {
  for (const level of LEVELS) {
    const cap = QR_BYTE_CAPACITY[level];
    it(`${level} 级：恰达上限 ${cap} 字节通过、超 1 字节报错且文案逐字锁定`, () => {
      validateQrPayload('x'.repeat(cap), level);
      assert.throws(
        () => validateQrPayload('x'.repeat(cap + 1), level),
        (err: unknown) =>
          err instanceof Error &&
          err.message ===
            `内容过长：${cap + 1} 字节，${level} 级纠错上限 ${cap} 字节；请缩短内容或降低纠错级别。`,
      );
    });
  }

  it('多字节字符按 UTF-8 字节数计入上限（中文 3 字节/字）', () => {
    assert.equal(byteLength('你'), 3);
    // 984 个“你”= 2952 字节 ≤ L 上限 2953；985 个 = 2955 字节 > 2953
    validateQrPayload('你'.repeat(984), 'L');
    assert.throws(
      () => validateQrPayload('你'.repeat(985), 'L'),
      (err: unknown) =>
        err instanceof Error &&
        err.message === '内容过长：2955 字节，L 级纠错上限 2953 字节；请缩短内容或降低纠错级别。',
    );
  });

  it('空白内容先于长度校验报“内容不能为空”', () => {
    assert.throws(() => validateQrPayload('   ', 'M'), /内容不能为空。/);
    assert.throws(() => validateQrPayload('', 'H'), /内容不能为空。/);
  });
});

describe('解码下采样算术（以 MAX_DECODE_DIMENSION 为准，与 QrTool 同式）', () => {
  const scale = (w: number, h: number) => Math.min(1, MAX_DECODE_DIMENSION / Math.max(w, h));
  const scaled = (w: number, h: number) => {
    const s = scale(w, h);
    return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
  };

  it('4000×3000 大图等比缩到长边 2000', () => {
    assert.equal(scale(4000, 3000), 0.5);
    assert.deepEqual(scaled(4000, 3000), { width: 2000, height: 1500 });
  });

  it('长边 ≤ 2000 不下采样（含恰好 2000 边界）', () => {
    assert.equal(scale(1000, 800), 1);
    assert.equal(scale(2000, 2000), 1);
    assert.deepEqual(scaled(2000, 2000), { width: 2000, height: 2000 });
  });

  it('长边刚超 2000 即下采样（2001×1000 长边落在 2000）', () => {
    assert.ok(scale(2001, 1000) < 1);
    assert.equal(scaled(2001, 1000).width, 2000);
  });
});
