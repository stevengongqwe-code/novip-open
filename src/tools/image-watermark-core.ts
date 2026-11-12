import {hexToRgb, planTilePoints} from './watermark-core';

// 图片加水印核心逻辑：纯函数参数校验、自适应比例计算、九宫格定位、错位密铺规划与 Canvas 绘制。
// 预览与导出共用同一套绘制函数，保证“所见即所得”，100% 浏览器本机处理。

export const IMAGE_WATERMARK_LIMITS = {
  maxFiles: 20,
  maxFileBytes: 25 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxLogoBytes: 5 * 1024 * 1024,
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
} as const;

export type ImageWatermarkLayout = 'tile' | 'grid' | 'center';

export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type ImageWatermarkOutputFormat = 'keep' | 'png' | 'jpeg' | 'webp';

export interface ImageWatermarkOptions {
  text: string;
  subText: string;
  includeLogo: boolean;
  logoScale: number;
  layout: ImageWatermarkLayout;
  position: WatermarkPosition;
  fontSize: number;
  opacity: number;
  rotate: number;
  color: string;
  stroke: boolean;
  gapX: number;
  gapY: number;
  margin: number;
  format: ImageWatermarkOutputFormat;
  quality: number;
}

export const POSITION_LABELS: {id: WatermarkPosition; label: string}[] = [
  {id: 'top-left', label: '左上'},
  {id: 'top-center', label: '上中'},
  {id: 'top-right', label: '右上'},
  {id: 'middle-left', label: '左中'},
  {id: 'center', label: '正中'},
  {id: 'middle-right', label: '右中'},
  {id: 'bottom-left', label: '左下'},
  {id: 'bottom-center', label: '下中'},
  {id: 'bottom-right', label: '右下'},
];

const VALID_POSITIONS = new Set<WatermarkPosition>(POSITION_LABELS.map((item) => item.id));
const VALID_LAYOUTS = new Set<ImageWatermarkLayout>(['tile', 'grid', 'center']);
const VALID_FORMATS = new Set<ImageWatermarkOutputFormat>(['keep', 'png', 'jpeg', 'webp']);

const FONT_STACK = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Source Han Sans SC",sans-serif';

