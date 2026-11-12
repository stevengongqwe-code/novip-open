import {PDFDocument} from 'pdf-lib';

export const PDF_COMPRESS_LIMITS = {
  recommendedBytes: 50 * 1024 * 1024,  // 50 MB 推荐上限（防移动端内存溢出）
  maxSingleBytes: 100 * 1024 * 1024,   // 100 MB 极限上限
  maxTotalBytes: 200 * 1024 * 1024,    // 200 MB 总上限
  maxPages: 200,                       // 最多 200 页（防长时间阻塞和 Canvas 内存溢出）
  maxPixelsPerPage: 16_000_000,        // 单页最大 1600 万像素防 OOM
} as const;

export type CompressTier = 'light' | 'recommended' | 'extreme' | 'lossless';

export interface TierConfig {
  id: CompressTier;
  label: string;
  badge: string;
  dpi: number;
  quality: number;
  isLossy: boolean;
  lossyNotice: string;
  description: string;
}

export const COMPRESS_TIERS: Record<CompressTier, TierConfig> = {
  light: {
    id: 'light',
    label: '轻度压缩',
    badge: '微损 · 优先画质',
    dpi: 150,
    quality: 0.85,
    isLossy: true,
    lossyNotice: '微损压缩：重采样为 150 DPI 高清图像，文字不可选，肉眼几乎无损。适合精细图表、公式或需清晰打印的文件。',
    description: '150 DPI · 优质 JPEG，保留锐利边缘，适合打印与精细图表。',
  },
  recommended: {
    id: 'recommended',
    label: '推荐压缩',
    badge: '平衡 · 推荐日常',
    dpi: 120,
    quality: 0.75,
    isLossy: true,
    lossyNotice: '轻度有损：重采样为 120 DPI 平衡图像，文字不可选。兼顾极佳清晰度与可观体积瘦身，推荐作业、邮箱与办事申报。',
    description: '120 DPI · 标准 JPEG，体积与清晰度黄金比例，日常最推荐。',
  },
  extreme: {
    id: 'extreme',
    label: '极限压缩',
    badge: '强力 · 最小体积',
    dpi: 96,
    quality: 0.60,
    isLossy: true,
    lossyNotice: '明显有损：重采样为 96 DPI 高压缩图像，图片有可见压缩痕迹，文字不可选。专为突破严格体积限制（如 ≤2MB/5MB）急救设计。',
    description: '96 DPI · 紧凑 JPEG，强力瘦身，适合限制 ≤2MB/5MB 的上传系统。',
  },
  lossless: {
    id: 'lossless',
    label: '结构优化',
    badge: '100% 无损 · 保留文字',
    dpi: 0,
    quality: 1.0,
    isLossy: false,
    lossyNotice: '完全无损：重构对象流、移除未引用孤立结构与无用元数据，100% 保留所有矢量文字、链接与可搜索性。',
    description: '仅优化 PDF 内部结构与对象流，完全无损，保留矢量文字。',
  },
};

export interface PdfSummary {
  pageCount: number;
  byteLength: number;
}

export interface CompressResult {
  bytes: Uint8Array;
  originalBytes: number;
  compressedBytes: number;
  finalBytes: number;
  savedBytes: number;
  savedPercent: number;
  isSaved: boolean;
  keptOriginal: boolean;
  notice: string;
  tier: CompressTier;
  isLossy: boolean;
  pageCount: number;
}

export type PageRasterizer = (
  bytes: Uint8Array,
  tier: TierConfig,
  onProgress?: (current: number, total: number) => void,
  check?: () => void
) => Promise<Uint8Array>;

