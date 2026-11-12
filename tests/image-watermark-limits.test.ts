import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_WATERMARK_LIMITS,
  IMAGE_WATERMARK_DEFAULTS,
  normalizeImageWatermarkOptions,
  planImageWatermarkTiles,
  validateWatermarkUpload,
} from '../src/tools/image-watermark-core';

// IMAGE_WATERMARK_LIMITS 图片水印上限契约：此前主分支与全部 open PR 的 tests/ 均零直接引用
// （tests/image-watermark.test.ts 只以硬编码字面量间接覆盖部分守卫行为，从未绑定常量本身）。
// 本文件直接锁定常量字面值，并对每个字段断言其驱动的边界行为（边界取等通过、越界报错，
// 报错文案凡由常量拼出者均用常量模板生成期望串——改常量不改文案即失败）。
// 诚实说明：maxLogoBytes 在核心层无任何函数使用，其唯一消费点是 ImageWatermark.tsx:232
// 的 Logo 文件大小检查，故本文件只锁定其字面值（5 MiB），不虚构核心层行为。

const L = IMAGE_WATERMARK_LIMITS;
const MiB = 1024 * 1024;

/** 断言 fn 抛错且报错文案与期望串逐字相等；未抛错时显式失败。 */
function throwsWith(fn: () => unknown, message: string): void {
  try {
    fn();
  } catch (err) {
    assert.equal((err as Error).message, message);
    return;
  }
  assert.fail(`应抛错「${message}」，但未抛错`);
}

const file = (name: string, size: number, width?: number, height?: number) => ({name, size, width, height});

