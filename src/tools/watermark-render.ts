import {hexToRgb, planTilePoints, type WatermarkOptions} from './watermark-core';

// 仅浏览器可用的水印渲染：把中文水印画到 Canvas，再导出透明 PNG 供 pdf-lib 叠加。
// 使用系统字体（苹方 / 微软雅黑 / Noto Sans SC），不下载也不嵌入字体文件。
const FONT_STACK = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Source Han Sans SC",sans-serif';
const MAX_OVERLAY_EDGE = 2200;

export function overlayScale(widthPt: number, heightPt: number): number {
  const longest = Math.max(widthPt, heightPt);
  if (!Number.isFinite(longest) || longest <= 0) throw new Error('页面尺寸无效，无法生成水印。');
  return Math.max(1, Math.min(2.2, MAX_OVERLAY_EDGE / longest));
}

function fontSpec(fontSizePt: number, scale: number) {
  return `600 ${Math.max(6, fontSizePt * scale)}px ${FONT_STACK}`;
}

function rgba(color: string, opacity: number) {
  const {r, g, b} = hexToRgb(color);
  return `rgba(${r},${g},${b},${opacity})`;
}

/**
 * 在给定 2D 上下文里绘制整页水印。导出与预览共用同一套逻辑，避免“预览对、导出错”。
 * widthPt/heightPt 为 PDF 页面 pt 尺寸；scale 为画布像素 / pt。
 */
export function drawWatermarkOnContext(
  ctx: CanvasRenderingContext2D,
  widthPt: number,
  heightPt: number,
  options: WatermarkOptions,
  scale: number,
): void {
  const width = widthPt * scale;
  const height = heightPt * scale;
  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.fillStyle = rgba(options.color, options.opacity);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = fontSpec(options.fontSize, scale);

  const angle = (options.rotate * Math.PI) / 180;
  const metrics = ctx.measureText(options.text);
  const textWidth = Math.max(1, metrics.width);
  const textHeight = Math.max(1, options.fontSize * scale * 1.25);

  const paint = (x: number, y: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillText(options.text, 0, 0);
    ctx.restore();
  };

  if (options.mode === 'single') {
    paint(width / 2, height / 2);
    return;
  }

  // 旋转后文字的包围盒会变大，按旋转角把有效尺寸放大，保证密铺不留空。
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const tileWidth = textWidth * cos + textHeight * sin;
  const tileHeight = textWidth * sin + textHeight * cos;
  const gapX = Math.max(24 * scale, textWidth * 1.4);
  const gapY = Math.max(28 * scale, textHeight * 2.2);
  const points = planTilePoints(width, height, tileWidth, tileHeight, gapX, gapY);
  for (const point of points) paint(point.x, point.y);
}

export function createOverlayCanvas(widthPt: number, heightPt: number, options: WatermarkOptions): HTMLCanvasElement {
  const scale = overlayScale(widthPt, heightPt);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(widthPt * scale));
  canvas.height = Math.max(1, Math.round(heightPt * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 Canvas，无法生成水印。');
  drawWatermarkOnContext(ctx, widthPt, heightPt, options, scale);
  return canvas;
}

export async function renderOverlayPng(widthPt: number, heightPt: number, options: WatermarkOptions): Promise<Uint8Array> {
  const canvas = createOverlayCanvas(widthPt, heightPt, options);
  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('水印图片生成失败，请换一个浏览器或减少页数后重试。');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
