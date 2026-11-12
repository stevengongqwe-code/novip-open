/**
 * A4 证件拼版复印打印 · 核心计算与排版引擎（纯端侧零上传）。
 *
 * 功能：
 *   1. 常见证件物理规格毫米级换算（二代身份证/社保卡/银行卡 85.6×54mm、学生证 100×70mm、驾驶证 88×60mm）。
 *   2. 标准 A4 纸张（210×297mm）多种版式几何排版（经典上下居中、左右并排、紧凑留白置顶）。
 *   3. 绝密防盗水印算法（倾斜重复铺陈，防冒用、防借贷诈骗）。
 *   4. 色彩滤波（原色、复印黑白去底灰、清晰灰度）。
 *   5. 基于 pdf-lib 纯端侧导出矢量精准 1:1 A4 PDF（595.28×841.89pt）与 300 DPI 打印级图片。
 */
import { PDFDocument } from 'pdf-lib';

export type CardPresetId = 'id-card' | 'student-card' | 'driver-license';

export interface CardPreset {
  id: CardPresetId;
  name: string;
  desc: string;
  widthMm: number;
  heightMm: number;
}

export const CARD_PRESETS: Record<CardPresetId, CardPreset> = {
  'id-card': {
    id: 'id-card',
    name: '二代居民身份证 / 社保卡 / 银行卡',
    desc: '85.6 × 54.0 mm（ISO/IEC 7810 ID-1 标准尺寸）',
    widthMm: 85.6,
    heightMm: 54.0,
  },
  'student-card': {
    id: 'student-card',
    name: '高校学生证 / 借书证',
    desc: '100.0 × 70.0 mm（大学学生证常用规格）',
    widthMm: 100.0,
    heightMm: 70.0,
  },
  'driver-license': {
    id: 'driver-license',
    name: '机动车驾驶证 / 行驶证',
    desc: '88.0 × 60.0 mm（全国标准驾驶证正副页规格）',
    widthMm: 88.0,
    heightMm: 60.0,
  },
};

export type LayoutMode = 'stacked' | 'side-by-side' | 'compact';

export interface LayoutOption {
  id: LayoutMode;
  name: string;
  desc: string;
}

export const LAYOUT_OPTIONS: Record<LayoutMode, LayoutOption> = {
  stacked: {
    id: 'stacked',
    name: '经典上下居中（推荐）',
    desc: '正面在上方居中，反面在下方居中，留足裁剪与装订边距',
  },
  'side-by-side': {
    id: 'side-by-side',
    name: '横向左右并排',
    desc: '正反面在页面中上部左右排列，适合作业纸与简明材料',
  },
  compact: {
    id: 'compact',
    name: '紧凑置顶（下半页留白）',
    desc: '正反面紧凑排列在上半页，下半页预留大面积空白用于签字盖章',
  },
};

export type ColorFilterMode = 'color' | 'photocopy' | 'grayscale';

