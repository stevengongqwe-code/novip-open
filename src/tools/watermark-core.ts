import {PDFDocument, type PDFImage} from 'pdf-lib';
import {inspectPdf, parsePageRange} from './pdf-page-number-core';

// PDF 加水印核心：参数校验、平铺坐标计划、pdf-lib 落盘。
// 中文字形由浏览器 Canvas 渲染成透明 PNG，再作为页面图像叠加；不嵌入字体文件，
// 因此不增加大字体资源，且中文、英文、数字都能显示。原文件字节不会被修改。
export const WATERMARK_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  maxPages: 300,
  maxTextLength: 40,
  minFontSize: 10,
  maxFontSize: 120,
  minOpacity: 0.05,
  maxOpacity: 0.9,
  maxTiles: 600,
} as const;

export type WatermarkMode = 'tile' | 'single';

export interface WatermarkOptions {
  text: string;
  mode: WatermarkMode;
  fontSize: number;
  opacity: number;
  rotate: number;
  color: string;
  range: string;
}

export const WATERMARK_DEFAULTS: WatermarkOptions = {
  text: '仅供报名使用',
  mode: 'tile',
  fontSize: 36,
  opacity: 0.18,
  rotate: -30,
  color: '#c9232c',
  range: '',
};

export function hexToRgb(input: string): {r: number; g: number; b: number} {
  const raw = String(input ?? '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) throw new Error('颜色需为 6 位十六进制，例如 #c9232c。');
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

/** 校验并规范化用户输入；任何非法项都抛出可直接展示给用户的中文错误。 */
export function normalizeWatermarkOptions(input: Partial<WatermarkOptions>): WatermarkOptions {
  const rawText = String(input.text ?? '').replace(/\r\n?/g, '\n');
  if (/[\u0000-\u001f\u007f]/.test(rawText.replace(/\n/g, ''))) throw new Error('水印文字不能包含控制字符。');
  const text = rawText.trim();
  if (!text) throw new Error('请先输入水印文字，例如「仅供报名使用」。');
  const length = [...text].length;
  if (length > WATERMARK_LIMITS.maxTextLength) {
    throw new Error(`水印文字最多 ${WATERMARK_LIMITS.maxTextLength} 个字符，当前 ${length} 个。`);
  }
  const mode: WatermarkMode = input.mode === 'single' ? 'single' : 'tile';
  const fontSize = Math.round(Number(input.fontSize ?? WATERMARK_DEFAULTS.fontSize));
  if (!Number.isFinite(fontSize) || fontSize < WATERMARK_LIMITS.minFontSize || fontSize > WATERMARK_LIMITS.maxFontSize) {
    throw new Error(`字号需为 ${WATERMARK_LIMITS.minFontSize}–${WATERMARK_LIMITS.maxFontSize} 之间的整数（单位 pt）。`);
  }
  const opacityRaw = Number(input.opacity ?? WATERMARK_DEFAULTS.opacity);
  if (!Number.isFinite(opacityRaw) || opacityRaw < WATERMARK_LIMITS.minOpacity || opacityRaw > WATERMARK_LIMITS.maxOpacity) {
    throw new Error(`透明度需在 ${WATERMARK_LIMITS.minOpacity}–${WATERMARK_LIMITS.maxOpacity} 之间。`);
  }
  const opacity = Math.round(opacityRaw * 100) / 100;
  const rotate = Math.round(Number(input.rotate ?? WATERMARK_DEFAULTS.rotate));
  if (!Number.isFinite(rotate) || rotate < -90 || rotate > 90) throw new Error('旋转角度需在 -90° 到 90° 之间。');
  hexToRgb(input.color ?? WATERMARK_DEFAULTS.color);
  const color = '#' + String(input.color ?? WATERMARK_DEFAULTS.color).trim().replace(/^#/, '').toLowerCase();
  return {text, mode, fontSize, opacity, rotate, color, range: String(input.range ?? '').trim()};
}

export interface TilePoint {
  x: number;
  y: number;
}

/**
 * 在 width×height 的画布上生成覆盖全页的水印中心点。
 * 行与行错开半格，视觉上更接近常见的密铺水印；坐标可以超出画布边缘
 * （旋转后会切到边缘），但必须有限且数量有上限，避免恶意参数造成死循环。
 */
export function planTilePoints(
  width: number,
  height: number,
  tileWidth: number,
  tileHeight: number,
  gapX: number,
  gapY: number,
  maxTiles: number = WATERMARK_LIMITS.maxTiles,
): TilePoint[] {
  for (const value of [width, height, tileWidth, tileHeight, gapX, gapY]) {
    if (!Number.isFinite(value) || value < 0) throw new Error('水印平铺尺寸无效。');
  }
  if (width <= 0 || height <= 0) throw new Error('页面尺寸无效，无法生成水印。');
  if (tileWidth <= 0 || tileHeight <= 0) throw new Error('水印文字尺寸无效，请调整字号。');
  const stepX = tileWidth + gapX;
  const stepY = tileHeight + gapY;
  const columns = Math.max(1, Math.ceil(width / stepX) + 1);
  const rows = Math.max(1, Math.ceil(height / stepY) + 1);
  if (columns * rows > maxTiles) throw new Error('水印平铺数量过多，请调大间距或减小字号。');
  const points: TilePoint[] = [];
  const originX = (width - (columns - 1) * stepX) / 2;
  const originY = (height - (rows - 1) * stepY) / 2;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const stagger = row % 2 === 1 ? stepX / 2 : 0;
      points.push({x: originX + column * stepX + stagger, y: originY + row * stepY});
    }
  }
  return points;
}

export interface OverlayRequest {
  width: number;
  height: number;
  rotation: number;
  options: WatermarkOptions;
}

/** 由浏览器 Canvas 提供透明 PNG（1x1 或整页），Node 测试中可注入替身。 */
export type OverlayRenderer = (request: OverlayRequest) => Promise<Uint8Array>;

export interface WatermarkResult {
  bytes: Uint8Array;
  pageCount: number;
  markedPages: number;
  overlayVariants: number;
}

export async function addWatermark(
  bytes: Uint8Array,
  options: Partial<WatermarkOptions>,
  renderOverlay: OverlayRenderer,
  check: () => void = () => {},
  onProgress?: (current: number, total: number) => void,
): Promise<WatermarkResult> {
  if (!(bytes instanceof Uint8Array)) throw new Error('请先选择 PDF 文件。');
  if (bytes.length > WATERMARK_LIMITS.maxBytes) throw new Error(`PDF 最多 ${Math.round(WATERMARK_LIMITS.maxBytes / (1024 * 1024))}MB，请先压缩或拆分后再加水印。`);
  const normalized = normalizeWatermarkOptions(options);
  const info = await inspectPdf(bytes);
  if (info.pageCount > WATERMARK_LIMITS.maxPages) throw new Error(`PDF 最多 ${WATERMARK_LIMITS.maxPages} 页，当前 ${info.pageCount} 页。`);
  const targets = new Set(parsePageRange(normalized.range, info.pageCount));

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, {updateMetadata: false});
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/encrypt/i.test(message)) throw new Error('PDF 已加密，请先解除密码保护再加水印。');
    throw new Error('PDF 读取失败：文件可能损坏或使用了不支持的结构。');
  }
  if (doc.isEncrypted) throw new Error('PDF 已加密，请先解除密码保护再加水印。');
  const cache = new Map<string, PDFImage>();
  const pages = doc.getPages();
  let marked = 0;
  for (let index = 0; index < pages.length; index++) {
    if (!targets.has(index)) continue;
    check();
    if (index % 5 === 0) {
      onProgress?.(marked, targets.size);
      await new Promise(r => setTimeout(r, 0));
    }
    const page = pages[index];
    const box = page.getCropBox();
    const width = Math.max(1, Math.round(box.width * 100) / 100);
    const height = Math.max(1, Math.round(box.height * 100) / 100);
    const key = `${width}x${height}`;
    let image = cache.get(key);
    if (!image) {
      const png = await renderOverlay({width, height, rotation: page.getRotation().angle, options: normalized});
      image = await doc.embedPng(png);
      cache.set(key, image);
    }
    page.drawImage(image, {x: box.x, y: box.y, width: box.width, height: box.height});
    marked++;
  }
  check();
  onProgress?.(marked, targets.size);
  await new Promise(r => setTimeout(r, 0));
  const output = await doc.save({useObjectStreams: true});
  return {bytes: output, pageCount: pages.length, markedPages: marked, overlayVariants: cache.size};
}
