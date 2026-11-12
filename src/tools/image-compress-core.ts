/**
 * image-compress-core.ts
 * NOVIP 图片精准压缩核心引擎 (Squoosh 级端侧算法)
 * 支持指定 KB 目标二分搜索、WebP/JPEG/PNG 格式自适应、无 CSS 依赖，便于 Node.js 与浏览器测试
 */

export type CompressFormat = 'image/jpeg' | 'image/webp' | 'image/png';

export interface TargetPreset {
  id: string;
  name: string;
  targetKb: number;
  description: string;
}

export const TARGET_PRESETS: TargetPreset[] = [
  { id: '50kb', name: '严格 ≤ 50KB', targetKb: 50, description: '考研网 / 少数省份教务报名严苛限制' },
  { id: '100kb', name: '标准 ≤ 100KB', targetKb: 100, description: '四六级 / 学信网 / 国家公务员考试标准' },
  { id: '200kb', name: '通用 ≤ 200KB', targetKb: 200, description: '毕业设计系统 / 学位论文管理系统' },
  { id: '500kb', name: '高清 ≤ 500KB', targetKb: 500, description: '班委收作业 / 实验报告配图 / 邮件附件' },
  { id: '1mb', name: '超清 ≤ 1MB', targetKb: 1024, description: '学术海报 / 答辩展示大图' },
];

export interface CompressOptions {
  format: CompressFormat;
  quality: number;          // 0.05 - 1.0
  maxWidth?: number;
  maxHeight?: number;
  targetBytes?: number;     // 如设置，则启用二分逼近
}

export interface CompressResultStats {
  originalBytes: number;
  compressedBytes: number;
  savedBytes: number;
  compressionRatio: number; // 0 - 100
  ratioPercent: string;     // e.g. "-78.5%"
  originalWidth: number;
  originalHeight: number;
  outputWidth: number;
  outputHeight: number;
  format: CompressFormat;
  quality: number;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

export function calcCompressionRatio(originalBytes: number, compressedBytes: number): {
  savedBytes: number;
  ratio: number;
  percent: string;
} {
  if (originalBytes <= 0) return { savedBytes: 0, ratio: 0, percent: '0%' };
  const saved = Math.max(0, originalBytes - compressedBytes);
  const ratio = (saved / originalBytes) * 100;
  const isReduced = compressedBytes < originalBytes;
  return {
    savedBytes: saved,
    ratio: Math.round(ratio * 10) / 10,
    percent: isReduced ? `-${(ratio).toFixed(1)}%` : `+${((compressedBytes / originalBytes - 1) * 100).toFixed(1)}%`,
  };
}

/**
 * 等比例缩放尺寸计算
 */
export function calculateFitDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth?: number,
  maxHeight?: number,
): { width: number; height: number; scale: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    throw new Error('原始图片尺寸无效。');
  }

  let scale = 1.0;
  if (maxWidth && maxWidth > 0 && srcWidth * scale > maxWidth) {
    scale = maxWidth / srcWidth;
  }
  if (maxHeight && maxHeight > 0 && srcHeight * scale > maxHeight) {
    scale = Math.min(scale, maxHeight / srcHeight);
  }

  // 约束在 16px - 8192px 之间
  const width = Math.max(16, Math.min(8192, Math.round(srcWidth * scale)));
  const height = Math.max(16, Math.min(8192, Math.round(srcHeight * scale)));

  return { width, height, scale };
}

/**
 * 模拟 / 算法估算：针对二分搜索的步长逼近策略
 * 在给定目标大小 targetBytes 时，在 [minQ, maxQ] 与尺度 scale 之间寻找最佳收敛点
 */
export function planCompressionSteps(
  rawBytes: number,
  targetBytes: number,
  currentWidth: number,
  currentHeight: number,
): { targetQuality: number; scaleFactor: number; estimatedIterations: number } {
  if (targetBytes <= 0) throw new Error('目标文件大小必须大于 0。');
  if (rawBytes <= targetBytes) {
    return { targetQuality: 0.92, scaleFactor: 1.0, estimatedIterations: 1 };
  }

  const ratioNeeded = targetBytes / rawBytes;
  let targetQuality = 0.85;
  let scaleFactor = 1.0;

  if (ratioNeeded < 0.1) {
    // 压缩比需要大幅降低（>90% 降幅），需结合分辨率缩小与低质量
    scaleFactor = Math.max(0.4, Math.sqrt(ratioNeeded * 1.8));
    targetQuality = Math.max(0.45, Math.min(0.75, ratioNeeded * 4));
  } else if (ratioNeeded < 0.3) {
    scaleFactor = Math.max(0.65, Math.sqrt(ratioNeeded * 1.4));
    targetQuality = Math.max(0.6, Math.min(0.82, ratioNeeded * 2));
  } else {
    // 仅需微调质量即可达成
    scaleFactor = 1.0;
    targetQuality = Math.max(0.5, Math.min(0.88, ratioNeeded * 0.95));
  }

  return {
    targetQuality: Math.round(targetQuality * 100) / 100,
    scaleFactor: Math.round(scaleFactor * 100) / 100,
    estimatedIterations: 5,
  };
}