export interface CompressOptions {
  tier?: CompressTier;
  rasterizer?: PageRasterizer;
  check?: () => void;
  onProgress?: (current: number, total: number) => void;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function compressedPdfName(fileName: string): string {
  const base = String(fileName || 'document').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'document';
  return `${base}-已压缩.pdf`;
}

export function assertPdfBytes(bytes: Uint8Array, maxBytes: number = PDF_COMPRESS_LIMITS.maxSingleBytes): void {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new Error('文件为空或不是有效PDF。');
  }
  if (bytes.length < 8) {
    throw new Error('文件太小，不是有效PDF。');
  }
  if (bytes.length > maxBytes) {
    const limitMb = Math.round(maxBytes / 1024 / 1024);
    const limitText = limitMb >= 1 ? `${limitMb}MB` : formatBytes(maxBytes);
    throw new Error(`PDF文件过大（超过 ${limitText} 极限上限）。建议先拆分后再处理。`);
  }
  let header = false;
  for (let i = 0; i < Math.min(bytes.length, 1024) - 4; i++) {
    if (bytes[i] === 0x25 && bytes[i+1] === 0x50 && bytes[i+2] === 0x44 && bytes[i+3] === 0x46 && bytes[i+4] === 0x2d) {
      header = true;
      break;
    }
  }
  if (!header) {
    throw new Error('这不是PDF文件（缺少 %PDF- 文件头），请确认文件未损坏。');
  }
}

export async function inspectPdf(bytes: Uint8Array): Promise<PdfSummary> {
  assertPdfBytes(bytes);
  let pageCount: number;
  try {
    const doc = await PDFDocument.load(bytes, {updateMetadata: false});
    if (doc.isEncrypted) {
      throw new Error('PDF已加密，请先在阅读器中解除密码保护再处理。');
    }
    pageCount = doc.getPageCount();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/encrypt|password/i.test(msg)) {
      throw new Error('PDF已加密，请先在阅读器中解除密码保护再处理。');
    }
    throw new Error('PDF读取失败：文件可能损坏或使用了不支持的结构。');
  }
  if (pageCount < 1) throw new Error('PDF没有可处理的页面。');
  if (pageCount > PDF_COMPRESS_LIMITS.maxPages) {
    throw new Error(`PDF页数过多（${pageCount} 页，上限 ${PDF_COMPRESS_LIMITS.maxPages} 页）。建议先使用「PDF 合并与拆分」提取部分页面后再压缩。`);
  }
  return {pageCount, byteLength: bytes.length};
}

export function calculateSavings(originalBytes: number, resultBytes: number) {
  if (resultBytes >= originalBytes) {
    return { savedBytes: 0, percent: 0, isSaved: false };
  }
  const savedBytes = originalBytes - resultBytes;
  const percent = Number(((savedBytes / originalBytes) * 100).toFixed(1));
  return { savedBytes, percent, isSaved: true };
}

export async function optimizePdfStructure(bytes: Uint8Array): Promise<Uint8Array> {
  assertPdfBytes(bytes);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, {updateMetadata: false});
  } catch {
    throw new Error('PDF结构优化失败：文件损坏或无法读取。');
  }
  if (doc.isEncrypted) {
    throw new Error('PDF已加密，请先在阅读器中解除密码保护再处理。');
  }
  const cleanDoc = await PDFDocument.create();
  const pageIndices = doc.getPageIndices();
  const copiedPages = await cleanDoc.copyPages(doc, pageIndices);
  for (const page of copiedPages) {
    cleanDoc.addPage(page);
  }
  return cleanDoc.save({useObjectStreams: true, addDefaultPage: false});
}