describe('image-watermark-core 上限常量契约', () => {
  it('字面值逐项锁定：21 个字段', () => {
    assert.deepEqual(L, {
      maxFiles: 20,
      maxFileBytes: 25 * MiB,
      maxTotalBytes: 100 * MiB,
      maxLogoBytes: 5 * MiB,
      maxEdge: 12000,
      maxPixels: 64_000_000,
      maxTextLength: 60,
      maxSubTextLength: 40,
      minFontSize: 12,
      maxFontSize: 160,
      minOpacity: 0.05,
      maxOpacity: 1,
      minGapFactor: 0.6,
      maxGapFactor: 4.0,
      minMarginPercent: 1,
      maxMarginPercent: 15,
      minLogoScale: 3,
      maxLogoScale: 50,
      minQuality: 0.5,
      maxQuality: 1,
      maxTiles: 800,
    });
    assert.equal(Object.keys(L).length, 21);
  });

  it('量纲与区间不变量', () => {
    // 字节类上限均为整 MiB；像素类为正整数；每组 min < max
    for (const [key, bytes] of [
      ['maxFileBytes', L.maxFileBytes],
      ['maxTotalBytes', L.maxTotalBytes],
      ['maxLogoBytes', L.maxLogoBytes],
    ] as const) {
      assert.ok(Number.isInteger(bytes / MiB), `${key} 应为整 MiB`);
    }
    assert.equal(L.maxFileBytes / MiB, 25);
    assert.equal(L.maxTotalBytes / MiB, 100);
    assert.equal(L.maxLogoBytes / MiB, 5);
    assert.equal(L.maxPixels, 64_000_000);
    for (const [min, max] of [
      [L.minFontSize, L.maxFontSize],
      [L.minOpacity, L.maxOpacity],
      [L.minGapFactor, L.maxGapFactor],
      [L.minMarginPercent, L.maxMarginPercent],
      [L.minLogoScale, L.maxLogoScale],
      [L.minQuality, L.maxQuality],
    ] as const) {
      assert.ok(min < max, `区间 ${min}–${max} 应为 min < max`);
    }
    assert.ok(L.maxFiles > 0 && Number.isInteger(L.maxFiles));
    assert.ok(L.maxTiles > 0 && Number.isInteger(L.maxTiles));
    assert.ok(L.maxTextLength > L.maxSubTextLength, '主文字上限应大于副标题上限');
  });

  it('默认值全部落在上限区间内', () => {
    const d = IMAGE_WATERMARK_DEFAULTS;
    assert.ok(d.fontSize >= L.minFontSize && d.fontSize <= L.maxFontSize);
    assert.ok(d.opacity >= L.minOpacity && d.opacity <= L.maxOpacity);
    assert.ok(d.gapX >= L.minGapFactor && d.gapX <= L.maxGapFactor);
    assert.ok(d.gapY >= L.minGapFactor && d.gapY <= L.maxGapFactor);
    assert.ok(d.margin >= L.minMarginPercent && d.margin <= L.maxMarginPercent);
    assert.ok(d.logoScale >= L.minLogoScale && d.logoScale <= L.maxLogoScale);
    assert.ok(d.quality >= L.minQuality && d.quality <= L.maxQuality);
    assert.ok([...d.text].length <= L.maxTextLength);
    assert.ok([...d.subText].length <= L.maxSubTextLength);
    // 默认配置本身可通过规范化（交叉契约：改任一上限致默认值越界时本例失败）
    assert.doesNotThrow(() => normalizeImageWatermarkOptions({...d}));
  });

  it('字号上下界：取等通过，越界报错且文案由常量生成', () => {
    const msg = `字号需为 ${L.minFontSize}–${L.maxFontSize} 之间的整数。`;
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, fontSize: L.minFontSize}).fontSize, 12);
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, fontSize: L.maxFontSize}).fontSize, 160);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, fontSize: L.minFontSize - 1}), msg);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, fontSize: L.maxFontSize + 1}), msg);
  });

  it('透明度上下界：取等通过，越界报错且文案由常量生成', () => {
    const msg = `透明度需在 ${L.minOpacity}–${L.maxOpacity} 之间。`;
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, opacity: L.minOpacity}).opacity, 0.05);
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, opacity: L.maxOpacity}).opacity, 1);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, opacity: 0.04}), msg);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, opacity: 1.01}), msg);
  });

  it('间距系数上下界：gapX/gapY 各取等通过，越界按轴报错', () => {
    const msgX = `水平间距系数需在 ${L.minGapFactor}–${L.maxGapFactor} 之间。`;
    const msgY = `垂直间距系数需在 ${L.minGapFactor}–${L.maxGapFactor} 之间。`;
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, gapX: L.minGapFactor}).gapX, 0.6);
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, gapX: L.maxGapFactor}).gapX, 4);
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, gapY: L.minGapFactor}).gapY, 0.6);
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, gapY: L.maxGapFactor}).gapY, 4);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, gapX: 0.59}), msgX);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, gapX: 4.01}), msgX);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, gapY: 0.59}), msgY);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, gapY: 4.01}), msgY);
  });

  it('边距比例上下界：取等通过，越界报错且文案由常量生成', () => {
    const msg = `边距比例需在 ${L.minMarginPercent}%–${L.maxMarginPercent}% 之间。`;
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, margin: L.minMarginPercent}).margin, 1);
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, margin: L.maxMarginPercent}).margin, 15);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, margin: 0.9}), msg);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, margin: 15.1}), msg);
  });

  it('Logo 比例上下界：取等通过，越界报错且文案由常量生成', () => {
    const msg = `Logo 大小比例需在 ${L.minLogoScale}%–${L.maxLogoScale}% 之间。`;
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, logoScale: L.minLogoScale}).logoScale, 3);
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, logoScale: L.maxLogoScale}).logoScale, 50);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, logoScale: 2.9}), msg);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, logoScale: 50.1}), msg);
  });

  it('导出质量上下界：取等通过，越界报错且文案由常量生成', () => {
    const msg = `导出图片质量需在 ${L.minQuality}–${L.maxQuality} 之间。`;
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, quality: L.minQuality}).quality, 0.5);
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, quality: L.maxQuality}).quality, 1);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, quality: 0.49}), msg);
    throwsWith(() => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, quality: 1.01}), msg);
  });

  it('水印文字长度：恰好上限通过，超 1 字报错且文案由常量生成', () => {
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, text: '水'.repeat(L.maxTextLength)}).text.length, 60);
    throwsWith(
      () => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, text: '水'.repeat(L.maxTextLength + 1)}),
      `水印文字最多 ${L.maxTextLength} 个字符，当前 ${L.maxTextLength + 1} 个。`,
    );
  });

  it('副标题长度：恰好上限通过，超 1 字报错且文案由常量生成', () => {
    assert.equal(normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, subText: '副'.repeat(L.maxSubTextLength)}).subText.length, 40);
    throwsWith(
      () => normalizeImageWatermarkOptions({...IMAGE_WATERMARK_DEFAULTS, subText: '副'.repeat(L.maxSubTextLength + 1)}),
      `副标题/日期文字最多 ${L.maxSubTextLength} 个字符，当前 ${L.maxSubTextLength + 1} 个。`,
    );
  });

  it('批量上传张数：恰好上限通过，超 1 张报错且文案由常量生成', () => {
    validateWatermarkUpload(Array.from({length: L.maxFiles}, (_, i) => file(`${i}.png`, 1024)));
    throwsWith(
      () => validateWatermarkUpload(Array.from({length: L.maxFiles + 1}, (_, i) => file(`${i}.png`, 1024))),
      `单次最多处理 ${L.maxFiles} 张图片，当前已选 ${L.maxFiles + 1} 张。`,
    );
  });

  it('单张与总大小：恰好上限通过，+1 字节报错（边界是 > 而非 >=）', () => {
    validateWatermarkUpload([file('a.png', L.maxFileBytes)]);
    // 注：单张超限文案硬编码“25MB”（阈值由常量驱动，文案数字未用常量拼出），此处锁定现有文案
    throwsWith(() => validateWatermarkUpload([file('a.png', L.maxFileBytes + 1)]), '图片「a.png」超过单张 25MB 上限，请先压缩后再加水印。');
    validateWatermarkUpload(Array.from({length: 4}, (_, i) => file(`${i}.png`, L.maxFileBytes)));
    throwsWith(
      () => validateWatermarkUpload([...Array.from({length: 4}, (_, i) => file(`${i}.png`, L.maxFileBytes)), file('tiny.png', 1)]),
      '所选图片总大小超过 100MB 上限，请分批处理。',
    );
  });

  it('单边与总像素：恰好上限通过，超限报错', () => {
    validateWatermarkUpload([file('a.png', 1024, L.maxEdge, 1000)]);
    throwsWith(
      () => validateWatermarkUpload([file('a.png', 1024, L.maxEdge + 1, 1000)]),
      `图片「a.png」（${L.maxEdge + 1}×1000px）单边超过 ${L.maxEdge}px 上限。`,
    );
    // 8000×8000 恰好 6400 万像素；8001×8000 超限（注：总像素文案硬编码“6400 万”，阈值由常量驱动）
    validateWatermarkUpload([file('a.png', 1024, 8000, 8000)]);
    throwsWith(() => validateWatermarkUpload([file('a.png', 1024, 8001, 8000)]), '图片「a.png」总像素超过 6400 万像素上限，请先缩小尺寸。');
  });

  it('密铺数量上限：恰好 800 点通过，820 点报错', () => {
    // 5000×3000、印章 76×100、不旋转、间距系数 0 时：列数 ceil(5000/130)+1=40、行数 ceil(3000/166)+1=20，恰好 40×20=800 点
    assert.equal(planImageWatermarkTiles(5000, 3000, 76, 100, 0, 0, 0).length, L.maxTiles);
    // 宽 +100px 后列数 41，41×20=820 点，触发上限
    throwsWith(() => planImageWatermarkTiles(5100, 3000, 76, 100, 0, 0, 0), '水印平铺数量过多，请调大间距或减小字号。');
  });

  it('maxLogoBytes 仅字面锁定：核心层无函数使用，消费点在组件侧', () => {
    // ImageWatermark.tsx:232 以该值检查 Logo 文件大小；核心层无对应守卫函数，不虚构行为
    assert.equal(L.maxLogoBytes, 5 * MiB);
  });
});
