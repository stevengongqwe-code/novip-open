import {zipSync, zlibSync} from 'fflate';
import {zipEntries} from '../conversion/files';

// PPTX 图片与素材一键提取核心：
// 1. 解析 ppt/media/* 与 ppt/slides/_rels/slide*.xml.rels，建立「图片 <-> 幻灯片页码」映射；
// 2. 纯字节解析 PNG / JPEG / GIF / WebP / SVG 宽高与真实 MIME，不依赖服务端；
// 3. 计算内容指纹识别课件模板中的重复背景/校徽，支持一键去重、小图标过滤与 ZIP + CSV 清单导出。

export const PPT_EXTRACT_LIMITS = {
  maxBytes: 40 * 1024 * 1024,
  maxMediaCount: 500,
} as const;

export type ExtractedImageFormat = 'png' | 'jpeg' | 'gif' | 'webp' | 'svg' | 'other';

export interface ExtractedPptMedia {
  id: string;
  mediaPath: string;
  fileName: string;
  ext: string;
  format: ExtractedImageFormat;
  mime: string;
  size: number;
  width: number;
  height: number;
  supported: boolean;
  fingerprint: string;
  isDuplicate: boolean;
  duplicateOf?: string;
  slides: number[];
  bytes: Uint8Array;
}

export interface PptExtractInspectResult {
  slideCount: number;
  totalMediaCount: number;
  supportedCount: number;
  uniqueSupportedCount: number;
  duplicateCount: number;
  items: ExtractedPptMedia[];
}

export interface PptExtractFilterOptions {
  deduplicate: boolean;
  minEdgePx: number;
  minBytes: number;
  slideFilter: number | 'all';
}

export const PPT_EXTRACT_FILTER_DEFAULTS: PptExtractFilterOptions = {
  deduplicate: true,
  minEdgePx: 0,
  minBytes: 0,
  slideFilter: 'all',
};