export interface RectMm {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface A4Placement {
  paperMm: { width: number; height: number };
  front: RectMm;
  back: RectMm;
}

export const A4_WIDTH_MM = 210.0;
export const A4_HEIGHT_MM = 297.0;

/** 毫米转 PDF 磅值 (72 pt / 25.4 mm) */
export function mmToPt(mm: number): number {
  return (mm / 25.4) * 72;
}

/** 毫米转指定 DPI 像素 */
export function mmToPx(mm: number, dpi: number = 300): number {
  return Math.round((mm / 25.4) * dpi);
}

/** 计算正面与反面在 A4 页面上的几何位置（毫米） */
export function calculateCardPlacement(
  presetId: CardPresetId = 'id-card',
  layout: LayoutMode = 'stacked',
): A4Placement {
  const preset = CARD_PRESETS[presetId] || CARD_PRESETS['id-card'];
  const w = preset.widthMm;
  const h = preset.heightMm;

  if (layout === 'stacked') {
    const x = (A4_WIDTH_MM - w) / 2;
    // 居中上下分布，正面距顶 45mm，两张间隔 35mm
    const topY = 46.0;
    const gap = 34.0;
    const bottomY = topY + h + gap;
    return {
      paperMm: { width: A4_WIDTH_MM, height: A4_HEIGHT_MM },
      front: { x, y: topY, width: w, height: h },
      back: { x, y: bottomY, width: w, height: h },
    };
  }

  if (layout === 'side-by-side') {
    const gap = 12.0;
    const totalW = w * 2 + gap;
    const startX = (A4_WIDTH_MM - totalW) / 2;
    const y = 60.0;
    return {
      paperMm: { width: A4_WIDTH_MM, height: A4_HEIGHT_MM },
      front: { x: startX, y, width: w, height: h },
      back: { x: startX + w + gap, y, width: w, height: h },
    };
  }

  // compact 紧凑置顶
  const x = (A4_WIDTH_MM - w) / 2;
  const topY = 25.0;
  const gap = 18.0;
  const bottomY = topY + h + gap;
  return {
    paperMm: { width: A4_WIDTH_MM, height: A4_HEIGHT_MM },
    front: { x, y: topY, width: w, height: h },
    back: { x, y: bottomY, width: w, height: h },
  };
}

export const WATERMARK_PRESETS = [
  '仅供大学评奖评优核验使用 他用无效',
  '仅供勤工助学兼职入职签约 他用无效',
  '仅供校园网与宿舍宽带开户 他用无效',
  '仅供全国英语四六级报名审核 他用无效',
  '仅供考研复试资格审查使用 他用无效',
  '仅供高校社团注册登记使用 他用无效',
] as const;

export type WatermarkColor = 'gray' | 'red' | 'blue';

export interface WatermarkOptions {
  enabled: boolean;
  text: string;
  color: WatermarkColor;
  density: 'standard' | 'dense';
}

export const DEFAULT_WATERMARK: WatermarkOptions = {
  enabled: true,
  text: WATERMARK_PRESETS[0],
  color: 'gray',
  density: 'standard',
};

export function normalizeWatermarkText(text: string): string {
  const clean = text.trim();
  if (!clean) return '仅供个人证件复印核验使用 他用无效';
  return clean.slice(0, 48);
}

/** 像素色彩过滤：原色、黑白复印（去灰底增强对比）、灰度 */
export function applyColorFilterToPixels(
  pixels: Uint8ClampedArray,
  filter: ColorFilterMode,
): void {
  if (filter === 'color') return;

  const len = pixels.length;
  for (let i = 0; i < len; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    // 标准亮度灰度换算公式 (ITU-R BT.601)
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    if (filter === 'grayscale') {
      pixels[i] = gray;
      pixels[i + 1] = gray;
      pixels[i + 2] = gray;
    } else if (filter === 'photocopy') {
      // 复印机模式：拉伸对比度，灰白色背景直接变白，深色文字加深，避免大片灰底耗墨
      let val: number;
      if (gray > 200) {
        val = 255;
      } else if (gray < 85) {
        val = Math.max(0, gray - 20);
      } else {
        // 中间色调适度高对比映射
        val = Math.round(((gray - 85) / 115) * 190 + 65);
      }
      pixels[i] = val;
      pixels[i + 1] = val;
      pixels[i + 2] = val;
    }
  }
}

/**
 * 纯端侧基于 pdf-lib 生成标准 1:1 A4 尺寸 PDF。
 * A4 尺寸为 595.28 × 841.89 pt。
 * 打印时选择「实际大小 / 100%」，物理尺寸分毫不差。
 */
export async function generateA4PdfFromImage(
  imageBytes: Uint8Array,
  mime: 'image/png' | 'image/jpeg' = 'image/jpeg',
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // 标准 A4 页面大小 (points)
  const a4WidthPt = mmToPt(A4_WIDTH_MM);
  const a4HeightPt = mmToPt(A4_HEIGHT_MM);

  const page = doc.addPage([a4WidthPt, a4HeightPt]);

  let embeddedImage;
  if (mime === 'image/png') {
    embeddedImage = await doc.embedPng(imageBytes);
  } else {
    embeddedImage = await doc.embedJpg(imageBytes);
  }

  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width: a4WidthPt,
    height: a4HeightPt,
  });

  doc.setTitle('A4证件拼版复印件_NOVIP');
  doc.setCreator('NOVIP (https://novip.site) - 纯端侧保护隐私');

  return await doc.save();
}

/**
 * 生成国风脱敏示范样卡（SVG Data URL），用于用户未上传文件时即刻体验与新手预览。
 */
