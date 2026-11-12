import {PDFDocument} from 'pdf-lib';

export const PDF_MERGE_SPLIT_LIMITS = {
  maxSingleBytes: 100 * 1024 * 1024,   // 100 MB 极限上限
  recommendedBytes: 50 * 1024 * 1024, // 50 MB 推荐上限
  maxTotalBytes: 200 * 1024 * 1024,   // 200 MB 队列总上限
  maxFiles: 50,                       // 最多 50 个文件
  maxPages: 1000,                     // 最多 1000 页
} as const;

export interface PdfSummary {
  pageCount: number;
  byteLength: number;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function assertPdfHeader(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) {
    throw new Error('文件为空或不是有效PDF。');
  }
  let header = false;
  for (let i = 0; i < Math.min(bytes.length, 1024) - 4; i++) {
    if (bytes[i] === 0x25 && bytes[i+1] === 0x50 && bytes[i+2] === 0x44 && bytes[i+3] === 0x46 && bytes[i+4] === 0x2d) {
      header = true;
      break;
    }
  }
  if (!header) throw new Error('这不是PDF文件（缺少 %PDF- 文件头），请确认文件未损坏。');
}

export async function inspectPdfSummary(bytes: Uint8Array): Promise<PdfSummary> {
  assertPdfHeader(bytes);
  if (bytes.length > PDF_MERGE_SPLIT_LIMITS.maxSingleBytes) {
    throw new Error(`PDF文件过大（${formatBytes(bytes.length)}，超过 100MB 上限）。建议先压缩后再处理。`);
  }
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
  if (pageCount > PDF_MERGE_SPLIT_LIMITS.maxPages) {
    throw new Error(`PDF页数过多（${pageCount}页，上限 ${PDF_MERGE_SPLIT_LIMITS.maxPages} 页）。`);
  }
  return {pageCount, byteLength: bytes.length};
}

/**
 * 解析拆分范围，例如：
 * 逐页模式 -> 返回 [[0], [1], [2], ...]
 * 范围拆分 -> "1-3; 4-6; 7" -> [[0, 1, 2], [3, 4, 5], [6]]
 * 逗号单分组 -> "1-3,5" -> [[0, 1, 2, 4]]
 */
export function parseSplitRanges(input: string, totalPages: number): number[][] {
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new Error('PDF总页数无效，无法解析页码。');
  }
  const text = String(input ?? '').trim();
  if (!text) {
    // 留空默认全部页面为一组
    return [Array.from({length: totalPages}, (_, i) => i)];
  }

  // 支持用分号 ; 或 ； 分组
  const groupTokens = text.split(/[;；]/).map(t => t.trim()).filter(Boolean);
  if (!groupTokens.length) {
    throw new Error('请输入有效的页码范围。');
  }

  const result: number[][] = [];
  for (const groupToken of groupTokens) {
    // 组内用逗号分隔，如 "1-3,5"
    const subTokens = groupToken.replace(/[，、]/g, ',').replace(/[–—－~～]/g, '-').split(',');
    const groupPages = new Set<number>();

    for (const raw of subTokens) {
      const part = raw.trim();
      if (!part) continue;
      const single = /^(\d+)$/.exec(part);
      const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);

      if (single) {
        const page = Number(single[1]);
        if (page < 1 || page > totalPages) {
          throw new Error(`页码 ${part} 超出范围（文档共 ${totalPages} 页）。`);
        }
        groupPages.add(page - 1);
      } else if (range) {
        const from = Number(range[1]);
        const to = Number(range[2]);
        if (from < 1 || to > totalPages) {
          throw new Error(`范围 ${part} 超出页数（文档共 ${totalPages} 页）。`);
        }
        if (from > to) {
          throw new Error(`范围起点大于终点：${part}。`);
        }
        for (let p = from; p <= to; p++) {
          groupPages.add(p - 1);
        }
      } else {
        throw new Error(`页码格式不正确：“${part}”。请使用如 1-3,5 或 1-3;4-6 的格式。`);
      }
    }

    if (!groupPages.size) {
      throw new Error(`分组 “${groupToken}” 未包含有效页码。`);
    }
    result.push([...groupPages].sort((a, b) => a - b));
  }

  return result;
}

/**
 * 解析单个页码清单（如 "1-3, 5"），返回 0-based 升序去重页码数组
 */
export function parsePageNumbers(input: string, totalPages: number): number[] {
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new Error('PDF总页数无效，无法解析页码。');
  }
  const text = String(input ?? '').trim();
  if (!text) {
    throw new Error('请输入要处理的页码。');
  }
  const clean = text.replace(/[，、]/g, ',').replace(/[–—－~～]/g, '-');
  const parts = clean.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) {
    throw new Error('请输入有效的页码或范围。');
  }

  const pageSet = new Set<number>();
  for (const part of parts) {
    const single = /^(\d+)$/.exec(part);
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (single) {
      const p = Number(single[1]);
      if (p < 1 || p > totalPages) {
        throw new Error(`页码 ${part} 超出范围（文档共 ${totalPages} 页）。`);
      }
      pageSet.add(p - 1);
    } else if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from < 1 || to > totalPages) {
        throw new Error(`范围 ${part} 超出页数（文档共 ${totalPages} 页）。`);
      }
      if (from > to) {
        throw new Error(`范围起点大于终点：${part}。`);
      }
      for (let i = from; i <= to; i++) pageSet.add(i - 1);
    } else {
      throw new Error(`页码格式不正确：“${part}”。请使用如 1-3,5 的格式。`);
    }
  }

  return [...pageSet].sort((a, b) => a - b);
}

