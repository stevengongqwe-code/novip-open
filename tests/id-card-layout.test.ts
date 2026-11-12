import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  CARD_PRESETS,
  calculateCardPlacement,
  generateA4PdfFromImage,
  getMockCardSvg,
  mmToPt,
  mmToPx,
  normalizeWatermarkText,
  applyColorFilterToPixels,
} from '../src/tools/id-card-layout-core';

describe('A4 证件拼版打印 · 几何与尺寸换算', () => {
  it('证件尺寸与 ISO 国际/国家标准对齐', () => {
    const idCard = CARD_PRESETS['id-card'];
    assert.equal(idCard.widthMm, 85.6);
    assert.equal(idCard.heightMm, 54.0);

    const studentCard = CARD_PRESETS['student-card'];
    assert.equal(studentCard.widthMm, 100.0);
    assert.equal(studentCard.heightMm, 70.0);

    const driverLicense = CARD_PRESETS['driver-license'];
    assert.equal(driverLicense.widthMm, 88.0);
    assert.equal(driverLicense.heightMm, 60.0);
  });

  it('毫米转 PDF 点阵 (mmToPt) 换算精确', () => {
    assert.equal(mmToPt(25.4), 72);
    // 标准 A4 210 × 297 mm
    const a4W = mmToPt(A4_WIDTH_MM);
    const a4H = mmToPt(A4_HEIGHT_MM);
    assert.ok(Math.abs(a4W - 595.28) < 0.01, `a4W 期望 595.28，实际 ${a4W}`);
    assert.ok(Math.abs(a4H - 841.89) < 0.01, `a4H 期望 841.89，实际 ${a4H}`);
  });

  it('毫米转 300 DPI 像素 (mmToPx) 换算精确', () => {
    assert.equal(mmToPx(25.4, 300), 300);
    assert.equal(mmToPx(210, 300), 2480);
    assert.equal(mmToPx(297, 300), 3508);
  });
});

describe('A4 证件拼版打印 · 排版布局计算', () => {
  it('经典上下居中 (stacked)：正反面水平对称且不重叠', () => {
    const placement = calculateCardPlacement('id-card', 'stacked');
    assert.equal(placement.paperMm.width, 210);
    assert.equal(placement.paperMm.height, 297);

    // 水平居中
    const expectedX = (210 - 85.6) / 2;
    assert.equal(placement.front.x, expectedX);
    assert.equal(placement.back.x, expectedX);

    // 垂直方向两卡片不重叠且留有间隙
    assert.ok(placement.front.y + placement.front.height < placement.back.y);
    assert.ok(placement.back.y + placement.back.height < 297);
  });

  it('横向左右并排 (side-by-side)：两张卡片左右排列且均在 A4 页面内部', () => {
    const placement = calculateCardPlacement('id-card', 'side-by-side');
    assert.equal(placement.front.y, placement.back.y);
    assert.ok(placement.front.x + placement.front.width < placement.back.x);
    assert.ok(placement.back.x + placement.back.width <= 210);
  });

  it('紧凑置顶 (compact)：上下排列在页面上半区，留足下半部盖章空白', () => {
    const placement = calculateCardPlacement('id-card', 'compact');
    assert.ok(placement.back.y + placement.back.height < 180, '紧凑模式卡片应完全位于页面上半部分');
  });
});

describe('A4 证件拼版打印 · 防盗水印与图像滤波', () => {
  it('水印文本标准化与长度截断', () => {
    assert.equal(normalizeWatermarkText('   '), '仅供个人证件复印核验使用 他用无效');
    assert.equal(normalizeWatermarkText(' 仅供奖学金评定 '), '仅供奖学金评定');
    const longText = 'a'.repeat(60);
    assert.equal(normalizeWatermarkText(longText).length, 48);
  });

  it('色彩滤波：灰度与黑白复印去灰底算法', () => {
    // 创建包含近白色灰底、黑色文字的像素数组 [r, g, b, a]
    const pixels = new Uint8ClampedArray([
      220, 220, 225, 255, // 近白灰底 (手机拍照常见)
      40, 40, 40, 255,    // 深色文字
      100, 150, 200, 255, // 彩色
    ]);

    // 灰度模式
    const grayPixels = new Uint8ClampedArray(pixels);
    applyColorFilterToPixels(grayPixels, 'grayscale');
    assert.equal(grayPixels[0], grayPixels[1]);
    assert.equal(grayPixels[1], grayPixels[2]);

    // 复印模式：近白灰底被完全过滤为纯白 255，深色加深
    const copyPixels = new Uint8ClampedArray(pixels);
    applyColorFilterToPixels(copyPixels, 'photocopy');
    assert.equal(copyPixels[0], 255, '近白底色在复印模式下应被过滤为纯白 255');
    assert.equal(copyPixels[1], 255);
    assert.equal(copyPixels[2], 255);
    assert.ok(copyPixels[4] <= 40, '深色文字在复印模式下保持深色');
  });
});

describe('A4 证件拼版打印 · 矢量 A4 PDF 导出与示范样卡', () => {
  it('getMockCardSvg 能生成正反面可用脱敏示范样卡', () => {
    const frontSvg = getMockCardSvg('front', 'id-card');
    assert.ok(frontSvg.startsWith('data:image/svg+xml'));
    assert.ok(frontSvg.includes('%E5%BC%A0%E5%B0%8F%E6%96%B0')); // 张小新 URL 编码

    const backSvg = getMockCardSvg('back', 'id-card');
    assert.ok(backSvg.startsWith('data:image/svg+xml'));
    assert.ok(backSvg.includes('%E5%B1%85%E6%B0%91%E8%BA%AB%E4%BB%BD%E8%AF%81')); // 居民身份证
  });

  it('generateA4PdfFromImage 生成标准 1:1 A4 PDF 文档', async () => {
    // 构造有效 1x1 PNG 用于测试
    const minimalPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pngBytes = Buffer.from(minimalPngBase64, 'base64');

    const pdfBytes = await generateA4PdfFromImage(pngBytes, 'image/png');
    assert.ok(pdfBytes.length > 0);

    // 解析 PDF 验证页面尺寸严格为 A4 pt
    const doc = await PDFDocument.load(pdfBytes);
    assert.equal(doc.getPageCount(), 1);
    const page = doc.getPage(0);
    const { width, height } = page.getSize();
    assert.ok(Math.abs(width - mmToPt(210)) < 0.1, `width: ${width}`);
    assert.ok(Math.abs(height - mmToPt(297)) < 0.1, `height: ${height}`);
    assert.equal(doc.getTitle(), 'A4证件拼版复印件_NOVIP');
  });
});
