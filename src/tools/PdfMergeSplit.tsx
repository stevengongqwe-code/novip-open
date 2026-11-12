import {useState, useRef, useEffect} from 'react';
import {
  ToolPage,
  saveLocal,
  isWeChat,
  WeChatNotice,
  SuccessNotice,
  ActionableError,
  EmptyState,
  ProgressBar,
} from './common';
import { useI18n } from '../i18n';
import {zipSync} from 'fflate';
import {
  inspectPdfSummary,
  parseSplitRanges,
  parsePageNumbers,
  parseRemovePages,
  mergePdfsCore,
  splitPdfCore,
  extractPdfPagesCore,
  removePdfPagesCore,
  formatBytes,
  PDF_MERGE_SPLIT_LIMITS,
  type MergeInputFile,
  type SplitOutputFile,
} from './pdf-merge-split-core';
import './pdf-tools.css';

interface MergeItem {
  id: string;
  file: File;
  bytes?: Uint8Array;
  pages?: number;
  error?: string;
  loading: boolean;
}

export default function PdfMergeSplit() {
  const { lang } = useI18n();
  const isEn = lang === 'en-US';
  const [tab, setTab] = useState<'merge' | 'split' | 'extract-remove'>('merge');

  // --- 合并状态 ---
  const [mergeItems, setMergeItems] = useState<MergeItem[]>([]);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeStatus, setMergeStatus] = useState('');
  const [mergeError, setMergeError] = useState('');
  const [mergeResult, setMergeResult] = useState<{bytes: Uint8Array; pageCount: number; name: string}>();
  const mergeAbort = useRef<AbortController | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // --- 拆分状态 ---
  const [splitFile, setSplitFile] = useState<File>();
  const [splitBytes, setSplitBytes] = useState<Uint8Array>();
  const [splitPages, setSplitPages] = useState<number>(0);
  const [splitMode, setSplitMode] = useState<'range' | 'each'>('range');
  const [splitRangeText, setSplitRangeText] = useState('1-3,5');
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitStatus, setSplitStatus] = useState('');
  const [splitError, setSplitError] = useState('');
  const [splitResults, setSplitResults] = useState<SplitOutputFile[]>([]);
  const splitAbort = useRef<AbortController | null>(null);

  // --- 提取与删页状态 ---
  const [pageOpsFile, setPageOpsFile] = useState<File>();
  const [pageOpsBytes, setPageOpsBytes] = useState<Uint8Array>();
  const [pageOpsPages, setPageOpsPages] = useState<number>(0);
  const [pageOpsMode, setPageOpsMode] = useState<'extract' | 'remove'>('extract');
  const [pageOpsRangeText, setPageOpsRangeText] = useState('1');
  const [pageOpsBusy, setPageOpsBusy] = useState(false);
  const [pageOpsStatus, setPageOpsStatus] = useState('');
  const [pageOpsError, setPageOpsError] = useState('');
  const [pageOpsResult, setPageOpsResult] = useState<{bytes: Uint8Array; pageCount: number; name: string}>();
  const pageOpsAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      mergeAbort.current?.abort();
      splitAbort.current?.abort();
      pageOpsAbort.current?.abort();
    };
  }, []);

  // ------------------ 合并功能 ------------------

  async function handleAddMergeFiles(files: FileList | File[]) {
    if (mergeBusy) return;
    setMergeError('');
    setMergeResult(undefined);

    const list = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
    if (!list.length) {
      setMergeError('请选择扩展名为 .pdf 的文件。');
      return;
    }

    if (mergeItems.length + list.length > PDF_MERGE_SPLIT_LIMITS.maxFiles) {
      setMergeError(`一次最多添加 ${PDF_MERGE_SPLIT_LIMITS.maxFiles} 个文件。`);
      return;
    }

    const currentTotalBytes = mergeItems.reduce((acc, it) => acc + it.file.size, 0);
    const addedTotalBytes = list.reduce((acc, f) => acc + f.size, 0);
    if (currentTotalBytes + addedTotalBytes > PDF_MERGE_SPLIT_LIMITS.maxTotalBytes) {
      setMergeError(`添加后队列总体积为 ${formatBytes(currentTotalBytes + addedTotalBytes)}，已超出 200MB 队列上限。请分批合并。`);
      return;
    }

    const newItems: MergeItem[] = list.map(file => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      loading: true,
    }));

    setMergeItems(prev => [...prev, ...newItems]);

    for (const item of newItems) {
      try {
        if (item.file.size === 0) {
          throw new Error('文件大小为 0 字节（空文件），无法合并。');
        }
        if (item.file.size > PDF_MERGE_SPLIT_LIMITS.maxSingleBytes) {
          throw new Error(`文件「${item.file.name}」大小为 ${formatBytes(item.file.size)}，已超过 100MB 极限上限。建议：1. 选用较小的章节；2. 先通过「文件转换」进行基础压缩后再合并。`);
        }
        const b = new Uint8Array(await item.file.arrayBuffer());
        const summary = await inspectPdfSummary(b);
        setMergeItems(prev => prev.map(it => it.id === item.id ? {...it, bytes: b, pages: summary.pageCount, loading: false} : it));
      } catch (err) {
        const msg = err instanceof Error ? err.message : '解析失败';
        setMergeItems(prev => prev.map(it => it.id === item.id ? {...it, error: msg, loading: false} : it));
      }
    }
  }

  function moveMergeItem(index: number, delta: number) {
    if (mergeBusy) return;
    const target = index + delta;
    if (target < 0 || target >= mergeItems.length) return;
    setMergeItems(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next;
    });
    setMergeResult(undefined);
  }

  function removeMergeItem(id: string) {
    if (mergeBusy) return;
    setMergeItems(prev => prev.filter(it => it.id !== id));
    setMergeResult(undefined);
  }

  function removeErrorMergeItems() {
    if (mergeBusy) return;
    setMergeItems(prev => prev.filter(it => !it.error));
    setMergeError('');
  }

  async function startMerge() {
    if (mergeBusy || !mergeItems.length) return;
    setMergeError('');
    setMergeResult(undefined);

    const validItems = mergeItems.filter(it => it.bytes && !it.error);
    if (validItems.length < 1) {
      setMergeError('没有可合并的有效PDF文件，请先检查并移除异常文件。');
      return;
    }

    setMergeBusy(true);
    setMergeStatus('准备合并…');
    const ac = new AbortController();
    mergeAbort.current = ac;

    try {
      const inputs: MergeInputFile[] = validItems.map(it => ({
        name: it.file.name,
        bytes: it.bytes!,
      }));

      const res = await mergePdfsCore(
        inputs,
        (msg) => setMergeStatus(msg),
        ac.signal
      );

      const firstName = validItems[0].file.name.replace(/\.pdf$/i, '');
      const outName = `${firstName}-合并.pdf`;

      setMergeResult({
        bytes: res.bytes,
        pageCount: res.pageCount,
        name: outName,
      });
      setMergeStatus(`合并成功！共 ${res.pageCount} 页。`);
    } catch (err) {
      if (ac.signal.aborted) {
        setMergeStatus('任务已取消。');
      } else {
        setMergeError(err instanceof Error ? err.message : '合并失败，请重试。');
        setMergeStatus('');
      }
    } finally {
      setMergeBusy(false);
    }
  }

  const validMergeCount = mergeItems.filter(it => !it.error && it.pages).length;
  const totalMergePages = mergeItems.reduce((acc, it) => acc + (it.pages ?? 0), 0);
  const totalMergeBytes = mergeItems.reduce((acc, it) => acc + it.file.size, 0);

  // ------------------ 拆分功能 ------------------

  async function handleSelectSplitFile(file: File | undefined) {
    if (splitBusy) return;
    setSplitFile(file);
    setSplitBytes(undefined);
    setSplitPages(0);
    setSplitError('');
    setSplitResults([]);
    setSplitStatus('');

    if (!file) return;

    if (file.size === 0) {
      setSplitError('文件大小为 0 字节（空文件），请选择有效的 PDF 文件。');
      return;
    }

    if (file.size > PDF_MERGE_SPLIT_LIMITS.maxSingleBytes) {
      setSplitError(`文件「${file.name}」大小为 ${formatBytes(file.size)}（已超 100MB 极限上限）。建议：1. 选用较小的文件；2. 先通过「文件转换」进行基础压缩后再拆分。`);
      return;
    }

    setSplitBusy(true);
    setSplitStatus('正在解析PDF文件…');

    try {
      const b = new Uint8Array(await file.arrayBuffer());
      const summary = await inspectPdfSummary(b);
      setSplitBytes(b);
      setSplitPages(summary.pageCount);
      setSplitStatus(`已读取文档：共 ${summary.pageCount} 页 (${formatBytes(file.size)})。`);
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : 'PDF读取失败，请换一个文件。');
      setSplitStatus('');
    } finally {
      setSplitBusy(false);
    }
  }

  let calculatedSplitCount = 0;
  let splitRangeCalcError = '';
  if (splitPages > 0) {
    try {
      if (splitMode === 'each') {
        calculatedSplitCount = splitPages;
      } else {
        calculatedSplitCount = parseSplitRanges(splitRangeText, splitPages).length;
      }
    } catch (e) {
      splitRangeCalcError = e instanceof Error ? e.message : '页码格式不正确';
    }
  }

  async function startSplit() {
    if (splitBusy || !splitBytes || !splitFile) return;
    setSplitError('');
    setSplitResults([]);

    let rangeGroups: number[][] = [];
    try {
      if (splitMode === 'each') {
        rangeGroups = Array.from({length: splitPages}, (_, i) => [i]);
      } else {
        rangeGroups = parseSplitRanges(splitRangeText, splitPages);
      }
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : '页码范围格式不正确。');
      return;
    }

    setSplitBusy(true);
    setSplitStatus('开始拆分…');
    const ac = new AbortController();
    splitAbort.current = ac;

    try {
      const outputs = await splitPdfCore(
        splitBytes,
        splitFile.name,
        rangeGroups,
        (msg) => setSplitStatus(msg),
        ac.signal
      );

      setSplitResults(outputs);
      setSplitStatus(`拆分完成！已生成 ${outputs.length} 个文件。`);
    } catch (err) {
      if (ac.signal.aborted) {
        setSplitStatus('拆分已取消。');
      } else {
        setSplitError(err instanceof Error ? err.message : '拆分失败，请检查页码范围。');
        setSplitStatus('');
      }
    } finally {
      setSplitBusy(false);
    }
  }

  function downloadSplitZip() {
    if (!splitResults.length || !splitFile) return;
    const entries: Record<string, Uint8Array> = {};
    for (const item of splitResults) {
      entries[item.name] = item.bytes;
    }
    const zipBytes = zipSync(entries, {level: 0});
    const stem = splitFile.name.replace(/\.pdf$/i, '');
    saveLocal(new Blob([zipBytes.slice().buffer], {type: 'application/zip'}), `${stem}-拆分集合.zip`);
    if (isWeChat()) {
      setSplitStatus('已尝试触发 ZIP 下载。⚠️ 微信内置浏览器若拦截保存，请点击右上角「···」选择「在浏览器打开」，或使用下方单页逐个下载。');
    }
  }

  // ------------------ 提取页与删页功能 ------------------

  async function handleSelectPageOpsFile(file: File | undefined) {
    if (pageOpsBusy) return;
    setPageOpsFile(file);
    setPageOpsBytes(undefined);
    setPageOpsPages(0);
    setPageOpsError('');
    setPageOpsResult(undefined);
    setPageOpsStatus('');

    if (!file) return;

    if (file.size === 0) {
      setPageOpsError('文件大小为 0 字节（空文件），请选择有效的 PDF 文件。');
      return;
    }

    if (file.size > PDF_MERGE_SPLIT_LIMITS.maxSingleBytes) {
      setPageOpsError(`文件「${file.name}」大小为 ${formatBytes(file.size)}（超过 100MB 极限）。建议先压缩后再处理。`);
      return;
    }

    setPageOpsBusy(true);
    setPageOpsStatus('正在解析PDF文件…');

    try {
      const b = new Uint8Array(await file.arrayBuffer());
      const summary = await inspectPdfSummary(b);
      setPageOpsBytes(b);
      setPageOpsPages(summary.pageCount);
      setPageOpsStatus(`已读取文档：共 ${summary.pageCount} 页 (${formatBytes(file.size)})。`);
    } catch (err) {
      setPageOpsError(err instanceof Error ? err.message : 'PDF读取失败，请确认文件未损坏且未加密。');
      setPageOpsStatus('');
    } finally {
      setPageOpsBusy(false);
    }
  }

  let pageOpsCalcHint = '';
  let pageOpsCalcError = '';
  if (pageOpsPages > 0 && pageOpsRangeText.trim()) {
    try {
      if (pageOpsMode === 'extract') {
        const nums = parsePageNumbers(pageOpsRangeText, pageOpsPages);
        pageOpsCalcHint = `将提取第 ${nums.map(p => p + 1).join('、')} 页，共 ${nums.length} 页。`;
      } else {
        const {keep, removed} = parseRemovePages(pageOpsRangeText, pageOpsPages);
        pageOpsCalcHint = `将删除第 ${removed.map(p => p + 1).join('、')} 页（共 ${removed.length} 页），保留其余 ${keep.length} 页为新文档。`;
      }
    } catch (err) {
      pageOpsCalcError = err instanceof Error ? err.message : '页码格式不正确';
    }
  }

  async function startPageOps() {
    if (pageOpsBusy || !pageOpsBytes || !pageOpsFile) return;
    setPageOpsError('');
    setPageOpsResult(undefined);

    setPageOpsBusy(true);
    const ac = new AbortController();
    pageOpsAbort.current = ac;

    try {
      if (pageOpsMode === 'extract') {
        const nums = parsePageNumbers(pageOpsRangeText, pageOpsPages);
        const res = await extractPdfPagesCore(
          pageOpsBytes,
          pageOpsFile.name,
          nums,
          (msg) => setPageOpsStatus(msg),
          ac.signal
        );
        setPageOpsResult(res);
        setPageOpsStatus(`提取完成！已生成新文档，共 ${res.pageCount} 页。`);
      } else {
        const {removed} = parseRemovePages(pageOpsRangeText, pageOpsPages);
        const res = await removePdfPagesCore(
          pageOpsBytes,
          pageOpsFile.name,
          removed,
          (msg) => setPageOpsStatus(msg),
          ac.signal
        );
        setPageOpsResult(res);
        setPageOpsStatus(`删页完成！已剔除 ${res.removedCount} 页，保留 ${res.pageCount} 页生成新文档。`);
      }
    } catch (err) {
      if (ac.signal.aborted) {
        setPageOpsStatus('任务已取消。');
      } else {
        setPageOpsError(err instanceof Error ? err.message : '处理失败，请重试。');
        setPageOpsStatus('');
      }
    } finally {
      setPageOpsBusy(false);
    }
  }

  return (
    <ToolPage
      id="pdf-merge-split"
      title="PDF 合并与拆分"
      description="多份PDF合并为一个，按页码范围/逐页拆分，或提取指定页、删除不需要页面；纯本地处理，不上传文件。"
    >
      {/* 顶部标签切换 */}
      <div style={{display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap'}}>
        <button
          className={`study-btn ${tab === 'merge' ? '' : 'alt'}`}
          onClick={() => { setTab('merge'); }}
          disabled={mergeBusy || splitBusy || pageOpsBusy}
        >
          {isEn ? 'PDF Merge' : 'PDF 合并'}
        </button>
        <button
          className={`study-btn ${tab === 'split' ? '' : 'alt'}`}
          onClick={() => { setTab('split'); }}
          disabled={mergeBusy || splitBusy || pageOpsBusy}
        >
          {isEn ? 'PDF Split' : 'PDF 拆分'}
        </button>
        <button
          className={`study-btn ${tab === 'extract-remove' ? '' : 'alt'}`}
          onClick={() => { setTab('extract-remove'); }}
          disabled={mergeBusy || splitBusy || pageOpsBusy}
        >
          {isEn ? 'Extract / Delete Pages' : '提取页 / 删页'}
        </button>
      </div>

      <p className="study-note">
        {isEn
          ? '💡 100% In-Browser Memory: Your files are processed locally and never uploaded to any server. Recommended ≤ 50MB per file.'
          : '💡 纯本地内存处理：你的作业、报告与个人资料不上传服务器，刷新页面即清理缓存。建议单个文件 ≤ 50MB，避免超大文件导致移动端浏览器卡顿。'}
      </p>

      {/* ======================= Tab 1: 合并 ======================= */}
      {tab === 'merge' && (
        <>
          <section className="study-card">
            <h2>{isEn ? '1. Select PDF Files to Merge' : '1 选择合并的 PDF 文件'}</h2>
            <div className="upload-limit-banner">
              <strong>{isEn ? 'File Limit: ' : '文件上限：'}</strong>
              {isEn
                ? 'Recommended ≤ 50MB per file (Limit 100MB, queue ≤ 200MB, up to 50 files and 1,000 pages) · 100% In-Browser'
                : '单文件推荐 ≤ 50MB（极限 100MB，总队列 ≤ 200MB，最多 50 个文件，总计最多 1000 页）· 纯本地浏览器拼装，不限次数'}
            </div>
            <div
              className="tool-drop"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                void handleAddMergeFiles(e.dataTransfer.files);
              }}
              style={{cursor: 'pointer', textAlign: 'center', padding: '24px 16px'}}
            >
              <p style={{margin: '0 0 8px', fontWeight: 600}}>
                {mergeBusy ? (isEn ? 'Processing...' : '正在处理中…') : (isEn ? 'Drop multiple PDF files here, or click to choose' : '拖入多个 PDF 文件，或点击下方选择')}
              </p>
              <input
                type="file"
                multiple
                accept=".pdf,application/pdf"
                disabled={mergeBusy}
                aria-label={isEn ? "Select PDF files to merge" : "选择合并的PDF文件"}
                onChange={e => {
                  if (e.target.files?.length) {
                    void handleAddMergeFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
              <small style={{display: 'block', marginTop: '6px', color: '#666'}}>
                {isEn
                  ? '⚡ 100% In-Browser Memory · Recommended ≤ 50MB per file · Mobile Friendly'
                  : '⚡ 纯本地内存处理 · 建议单个 ≤ 50MB（极限 100MB）· 微信与手机端直接可用'}
              </small>
            </div>

            {mergeItems.length === 0 && (
              <div style={{marginTop: '16px'}}>
                <EmptyState
                  title={isEn ? "No PDF files added yet" : "尚未添加要合并的 PDF 文件"}
                  description={isEn ? "Supports multi-file select and drop, 100% local in-browser merge, reorder files with drag or ↑ / ↓ buttons." : "支持多选或分批拖入，纯本地极速拼接，可任意拖拽或使用 ↑ / ↓ 调整前后顺序。"}
                />
              </div>
            )}

            {mergeItems.length > 0 && (
              <div style={{marginTop: '16px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px'}}>
                  <div>
                    <strong>
                      {isEn
                        ? `Selected ${mergeItems.length} file(s) · Est. ${totalMergePages} pages · Total size ${formatBytes(totalMergeBytes)}`
                        : `已选 ${mergeItems.length} 个文件 · 预估共 ${totalMergePages} 页 · 总体积 ${formatBytes(totalMergeBytes)}`}
                    </strong>
                    <p className="study-note" style={{margin: '4px 0 0'}}>
                      {isEn
                        ? 'Reorder files: Drag & drop on desktop, or tap ↑ / ↓ buttons on mobile (supports Alt + ↑/↓ keyboard shortcuts).'
                        : '调整文件顺序：电脑端可直接拖拽调整，手机端支持点击 ↑ / ↓ 按钮上下移动（支持键盘 Alt + ↑/↓ 移动）。'}
                    </p>
                  </div>
                  <div style={{display: 'flex', gap: '8px'}}>
                    {mergeItems.some(it => it.error) && (
                      <button
                        className="study-link"
                        disabled={mergeBusy}
                        onClick={removeErrorMergeItems}
                        style={{color: '#c0392b'}}
                      >
                        {isEn ? 'Remove invalid files' : '移除异常文件'}
                      </button>
                    )}
                    <button
                      className="study-link"
                      disabled={mergeBusy}
                      onClick={() => {
                        setMergeItems([]);
                        setMergeResult(undefined);
                        setMergeError('');
                        setMergeStatus('');
                      }}
                    >
                      {isEn ? 'Clear all' : '清空全部'}
                    </button>
                  </div>
                </div>

                <ul className="tool-queue batch-queue pdf-merge-queue" style={{margin: 0, padding: 0}}>
                  {mergeItems.map((item, idx) => (
                    <li
                      key={item.id}
                      className={`pdf-queue-item ${dragOverIndex === idx ? 'is-dragover' : ''}`}
                      draggable={!mergeBusy}
                      onDragStart={e => {
                        e.dataTransfer.setData('text/plain', String(idx));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={e => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverIndex !== idx) setDragOverIndex(idx);
                      }}
                      onDragLeave={() => {
                        if (dragOverIndex === idx) setDragOverIndex(null);
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        const fromIdx = Number(e.dataTransfer.getData('text/plain'));
                        setDragOverIndex(null);
                        if (!Number.isNaN(fromIdx) && fromIdx !== idx) {
                          setMergeItems(prev => {
                            const next = [...prev];
                            const [moved] = next.splice(fromIdx, 1);
                            next.splice(idx, 0, moved);
                            return next;
                          });
                          setMergeResult(undefined);
                        }
                      }}
                      onKeyDown={e => {
                        if (e.altKey && e.key === 'ArrowUp') {
                          e.preventDefault();
                          moveMergeItem(idx, -1);
                        } else if (e.altKey && e.key === 'ArrowDown') {
                          e.preventDefault();
                          moveMergeItem(idx, 1);
                        }
                      }}
                      tabIndex={0}
                      aria-label={isEn ? `File ${idx + 1}: ${item.file.name}` : `第 ${idx + 1} 个文件: ${item.file.name}，可使用 Alt+上下方向键或右侧按钮排序`}
                      style={{
                        background: item.error ? '#fff5f5' : undefined,
                      }}
                    >
                      <div className="pdf-queue-handle" title={isEn ? "Drag to reorder" : "拖拽调整顺序"} aria-hidden="true">
                        ⋮⋮
                      </div>
                      <div className="pdf-queue-info">
                        <span className="pdf-queue-index">{idx + 1}</span>
                        <div className="pdf-queue-text">
                          <span className="pdf-file-name">{item.file.name}</span>
                          <div className="pdf-queue-meta">
                            {item.loading && (isEn ? 'Verifying...' : '正在快速校验…')}
                            {item.error && <span style={{color: '#c0392b'}}>❌ {item.error}</span>}
                            {!item.loading && !item.error && <span>{item.pages ?? 0} {isEn ? 'pages' : '页'} · {formatBytes(item.file.size)}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="pdf-queue-actions">
                        <button
                          type="button"
                          disabled={mergeBusy || idx === 0}
                          aria-label={isEn ? `Move up ${item.file.name}` : `上移 ${item.file.name}`}
                          onClick={() => moveMergeItem(idx, -1)}
                          title={isEn ? "Move up" : "上移"}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={mergeBusy || idx === mergeItems.length - 1}
                          aria-label={isEn ? `Move down ${item.file.name}` : `下移 ${item.file.name}`}
                          onClick={() => moveMergeItem(idx, 1)}
                          title={isEn ? "Move down" : "下移"}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          disabled={mergeBusy}
                          onClick={() => removeMergeItem(item.id)}
                          aria-label={isEn ? `Remove ${item.file.name}` : `移除 ${item.file.name}`}
                          title={isEn ? "Remove" : "移除"}
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {mergeItems.length > 0 && (
            <section className="study-card">
              <h2>{isEn ? '2. Execute Merge' : '2 执行合并'}</h2>
              {mergeBusy && (
                <div style={{marginBottom: '14px'}}>
                  <ProgressBar label={isEn ? "Merging PDF" : "正在合并 PDF"} statusText={mergeStatus || (isEn ? 'Assembling pages...' : '正在拼装页面…')} />
                </div>
              )}
              {mergeError && (
                <div style={{marginBottom: '14px'}}>
                  <ActionableError
                    error={mergeError}
                    suggestions={[
                      isEn ? 'If single file size is too large, please compress first.' : '若单文件体积过大，请先用「文件转换」基础压缩后再合并。',
                      isEn ? 'Check for damaged or password-protected PDF files.' : '检查是否存在受损或被密码保护的 PDF 文件并点击「移除异常文件」。',
                      isEn ? 'Try merging in smaller batches (e.g. 3-5 files at a time).' : '若文件较多，建议分批次合并（如每次 3-5 个文件）。',
                    ]}
                  />
                </div>
              )}
              {mergeStatus && !mergeBusy && !mergeError && (
                <p className="study-note" style={{marginBottom: '12px'}}>
                  {mergeStatus}
                </p>
              )}

              <div className="study-actions">
                <button
                  className="study-btn"
                  disabled={mergeBusy || validMergeCount < 1}
                  onClick={() => void startMerge()}
                >
                  {mergeBusy ? (isEn ? 'Merging...' : '正在合并…') : (isEn ? 'Start Merging PDF' : '开始合并 PDF')}
                </button>
                {mergeBusy && (
                  <button
                    className="study-btn alt"
                    onClick={() => mergeAbort.current?.abort()}
                  >
                    {isEn ? 'Cancel' : '取消'}
                  </button>
                )}
              </div>
            </section>
          )}

          {mergeResult && (
            <section className="study-card" style={{borderLeft: '4px solid #16a34a'}}>
              <h2>{isEn ? '3. Merge Result & Download' : '3 合并结果与下载'}</h2>
              <SuccessNotice
                message={isEn ? `Merge successful! Generated: ${mergeResult.name}` : `合并成功！已生成新文件：${mergeResult.name}`}
                submessage={isEn ? `${mergeResult.pageCount} pages · Total ${formatBytes(mergeResult.bytes.length)}` : `共 ${mergeResult.pageCount} 页 · 总体积 ${formatBytes(mergeResult.bytes.length)}`}
              />
              <WeChatNotice />
              <div className="study-actions" style={{marginTop: '14px'}}>
                <button
                  className="study-btn"
                  onClick={() => saveLocal(new Blob([mergeResult.bytes.slice().buffer], {type: 'application/pdf'}), mergeResult.name)}
                >
                  {isEn ? 'Download Merged PDF' : '下载合并后的 PDF'}
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {/* ======================= Tab 2: 拆分 ======================= */}
      {tab === 'split' && (
        <>
          <section className="study-card">
            <h2>{isEn ? '1. Select PDF File to Split' : '1 选择要拆分的 PDF 文件'}</h2>
            <div className="upload-limit-banner">
              <strong>{isEn ? 'File Limit: ' : '文件上限：'}</strong>
              {isEn
                ? 'Recommended ≤ 50MB (Limit 100MB) · Up to 1,000 pages · 100% In-Browser'
                : '推荐 ≤ 50MB（极限 100MB）· 最大支持 1000 页 · 纯本地浏览器拆分，不限次数'}
            </div>
            <div
              className="tool-drop"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) void handleSelectSplitFile(e.dataTransfer.files[0]);
              }}
              style={{cursor: 'pointer', textAlign: 'center', padding: '24px 16px'}}
            >
              <p style={{margin: '0 0 8px', fontWeight: 600}}>
                {splitBusy ? (isEn ? 'Reading...' : '正在读取中…') : (isEn ? 'Drop a single PDF file here, or click to choose' : '拖入单个 PDF 文件，或点击下方选择')}
              </p>
              <input
                type="file"
                accept=".pdf,application/pdf"
                disabled={splitBusy}
                aria-label={isEn ? "Select PDF file to split" : "选择拆分的PDF文件"}
                onChange={e => {
                  if (e.target.files?.[0]) {
                    void handleSelectSplitFile(e.target.files[0]);
                    e.target.value = '';
                  }
                }}
              />
              <small style={{display: 'block', marginTop: '6px', color: '#666'}}>
                {isEn
                  ? '⚡ 100% In-Browser Memory · Mobile Friendly'
                  : '⚡ 纯本地内存处理 · 微信与手机端直接可用'}
              </small>
            </div>

            {!splitFile && (
              <div style={{marginTop: '16px'}}>
                <EmptyState
                  title={isEn ? "No PDF file selected yet" : "尚未选择要拆分的 PDF 文件"}
                  description={isEn ? "Supports splitting by page ranges (e.g. 1-3,5) or splitting each page into ZIP, all processed locally." : "支持按页码范围拆分（如 1-3,5）或一键按单页拆分打包 ZIP，本地处理不传云端。"}
                />
              </div>
            )}

            {splitFile && (
              <p style={{marginTop: '12px', fontWeight: 600}}>
                {isEn ? `Selected file: ${splitFile.name} (${formatBytes(splitFile.size)})` : `已选文件：${splitFile.name}（${formatBytes(splitFile.size)}）`}
              </p>
            )}
            {splitBusy && (
              <div style={{marginTop: '12px'}}>
                <ProgressBar label={isEn ? "Splitting PDF" : "正在拆分 PDF"} statusText={splitStatus || (isEn ? 'Splitting pages...' : '正在拆分页面…')} />
              </div>
            )}
            {splitError && (
              <div style={{marginTop: '12px'}}>
                <ActionableError
                  error={splitError}
                  suggestions={[
                    isEn ? 'Ensure page range is within total page count.' : '确认填写的页码范围在文档总页数之内。',
                    isEn ? 'Commas (1-3,5) combine into one file; semicolons (1-3; 4-6) split into separate files.' : '逗号分隔（如 1-3,5）会合为一个文件；分号（如 1-3; 4-6）会拆为多个文件。',
                    isEn ? 'Confirm PDF is not encrypted or corrupted.' : '确认 PDF 文件未设置权限保护或损坏。',
                  ]}
                />
              </div>
            )}
            {splitStatus && !splitBusy && !splitError && (
              <p className="study-note" style={{marginTop: '8px'}}>
                {splitStatus}
              </p>
            )}
          </section>

          {splitPages > 0 && splitBytes && (
            <section className="study-card">
              <h2>{isEn ? '2. Split Rules' : '2 拆分规则'}</h2>
              <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                <label>
                  {isEn ? 'Split Mode:' : '拆分模式：'}
                  <select
                    value={splitMode}
                    disabled={splitBusy}
                    onChange={e => setSplitMode(e.target.value as 'range' | 'each')}
                    style={{marginTop: '4px', width: '100%', padding: '6px 8px'}}
                  >
                    <option value="range">{isEn ? 'Split by page range (custom extract or chunks)' : '按页码范围拆分（可提取或分段）'}</option>
                    <option value="each">{isEn ? 'Split each page into a separate file' : '每页拆为一个独立文件（逐页模式）'}</option>
                  </select>
                </label>
              </div>

              {splitMode === 'range' && (
                <div style={{marginTop: '12px'}}>
                  <label>
                    {isEn ? 'Page range:' : '拆分页码范围：'}
                    <input
                      type="text"
                      value={splitRangeText}
                      disabled={splitBusy}
                      placeholder={isEn ? "e.g. 1-3,5 or 1-3; 4-6" : "如 1-3,5 或 1-3; 4-6"}
                      onInput={e => {
                        setSplitRangeText((e.target as HTMLInputElement).value);
                        setSplitError('');
                      }}
                      onChange={e => {
                        setSplitRangeText(e.target.value);
                        setSplitError('');
                      }}
                      style={{marginTop: '4px', width: '100%'}}
                    />
                  </label>
                  {splitRangeCalcError ? (
                    <p className="study-warning" role="alert" style={{marginTop: '4px'}}>
                      {splitRangeCalcError}
                    </p>
                  ) : (
                    <p className="study-note" style={{marginTop: '4px'}}>
                      {isEn ? `Will split into ${calculatedSplitCount} file(s).` : `预计将拆分为 ${calculatedSplitCount} 个文件。`}
                      {isEn
                        ? ' 💡 Tip: Commas (e.g. 1-3,5) combine into 1 file; semicolons (e.g. 1-3; 4-6) split into separate files.'
                        : ' 💡 提示：用逗号（如 1-3,5）合为一个文件；用分号（如 1-3; 4-6; 7-10）分拆为多个文件。'}
                    </p>
                  )}
                </div>
              )}

              {splitMode === 'each' && (
                <p className="study-note">
                  {isEn
                    ? `All ${splitPages} pages will be exported as single-page PDF files (${calculatedSplitCount} files).`
                    : `全部 ${splitPages} 页将被分别导出为单独的单页 PDF 文件，预计将拆分为 ${calculatedSplitCount} 个文件。`}
                </p>
              )}

              <div className="study-actions" style={{marginTop: '16px'}}>
                <button
                  className="study-btn"
                  disabled={splitBusy || !!splitRangeCalcError}
                  onClick={() => void startSplit()}
                >
                  {splitBusy ? (isEn ? 'Splitting...' : '正在拆分…') : (isEn ? 'Start Splitting PDF' : '开始拆分 PDF')}
                </button>
                {splitBusy && (
                  <button
                    className="study-btn alt"
                    onClick={() => splitAbort.current?.abort()}
                  >
                    {isEn ? 'Cancel' : '取消'}
                  </button>
                )}
              </div>
            </section>
          )}

          {splitResults.length > 0 && (
            <section className="study-card">
              <h2>{isEn ? '3. Split Results & Download' : '3 拆分结果与下载'}</h2>
              <SuccessNotice
                message={isEn ? `Split complete! Generated ${splitResults.length} file(s)` : `拆分完成！共生成 ${splitResults.length} 个文件`}
                submessage={isEn ? 'Download all as a ZIP package or choose individual pages below.' : '可打包下载全部 ZIP 或在下方单页选择下载。'}
              />
              <p>
                {isEn ? `Generated ${splitResults.length} file(s):` : `共生成 ${splitResults.length} 个文件：`}
              </p>
              <WeChatNotice isZip={splitResults.length > 1} />
              <div className="study-actions" style={{marginBottom: '16px', marginTop: '14px'}}>
                {splitResults.length > 1 && (
                  <button
                    className="study-btn"
                    onClick={downloadSplitZip}
                  >
                    {isEn ? `Download All ZIP (${splitResults.length} files)` : `打包下载全部 ZIP (${splitResults.length}份)`}
                  </button>
                )}
              </div>

              <ul className="tool-queue" style={{margin: 0, padding: 0}}>
                {splitResults.map((item, idx) => (
                  <li key={item.name + idx} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px'}}>
                    <div>
                      <strong>{item.name}</strong>
                      <div style={{fontSize: '12px', color: '#666'}}>
                        {item.pages} {isEn ? 'pages' : '页'} · {formatBytes(item.bytes.length)}
                      </div>
                    </div>
                    <button
                      className="study-btn alt"
                      style={{padding: '4px 10px', fontSize: '13px'}}
                      onClick={() => {
                        saveLocal(new Blob([item.bytes.slice().buffer], {type: 'application/pdf'}), item.name);
                        if (isWeChat()) setSplitStatus(isEn ? `Triggered download for "${item.name}". Open in browser if needed.` : `已触发单页「${item.name}」下载。若微信未弹出保存提示，请在浏览器中打开。`);
                      }}
                    >
                      {isEn ? 'Download' : '下载'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* ======================= Tab 3: 提取页与删页 ======================= */}
      {tab === 'extract-remove' && (
        <>
          <section className="study-card">
            <h2>{isEn ? '1. Select PDF File' : '1 选择处理的 PDF 文件'}</h2>
            <div className="upload-limit-banner">
              <strong>{isEn ? 'Feature: ' : '功能说明：'}</strong>
              {isEn
                ? 'Extract specified pages into a new file, or remove unwanted pages (cannot delete all). Recommended ≤ 50MB (Limit 100MB) · 100% In-Browser'
                : '提取指定页为一个新文件，或剔除指定不需要的页（防误删全部）。单文件推荐 ≤ 50MB（极限 100MB）· 本地处理不上传'}
            </div>
            <div
              className="tool-drop"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) void handleSelectPageOpsFile(e.dataTransfer.files[0]);
              }}
              style={{cursor: 'pointer', textAlign: 'center', padding: '24px 16px'}}
            >
              <p style={{margin: '0 0 8px', fontWeight: 600}}>
                {pageOpsBusy ? (isEn ? 'Reading...' : '正在读取中…') : (isEn ? 'Drop a PDF file here, or click to choose' : '拖入 PDF 文件，或点击下方选择')}
              </p>
              <input
                type="file"
                accept=".pdf,application/pdf"
                disabled={pageOpsBusy}
                aria-label={isEn ? "Select PDF file to extract or remove pages" : "选择提取或删页的PDF文件"}
                onChange={e => {
                  if (e.target.files?.[0]) {
                    void handleSelectPageOpsFile(e.target.files[0]);
                    e.target.value = '';
                  }
                }}
              />
              <small style={{display: 'block', marginTop: '6px', color: '#666'}}>
                {isEn
                  ? '⚡ 100% In-Browser Memory · Never uploaded to servers'
                  : '⚡ 纯本地内存处理 · 绝不上传服务器'}
              </small>
            </div>

            {!pageOpsFile && (
              <div style={{marginTop: '16px'}}>
                <EmptyState
                  title={isEn ? "No PDF file selected yet" : "尚未选择要提取或删页的 PDF 文件"}
                  description={isEn ? "Extract key pages or remove redundant pages to quickly generate a new document." : "提取重点单页或剔除冗余页，极速生成新文档，内存本地保护。"}
                />
              </div>
            )}

            {pageOpsFile && (
              <p style={{marginTop: '12px', fontWeight: 600}}>
                {isEn ? `Selected file: ${pageOpsFile.name} (${formatBytes(pageOpsFile.size)})` : `已选文件：${pageOpsFile.name}（${formatBytes(pageOpsFile.size)}）`}
              </p>
            )}
            {pageOpsBusy && (
              <div style={{marginTop: '12px'}}>
                <ProgressBar label={isEn ? "Processing PDF" : "正在处理 PDF"} statusText={pageOpsStatus || (isEn ? 'Extracting or removing pages...' : '正在提取或剔除页面…')} />
              </div>
            )}
            {pageOpsError && (
              <div style={{marginTop: '12px'}}>
                <ActionableError
                  error={pageOpsError}
                  suggestions={[
                    isEn ? 'Ensure entered page numbers are within total page count.' : '检查输入的页码是否超出该文档的总页数。',
                    isEn ? 'Delete mode must keep at least 1 page (cannot delete all).' : '删除模式下必须保留至少 1 页，不能全删。',
                    isEn ? 'Confirm PDF is not encrypted or restricted.' : '确认 PDF 文件未设置权限保护。',
                  ]}
                />
              </div>
            )}
            {pageOpsStatus && !pageOpsBusy && !pageOpsError && (
              <p className="study-note" style={{marginTop: '8px'}}>
                {pageOpsStatus}
              </p>
            )}
          </section>

          {pageOpsPages > 0 && pageOpsBytes && (
            <section className="study-card">
              <h2>{isEn ? '2. Mode & Page Numbers' : '2 操作方式与页码输入'}</h2>
              <div style={{display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '14px'}}>
                <label style={{display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600}}>
                  <input
                    type="radio"
                    name="pageOpsMode"
                    value="extract"
                    checked={pageOpsMode === 'extract'}
                    disabled={pageOpsBusy}
                    onChange={() => {
                      setPageOpsMode('extract');
                      setPageOpsError('');
                      setPageOpsResult(undefined);
                    }}
                  />
                  {isEn ? '🌟 Extract Pages (Keep only selected)' : '🌟 提取指定页面（仅保留选定页）'}
                </label>
                <label style={{display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600}}>
                  <input
                    type="radio"
                    name="pageOpsMode"
                    value="remove"
                    checked={pageOpsMode === 'remove'}
                    disabled={pageOpsBusy}
                    onChange={() => {
                      setPageOpsMode('remove');
                      setPageOpsError('');
                      setPageOpsResult(undefined);
                    }}
                  />
                  {isEn ? '🗑️ Delete Pages (Exclude unwanted)' : '🗑️ 删除指定页面（排除不需要的页）'}
                </label>
              </div>

              <div>
                <label>
                  {pageOpsMode === 'extract' ? (isEn ? 'Pages to extract:' : '要提取的页码：') : (isEn ? 'Pages to delete:' : '要删除的页码：')}
                  <input
                    type="text"
                    value={pageOpsRangeText}
                    disabled={pageOpsBusy}
                    placeholder={pageOpsMode === 'extract' ? (isEn ? 'e.g. 1-3, 5 or 2' : '例如 1-3, 5 或 2') : (isEn ? 'e.g. 2, 4 or 1-2 (cannot delete all)' : '例如 2, 4 或 1-2（防误删：不能全删）')}
                    onChange={e => {
                      setPageOpsRangeText(e.target.value);
                      setPageOpsError('');
                    }}
                    style={{marginTop: '6px', width: '100%'}}
                  />
                </label>
                {pageOpsCalcError ? (
                  <p className="study-warning" role="alert" style={{marginTop: '6px'}}>
                    {pageOpsCalcError}
                  </p>
                ) : (
                  <p className="study-note" style={{marginTop: '6px', color: '#166534', fontWeight: 500}}>
                    {pageOpsCalcHint}
                  </p>
                )}
              </div>

              <div className="study-actions" style={{marginTop: '16px'}}>
                <button
                  className="study-btn"
                  disabled={pageOpsBusy || !pageOpsRangeText.trim() || !!pageOpsCalcError}
                  onClick={() => void startPageOps()}
                >
                  {pageOpsBusy
                    ? (isEn ? 'Processing...' : '正在处理…')
                    : pageOpsMode === 'extract'
                      ? (isEn ? 'Extract & Export PDF' : '立即提取并导出 PDF')
                      : (isEn ? 'Delete & Export New PDF' : '立即删除并导出新 PDF')}
                </button>
                {pageOpsBusy && (
                  <button
                    className="study-btn alt"
                    onClick={() => pageOpsAbort.current?.abort()}
                  >
                    {isEn ? 'Cancel' : '取消'}
                  </button>
                )}
              </div>
            </section>
          )}

          {pageOpsResult && (
            <section className="study-card" style={{borderLeft: '4px solid #16a34a'}}>
              <h2>{isEn ? '3. Result & Download' : '3 处理完成与下载'}</h2>
              <SuccessNotice
                message={isEn ? `Success! Generated: ${pageOpsResult.name}` : `处理成功！已生成新文件：${pageOpsResult.name}`}
                submessage={isEn ? `${pageOpsResult.pageCount} pages · Total ${formatBytes(pageOpsResult.bytes.length)}` : `共 ${pageOpsResult.pageCount} 页 · 总体积 ${formatBytes(pageOpsResult.bytes.length)}`}
              />
              <WeChatNotice />
              <div className="study-actions" style={{marginTop: '14px'}}>
                <button
                  className="study-btn"
                  onClick={() => saveLocal(new Blob([pageOpsResult.bytes.slice().buffer], {type: 'application/pdf'}), pageOpsResult.name)}
                >
                  {isEn ? 'Download New PDF' : '下载新生成的 PDF'}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </ToolPage>
  );
}