/**
 * 解析删除页码，返回保留的页码 keep 与被删除的页码 removed
 */
export function parseRemovePages(input: string, totalPages: number): {keep: number[]; removed: number[]} {
  const removed = parsePageNumbers(input, totalPages);
  if (removed.length >= totalPages) {
    throw new Error('不能删除全部页面，至少保留一页。');
  }
  const removedSet = new Set(removed);
  const keep: number[] = [];
  for (let i = 0; i < totalPages; i++) {
    if (!removedSet.has(i)) keep.push(i);
  }
  return {keep, removed};
}

export interface MergeInputFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * 内存友好的 PDF 合并：逐个文档拷贝页面，周期性 yield 宏任务，支持 AbortSignal 取消
 */
export async function mergePdfsCore(
  files: MergeInputFile[],
  onProgress?: (message: string, current: number, total: number) => void,
  signal?: AbortSignal
): Promise<{bytes: Uint8Array; pageCount: number}> {
  if (!files.length) throw new Error('请至少选择一个PDF文件。');
  if (files.length > PDF_MERGE_SPLIT_LIMITS.maxFiles) {
    throw new Error(`一次最多合并 ${PDF_MERGE_SPLIT_LIMITS.maxFiles} 个文件。`);
  }

  const totalBytes = files.reduce((acc, f) => acc + f.bytes.length, 0);
  if (totalBytes > PDF_MERGE_SPLIT_LIMITS.maxTotalBytes) {
    throw new Error(`队列文件总体积为 ${formatBytes(totalBytes)}，已超出 ${formatBytes(PDF_MERGE_SPLIT_LIMITS.maxTotalBytes)} 上限。请分批合并。`);
  }

  const outDoc = await PDFDocument.create();
  let totalPages = 0;

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) throw new Error('合并已取消。');
    const f = files[i];
    onProgress?.(`正在处理第 ${i + 1}/${files.length} 个文件：${f.name}`, i, files.length);

    // 让出主线程以保持 UI 响应
    await new Promise(r => setTimeout(r, 0));
    if (signal?.aborted) throw new Error('合并已取消。');

    assertPdfHeader(f.bytes);
    let srcDoc: PDFDocument;
    try {
      srcDoc = await PDFDocument.load(f.bytes, {updateMetadata: false});
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/encrypt|password/i.test(msg)) {
        throw new Error(`文件 “${f.name}” 已加密，请先解除密码保护。`);
      }
      throw new Error(`文件 “${f.name}” 读取失败：可能已损坏或受密码保护。`);
    }

    if (srcDoc.isEncrypted) {
      throw new Error(`文件 “${f.name}” 已加密，请先解除密码保护。`);
    }

    const count = srcDoc.getPageCount();
    if (totalPages + count > PDF_MERGE_SPLIT_LIMITS.maxPages) {
      throw new Error(`合并后总页数超过 ${PDF_MERGE_SPLIT_LIMITS.maxPages} 页限制（当前已累计 ${totalPages + count} 页）。`);
    }

    const copiedPages = await outDoc.copyPages(srcDoc, srcDoc.getPageIndices());
    for (const p of copiedPages) {
      outDoc.addPage(p);
    }
    totalPages += count;
  }

  if (signal?.aborted) throw new Error('合并已取消。');
  onProgress?.('正在生成合并后的PDF文件…', files.length, files.length);
  await new Promise(r => setTimeout(r, 0));

  const output = await outDoc.save({useObjectStreams: true});
  return {bytes: output, pageCount: totalPages};
}

export interface SplitOutputFile {
  name: string;
  bytes: Uint8Array;
  pages: number;
}

/**
 * PDF 拆分：按传入的页码索引分组拆分为一个或多个 PDF
 */
