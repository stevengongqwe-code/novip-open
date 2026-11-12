import {useState, useRef} from 'react';
import {
  FileText,
  Upload,
  Download,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Info,
  LoaderCircle,
} from 'lucide-react';
import {ToolPage, useJob, saveLocal, isWeChat, WeChatNotice, ShareToClassmates} from './common';
import { useI18n } from '../i18n';
import {
  COMPRESS_TIERS,
  PDF_COMPRESS_LIMITS,
  compressPdf,
  compressedPdfName,
  formatBytes,
  inspectPdf,
  type CompressResult,
  type CompressTier,
  type PdfSummary,
} from './pdf-compress-core';
import './pdf-tools.css';

export default function PdfCompress() {
  const { lang } = useI18n();
  const isEn = lang === 'en-US';
  const job = useJob();
  const [file, setFile] = useState<File>();
  const [bytes, setBytes] = useState<Uint8Array>();
  const [summary, setSummary] = useState<PdfSummary>();
  const [tier, setTier] = useState<CompressTier>('recommended');
  const [result, setResult] = useState<CompressResult>();
  const [processing, setProcessing] = useState(false);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState({current: 0, total: 0});
  const [dragOver, setDragOver] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetAll = () => {
    job.reset();
    setFile(undefined);
    setBytes(undefined);
    setSummary(undefined);
    setResult(undefined);
    setProcessing(false);
    setReading(false);
    setProgress({current: 0, total: 0});
    setFileKey(k => k + 1);
  };

  const handleFile = async (selectedFile: File | undefined) => {
    if (!selectedFile) return;
    job.reset();
    setResult(undefined);
    setFile(selectedFile);
    setReading(true);
    job.setStatus(isEn ? 'Reading PDF file info...' : '正在读取 PDF 文件信息…');

    try {
      if (selectedFile.size === 0) {
        throw new Error(isEn ? 'Selected file is empty.' : '所选文件为空，无法处理。');
      }
      if (selectedFile.size > PDF_COMPRESS_LIMITS.maxSingleBytes) {
        throw new Error(
          isEn
            ? `File size is ${(selectedFile.size / 1024 / 1024).toFixed(1)}MB (exceeds 100MB limit). Please split or optimize on desktop.`
            : `文件大小为 ${(selectedFile.size / 1024 / 1024).toFixed(1)}MB（超过 100MB 极限上限）。为防止浏览器内存崩溃，请先在电脑端拆分或处理。`
        );
      }
      const buffer = new Uint8Array(await selectedFile.arrayBuffer());
      const inspected = await inspectPdf(buffer);
      setBytes(buffer);
      setSummary(inspected);
      job.setStatus(
        isEn
          ? `Loaded: ${inspected.pageCount} pages, original size ${formatBytes(buffer.length)}.`
          : `已载入：共 ${inspected.pageCount} 页，原始大小 ${formatBytes(buffer.length)}。`
      );
    } catch (err) {
      job.setError(err instanceof Error ? err.message : (isEn ? 'Failed to read PDF, verify it is not damaged or encrypted.' : 'PDF 读取失败，请确认文件未损坏且未加密。'));
      job.setStatus(isEn ? 'Reading incomplete.' : '读取未完成。');
      setBytes(undefined);
      setSummary(undefined);
    } finally {
      setReading(false);
    }
  };

  const handleStartCompress = async () => {
    if (!bytes || !file || processing) return;
    setProcessing(true);
    job.setError('');
    job.setStatus(isEn ? 'Preparing compression...' : '正在准备压缩处理…');
    setProgress({current: 0, total: summary?.pageCount || 1});

    try {
      const res = await compressPdf(bytes, {
        tier,
        onProgress: (current, total) => {
          setProgress({current, total});
          job.setStatus(isEn ? `Compressing page ${current} of ${total}...` : `正在处理第 ${current} / ${total} 页…`);
        },
      });
      setResult(res);
      job.setStatus(res.notice);
    } catch (err) {
      job.setError(err instanceof Error ? err.message : (isEn ? 'Compression failed, please retry or use another file.' : '压缩处理失败，请重试或更换文件。'));
      job.setStatus(isEn ? 'Compression incomplete.' : '压缩未完成。');
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!result || !file) return;
    const downloadName = result.keptOriginal ? file.name : compressedPdfName(file.name);
    saveLocal(new Blob([result.bytes.slice().buffer as ArrayBuffer], {type: 'application/pdf'}), downloadName);
  };

  const currentTierConfig = COMPRESS_TIERS[tier];

  return (
    <ToolPage
      id="pdf-compress"
      title={isEn ? "PDF Compression" : "PDF 压缩"}
      description={
        isEn
          ? "Compress and optimize PDF images and documents with light, recommended, or extreme presets, plus lossless structural cleaning. 100% In-Browser."
          : "按轻度/推荐/极限档位重采样压缩 PDF 页面图片，或无损优化文档结构；变大自动拦截保留原文件。纯浏览器本地处理不上传。"
      }
    >
      {/* 上限提示条 */}
      <div className="upload-limit-banner">
        <strong>{isEn ? 'File Limit: ' : '文件上限：'}</strong>
        {isEn
          ? 'Recommended ≤ 50MB (Limit 100MB, up to 200 pages) · 100% In-Browser · Privacy Protected'
          : '单个文件建议 ≤ 50MB（极限 100MB，最多 200 页），纯浏览器本地内存处理 · 保护文件隐私'}
      </div>

      {/* 微信环境提示 */}
      {isWeChat() && <WeChatNotice />}

      {/* 状态与错误报告 */}
      {job.error && (
        <div role="alert" className="study-error" style={{marginBottom: '16px'}}>
          <AlertCircle size={16} />
          <span>{job.error}</span>
        </div>
      )}

      {/* 卡片 1: 选择文件 */}
      <section className="study-card" style={{marginBottom: '18px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
          <h2 style={{margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <FileText size={18} />
            <span>{isEn ? '1. Select PDF to Compress' : '1. 选择要压缩的 PDF'}</span>
          </h2>
          {file && (
            <button
              type="button"
              className="study-btn alt"
              onClick={resetAll}
              disabled={processing || reading}
              style={{padding: '5px 12px', fontSize: '12px'}}
            >
              <RotateCcw size={13} style={{marginRight: '4px'}} />
              {isEn ? 'Change File' : '更换文件'}
            </button>
          )}
        </div>

        {!file ? (
          <div
            className={`tool-drop ${dragOver ? 'is-dragover' : ''}`}
            onDragOver={e => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) void handleFile(dropped);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={32} style={{color: '#71717a', margin: '0 auto 8px'}} />
            <p style={{margin: '0 0 6px', fontWeight: 600, color: '#18181b'}}>
              {isEn ? 'Click to select or drag & drop a PDF file here' : '点击选择或拖放 PDF 文件到这里'}
            </p>
            <p style={{margin: 0, fontSize: '12px', color: '#71717a'}}>
              {isEn
                ? 'Supports slides, papers, scans and forms · Recommended ≤ 50MB (Limit 100MB / 200 pages)'
                : '支持课件、论文、扫描件及表单 · 单文件 ≤ 50MB 推荐（极限 100MB / 200 页）'}
            </p>
            <input
              key={fileKey}
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              aria-label={isEn ? "Select PDF file to compress" : "选择要压缩的 PDF 文件"}
              style={{display: 'none'}}
              onChange={e => {
                const picked = e.target.files?.[0];
                if (picked) void handleFile(picked);
              }}
            />
          </div>
        ) : (
          <div
            style={{
              padding: '12px 14px',
              background: '#f4f4f5',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div>
              <strong style={{fontSize: '14px', color: '#18181b', display: 'block'}}>{file.name}</strong>
              <span style={{fontSize: '12px', color: '#71717a'}}>
                {isEn ? `Original size: ${formatBytes(file.size)}` : `原始大小：${formatBytes(file.size)}`}
                {summary ? (isEn ? ` · ${summary.pageCount} pages` : ` · 共 ${summary.pageCount} 页`) : reading ? (isEn ? ' · Analyzing pages...' : ' · 正在分析页数…') : ''}
              </span>
            </div>
            {file.size > PDF_COMPRESS_LIMITS.recommendedBytes && (
              <span
                style={{
                  fontSize: '11px',
                  color: '#92400e',
                  background: '#fef3c7',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: 600,
                }}
              >
                {isEn ? 'Desktop recommended for large files' : '建议在电脑端处理大文件'}
              </span>
            )}
          </div>
        )}
      </section>

      {/* 卡片 2: 选择压缩档位与参数 */}
      {bytes && summary && !result && (
        <section className="study-card" style={{marginBottom: '18px'}}>
          <h2 style={{margin: '0 0 8px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <Sparkles size={18} />
            <span>{isEn ? '2. Select Compression Level' : '2. 选择压缩档位'}</span>
          </h2>
          <p style={{margin: '0 0 12px', fontSize: '13px', color: '#52525b'}}>
            {isEn
              ? 'Pages containing scanned images or photos are resampled at target quality; vector pages recommend lossless structural optimization.'
              : '包含扫描图像或照片的页面按设定质量重新采样；纯矢量页面建议使用无损结构优化。'}
          </p>

          {/* 4 档位单选卡片 */}
          <div className="pdf-tier-grid" role="radiogroup" aria-label={isEn ? "Select compression tier" : "压缩档位选择"}>
            {(Object.keys(COMPRESS_TIERS) as CompressTier[]).map(tKey => {
              const cfg = COMPRESS_TIERS[tKey];
              const isSelected = tier === tKey;
              return (
                <div
                  key={tKey}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  className={`pdf-tier-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => !processing && setTier(tKey)}
                  onKeyDown={e => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      if (!processing) setTier(tKey);
                    }
                  }}
                >
                  <div className="pdf-tier-header">
                    <span className="pdf-tier-title">
                      {isEn
                        ? tKey === 'recommended'
                          ? 'Recommended (120 DPI)'
                          : tKey === 'light'
                            ? 'Light (150 DPI)'
                            : tKey === 'extreme'
                              ? 'Extreme (96 DPI)'
                              : 'Lossless Optimization'
                        : cfg.label}
                    </span>
                    <span className={`pdf-tier-badge ${cfg.isLossy ? 'lossy' : 'lossless'}`}>
                      {isEn
                        ? tKey === 'lossless'
                          ? 'Lossless'
                          : tKey === 'recommended'
                            ? 'Balanced'
                            : tKey === 'light'
                              ? 'High Quality'
                              : 'Smallest'
                        : cfg.badge}
                    </span>
                  </div>
                  <p className="pdf-tier-desc">
                    {isEn
                      ? tKey === 'recommended'
                        ? 'Re-samples scanned images to 120 DPI, suitable for homework submissions and email attachments.'
                        : tKey === 'light'
                          ? 'Re-samples images to 150 DPI with minimal visual degradation.'
                          : tKey === 'extreme'
                            ? 'Re-samples to 96 DPI, maximum size reduction for upload limits.'
                            : 'Removes unused objects and optimizes streams with 100% vector clarity.'
                      : cfg.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* 明确告知是否有损 */}
          <div className="pdf-lossy-disclosure" role="note">
            <div style={{display: 'flex', alignItems: 'flex-start', gap: '8px'}}>
              <Info size={16} style={{flexShrink: 0, marginTop: '2px'}} />
              <div>
                <strong>{isEn ? 'Current tier properties: ' : '当前档位特性：'}</strong>
                <span>
                  {isEn
                    ? currentTierConfig.isLossy
                      ? 'Lossy image re-sampling: images/scans will be rasterized at selected DPI. Text within images cannot be selected.'
                      : 'Lossless optimization: cleans unused object streams, retains 100% vector fonts and crispness.'
                    : currentTierConfig.lossyNotice}
                </span>
              </div>
            </div>
          </div>

          {/* 启动压缩操作 */}
          <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', alignItems: 'center'}}>
            {processing && (
              <span style={{fontSize: '13px', color: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px'}}>
                <LoaderCircle size={15} className="spin" />
                <span>
                  {progress.total > 0
                    ? isEn
                      ? `Compressing page ${progress.current} of ${progress.total}...`
                      : `正在压缩第 ${progress.current} / ${progress.total} 页…`
                    : isEn
                      ? 'Processing...'
                      : '正在处理中…'}
                </span>
              </span>
            )}
            <button
              type="button"
              className="study-btn"
              disabled={processing}
              onClick={handleStartCompress}
              style={{
                background: '#2563eb',
                borderColor: '#2563eb',
                color: '#fff',
                padding: '9px 24px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '6px',
              }}
            >
              {processing
                ? (isEn ? 'Compressing...' : '正在压缩…')
                : (isEn ? 'Start PDF Compression ➔' : '开始压缩 PDF ➔')}
            </button>
          </div>
        </section>
      )}

      {/* 卡片 3: 压缩结果与下载 */}
      {result && file && (
        <section className="study-card" style={{marginBottom: '18px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
            <h2 style={{margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
              <CheckCircle2 size={18} style={{color: '#16a34a'}} />
              <span>{isEn ? '3. Compression Result & Download' : '3. 压缩结果与下载'}</span>
            </h2>
            <button
              type="button"
              className="study-btn alt"
              onClick={() => setResult(undefined)}
              style={{padding: '5px 12px', fontSize: '12px'}}
            >
              {isEn ? 'Re-select Tier' : '重新选择档位'}
            </button>
          </div>

          {/* 前后体积对比卡片 */}
          <div className="pdf-compress-stats">
            <div className="pdf-stat-box">
              <div className="pdf-stat-label">{isEn ? 'Original' : '原始大小'}</div>
              <div className="pdf-stat-val">{formatBytes(result.originalBytes)}</div>
            </div>
            <div className="pdf-stat-box">
              <div className="pdf-stat-label">{isEn ? 'Compressed' : '压缩后产物'}</div>
              <div className="pdf-stat-val">{formatBytes(result.compressedBytes)}</div>
            </div>
            <div className="pdf-stat-box">
              <div className="pdf-stat-label">{isEn ? 'Delivered' : '最终提供'}</div>
              <div className={`pdf-stat-val ${result.isSaved ? 'highlight' : ''}`}>
                {formatBytes(result.finalBytes)}
              </div>
            </div>
            <div className="pdf-stat-box">
              <div className="pdf-stat-label">{isEn ? 'Savings' : '体积变化'}</div>
              <div className={`pdf-stat-val ${result.isSaved ? 'highlight' : ''}`}>
                {result.isSaved ? `-${result.savedPercent}%` : (isEn ? 'No reduction' : '未减少')}
              </div>
            </div>
          </div>

          {/* 变大拦截或成功提示 */}
          {result.keptOriginal ? (
            <div className="pdf-retention-box" role="status">
              <div style={{display: 'flex', alignItems: 'flex-start', gap: '8px'}}>
                <Info size={16} style={{color: '#2563eb', flexShrink: 0, marginTop: '2px'}} />
                <div>
                  <strong>{isEn ? 'File size not reduced · Smart protection active:' : '体积未减小 · 智能保护已生效：'}</strong>
                  <p style={{margin: '4px 0 0', lineHeight: '1.6'}}>{result.notice}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="pdf-success-box" role="status">
              <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                <CheckCircle2 size={16} style={{flexShrink: 0}} />
                <span>{result.notice}</span>
              </div>
            </div>
          )}

          {/* 下载按钮 */}
          <div style={{display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', flexWrap: 'wrap'}}>
            <button
              type="button"
              className="study-btn"
              onClick={handleDownload}
              style={{
                background: result.keptOriginal ? '#4b5563' : '#16a34a',
                borderColor: result.keptOriginal ? '#4b5563' : '#16a34a',
                color: '#fff',
                padding: '9px 24px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Download size={16} />
              <span>
                {result.keptOriginal
                  ? (isEn ? `Download Kept Original (${formatBytes(result.finalBytes)})` : `下载保留的原文件 (${formatBytes(result.finalBytes)})`)
                  : (isEn ? `Download Compressed PDF (${formatBytes(result.finalBytes)})` : `下载压缩后的 PDF (${formatBytes(result.finalBytes)})`)}
              </span>
            </button>
          </div>

          <ShareToClassmates toolId="pdf-compress" />
        </section>
      )}

      {/* 底部使用提示与说明 */}
      <section className="study-card" style={{marginTop: '24px'}}>
        <h3 style={{margin: '0 0 10px', fontSize: '14px', color: '#18181b', display: 'flex', alignItems: 'center', gap: '6px'}}>
          <ShieldCheck size={16} />
          <span>{isEn ? 'Compression Principles & Privacy Security' : '压缩原理与隐私安全说明'}</span>
        </h3>
        <ul className="study-checklist" style={{margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#52525b', lineHeight: '1.7'}}>
          <li>
            <strong>{isEn ? 'Lossy Re-sampling: ' : '有损重采样压缩：'}</strong>
            {isEn
              ? 'Rasterizes pages to 150/120/96 DPI JPEG images and re-packages them. Ideal for scanned documents and lecture slides with photos.'
              : '将页面光栅化为 150/120/96 DPI 的 JPEG 图像并重新封装，专治扫描版 PDF、包含手机实拍照片或嵌入超清配图的课件。代价是文字将变为图片形式，不再支持单独划词搜索。'}
          </li>
          <li>
            <strong>{isEn ? 'Lossless Structural Optimization: ' : '无损结构优化：'}</strong>
            {isEn
              ? 'Cleans revision history, orphaned object streams, and unreferenced fonts while retaining 100% crisp vector text. Perfect for Word/LaTeX PDFs.'
              : '清理文档历史修订流、孤立对象表与未引用字体，打包紧凑对象流，100% 保持原有清晰度与矢量文字，适合从 Word、LaTeX 排版导出的文档。'}
          </li>
          <li>
            <strong>{isEn ? 'Growth Interception: ' : '变大自动拦截：'}</strong>
            {isEn
              ? 'If compressed file becomes larger than the original, the system automatically intercepts it and retains the original file.'
              : '若纯文字文档经重采样后体积反而膨胀，系统会自动拦截并保留原文件，绝不向你提供虚假变大的文件。'}
          </li>
          <li>
            <strong>{isEn ? '100% In-Browser Privacy: ' : '严格本地处理：'}</strong>
            {isEn
              ? 'All processing occurs purely in your browser tab memory. No cloud upload, no login required, zero leak risk.'
              : '所有计算均在当前浏览器标签页内存中完成，不上传云端服务器，无需登录，保障学生作业与个人文件隐私。'}
          </li>
        </ul>
      </section>
    </ToolPage>
  );
}