export function getMockCardSvg(side: 'front' | 'back', presetId: CardPresetId = 'id-card'): string {
  const preset = CARD_PRESETS[presetId] || CARD_PRESETS['id-card'];
  const isId = presetId === 'id-card';

  if (side === 'front') {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 428 270" width="428" height="270">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fdfbf7"/>
            <stop offset="100%" stop-color="#ebf1f5"/>
          </linearGradient>
          <filter id="shadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.15"/>
          </filter>
        </defs>
        <rect width="428" height="270" rx="14" fill="url(#bg)" stroke="#b5c4d1" stroke-width="1.5"/>
        <!-- 装饰底纹 -->
        <rect x="22" y="24" width="384" height="222" rx="8" fill="none" stroke="#dbe4ec" stroke-dasharray="4 4" stroke-width="1"/>
        <text x="36" y="58" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0066cc">${isId ? '姓名' : '持证人'}</text>
        <text x="76" y="58" font-family="sans-serif" font-size="16" font-weight="bold" fill="#111827">张小新 (示范样例)</text>
        
        <text x="36" y="96" font-family="sans-serif" font-size="13" fill="#64748b">性别</text>
        <text x="76" y="96" font-family="sans-serif" font-size="14" fill="#1e293b">男</text>
        <text x="130" y="96" font-family="sans-serif" font-size="13" fill="#64748b">民族</text>
        <text x="170" y="96" font-family="sans-serif" font-size="14" fill="#1e293b">汉</text>

        <text x="36" y="134" font-family="sans-serif" font-size="13" fill="#64748b">出生</text>
        <text x="76" y="134" font-family="sans-serif" font-size="14" fill="#1e293b">2004 年 9 月 1 日</text>

        <text x="36" y="172" font-family="sans-serif" font-size="13" fill="#64748b">住址</text>
        <text x="76" y="172" font-family="sans-serif" font-size="13" fill="#1e293b">北京市海淀区学院路 30 号</text>
        <text x="76" y="192" font-family="sans-serif" font-size="13" fill="#1e293b">高校示范园区</text>

        <text x="36" y="238" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0066cc">公民身份号码</text>
        <text x="136" y="238" font-family="monospace" font-size="15" font-weight="bold" fill="#0f172a">11010820040901XXXX</text>

        <!-- 模拟头像区域 -->
        <rect x="294" y="44" width="102" height="136" rx="6" fill="#e2e8f0" stroke="#cbd5e1"/>
        <circle cx="345" cy="94" r="28" fill="#94a3b8"/>
        <path d="M310 162 C310 132, 380 132, 380 162 Z" fill="#94a3b8"/>
        <text x="345" y="174" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#64748b">标准人像面</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  // back 国徽与签发机关面
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 428 270" width="428" height="270">
      <defs>
        <linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff8f8"/>
          <stop offset="100%" stop-color="#f5e8e8"/>
        </linearGradient>
      </defs>
      <rect width="428" height="270" rx="14" fill="url(#bg2)" stroke="#e2b8b8" stroke-width="1.5"/>
      <rect x="22" y="24" width="384" height="222" rx="8" fill="none" stroke="#eed4d4" stroke-dasharray="4 4" stroke-width="1"/>

      <!-- 模拟国徽与长城纹理 -->
      <circle cx="82" cy="80" r="34" fill="#fee2e2" stroke="#dc2626" stroke-width="2"/>
      <polygon points="82,56 89,76 108,76 93,88 98,107 82,96 66,107 71,88 56,76 75,76" fill="#dc2626"/>

      <text x="134" y="74" font-family="sans-serif" font-size="20" font-weight="bold" fill="#dc2626" letter-spacing="4">中华人民共和国</text>
      <text x="134" y="102" font-family="sans-serif" font-size="22" font-weight="bold" fill="#dc2626" letter-spacing="6">居民身份证</text>

      <text x="46" y="174" font-family="sans-serif" font-size="14" fill="#64748b">签发机关</text>
      <text x="118" y="174" font-family="sans-serif" font-size="15" fill="#1e293b">北京市公安局海淀分局</text>

      <text x="46" y="214" font-family="sans-serif" font-size="14" fill="#64748b">有效期限</text>
      <text x="118" y="214" font-family="sans-serif" font-size="15" fill="#1e293b">2020.09.01 - 2030.09.01</text>

      <text x="340" y="244" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#991b1b">国徽印章面</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