export async function splitPdfCore(
  bytes: Uint8Array,
  baseName: string,
  rangeGroups: number[][],
  onProgress?: (message: string, current: number, total: number) => void,
  signal?: AbortSignal
): Promise<SplitOutputFile[]> {
  assertPdfHeader(bytes);
  if (!rangeGroups.length) throw new Error('没有指定的拆分页面。');

  let srcDoc: PDFDocument;
  try {
    srcDoc = await PDFDocument.load(bytes, {updateMetadata: false});
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/encrypt|password/i.test(msg)) {
      throw new Error('PDF已加密，请解除密码保护后再拆分。');
    }
    throw new Error('PDF读取失败：文件可能损坏或使用了不支持的结构。');
  }
  if (srcDoc.isEncrypted) throw new Error('PDF已加密，请解除密码保护后再拆分。');

  const cleanStem = baseName.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'document';
  const results: SplitOutputFile[] = [];

  for (let i = 0; i < rangeGroups.length; i++) {
    if (signal?.aborted) throw new Error('拆分已取消。');
    const group = rangeGroups[i];
    onProgress?.(`正在导出第 ${i + 1}/${rangeGroups.length} 个拆分文件…`, i, rangeGroups.length);

    await new Promise(r => setTimeout(r, 0));
    if (signal?.aborted) throw new Error('拆分已取消。');

    const outDoc = await PDFDocument.create();
    const copied = await outDoc.copyPages(srcDoc, group);
    for (const p of copied) {
      outDoc.addPage(p);
    }

    const outBytes = await outDoc.save({useObjectStreams: true});

    let suffix = '';
    if (rangeGroups.length === 1) {
      suffix = '-已提取';
    } else if (group.length === 1) {
      suffix = `-第${group[0] + 1}页`;
    } else {
      suffix = `-分段${i + 1}(第${group[0] + 1}-${group[group.length - 1] + 1}页)`;
    }

    results.push({
      name: `${cleanStem}${suffix}.pdf`,
      bytes: outBytes,
      pages: group.length,
    });
  }

  return results;
}

/**
 * PDF 提取指定页面：将选中页码导出为一个新的单份 PDF
 */
export async function extractPdfPagesCore(
  bytes: Uint8Array,
  baseName: string,
  pages: number[],
  onProgress?: (message: string) => void,
  signal?: AbortSignal
): Promise<{name: string; bytes: Uint8Array; pageCount: number}> {
  assertPdfHeader(bytes);
  if (!pages.length) throw new Error('请至少指定一页需要提取的页面。');
  if (signal?.aborted) throw new Error('提取已取消。');

  let srcDoc: PDFDocument;
  try {
    srcDoc = await PDFDocument.load(bytes, {updateMetadata: false});
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/encrypt|password/i.test(msg)) {
      throw new Error('PDF已加密，请解除密码保护后再提取页面。');
    }
    throw new Error('PDF读取失败：文件可能损坏或使用了不支持的结构。');
  }
  if (srcDoc.isEncrypted) throw new Error('PDF已加密，请解除密码保护后再提取页面。');

  const total = srcDoc.getPageCount();
  for (const p of pages) {
    if (p < 0 || p >= total) {
      throw new Error(`提取页码超出文档范围（文档共 ${total} 页）。`);
    }
  }

  onProgress?.('正在提取指定页面…');
  await new Promise(r => setTimeout(r, 0));
  if (signal?.aborted) throw new Error('提取已取消。');

  const outDoc = await PDFDocument.create();
  const copied = await outDoc.copyPages(srcDoc, pages);
  for (const p of copied) outDoc.addPage(p);

  const outBytes = await outDoc.save({useObjectStreams: true});
  const cleanStem = baseName.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'document';
  return {
    name: `${cleanStem}-已提取.pdf`,
    bytes: outBytes,
    pageCount: pages.length,
  };
}

/**
 * PDF 删页：排除指定页码，将其余页面导出为一个新的单份 PDF
 */
export async function removePdfPagesCore(
  bytes: Uint8Array,
  baseName: string,
  pagesToRemove: number[],
  onProgress?: (message: string) => void,
  signal?: AbortSignal
): Promise<{name: string; bytes: Uint8Array; pageCount: number; removedCount: number}> {
  assertPdfHeader(bytes);
  if (signal?.aborted) throw new Error('删页已取消。');

  let srcDoc: PDFDocument;
  try {
    srcDoc = await PDFDocument.load(bytes, {updateMetadata: false});
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/encrypt|password/i.test(msg)) {
      throw new Error('PDF已加密，请解除密码保护后再处理。');
    }
    throw new Error('PDF读取失败：文件可能损坏或使用了不支持的结构。');
  }
  if (srcDoc.isEncrypted) throw new Error('PDF已加密，请解除密码保护后再处理。');

  const total = srcDoc.getPageCount();
  if (pagesToRemove.length >= total) {
    throw new Error('不能删除全部页面，至少保留一页。');
  }

  const removeSet = new Set(pagesToRemove);
  const keepPages: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!removeSet.has(i)) keepPages.push(i);
  }
  if (!keepPages.length) {
    throw new Error('不能删除全部页面，至少保留一页。');
  }

  onProgress?.('正在剔除指定页面并重构文档…');
  await new Promise(r => setTimeout(r, 0));
  if (signal?.aborted) throw new Error('删页已取消。');

  const outDoc = await PDFDocument.create();
  const copied = await outDoc.copyPages(srcDoc, keepPages);
  for (const p of copied) outDoc.addPage(p);

  const outBytes = await outDoc.save({useObjectStreams: true});
  const cleanStem = baseName.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'document';
  return {
    name: `${cleanStem}-已删页.pdf`,
    bytes: outBytes,
    pageCount: keepPages.length,
    removedCount: pagesToRemove.length,
  };
}
