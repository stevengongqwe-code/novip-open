import {useEffect, useRef, useState} from 'react';
import {ToolPage, useJob, saveLocal, isWeChat, WeChatNotice} from './common';
import {inspectPdf, ptToMm, type PdfInfo} from './pdf-page-number-core';
import {
  WATERMARK_DEFAULTS,
  WATERMARK_LIMITS,
  addWatermark,
  normalizeWatermarkOptions,
  type WatermarkOptions,
} from './watermark-core';
import {drawWatermarkOnContext, renderOverlayPng} from './watermark-render';
import './pdf-watermark.css';

const formatBytes = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function PdfWatermark() {
  const job = useJob();
  const [file, setFile] = useState<File>();
  const [bytes, setBytes] = useState<Uint8Array>();
  const [info, setInfo] = useState<PdfInfo>();
  const [options, setOptions] = useState<WatermarkOptions>({...WATERMARK_DEFAULTS});
  const [result, setResult] = useState<{bytes: Uint8Array; pageCount: number; markedPages: number; overlayVariants: number}>()
  const [loading, setLoading] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [previewError, setPreviewError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const patch = (value: Partial<WatermarkOptions>) => {
    job.setError('');
    setResult(undefined);
    setOptions((current) => ({...current, ...value}));
  };

  const reset = () => {
    job.reset();
    setFile(undefined); setBytes(undefined); setInfo(undefined); setResult(undefined);
    setLoading(false); setPreviewError(''); setFileKey((key) => key + 1);
  };

  const read = async (next: File | undefined) => {
    setFile(next); setBytes(undefined); setInfo(undefined); setResult(undefined); job.reset(); setPreviewError('');
    if (!next) return;
    setLoading(true); job.setStatus('正在读取 PDF 信息（大文件可能需要数秒）…');
    try {
      if (next.size > WATERMARK_LIMITS.maxBytes) {
        throw new Error(`文件大小为 ${(next.size / 1024 / 1024).toFixed(1)}MB（超过 50MB 建议上限）。为防浏览器崩溃，建议：1. 先前往「PDF 合并与拆分」提取需要盖水印的页码；2. 或先压缩后再加水印。`);
      }
      const buffer = new Uint8Array(await next.arrayBuffer());
      const inspected = await inspectPdf(buffer);
      setBytes(buffer); setInfo(inspected);
      job.setStatus(`已读取 ${inspected.pageCount} 页 PDF，可调整水印并预览。`);
    } catch (error) {
      job.setError(error instanceof Error ? error.message : 'PDF 读取失败，请换一个文件。');
      job.setStatus('未完成。');
    } finally { setLoading(false); }
  };

  // 预览：与导出使用同一套 Canvas 绘制逻辑。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !info) return;
    setPreviewError('');
    try {
      const normalized = normalizeWatermarkOptions(options);
      const page = info.sizes[0];
      const displayWidth = Math.min(360, canvas.parentElement?.clientWidth || 360);
      const ratio = page.height / page.width;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(displayWidth * dpr);
      canvas.height = Math.round(displayWidth * ratio * dpr);
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${Math.round(displayWidth * ratio)}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('当前浏览器不支持 Canvas。');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawWatermarkOnContext(ctx, page.width, page.height, normalized, canvas.width / page.width);
      // 页面内容占位：让用户看出水印会在整页上重复。
      ctx.strokeStyle = '#e4e4e7';
      ctx.lineWidth = 1;
      ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : '预览生成失败。');
    }
  }, [info, options]);

  let planError = '';
  let targetCount = 0;
  if (info) {
    try {
      normalizeWatermarkOptions(options);
      targetCount = options.range.trim() ? countRange(options.range, info.pageCount) : info.pageCount;
    } catch (error) { planError = error instanceof Error ? error.message : '水印参数有误。'; }
  }

  const generate = () => {
    if (!bytes || !info) return;
    setResult(undefined);
    void job.run(async (check) => {
      const normalized = normalizeWatermarkOptions(options);
      check();
      return addWatermark(
        bytes,
        normalized,
        (request) => renderOverlayPng(request.width, request.height, normalized),
        check,
        (cur, tot) => job.setStatus(`正在给第 ${cur}/${tot} 页加水印…`)
      );
    }, setResult);
  };

  const download = () => {
    if (!result) return;
    const name = (file?.name || 'document.pdf').replace(/\.pdf$/i, '');
    saveLocal(new Blob([result.bytes.slice().buffer], {type: 'application/pdf'}), `${name}-加水印.pdf`);
    if (isWeChat()) job.setStatus('已触发下载。如微信未提示保存，请点击右上角「···」在浏览器中打开。');
  };

  const preset = (id: 'report' | 'sign' | 'invoice') => {
    if (id === 'report') patch({text: '仅供报名使用', mode: 'tile', fontSize: 36, opacity: 0.18, rotate: -30, color: '#c9232c'});
    if (id === 'sign') patch({text: '仅供本人办理业务使用', mode: 'tile', fontSize: 30, opacity: 0.14, rotate: -45, color: '#71717a'});
    if (id === 'invoice') patch({text: '仅用于本次提交 · 复印无效', mode: 'single', fontSize: 28, opacity: 0.32, rotate: 0, color: '#c9232c'});
  };

  return (
    <ToolPage id="pdf-watermark" title="PDF加水印" description="给 PDF 叠加中文水印：密铺或单条居中、颜色/透明度/角度/字号可调、可按页码范围只盖部分页。全程本机处理，不上传文件。" job={job}>
      <section className="study-card">
        <h2>1 选择 PDF</h2>
        <div className="upload-limit-banner"><strong>文件上限：</strong>单文件建议 ≤ 50MB（最多 {WATERMARK_LIMITS.maxPages} 页）· 纯本地渲染叠加水印，不上传原件</div>
        <div className="tool-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.[0]) void read(e.dataTransfer.files[0]); }}>
          <p style={{margin: '0 0 8px', fontWeight: 600}}>拖入 PDF 文件，或点击选择</p>
          <input key={fileKey} type="file" accept=".pdf,application/pdf" disabled={job.busy || loading} onChange={(event) => void read(event.target.files?.[0])} />
          <small style={{display: 'block', marginTop: '6px', color: '#71717a'}}>⚡ 纯本地内存处理 · 建议单个 ≤ 50MB · {WATERMARK_LIMITS.maxPages} 页以内 · 不上传服务器</small>
        </div>
        {loading && <p className="study-message" role="status">正在读取 PDF 信息…</p>}
        {info && <p className="study-note">共 {info.pageCount} 页 · 第1页 {ptToMm(info.sizes[0].width).toFixed(1)} × {ptToMm(info.sizes[0].height).toFixed(1)} mm · 文件 {formatBytes(file?.size ?? 0)}</p>}
      </section>

      {info && <section className="study-card">
        <h2>2 水印设置</h2>
        <div className="pdf-preset-row" role="group" aria-label="常用水印预设">
          <button type="button" disabled={job.busy} onClick={() => preset('report')}>报名材料</button>
          <button type="button" disabled={job.busy} onClick={() => preset('sign')}>证件复印件</button>
          <button type="button" disabled={job.busy} onClick={() => preset('invoice')}>单条居中声明</button>
        </div>
        <div className="study-fields">
          <label>水印文字（最多 {WATERMARK_LIMITS.maxTextLength} 字）
            <input value={options.text} maxLength={WATERMARK_LIMITS.maxTextLength} disabled={job.busy} onChange={(event) => patch({text: event.target.value})} placeholder="仅供报名使用" />
          </label>
          <label>排布方式
            <select value={options.mode} disabled={job.busy} onChange={(event) => patch({mode: event.target.value as WatermarkOptions['mode']})}>
              <option value="tile">全页密铺（防盗用）</option>
              <option value="single">页面正中一条</option>
            </select>
          </label>
          <label>字号（pt）
            <input type="number" min={WATERMARK_LIMITS.minFontSize} max={WATERMARK_LIMITS.maxFontSize} step={1} value={options.fontSize} disabled={job.busy} onChange={(event) => patch({fontSize: Number(event.target.value)})} />
          </label>
          <label>透明度（{WATERMARK_LIMITS.minOpacity}–{WATERMARK_LIMITS.maxOpacity}）
            <input type="number" min={WATERMARK_LIMITS.minOpacity} max={WATERMARK_LIMITS.maxOpacity} step={0.01} value={options.opacity} disabled={job.busy} onChange={(event) => patch({opacity: Number(event.target.value)})} />
          </label>
          <label>旋转角度（-90 到 90）
            <input type="number" min={-90} max={90} step={1} value={options.rotate} disabled={job.busy} onChange={(event) => patch({rotate: Number(event.target.value)})} />
          </label>
          <label>颜色
            <span className="pdf-color-field">
              <input type="color" value={options.color} disabled={job.busy} aria-label="选择水印颜色" onChange={(event) => patch({color: event.target.value})} />
              <input value={options.color} maxLength={7} disabled={job.busy} aria-label="水印颜色十六进制值" onChange={(event) => patch({color: event.target.value})} />
            </span>
          </label>
          <label>页码范围（留空=全部，如 1-3,5）
            <input value={options.range} disabled={job.busy} onChange={(event) => patch({range: event.target.value})} placeholder="1-3,5" />
          </label>
        </div>

        <h3>实时预览（第 1 页比例）</h3>
        <div className="pdf-watermark-preview">
          {previewError ? <p className="study-warning" role="alert">{previewError}</p> : <canvas ref={canvasRef} aria-label="水印效果预览" role="img" />}
        </div>
        <p className="study-note">预览为示意比例；导出时会按每页真实尺寸生成。若原页面本身带旋转（/Rotate），水印会跟随页面一起旋转。中文使用系统字体，不嵌入字体文件、不会额外增大 PDF 太多。</p>
      </section>}

      {info && bytes && <section className="study-card">
        <h2>3 生成与下载</h2>
        {planError ? <p className="study-warning" role="alert">{planError}</p> : <p>将给 <strong>{targetCount}</strong> 页叠加水印：{options.mode === 'tile' ? '全页密铺' : '居中单条'}，字号 {options.fontSize}pt，透明度 {options.opacity}，角度 {options.rotate}°，颜色 {options.color}。</p>}
        <div className="study-actions">
          <button className="study-btn" disabled={!!planError || job.busy} onClick={generate}>生成带水印的 PDF</button>
          <button className="study-btn alt" disabled={job.busy} onClick={reset}>取消 / 重置</button>
        </div>
        <p className="study-note">加水印是可逆的视觉叠加，不是加密或脱敏；原件仍可被他人获得时，水印只能起到标识与追溯提示作用。</p>
      </section>}

      {result && <section className="study-card">
        <h2>4 结果</h2>
        <p>{result.pageCount} 页 · 已加 {result.markedPages} 页 · 输出 {formatBytes(result.bytes.length)} · 页面尺寸样式 {result.overlayVariants} 种</p>
        <WeChatNotice customText="📱 微信提示：若点击下载未弹出保存文件提示，请点击右上角「···」选择「在浏览器打开」即可保存到手机文件。" />
        <button className="study-btn" onClick={download}>下载带水印的 PDF</button>
        <p className="study-note">请打开下载结果逐页核对，尤其是扫描件、横竖混排和已带旋转的页面。</p>
      </section>}
    </ToolPage>
  );
}

function countRange(range: string, total: number): number {
  let count = 0;
  const text = range.replace(/[，、;；]/g, ',').replace(/[–—－~～]/g, '-');
  for (const part of text.split(',')) {
    const value = part.trim();
    if (!value) continue;
    const single = /^(\d+)$/.exec(value);
    const span = /^(\d+)\s*-\s*(\d+)$/.exec(value);
    if (single) count++;
    else if (span) count += Math.abs(Number(span[2]) - Number(span[1])) + 1;
    else throw new Error('页码范围格式不正确，请使用 1-3,5 这样的写法。');
  }
  return Math.min(count, total);
}