export async function defaultBrowserRasterizer(
  bytes: Uint8Array,
  tier: TierConfig,
  onProgress?: (current: number, total: number) => void,
  check?: () => void
): Promise<Uint8Array> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('页面重采样需在浏览器环境运行。当前环境请使用结构优化无损模式。');
  }
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const baseUrl = import.meta.env?.BASE_URL ?? '/';
  const loadingTask = pdfjs.getDocument({
    data: bytes.slice(),
    stopAtErrors: true,
    useSystemFonts: true,
    cMapUrl: `${baseUrl}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${baseUrl}pdfjs/standard_fonts/`,
    wasmUrl: `${baseUrl}pdfjs/wasm/`,
  });

  try {
    const doc = await loadingTask.promise;
    const pageCount = doc.numPages;
    const outDoc = await PDFDocument.create();

    for (let i = 0; i < pageCount; i++) {
      check?.();
      const page = await doc.getPage(i + 1);
      const base = page.getViewport({scale: 1});

      let scale = tier.dpi / 72;
      const targetPixels = (base.width * scale) * (base.height * scale);
      if (targetPixels > PDF_COMPRESS_LIMITS.maxPixelsPerPage) {
        scale = Math.sqrt(PDF_COMPRESS_LIMITS.maxPixelsPerPage / (base.width * base.height));
      }

      const viewport = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('浏览器无法创建渲染画布。');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderTask = page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        background: '#ffffff',
      });
      await renderTask.promise;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          b => b ? resolve(b) : reject(new Error('页面编码失败。')),
          'image/jpeg',
          tier.quality
        );
      });
      const imgBytes = new Uint8Array(await blob.arrayBuffer());

      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();

      const embedded = await outDoc.embedJpg(imgBytes);
      const outPage = outDoc.addPage([base.width, base.height]);
      outPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: base.width,
        height: base.height,
      });

      onProgress?.(i + 1, pageCount);
      await new Promise(r => setTimeout(r, 0));
    }

    return await outDoc.save({useObjectStreams: true});
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

export async function compressPdf(
  bytes: Uint8Array,
  options: CompressOptions = {}
): Promise<CompressResult> {
  assertPdfBytes(bytes);
  const summary = await inspectPdf(bytes);
  const tierKey = options.tier || 'recommended';
  const tierConfig = COMPRESS_TIERS[tierKey] || COMPRESS_TIERS.recommended;

  options.check?.();

  let compressedBytes: Uint8Array;
  if (!tierConfig.isLossy) {
    // 结构无损优化
    options.onProgress?.(1, summary.pageCount);
    compressedBytes = await optimizePdfStructure(bytes);
    options.onProgress?.(summary.pageCount, summary.pageCount);
  } else {
    // 有损重采样
    const rasterizer = options.rasterizer || defaultBrowserRasterizer;
    compressedBytes = await rasterizer(bytes, tierConfig, options.onProgress, options.check);
  }

  options.check?.();

  // 判断压缩产物体积是否变小
  if (compressedBytes.length < bytes.length) {
    const savings = calculateSavings(bytes.length, compressedBytes.length);
    return {
      bytes: compressedBytes,
      originalBytes: bytes.length,
      compressedBytes: compressedBytes.length,
      finalBytes: compressedBytes.length,
      savedBytes: savings.savedBytes,
      savedPercent: savings.percent,
      isSaved: true,
      keptOriginal: false,
      notice: `成功压缩！文件体积减少了 ${savings.percent}%（${formatBytes(bytes.length)} → ${formatBytes(compressedBytes.length)}）。`,
      tier: tierConfig.id,
      isLossy: tierConfig.isLossy,
      pageCount: summary.pageCount,
    };
  }

  // 压缩后反而变大：拦截膨胀，自动保留原文件（或体积更小的无损结构版）
  let fallbackBytes = bytes;
  if (tierConfig.isLossy) {
    try {
      const lossless = await optimizePdfStructure(bytes);
      if (lossless.length < fallbackBytes.length) {
        fallbackBytes = lossless;
      }
    } catch {
      // 保持原始
    }
  }

  const finalSize = fallbackBytes.length;
  const isLosslessSaved = finalSize < bytes.length;
  const savings = calculateSavings(bytes.length, finalSize);

  return {
    bytes: fallbackBytes,
    originalBytes: bytes.length,
    compressedBytes: compressedBytes.length,
    finalBytes: finalSize,
    savedBytes: savings.savedBytes,
    savedPercent: savings.percent,
    isSaved: isLosslessSaved,
    keptOriginal: true,
    notice: `原文件已处于高度压缩状态（或包含大量矢量文字），重采样后体积未减少（${formatBytes(bytes.length)} → ${formatBytes(compressedBytes.length)}）。为保护文档质量并防止文件膨胀，系统已自动为你保留原文件。`,
    tier: tierConfig.id,
    isLossy: tierConfig.isLossy,
    pageCount: summary.pageCount,
  };
}
