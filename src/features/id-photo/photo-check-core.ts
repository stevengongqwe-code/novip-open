export interface PhotoTransferData {
  file?: File;
  width?: number;
  height?: number;
  limitKB?: number;
  source?: 'photo-check';
}

let pendingTransfer: PhotoTransferData | null = null;

export function setPhotoTransfer(data: PhotoTransferData): void {
  pendingTransfer = data;
}

export function consumePhotoTransfer(): PhotoTransferData | null {
  const cur = pendingTransfer;
  pendingTransfer = null;
  return cur;
}

export function getPendingPhotoTransfer(): PhotoTransferData | null {
  return pendingTransfer;
}

export interface PhotoDiagnosisCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  summary: string;
  advice?: string;
}

export interface PhotoDiagnosisResult {
  score: number; // 0 - 100
  overall: 'pass' | 'need_fix';
  overallMessage: string;
  width: number;
  height: number;
  sizeBytes: number;
  mime: string;
  aspectRatio: number;
  bgColorName: '白底' | '蓝底' | '红底' | '复杂/非纯色底';
  bgColorHex: string;
  bgIsUniform: boolean;
  checks: PhotoDiagnosisCheck[];
  suggestedAction?: 'crop_and_compress' | 'change_background' | 'convert_jpg' | 'ready';
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** 颜色距离计算（欧式距离） */
export function colorDistance(c1: RgbColor, c2: RgbColor): number {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

/** 识别主底色类型 */
export function identifyBgColorType(samples: RgbColor[]): {
  type: '白底' | '蓝底' | '红底' | '复杂/非纯色底';
  hex: string;
  isUniform: boolean;
} {
  if (!samples.length) {
    return {type: '复杂/非纯色底', hex: '#ffffff', isUniform: false};
  }

  // 计算平均颜色
  const avg = samples.reduce(
    (acc, cur) => ({r: acc.r + cur.r, g: acc.g + cur.g, b: cur.b + acc.b}),
    {r: 0, g: 0, b: 0}
  );
  avg.r = Math.round(avg.r / samples.length);
  avg.g = Math.round(avg.g / samples.length);
  avg.b = Math.round(avg.b / samples.length);

  const hex = `#${((1 << 24) + (avg.r << 16) + (avg.g << 8) + avg.b).toString(16).slice(1)}`;

  // 计算各采样点与均值的最大距离与方差
  const distances = samples.map(s => colorDistance(s, avg));
  const maxDist = Math.max(...distances);
  const isUniform = maxDist < 55; // 边缘容差

  // 判断是否白底（高亮度、低饱和度）
  if (avg.r > 215 && avg.g > 215 && avg.b > 215) {
    return {type: isUniform ? '白底' : '复杂/非纯色底', hex, isUniform};
  }

  // 判断是否蓝底（蓝色分量显著高于红色与绿色）
  if (avg.b > 120 && avg.b > avg.r + 30 && avg.b > avg.g + 15) {
    return {type: isUniform ? '蓝底' : '复杂/非纯色底', hex, isUniform};
  }

  // 判断是否红底（红色分量显著高）
  if (avg.r > 150 && avg.r > avg.g + 50 && avg.r > avg.b + 50) {
    return {type: isUniform ? '红底' : '复杂/非纯色底', hex, isUniform};
  }

  return {type: '复杂/非纯色底', hex, isUniform: false};
}

/**
 * 证件照规则体检纯函数（覆盖四六级、教资、考研、国考等主流规范）
 */
export function diagnosePhoto(
  width: number,
  height: number,
  sizeBytes: number,
  mime: string,
  samples: RgbColor[]
): PhotoDiagnosisResult {
  const checks: PhotoDiagnosisCheck[] = [];
  const ratio = width / Math.max(1, height);
  const sizeKB = Math.round(sizeBytes / 1024);

  // 1. 格式检查 (绝大多数系统只支持 JPG/JPEG)
  const isJpg = mime === 'image/jpeg' || mime === 'image/jpg';
  if (isJpg) {
    checks.push({
      id: 'format',
      label: '文件格式',
      status: 'pass',
      summary: `标准 JPG 格式 (${mime})`,
    });
  } else {
    checks.push({
      id: 'format',
      label: '文件格式',
      status: 'fail',
      summary: `当前为 ${mime}，非标准 JPG`,
      advice: '绝大多数报名系统（学信网/教资/考研）强制要求 JPG/JPEG 格式，请转为 JPG。',
    });
  }

  // 2. 文件体积检查 (通常要求 10KB ~ 100KB 或 ≤ 200KB)
  if (sizeKB < 10) {
    checks.push({
      id: 'size',
      label: '文件大小',
      status: 'fail',
      summary: `${sizeKB} KB (小于 10KB)`,
      advice: '文件过小，图片可能过于模糊或被过度压缩，无法通过系统清晰度审核。',
    });
  } else if (sizeKB <= 100) {
    checks.push({
      id: 'size',
      label: '文件大小',
      status: 'pass',
      summary: `${sizeKB} KB (符合最严格的 ≤ 100KB 规范)`,
    });
  } else if (sizeKB <= 200) {
    checks.push({
      id: 'size',
      label: '文件大小',
      status: 'warn',
      summary: `${sizeKB} KB (在 100KB-200KB 之间)`,
      advice: '部分要求较严的考试（如四六级、普通话）要求 ≤ 100KB，建议一键压缩至 100KB 以内。',
    });
  } else {
    checks.push({
      id: 'size',
      label: '文件大小',
      status: 'fail',
      summary: `${sizeKB} KB (超过 200KB)`,
      advice: '文件过大，无法直接上传到绝大多数报名系统，请压缩。',
    });
  }

  // 3. 比例与规格检查 (标准证件照比例约为 3:4，如 480×640、295×413、358×441 等)
  const isStandardRatio = ratio >= 0.7 && ratio <= 0.77;
  const isExact480x640 = width === 480 && height === 640;
  const isExact1Inch = (width === 295 && height === 413) || (width === 260 && height === 378);

  if (isExact480x640) {
    checks.push({
      id: 'dimension',
      label: '像素规格',
      status: 'pass',
      summary: `${width} × ${height} px（完美匹配四六级/考研/教资标准 480×640）`,
    });
  } else if (isExact1Inch) {
    checks.push({
      id: 'dimension',
      label: '像素规格',
      status: 'pass',
      summary: `${width} × ${height} px（标准 1 寸规格）`,
    });
  } else if (isStandardRatio) {
    checks.push({
      id: 'dimension',
      label: '像素规格',
      status: 'pass',
      summary: `${width} × ${height} px（标准 3:4 纵向证件照比例）`,
    });
  } else if (ratio > 0.95 && ratio < 1.05) {
    checks.push({
      id: 'dimension',
      label: '像素规格',
      status: 'warn',
      summary: `${width} × ${height} px（正方形 1:1 照片）`,
      advice: '常见于社保卡或部分外企申请，但四六级与学信网要求 3:4 矩形，建议按规范裁剪。',
    });
  } else if (width > height) {
    checks.push({
      id: 'dimension',
      label: '像素规格',
      status: 'fail',
      summary: `${width} × ${height} px（横向照片）`,
      advice: '证件照必须为竖向照片，当前为横向，系统将直接驳回。',
    });
  } else {
    checks.push({
      id: 'dimension',
      label: '像素规格',
      status: 'warn',
      summary: `${width} × ${height} px（比例为 ${(ratio).toFixed(2)}，略偏离 3:4）`,
      advice: '建议裁切至标准 480×640 像素或 1 寸/2 寸规格。',
    });
  }

  // 4. 底色分析
  const bg = identifyBgColorType(samples);
  if (bg.type === '白底' || bg.type === '蓝底' || bg.type === '红底') {
    checks.push({
      id: 'bgcolor',
      label: '背景底色',
      status: 'pass',
      summary: `检测为标准【${bg.type}】(色值 ${bg.hex}，纯净度优)`,
    });
  } else {
    checks.push({
      id: 'bgcolor',
      label: '背景底色',
      status: 'warn',
      summary: `背景可能为复杂生活背景或杂色（色值 ${bg.hex}）`,
      advice: '大多数官方报名要求纯白、纯蓝或纯红纯色底；若为生活照背景，可能审核不通过。',
    });
  }

  // 5. 综合评分与建议
  const fails = checks.filter(c => c.status === 'fail');
  const warns = checks.filter(c => c.status === 'warn');

  let score = 100 - fails.length * 35 - warns.length * 15;
  score = Math.max(10, Math.min(100, score));

  let overall: 'pass' | 'need_fix' = 'pass';
  let overallMessage = '照片整体符合常见报名规范，可直接尝试上传！';
  let suggestedAction: PhotoDiagnosisResult['suggestedAction'] = 'ready';

  if (fails.length > 0 || warns.length >= 2) {
    overall = 'need_fix';
    if (fails.some(f => f.id === 'format') || fails.some(f => f.id === 'size') || fails.some(f => f.id === 'dimension')) {
      suggestedAction = 'crop_and_compress';
      overallMessage = '照片存在不符合项，建议点击下方【一键修复并下载】或使用裁剪工具调整。';
    } else if (warns.some(w => w.id === 'bgcolor')) {
      suggestedAction = 'change_background';
      overallMessage = '照片尺寸尚可，但背景可能不是纯色底，建议前往换底工具处理。';
    } else {
      suggestedAction = 'crop_and_compress';
      overallMessage = '照片需要微调以确保 100% 通过报名系统审核。';
    }
  }

  return {
    score,
    overall,
    overallMessage,
    width,
    height,
    sizeBytes,
    mime,
    aspectRatio: ratio,
    bgColorName: bg.type,
    bgColorHex: bg.hex,
    bgIsUniform: bg.isUniform,
    checks,
    suggestedAction,
  };
}