/** 按中国标准时间（UTC+8）格式化 YYYY-MM-DD 日期，用于证件/作业日期水印。 */
export function formatTodayDate(now: Date = new Date()): string {
  const shanghaiMs = now.getTime() + 8 * 3600_000;
  const shanghai = new Date(shanghaiMs);
  const year = shanghai.getUTCFullYear();
  const month = String(shanghai.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shanghai.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const IMAGE_WATERMARK_DEFAULTS: ImageWatermarkOptions = {
  text: '仅供本次报名审核使用 · 他用无效',
  subText: '',
  includeLogo: false,
  logoScale: 12,
  layout: 'tile',
  position: 'bottom-right',
  fontSize: 34,
  opacity: 0.22,
  rotate: -30,
  color: '#c9232c',
  stroke: true,
  gapX: 1.4,
  gapY: 2.0,
  margin: 3.5,
  format: 'keep',
  quality: 0.92,
};

export type WatermarkPresetId = 'id-card' | 'copy-verify' | 'homework' | 'corner-date' | 'center-stamp';

export function buildWatermarkPreset(id: WatermarkPresetId, today: string = formatTodayDate()): Partial<ImageWatermarkOptions> {
  switch (id) {
    case 'id-card':
      return {
        text: '仅供本次报名审核使用 · 他用无效',
        subText: today,
        layout: 'tile',
        fontSize: 34,
        opacity: 0.22,
        rotate: -30,
        color: '#c9232c',
        stroke: true,
        gapX: 1.4,
        gapY: 2.0,
      };
    case 'copy-verify':
      return {
        text: '仅供本人办理业务核验使用 · 再次复印无效',
        subText: today,
        layout: 'tile',
        fontSize: 30,
        opacity: 0.2,
        rotate: -35,
        color: '#3f3f46',
        stroke: true,
        gapX: 1.3,
        gapY: 1.9,
      };
    case 'homework':
      return {
        text: '原创课程作业图片 · 请勿盗用',
        subText: '',
        layout: 'tile',
        fontSize: 32,
        opacity: 0.18,
        rotate: -25,
        color: '#1d4ed8',
        stroke: true,
        gapX: 1.5,
        gapY: 2.1,
      };
    case 'corner-date':
      return {
        text: '原创实拍 · 请勿转载',
        subText: today,
        layout: 'grid',
        position: 'bottom-right',
        fontSize: 28,
        opacity: 0.88,
        rotate: 0,
        color: '#ffffff',
        stroke: true,
        margin: 3.5,
      };
    case 'center-stamp':
      return {
        text: '初稿预览 · 请勿外传',
        subText: '',
        layout: 'center',
        fontSize: 52,
        opacity: 0.32,
        rotate: -20,
        color: '#c9232c',
        stroke: true,
      };
  }
}

function cleanSingleLine(raw: unknown, label: string, maxLen: number): string {
  const str = String(raw ?? '').replace(/\r\n?/g, ' ').trim();
  if (/[\u0000-\u001f\u007f]/.test(str)) {
    throw new Error(`${label}不能包含控制字符。`);
  }
  const len = [...str].length;
  if (len > maxLen) {
    throw new Error(`${label}最多 ${maxLen} 个字符，当前 ${len} 个。`);
  }
  return str;
}

/** 校验并规范化图片水印设置；支持纯文字、文字+副标题、文字+Logo 或纯 Logo 水印。 */
export function normalizeImageWatermarkOptions(
  input: Partial<ImageWatermarkOptions>,
  hasLogo: boolean = Boolean(input.includeLogo),
): ImageWatermarkOptions {
  const text = cleanSingleLine(input.text ?? IMAGE_WATERMARK_DEFAULTS.text, '水印文字', IMAGE_WATERMARK_LIMITS.maxTextLength);
  const subText = cleanSingleLine(input.subText ?? IMAGE_WATERMARK_DEFAULTS.subText, '副标题/日期文字', IMAGE_WATERMARK_LIMITS.maxSubTextLength);
  const includeLogo = Boolean(input.includeLogo && hasLogo);

  if (!text && !subText && !includeLogo) {
    throw new Error('请先输入水印文字，或上传并启用 Logo 水印图片。');
  }

  const layoutRaw = (input.layout ?? IMAGE_WATERMARK_DEFAULTS.layout) as ImageWatermarkLayout;
  const layout: ImageWatermarkLayout = VALID_LAYOUTS.has(layoutRaw) ? layoutRaw : 'tile';

  const posRaw = (input.position ?? IMAGE_WATERMARK_DEFAULTS.position) as WatermarkPosition;
  const position: WatermarkPosition = VALID_POSITIONS.has(posRaw) ? posRaw : 'bottom-right';

  const fontSize = Math.round(Number(input.fontSize ?? IMAGE_WATERMARK_DEFAULTS.fontSize));
  if (!Number.isFinite(fontSize) || fontSize < IMAGE_WATERMARK_LIMITS.minFontSize || fontSize > IMAGE_WATERMARK_LIMITS.maxFontSize) {
    throw new Error(`字号需为 ${IMAGE_WATERMARK_LIMITS.minFontSize}–${IMAGE_WATERMARK_LIMITS.maxFontSize} 之间的整数。`);
  }

  const opacityRaw = Number(input.opacity ?? IMAGE_WATERMARK_DEFAULTS.opacity);
  if (!Number.isFinite(opacityRaw) || opacityRaw < IMAGE_WATERMARK_LIMITS.minOpacity || opacityRaw > IMAGE_WATERMARK_LIMITS.maxOpacity) {
    throw new Error(`透明度需在 ${IMAGE_WATERMARK_LIMITS.minOpacity}–${IMAGE_WATERMARK_LIMITS.maxOpacity} 之间。`);
  }
  const opacity = Math.round(opacityRaw * 100) / 100;

  const rotate = Math.round(Number(input.rotate ?? IMAGE_WATERMARK_DEFAULTS.rotate));
  if (!Number.isFinite(rotate) || rotate < -90 || rotate > 90) {
    throw new Error('旋转角度需在 -90° 到 90° 之间。');
  }

  hexToRgb(input.color ?? IMAGE_WATERMARK_DEFAULTS.color);
  const color = '#' + String(input.color ?? IMAGE_WATERMARK_DEFAULTS.color).trim().replace(/^#/, '').toLowerCase();

  const stroke = input.stroke ?? IMAGE_WATERMARK_DEFAULTS.stroke;

  const gapXRaw = Number(input.gapX ?? IMAGE_WATERMARK_DEFAULTS.gapX);
  if (!Number.isFinite(gapXRaw) || gapXRaw < IMAGE_WATERMARK_LIMITS.minGapFactor || gapXRaw > IMAGE_WATERMARK_LIMITS.maxGapFactor) {
    throw new Error(`水平间距系数需在 ${IMAGE_WATERMARK_LIMITS.minGapFactor}–${IMAGE_WATERMARK_LIMITS.maxGapFactor} 之间。`);
  }
  const gapX = Math.round(gapXRaw * 100) / 100;

  const gapYRaw = Number(input.gapY ?? IMAGE_WATERMARK_DEFAULTS.gapY);
  if (!Number.isFinite(gapYRaw) || gapYRaw < IMAGE_WATERMARK_LIMITS.minGapFactor || gapYRaw > IMAGE_WATERMARK_LIMITS.maxGapFactor) {
    throw new Error(`垂直间距系数需在 ${IMAGE_WATERMARK_LIMITS.minGapFactor}–${IMAGE_WATERMARK_LIMITS.maxGapFactor} 之间。`);
  }
  const gapY = Math.round(gapYRaw * 100) / 100;

  const marginRaw = Number(input.margin ?? IMAGE_WATERMARK_DEFAULTS.margin);
  if (!Number.isFinite(marginRaw) || marginRaw < IMAGE_WATERMARK_LIMITS.minMarginPercent || marginRaw > IMAGE_WATERMARK_LIMITS.maxMarginPercent) {
    throw new Error(`边距比例需在 ${IMAGE_WATERMARK_LIMITS.minMarginPercent}%–${IMAGE_WATERMARK_LIMITS.maxMarginPercent}% 之间。`);
  }
  const margin = Math.round(marginRaw * 10) / 10;

  const logoScaleRaw = Number(input.logoScale ?? IMAGE_WATERMARK_DEFAULTS.logoScale);
  if (!Number.isFinite(logoScaleRaw) || logoScaleRaw < IMAGE_WATERMARK_LIMITS.minLogoScale || logoScaleRaw > IMAGE_WATERMARK_LIMITS.maxLogoScale) {
    throw new Error(`Logo 大小比例需在 ${IMAGE_WATERMARK_LIMITS.minLogoScale}%–${IMAGE_WATERMARK_LIMITS.maxLogoScale}% 之间。`);
  }
  const logoScale = Math.round(logoScaleRaw * 10) / 10;

  const formatRaw = (input.format ?? IMAGE_WATERMARK_DEFAULTS.format) as ImageWatermarkOutputFormat;
  const format: ImageWatermarkOutputFormat = VALID_FORMATS.has(formatRaw) ? formatRaw : 'keep';

  const qualityRaw = Number(input.quality ?? IMAGE_WATERMARK_DEFAULTS.quality);
  if (!Number.isFinite(qualityRaw) || qualityRaw < IMAGE_WATERMARK_LIMITS.minQuality || qualityRaw > IMAGE_WATERMARK_LIMITS.maxQuality) {
    throw new Error(`导出图片质量需在 ${IMAGE_WATERMARK_LIMITS.minQuality}–${IMAGE_WATERMARK_LIMITS.maxQuality} 之间。`);
  }
  const quality = Math.round(qualityRaw * 100) / 100;

  return {
    text,
    subText,
    includeLogo,
    logoScale,
    layout,
    position,
    fontSize,
    opacity,
    rotate,
    color,
    stroke,
    gapX,
    gapY,
    margin,
    format,
    quality,
  };
}

export interface UploadFileCheckItem {
  name: string;
  size: number;
  width?: number;
  height?: number;
}

/** 校验待加水印的图片文件列表（数量、单张大小、总大小、像素尺寸）。 */
export function validateWatermarkUpload(files: UploadFileCheckItem[]): void {
  if (!files.length) {
    throw new Error('请至少选择 1 张图片。');
  }
  if (files.length > IMAGE_WATERMARK_LIMITS.maxFiles) {
    throw new Error(`单次最多处理 ${IMAGE_WATERMARK_LIMITS.maxFiles} 张图片，当前已选 ${files.length} 张。`);
  }
  let totalBytes = 0;
  for (const file of files) {
    if (!Number.isFinite(file.size) || file.size <= 0) {
      throw new Error(`图片「${file.name}」为空文件，请重新选择。`);
    }
    if (file.size > IMAGE_WATERMARK_LIMITS.maxFileBytes) {
      throw new Error(`图片「${file.name}」超过单张 25MB 上限，请先压缩后再加水印。`);
    }
    totalBytes += file.size;
    if (file.width !== undefined && file.height !== undefined) {
      if (file.width <= 0 || file.height <= 0) {
        throw new Error(`图片「${file.name}」尺寸无效。`);
      }
      if (file.width > IMAGE_WATERMARK_LIMITS.maxEdge || file.height > IMAGE_WATERMARK_LIMITS.maxEdge) {
        throw new Error(`图片「${file.name}」（${file.width}×${file.height}px）单边超过 ${IMAGE_WATERMARK_LIMITS.maxEdge}px 上限。`);
      }
      if (file.width * file.height > IMAGE_WATERMARK_LIMITS.maxPixels) {
        throw new Error(`图片「${file.name}」总像素超过 6400 万像素上限，请先缩小尺寸。`);
      }
    }
  }
  if (totalBytes > IMAGE_WATERMARK_LIMITS.maxTotalBytes) {
    throw new Error('所选图片总大小超过 100MB 上限，请分批处理。');
  }
}

/**
 * 计算自适应缩放基准：以画布短边 1000px 为 1.0 倍基准，使 4000×3000 的手机照片与 1000×750 的截图
 * 在相同字号参数下呈现一致的视觉比例。
 */
export function adaptiveUnitScale(width: number, height: number): number {
  const shorter = Math.min(width, height);
  if (!Number.isFinite(shorter) || shorter <= 0) {
    throw new Error('画布尺寸无效。');
  }
  return Math.max(0.25, shorter / 1000);
}

/** 根据主色亮度自动计算反色描边颜色，避免白色水印在白底证件照或深色水印在暗部消失。 */
export function contrastStrokeColor(hexColor: string, opacity: number): string {
  const {r, g, b} = hexToRgb(hexColor);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const strokeAlpha = Math.min(0.85, Math.max(0.12, opacity * 0.72));
  return luminance > 0.62
    ? `rgba(24,24,27,${strokeAlpha.toFixed(3)})`
    : `rgba(255,255,255,${strokeAlpha.toFixed(3)})`;
}

/** 计算九宫格单处水印的中心点坐标（x, y），保证旋转外接框加上边距后不贴边裁切。 */
export function computeAnchorPosition(
  width: number,
  height: number,
  boxWidth: number,
  boxHeight: number,
  position: WatermarkPosition,
  marginPercent: number,
): {x: number; y: number} {
  if (width <= 0 || height <= 0) throw new Error('画布尺寸无效。');
  const shorter = Math.min(width, height);
  const marginPx = Math.max(8, (shorter * marginPercent) / 100);
  const halfW = Math.min(width / 2, boxWidth / 2);
  const halfH = Math.min(height / 2, boxHeight / 2);

  const leftX = Math.min(width / 2, marginPx + halfW);
  const rightX = Math.max(width / 2, width - marginPx - halfW);
  const centerX = width / 2;

  const topY = Math.min(height / 2, marginPx + halfH);
  const bottomY = Math.max(height / 2, height - marginPx - halfH);
  const centerY = height / 2;

  const x = position.endsWith('left') ? leftX : position.endsWith('right') ? rightX : centerX;
  const y = position.startsWith('top-') ? topY : position.startsWith('bottom-') ? bottomY : centerY;
  return {x, y};
}

/** 计算错位密铺的所有中心点坐标。 */
export function planImageWatermarkTiles(
  width: number,
  height: number,
  stampWidth: number,
  stampHeight: number,
  rotateDeg: number,
  gapXFactor: number,
  gapYFactor: number,
): {x: number; y: number}[] {
  const angle = (rotateDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const rotatedW = Math.max(12, stampWidth * cos + stampHeight * sin);
  const rotatedH = Math.max(12, stampWidth * sin + stampHeight * cos);
  const unit = adaptiveUnitScale(width, height);
  const gapX = Math.max(18 * unit, stampWidth * gapXFactor * 0.65);
  const gapY = Math.max(22 * unit, stampHeight * gapYFactor * 0.85);
  return planTilePoints(width, height, rotatedW, rotatedH, gapX, gapY, IMAGE_WATERMARK_LIMITS.maxTiles);
}

/** 根据原图 MIME 与用户选择的导出格式决定最终输出 MIME 与扩展名。 */
export function resolveOutputMime(
  inputMime: string,
  format: ImageWatermarkOutputFormat,
): {mime: 'image/png' | 'image/jpeg' | 'image/webp'; ext: 'png' | 'jpg' | 'webp'} {
  if (format === 'png') return {mime: 'image/png', ext: 'png'};
  if (format === 'jpeg') return {mime: 'image/jpeg', ext: 'jpg'};
  if (format === 'webp') return {mime: 'image/webp', ext: 'webp'};
  const lower = String(inputMime ?? '').toLowerCase();
  if (lower.includes('jpeg') || lower.includes('jpg')) return {mime: 'image/jpeg', ext: 'jpg'};
  if (lower.includes('webp')) return {mime: 'image/webp', ext: 'webp'};
  return {mime: 'image/png', ext: 'png'};
}

/** 生成不重名的加水印输出文件名。 */
export function buildWatermarkedFileName(originalName: string, ext: string, usedNames?: Set<string>): string {
  const base = String(originalName || 'image')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim() || 'image';
  const cleanExt = ext.replace(/^\./, '') || 'png';
  let candidate = `${base}-加水印.${cleanExt}`;
  if (!usedNames) return candidate;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base}-加水印-${suffix}.${cleanExt}`;
    suffix++;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export interface DrawableLogo {
  width: number;
  height: number;
}

/**
 * 在给定 2D 上下文上叠加图片水印（假定底图已绘制或正在预览画布上绘制）。
 * 支持主文字 + 副标题/日期 + Logo 图标组合，自动按画布短边缩放。
 */
export function drawImageWatermarkOnContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: ImageWatermarkOptions,
  logoSource?: (CanvasImageSource & DrawableLogo) | null,
): {stampCount: number} {
  const unit = adaptiveUnitScale(width, height);
  const mainPx = Math.max(10, Math.round(options.fontSize * unit));
  const subPx = Math.max(9, Math.round(mainPx * 0.72));
  const mainFont = `600 ${mainPx}px ${FONT_STACK}`;
  const subFont = `500 ${subPx}px ${FONT_STACK}`;

  const {r, g, b} = hexToRgb(options.color);
  const fillColor = `rgba(${r},${g},${b},${options.opacity})`;
  const strokeColor = contrastStrokeColor(options.color, options.opacity);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let mainWidth = 0;
  if (options.text) {
    ctx.font = mainFont;
    mainWidth = Math.max(mainPx * [...options.text].length * 0.55, ctx.measureText?.(options.text)?.width || 0);
  }
  let subWidth = 0;
  if (options.subText) {
    ctx.font = subFont;
    subWidth = Math.max(subPx * [...options.subText].length * 0.52, ctx.measureText?.(options.subText)?.width || 0);
  }

  const hasLogo = Boolean(options.includeLogo && logoSource && logoSource.width > 0 && logoSource.height > 0);
  const shorter = Math.min(width, height);
  const logoDrawW = hasLogo ? Math.max(16, (shorter * options.logoScale) / 100) : 0;
  const logoDrawH = hasLogo && logoSource ? Math.max(12, logoDrawW * (logoSource.height / logoSource.width)) : 0;

  const lineGap = Math.max(4, Math.round(mainPx * 0.28));
  const partsHeights: number[] = [];
  if (hasLogo) partsHeights.push(logoDrawH);
  if (options.text) partsHeights.push(mainPx * 1.2);
  if (options.subText) partsHeights.push(subPx * 1.2);

  const totalHeight =
    partsHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, partsHeights.length - 1) * lineGap;
  const totalWidth = Math.max(16, mainWidth, subWidth, logoDrawW);

  const angle = (options.rotate * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const boundW = totalWidth * cos + totalHeight * sin;
  const boundH = totalWidth * sin + totalHeight * cos;

  const paintStamp = (cx: number, cy: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    let cursorY = -totalHeight / 2;

    if (hasLogo && logoSource) {
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = options.opacity;
      ctx.drawImage(logoSource, -logoDrawW / 2, cursorY, logoDrawW, logoDrawH);
      ctx.globalAlpha = prevAlpha;
      cursorY += logoDrawH + lineGap;
    }

    if (options.text) {
      const lineH = mainPx * 1.2;
      const lineCenterY = cursorY + lineH / 2;
      ctx.font = mainFont;
      if (options.stroke) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(1.5, mainPx * 0.1);
        ctx.lineJoin = 'round';
        ctx.strokeText?.(options.text, 0, lineCenterY);
      }
      ctx.fillStyle = fillColor;
      ctx.fillText(options.text, 0, lineCenterY);
      cursorY += lineH + lineGap;
    }

    if (options.subText) {
      const lineH = subPx * 1.2;
      const lineCenterY = cursorY + lineH / 2;
      ctx.font = subFont;
      if (options.stroke) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(1.2, subPx * 0.1);
        ctx.lineJoin = 'round';
        ctx.strokeText?.(options.subText, 0, lineCenterY);
      }
      ctx.fillStyle = fillColor;
      ctx.fillText(options.subText, 0, lineCenterY);
    }

    ctx.restore();
  };

  let points: {x: number; y: number}[];
  if (options.layout === 'center') {
    points = [{x: width / 2, y: height / 2}];
  } else if (options.layout === 'grid') {
    points = [computeAnchorPosition(width, height, boundW, boundH, options.position, options.margin)];
  } else {
    points = planImageWatermarkTiles(width, height, totalWidth, totalHeight, options.rotate, options.gapX, options.gapY);
  }

  for (const pt of points) {
    paintStamp(pt.x, pt.y);
  }

  ctx.restore();
  return {stampCount: points.length};
}