/** 计算确定性的双 32 位 FNV-1a 内容指纹（附带字节长度），用于快速无碰撞检测重复图片。 */
export function fingerprintBytes(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h1 ^= b;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= b ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `${bytes.length.toString(16)}-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/** 从图片文件头纯函数嗅探真实格式与像素宽高（支持 PNG / JPEG / GIF / WebP / SVG）。 */
export function sniffImageMeta(
  bytes: Uint8Array,
  fileName: string,
): {format: ExtractedImageFormat; mime: string; ext: string; width: number; height: number; supported: boolean} {
  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR at offset 16..24
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return {format: 'png', mime: 'image/png', ext: 'png', width, height, supported: width > 0 && height > 0};
  }

  // 2. JPEG: FF D8 ... SOF markers (C0..CF except C4, C8, CC)
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    let width = 0;
    let height = 0;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segLen < 2 || offset + 2 + segLen > bytes.length) break;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        break;
      }
      offset += 2 + segLen;
    }
    return {format: 'jpeg', mime: 'image/jpeg', ext: 'jpg', width, height, supported: true};
  }

  // 3. GIF: GIF87a / GIF89a
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    return {format: 'gif', mime: 'image/gif', ext: 'gif', width, height, supported: width > 0 && height > 0};
  }

  // 4. WebP: RIFF....WEBP
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    let width = 0;
    let height = 0;
    const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunkType === 'VP8X' && bytes.length >= 30) {
      width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    } else if (chunkType === 'VP8 ' && bytes.length >= 30) {
      width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    } else if (chunkType === 'VP8L' && bytes.length >= 25) {
      const b0 = bytes[21];
      const b1 = bytes[22];
      const b2 = bytes[23];
      const b3 = bytes[24];
      width = 1 + (((b1 & 0x3f) << 8) | b0);
      height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    }
    return {format: 'webp', mime: 'image/webp', ext: 'webp', width, height, supported: true};
  }

  // 5. SVG: 检查前 1024 字节是否含 <svg
  if (/\.svg$/i.test(fileName)) {
    const head = new TextDecoder('utf-8', {fatal: false}).decode(bytes.subarray(0, Math.min(bytes.length, 2048)));
    if (/<svg[\s>]/i.test(head)) {
      let width = 0;
      let height = 0;
      const vb = /viewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i.exec(head);
      if (vb) {
        width = Math.round(Number(vb[1])) || 0;
        height = Math.round(Number(vb[2])) || 0;
      } else {
        const wMatch = /\bwidth\s*=\s*["'](\d+(?:\.\d+)?)/i.exec(head);
        const hMatch = /\bheight\s*=\s*["'](\d+(?:\.\d+)?)/i.exec(head);
        width = wMatch ? Math.round(Number(wMatch[1])) : 0;
        height = hMatch ? Math.round(Number(hMatch[1])) : 0;
      }
      return {format: 'svg', mime: 'image/svg+xml', ext: 'svg', width, height, supported: true};
    }
  }

  const extMatch = /\.([a-z0-9]+)$/i.exec(fileName);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
  return {format: 'other', mime: 'application/octet-stream', ext, width: 0, height: 0, supported: false};
}

/** 解析 ppt/slides/_rels/slideN.xml.rels，建立媒体路径 -> 幻灯片页码列表映射。 */
function mapMediaToSlides(entries: Record<string, Uint8Array>): {slideCount: number; mediaSlides: Map<string, Set<number>>} {
  const mediaSlides = new Map<string, Set<number>>();
  let maxSlide = 0;
  const decoder = new TextDecoder('utf-8', {fatal: false});

  for (const name of Object.keys(entries)) {
    const slideMatch = /^ppt\/slides\/slide(\d+)\.xml$/i.exec(name);
    if (slideMatch) {
      maxSlide = Math.max(maxSlide, Number(slideMatch[1]));
      continue;
    }
    const relMatch = /^ppt\/slides\/_rels\/slide(\d+)\.xml\.rels$/i.exec(name);
    if (!relMatch) continue;
    const slideNo = Number(relMatch[1]);
    maxSlide = Math.max(maxSlide, slideNo);
    const xml = decoder.decode(entries[name]);
    const targetRegex = /Target\s*=\s*["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = targetRegex.exec(xml)) !== null) {
      const rawTarget = match[1].trim();
      const normalized = rawTarget
        .replace(/^\.\.\//, 'ppt/')
        .replace(/^\/+/, '');
      if (/^ppt\/media\/[^/]+$/i.test(normalized)) {
        let set = mediaSlides.get(normalized);
        if (!set) {
          set = new Set<number>();
          mediaSlides.set(normalized, set);
        }
        set.add(slideNo);
      }
    }
  }
  return {slideCount: maxSlide, mediaSlides};
}

/** 解包并分析 PPTX 内的全部媒体文件，标注尺寸、幻灯片页码与重复项。 */
export function inspectPptImages(bytes: Uint8Array): PptExtractInspectResult {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new Error('请先选择有效的 .pptx 课件文件。');
  }
  if (bytes.length > PPT_EXTRACT_LIMITS.maxBytes) {
    throw new Error('单个 PPTX 文件最多支持 40MB，请分拆课件后重试。');
  }
  let entries: Record<string, Uint8Array>;
  try {
    entries = zipEntries(bytes);
  } catch {
    throw new Error('无法解压该文件：请确认它是标准的 .pptx（而非旧版 .ppt 或加密文件）。');
  }
  if (!entries['ppt/presentation.xml'] || !entries['[Content_Types].xml']) {
    throw new Error('不是有效的 PPTX 演示文稿（缺少 presentation.xml 结构）。');
  }
  const names = Object.keys(entries);
  if (names.some((n) => n.startsWith('/') || n.split('/').includes('..'))) {
    throw new Error('压缩包路径包含不安全引用，已拒绝处理。');
  }

  const {slideCount, mediaSlides} = mapMediaToSlides(entries);
  const mediaNames = names
    .filter((n) => /^ppt\/media\/[^/]+$/i.test(n) && !n.endsWith('/'))
    .sort((a, b) => {
      const slidesA = mediaSlides.get(a);
      const slidesB = mediaSlides.get(b);
      const firstA = slidesA && slidesA.size > 0 ? Math.min(...slidesA) : 999999;
      const firstB = slidesB && slidesB.size > 0 ? Math.min(...slidesB) : 999999;
      if (firstA !== firstB) return firstA - firstB;
      const stemA = a.replace(/\.[^.]+$/, '');
      const stemB = b.replace(/\.[^.]+$/, '');
      return stemA.localeCompare(stemB, undefined, {numeric: true});
    });

  if (mediaNames.length > PPT_EXTRACT_LIMITS.maxMediaCount) {
    throw new Error(`PPTX 内嵌媒体超过 ${PPT_EXTRACT_LIMITS.maxMediaCount} 个上限。`);
  }

  const firstByFingerprint = new Map<string, ExtractedPptMedia>();
  const items: ExtractedPptMedia[] = [];

  for (const mediaPath of mediaNames) {
    const fileBytes = entries[mediaPath];
    const fileName = mediaPath.replace(/^ppt\/media\//i, '');
    const meta = sniffImageMeta(fileBytes, fileName);
    const fp = fingerprintBytes(fileBytes);
    const slides = [...(mediaSlides.get(mediaPath) ?? [])].sort((a, b) => a - b);

    const existing = meta.supported ? firstByFingerprint.get(fp) : undefined;
    if (existing) {
      // 将重复图片出现的幻灯片页码合并到首张原图上，确保去重后页码信息不丢失
      const mergedSlides = new Set([...existing.slides, ...slides]);
      existing.slides = [...mergedSlides].sort((a, b) => a - b);
    }

    const item: ExtractedPptMedia = {
      id: mediaPath,
      mediaPath,
      fileName,
      ext: meta.ext,
      format: meta.format,
      mime: meta.mime,
      size: fileBytes.length,
      width: meta.width,
      height: meta.height,
      supported: meta.supported,
      fingerprint: fp,
      isDuplicate: Boolean(existing),
      duplicateOf: existing?.fileName,
      slides,
      bytes: fileBytes,
    };

    if (meta.supported && !existing) {
      firstByFingerprint.set(fp, item);
    }
    items.push(item);
  }

  const supportedItems = items.filter((item) => item.supported);
  const duplicateCount = supportedItems.filter((item) => item.isDuplicate).length;

  return {
    slideCount,
    totalMediaCount: items.length,
    supportedCount: supportedItems.length,
    uniqueSupportedCount: supportedItems.length - duplicateCount,
    duplicateCount,
    items,
  };
}

/** 按去重、最小边长、最小字节数与指定幻灯片页码筛选可导出的图片。 */
export function filterExtractedImages(
  items: ExtractedPptMedia[],
  options: Partial<PptExtractFilterOptions> = {},
): ExtractedPptMedia[] {
  const deduplicate = options.deduplicate ?? PPT_EXTRACT_FILTER_DEFAULTS.deduplicate;
  const minEdgePx = Math.max(0, Number(options.minEdgePx ?? 0));
  const minBytes = Math.max(0, Number(options.minBytes ?? 0));
  const slideFilter = options.slideFilter ?? 'all';

  return items.filter((item) => {
    if (!item.supported) return false;
    if (deduplicate && item.isDuplicate) return false;
    if (minBytes > 0 && item.size < minBytes) return false;
    if (minEdgePx > 0 && item.width > 0 && item.height > 0 && Math.min(item.width, item.height) < minEdgePx) {
      return false;
    }
    if (slideFilter !== 'all' && !item.slides.includes(slideFilter)) {
      return false;
    }
    return true;
  });
}

/** 为提取出的图片生成带幻灯片页码前缀的规范文件名（如 P01-image1.png）。 */
export function buildExtractedImageName(item: ExtractedPptMedia, index: number): string {
  const base = item.fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_') || `image_${index + 1}`;
  const slidePrefix = item.slides.length > 0 ? `P${String(item.slides[0]).padStart(2, '0')}-` : '未引用-';
  return `${slidePrefix}${base}.${item.ext}`;
}

/** 将筛选后的图片与 UTF-8 BOM CSV 清单一起打包为 ZIP。 */
export function buildExtractedImagesZip(items: ExtractedPptMedia[], pptxName: string = 'courseware.pptx'): Uint8Array {
  if (!items.length) {
    throw new Error('当前筛选条件下没有可导出的图片。');
  }
  const entries: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();
  const csvRows: string[] = ['序号,导出文件名,原媒体路径,格式,宽(px),高(px),大小(Bytes),所在幻灯片页码'];

  items.forEach((item, idx) => {
    let outName = buildExtractedImageName(item, idx);
    let suffix = 2;
    while (usedNames.has(outName.toLowerCase())) {
      const stem = outName.replace(/\.[^.]+$/, '');
      outName = `${stem}_${suffix}.${item.ext}`;
      suffix++;
    }
    usedNames.add(outName.toLowerCase());
    entries[outName] = item.bytes;

    const slideText = item.slides.length > 0 ? item.slides.map((s) => `第${s}页`).join('/') : '母版或未直接引用';
    csvRows.push(
      `${idx + 1},"${outName}","${item.mediaPath}",${item.format.toUpperCase()},${item.width},${item.height},${item.size},"${slideText}"`,
    );
  });

  const cleanPptName = pptxName.replace(/\.pptx$/i, '').replace(/[\\/:*?"<>|]/g, '_') || 'courseware';
  const csvContent = '\ufeff' + csvRows.join('\r\n') + '\r\n';
  entries[`${cleanPptName}-图片提取清单.csv`] = new TextEncoder().encode(csvContent);

  return zipSync(entries, {level: 6});
}

/** 生成一个内置的 3 页教学示例 PPTX（含课程图表 PNG、重复校徽 PNG 与矢量公式图 SVG），用于一键体验与回归测试。 */
export function createSampleCoursewarePptx(): Uint8Array {
  const crc32 = (bytes: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const pngChunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length, false);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
    return out;
  };
  const makeMiniPng = (width: number, height: number, r: number, g: number, b: number): Uint8Array => {
    // 构造真实可被浏览器 <img> 解码的 2-bit 调色板 PNG（含边框与色块视觉层次，体积小且解码快）
    const ihdr = new Uint8Array(13);
    const iv = new DataView(ihdr.buffer);
    iv.setUint32(0, width, false);
    iv.setUint32(4, height, false);
    ihdr[8] = 2; // bit depth = 2 (4 palette colors)
    ihdr[9] = 3; // color type = 3 (indexed palette)
    const plte = new Uint8Array([
      248, 250, 252, // 0: background light
      r, g, b,       // 1: primary accent
      Math.min(255, r + 45), Math.min(255, g + 45), Math.min(255, b + 45), // 2: soft highlight
      30, 41, 59,    // 3: dark frame
    ]);
    const rowBytes = Math.ceil(width / 4);
    const raw = new Uint8Array((1 + rowBytes) * height);
    const borderX = Math.max(4, Math.floor(width * 0.06));
    const borderY = Math.max(4, Math.floor(height * 0.08));
    for (let y = 0; y < height; y++) {
      const rowOffset = y * (1 + rowBytes);
      raw[rowOffset] = 0; // filter: None
      const inVertCard = y >= borderY && y < height - borderY;
      const inHeaderBand = y >= borderY && y < Math.floor(height * 0.34);
      for (let bx = 0; bx < rowBytes; bx++) {
        let byte = 0;
        for (let p = 0; p < 4; p++) {
          const x = bx * 4 + p;
          let colorIdx = 0;
          if (inVertCard && x >= borderX && x < width - borderX) {
            colorIdx = inHeaderBand ? 1 : (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0 ? 2 : 0;
          }
          byte = (byte << 2) | (colorIdx & 3);
        }
        raw[rowOffset + 1 + bx] = byte;
      }
    }
    const idat = zlibSync(raw, {level: 1});
    const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const cIhdr = pngChunk('IHDR', ihdr);
    const cPlte = pngChunk('PLTE', plte);
    const cIdat = pngChunk('IDAT', idat);
    const cIend = pngChunk('IEND', new Uint8Array(0));
    const total = sig.length + cIhdr.length + cPlte.length + cIdat.length + cIend.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of [sig, cIhdr, cPlte, cIdat, cIend]) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  };

  const chartPng = makeMiniPng(1280, 720, 29, 78, 216);
  const badgePng = makeMiniPng(96, 96, 201, 35, 44);
  const diagramSvg = new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450"><rect width="800" height="450" fill="#f8fafc"/><circle cx="220" cy="225" r="110" fill="#fee2e2" stroke="#c9232c" stroke-width="6"/><rect x="420" y="115" width="260" height="220" rx="18" fill="#dbeafe" stroke="#1d4ed8" stroke-width="6"/><text x="400" y="60" text-anchor="middle" font-size="26" fill="#0f172a">课程实验原理示意图 (SVG 原图)</text></svg>`,
  );

  const enc = (str: string) => new TextEncoder().encode(str);
  return zipSync(
    {
      '[Content_Types].xml': enc(
        `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="svg" ContentType="image/svg+xml"/></Types>`,
      ),
      '_rels/.rels': enc(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
      ),
      'ppt/presentation.xml': enc(
        `<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256"/><p:sldId id="257"/><p:sldId id="258"/></p:sldIdLst></p:presentation>`,
      ),
      'ppt/slides/slide1.xml': enc(`<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`),
      'ppt/slides/slide2.xml': enc(`<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`),
      'ppt/slides/slide3.xml': enc(`<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`),
      'ppt/slides/_rels/slide1.xml.rels': enc(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="../media/image1.png"/><Relationship Id="rId2" Target="../media/logo_badge.png"/></Relationships>`,
      ),
      'ppt/slides/_rels/slide2.xml.rels': enc(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="../media/diagram.svg"/><Relationship Id="rId2" Target="../media/logo_badge_copy.png"/></Relationships>`,
      ),
      'ppt/slides/_rels/slide3.xml.rels': enc(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>`,
      ),
      'ppt/media/image1.png': chartPng,
      'ppt/media/logo_badge.png': badgePng,
      'ppt/media/logo_badge_copy.png': badgePng, // 与 logo_badge.png 完全相同的重复图片
      'ppt/media/diagram.svg': diagramSvg,
    },
    {level: 6},
  );
}
