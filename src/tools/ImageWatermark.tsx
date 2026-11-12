import {useEffect, useRef, useState} from 'react';
import {zipSync} from 'fflate';
import {ToolPage, useJob, saveLocal} from './common';
import { useI18n } from '../i18n';
import {
  IMAGE_WATERMARK_DEFAULTS,
  IMAGE_WATERMARK_LIMITS,
  POSITION_LABELS,
  buildWatermarkPreset,
  buildWatermarkedFileName,
  drawImageWatermarkOnContext,
  formatTodayDate,
  normalizeImageWatermarkOptions,
  resolveOutputMime,
  validateWatermarkUpload,
  type ImageWatermarkLayout,
  type ImageWatermarkOptions,
  type ImageWatermarkOutputFormat,
  type WatermarkPosition,
  type WatermarkPresetId,
} from './image-watermark-core';
import './image-watermark.css';

interface LoadedImageItem {
  id: number;
  name: string;
  size: number;
  type: string;
  width: number;
  height: number;
  file: File;
}

interface GeneratedItem {
  id: number;
  originalName: string;
  outputName: string;
  width: number;
  height: number;
  beforeBytes: number;
  afterBytes: number;
  stampCount: number;
  blob: Blob;
  bytes: Uint8Array;
}

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const decodeBitmap = async (file: Blob, label: string): Promise<ImageBitmap> => {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(`无法解码图片「${label}」：仅支持 JPG、PNG、WebP 静态图片，或文件已损坏。`);
  }
};

/** 未选择图片时，在预览画布上绘制一张模拟证件/作业底图（左浅右深），便于直接调节水印效果。 */
function paintSampleCard(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(Math.round(width * 0.58), 0, Math.round(width * 0.42), height);
  ctx.fillStyle = '#cbd5e1';
  const pad = Math.round(width * 0.06);
  ctx.fillRect(pad, pad, Math.round(width * 0.24), Math.round(height * 0.34));
  ctx.fillStyle = '#94a3b8';
  const lineX = Math.round(width * 0.34);
  for (let row = 0; row < 4; row++) {
    ctx.fillRect(
      lineX,
      pad + row * Math.round(height * 0.1),
      Math.round(width * (row === 3 ? 0.35 : 0.52)),
      Math.max(6, Math.round(height * 0.035)),
    );
  }
}

export default function ImageWatermark() {
  const { lang } = useI18n();
  const isEn = lang === 'en-US';
  const job = useJob();
  const fileIdRef = useRef(1);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [files, setFiles] = useState<LoadedImageItem[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [logoInputKey, setLogoInputKey] = useState(0);
  const [logoFile, setLogoFile] = useState<{name: string; width: number; height: number; file: File} | null>(null);
  const [options, setOptions] = useState<ImageWatermarkOptions>(() => ({
    ...IMAGE_WATERMARK_DEFAULTS,
    subText: formatTodayDate(),
  }));
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [previewInfo, setPreviewInfo] = useState<{width: number; height: number; stamps: number; isSample: boolean}>({
    width: 800,
    height: 520,
    stamps: 0,
    isSample: true,
  });
  const [previewError, setPreviewError] = useState('');
  const [results, setResults] = useState<GeneratedItem[]>([]);
  const [notice, setNotice] = useState('');

  const busy = scanning || job.busy;
  const activeFile = files.find((item) => item.id === activeId) ?? files[0] ?? null;
  const totalBytes = files.reduce((sum, item) => sum + item.size, 0);

  const patch = (next: Partial<ImageWatermarkOptions>) => {
    job.setError('');
    setPreviewError('');
    setResults([]);
    setNotice('');
    setOptions((current) => ({...current, ...next}));
  };

  let validationError = '';
  try {
    normalizeImageWatermarkOptions(options, Boolean(logoFile));
  } catch (error) {
    validationError = error instanceof Error ? error.message : '水印参数有误。';
  }

  // 实时预览：有图片时绘制当前选中图片 + 水印；无图片时绘制模拟证件/作业底图 + 水印。
  useEffect(() => {
    let cancelled = false;
    const renderPreview = async () => {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      setPreviewError('');
      try {
        const normalized = normalizeImageWatermarkOptions(options, Boolean(logoFile));
        let sourceBitmap: ImageBitmap | null = null;
        let logoBitmap: ImageBitmap | null = null;
        try {
          if (activeFile) {
            sourceBitmap = await decodeBitmap(activeFile.file, activeFile.name);
          }
          if (normalized.includeLogo && logoFile) {
            logoBitmap = await decodeBitmap(logoFile.file, logoFile.name);
          }
          if (cancelled) return;

          const rawW = sourceBitmap ? sourceBitmap.width : 800;
          const rawH = sourceBitmap ? sourceBitmap.height : 520;
          const maxPreviewEdge = 760;
          const scale = Math.min(1, maxPreviewEdge / Math.max(rawW, rawH));
          const drawW = Math.max(1, Math.round(rawW * scale));
          const drawH = Math.max(1, Math.round(rawH * scale));

          canvas.width = drawW;
          canvas.height = drawH;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D。');
          ctx.clearRect(0, 0, drawW, drawH);
          if (sourceBitmap) {
            ctx.drawImage(sourceBitmap, 0, 0, drawW, drawH);
          } else {
            paintSampleCard(ctx, drawW, drawH);
          }
          const {stampCount} = drawImageWatermarkOnContext(ctx, drawW, drawH, normalized, logoBitmap);
          setPreviewInfo({
            width: rawW,
            height: rawH,
            stamps: stampCount,
            isSample: !sourceBitmap,
          });
        } finally {
          sourceBitmap?.close();
          logoBitmap?.close();
        }
      } catch (error) {
        if (!cancelled) {
          setPreviewError(error instanceof Error ? error.message : '预览生成失败。');
        }
      }
    };
    void renderPreview();
    return () => {
      cancelled = true;
    };
  }, [activeFile, logoFile, options]);

  const handleAddFiles = async (picked: FileList | null) => {
    if (!picked?.length || busy) return;
    const incoming = [...picked];
    setScanning(true);
    setScanError('');
    setNotice('');
    setResults([]);
    try {
      validateWatermarkUpload([
        ...files.map((f) => ({name: f.name, size: f.size, width: f.width, height: f.height})),
        ...incoming.map((f) => ({name: f.name, size: f.size})),
      ]);
      const loaded: LoadedImageItem[] = [];
      for (const file of incoming) {
        const bitmap = await decodeBitmap(file, file.name);
        try {
          validateWatermarkUpload([{name: file.name, size: file.size, width: bitmap.width, height: bitmap.height}]);
          loaded.push({
            id: fileIdRef.current++,
            name: file.name,
            size: file.size,
            type: file.type || 'image/png',
            width: bitmap.width,
            height: bitmap.height,
            file,
          });
        } finally {
          bitmap.close();
        }
      }
      setFiles((prev) => {
        const merged = [...prev, ...loaded];
        return merged;
      });
      if (activeId === null && loaded.length > 0) {
        setActiveId(loaded[0].id);
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : '读取图片失败，请重试。');
    } finally {
      setScanning(false);
      setFileInputKey((k) => k + 1);
    }
  };

  const handleLogoUpload = async (file: File | undefined) => {
    if (!file || busy) return;
    setScanError('');
    setResults([]);
    try {
      if (file.size > IMAGE_WATERMARK_LIMITS.maxLogoBytes) {
        throw new Error('Logo 图片最多 5MB，请换一张更小的图标。');
      }
      const bitmap = await decodeBitmap(file, file.name);
      try {
        setLogoFile({name: file.name, width: bitmap.width, height: bitmap.height, file});
        patch({includeLogo: true});
      } finally {
        bitmap.close();
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Logo 图片读取失败。');
    } finally {
      setLogoInputKey((k) => k + 1);
    }
  };

  const removeFile = (id: number) => {
    setResults([]);
    setNotice('');
    setFiles((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (activeId === id) {
        setActiveId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const applyPreset = (id: WatermarkPresetId) => {
    patch(buildWatermarkPreset(id, formatTodayDate()));
  };

  const resetAll = () => {
    job.reset();
    setFiles([]);
    setActiveId(null);
    setLogoFile(null);
    setResults([]);
    setScanError('');
    setPreviewError('');
    setNotice('');
    setFileInputKey((k) => k + 1);
    setLogoInputKey((k) => k + 1);
    setOptions({
      ...IMAGE_WATERMARK_DEFAULTS,
      subText: formatTodayDate(),
    });
  };

  const generateAll = () => {
    if (!files.length) return;
    setResults([]);
    setNotice('');
    void job.run(async (check) => {
      validateWatermarkUpload(files.map((f) => ({name: f.name, size: f.size, width: f.width, height: f.height})));
      const normalized = normalizeImageWatermarkOptions(options, Boolean(logoFile));
      let logoBitmap: ImageBitmap | null = null;
      const usedNames = new Set<string>();
      const out: GeneratedItem[] = [];
      try {
        if (normalized.includeLogo && logoFile) {
          logoBitmap = await decodeBitmap(logoFile.file, logoFile.name);
        }
        for (let i = 0; i < files.length; i++) {
          check();
          const item = files[i];
          job.setStatus(`正在处理第 ${i + 1}/${files.length} 张「${item.name}」…`);
          await new Promise((resolve) => setTimeout(resolve, 0));
          check();
          const bitmap = await decodeBitmap(item.file, item.name);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          try {
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('当前浏览器无法创建 Canvas 2D 上下文。');
            const {mime, ext} = resolveOutputMime(item.type, normalized.format);
            if (mime === 'image/jpeg') {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const {stampCount} = drawImageWatermarkOnContext(ctx, canvas.width, canvas.height, normalized, logoBitmap);
            check();
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob(
                (encoded) => {
                  if (!encoded?.size) reject(new Error(`图片「${item.name}」编码失败，请尝试换用 PNG 格式或缩小原图。`));
                  else resolve(encoded);
                },
                mime,
                mime === 'image/png' ? undefined : normalized.quality,
              );
            });
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const outputName = buildWatermarkedFileName(item.name, ext, usedNames);
            out.push({
              id: item.id,
              originalName: item.name,
              outputName,
              width: bitmap.width,
              height: bitmap.height,
              beforeBytes: item.size,
              afterBytes: bytes.length,
              stampCount,
              blob,
              bytes,
            });
          } finally {
            bitmap.close();
            canvas.width = 1;
            canvas.height = 1;
          }
        }
      } finally {
        logoBitmap?.close();
      }
      return out;
    }, (done) => {
      setResults(done);
      job.setStatus(`已完成 ${done.length} 张图片加水印处理。`);
    });
  };

  const downloadSingle = (item: GeneratedItem) => {
    saveLocal(item.blob, item.outputName);
    setNotice(`已开始下载「${item.outputName}」。`);
  };

  const downloadZip = () => {
    if (!results.length) return;
    const entries: Record<string, Uint8Array> = {};
    for (const item of results) {
      entries[item.outputName] = item.bytes;
    }
    const zipped = zipSync(entries, {level: 6});
    const zipName = isEn
      ? `watermark-${formatTodayDate()}-${results.length}-images.zip`
      : `图片加水印-${formatTodayDate()}-共${results.length}张.zip`;
    saveLocal(new Blob([zipped.slice().buffer], {type: 'application/zip'}), zipName);
    setNotice(isEn ? `Downloading ZIP package "${zipName}" (${results.length} images).` : `已打包下载「${zipName}」（共 ${results.length} 张）。`);
  };

  return (
    <ToolPage
      id="image-watermark"
      title={isEn ? "Image Watermark / ID Theft Protection Watermark" : "图片加水印 / 证件防盗用水印"}
      description={isEn
        ? "Add 'For XX Application Only · Invalid for Other Uses' anti-theft tiled watermarks to ID cards, student IDs, or application documents. Add 3x3 corner signatures, timestamps, and logos to homework, notes, and photos. 100% in-browser offline processing."
        : "给身份证/学生证/报名材料照片加「仅供XX使用 · 他用无效」全图防盗用密铺水印，或给课程作业/笔记/实拍图加九宫格角标署名、日期戳与 Logo 图标。支持批量处理与 ZIP 下载，100% 浏览器本地合成，绝不上传原图。"}
      job={job}
    >
      <section className="study-card">
        <h2>{isEn ? "1 Select Images (Single or Batch)" : "1 选择图片（支持单张或批量）"}</h2>
        <input
          key={fileInputKey}
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          multiple
          aria-label={isEn ? "Select images to watermark" : "选择要加水印的图片"}
          disabled={busy}
          onChange={(e) => void handleAddFiles(e.target.files)}
        />
        <p className="study-note">
          {isEn
            ? `Supports JPG / PNG / WebP, up to ${IMAGE_WATERMARK_LIMITS.maxFiles} images (≤ 25MB each, ≤ 100MB total). All processing happens in local browser memory without uploading to any server.`
            : `支持 JPG / PNG / WebP，单次最多 ${IMAGE_WATERMARK_LIMITS.maxFiles} 张（单张 ≤ 25MB、合计 ≤ 100MB）。所有图片仅在当前浏览器内存中合成，不会上传到任何服务器。`}
        </p>
        {scanning && <p className="study-message" role="status">{isEn ? "Reading image dimensions…" : "正在读取图片尺寸信息…"}</p>}
        {scanError && <p className="study-error" role="alert">{scanError}</p>}

        <p className="study-note">
          {isEn ? (
            <>
              Selected <strong>{files.length}</strong> image{files.length === 1 ? '' : 's'}
              {files.length > 0 ? ` · Total ${formatBytes(totalBytes)} (Click file name to switch preview)` : ' · Sample ID card preview shown below when no images selected'}
            </>
          ) : (
            <>
              已选 <strong>{files.length}</strong> 张图片
              {files.length > 0 ? ` · 合计 ${formatBytes(totalBytes)}（点击文件名可切换预览图）` : ' · 未选图片时下方展示模拟证件预览'}
            </>
          )}
        </p>

        {files.length > 0 && (
          <div className="img-wm-file-list" role="list" aria-label={isEn ? "Selected images list" : "已选图片列表"}>
            {files.map((item, idx) => {
              const isCurrent = activeFile?.id === item.id;
              return (
                <div key={item.id} role="listitem" className={`img-wm-file-pill${isCurrent ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="img-wm-file-select"
                    disabled={busy}
                    onClick={() => setActiveId(item.id)}
                    title={`${item.name} (${item.width}×${item.height}px)`}
                  >
                    {idx + 1}. {item.name} ({item.width}×{item.height})
                  </button>
                  <button
                    type="button"
                    className="img-wm-file-remove"
                    disabled={busy}
                    aria-label={isEn ? `Remove ${item.name}` : `移除 ${item.name}`}
                    onClick={() => removeFile(item.id)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="study-card">
        <h2>{isEn ? "2 Watermark Content & Layout Settings" : "2 水印内容与排布设置"}</h2>
        <div className="img-wm-preset-row" role="group" aria-label={isEn ? "Watermark Presets" : "常用图片水印预设"}>
          <button type="button" disabled={busy} onClick={() => applyPreset('id-card')}>
            {isEn ? "ID Theft-Proof" : "报名证件防盗用"}
          </button>
          <button type="button" disabled={busy} onClick={() => applyPreset('copy-verify')}>
            {isEn ? "ID / Student Card Copy" : "身份证/学生证复印件"}
          </button>
          <button type="button" disabled={busy} onClick={() => applyPreset('homework')}>
            {isEn ? "Homework Anti-Theft" : "作业/实验图防盗图"}
          </button>
          <button type="button" disabled={busy} onClick={() => applyPreset('corner-date')}>
            {isEn ? "Corner Signature + Date" : "右下角署名+日期戳"}
          </button>
          <button type="button" disabled={busy} onClick={() => applyPreset('center-stamp')}>
            {isEn ? "Center Large Draft Stamp" : "正中初稿大章"}
          </button>
        </div>

        <div className="study-fields">
          <label>
            {isEn ? `Primary Text (max ${IMAGE_WATERMARK_LIMITS.maxTextLength} chars)` : `水印主文字（最多 ${IMAGE_WATERMARK_LIMITS.maxTextLength} 字）`}
            <input
              aria-label={isEn ? "Primary watermark text" : "水印主文字"}
              value={options.text}
              maxLength={IMAGE_WATERMARK_LIMITS.maxTextLength}
              disabled={busy}
              placeholder={isEn ? "For verification only · Invalid for other uses" : "仅供本次报名审核使用 · 他用无效"}
              onChange={(e) => patch({text: e.target.value})}
            />
          </label>

          <div>
            <label>
              {isEn ? `Subtitle / Timestamp (optional, max ${IMAGE_WATERMARK_LIMITS.maxSubTextLength} chars)` : `副标题 / 日期小字（可选，最多 ${IMAGE_WATERMARK_LIMITS.maxSubTextLength} 字）`}
              <input
                aria-label={isEn ? "Subtitle or date" : "副标题或日期"}
                value={options.subText}
                maxLength={IMAGE_WATERMARK_LIMITS.maxSubTextLength}
                disabled={busy}
                placeholder={isEn ? "e.g. 2026-10-28 or Student ID/Name" : "如 2026-10-28 或 学号/姓名"}
                onChange={(e) => patch({subText: e.target.value})}
              />
            </label>
            <div className="img-wm-subtext-bar">
              <button
                type="button"
                className="img-wm-inline-btn"
                disabled={busy}
                onClick={() => patch({subText: formatTodayDate()})}
              >
                {isEn ? "Fill Today's Date" : "填入今日日期"}
              </button>
              <button
                type="button"
                className="img-wm-inline-btn"
                disabled={busy || !options.subText}
                onClick={() => patch({subText: ''})}
              >
                {isEn ? "Clear Subtitle" : "清空副标题"}
              </button>
            </div>
          </div>

          <label>
            {isEn ? "Layout Mode" : "排布方式"}
            <select
              aria-label={isEn ? "Layout Mode" : "排布方式"}
              value={options.layout}
              disabled={busy}
              onChange={(e) => patch({layout: e.target.value as ImageWatermarkLayout})}
            >
              <option value="tile">{isEn ? "Full Image Staggered Tile (Anti-theft / Copyright)" : "全图错位密铺（证件防盗用 / 版权保护）"}</option>
              <option value="grid">{isEn ? "3x3 Grid Single Location (Corner Signature / Date)" : "九宫格单处定位（角标署名 / 日期戳）"}</option>
              <option value="center">{isEn ? "Center Single Large Stamp" : "页面正中单条大章"}</option>
            </select>
          </label>

          <label>
            {isEn
              ? `Base Font Size (${IMAGE_WATERMARK_LIMITS.minFontSize}–${IMAGE_WATERMARK_LIMITS.maxFontSize}, auto scaled)`
              : `基准字号（${IMAGE_WATERMARK_LIMITS.minFontSize}–${IMAGE_WATERMARK_LIMITS.maxFontSize}，按原图分辨率自动等比缩放）`}
            <input
              type="number"
              aria-label={isEn ? "Base Font Size" : "基准字号"}
              min={IMAGE_WATERMARK_LIMITS.minFontSize}
              max={IMAGE_WATERMARK_LIMITS.maxFontSize}
              step={1}
              value={options.fontSize}
              disabled={busy}
              onChange={(e) => patch({fontSize: Number(e.target.value)})}
            />
          </label>

          <label>
            {isEn
              ? `Opacity (${IMAGE_WATERMARK_LIMITS.minOpacity}–${IMAGE_WATERMARK_LIMITS.maxOpacity})`
              : `透明度（${IMAGE_WATERMARK_LIMITS.minOpacity}–${IMAGE_WATERMARK_LIMITS.maxOpacity}）`}
            <input
              type="number"
              aria-label={isEn ? "Watermark Opacity" : "水印透明度"}
              min={IMAGE_WATERMARK_LIMITS.minOpacity}
              max={IMAGE_WATERMARK_LIMITS.maxOpacity}
              step={0.02}
              value={options.opacity}
              disabled={busy}
              onChange={(e) => patch({opacity: Number(e.target.value)})}
            />
          </label>

          <label>
            {isEn ? "Rotation Angle (-90° to 90°)" : "旋转角度（-90° 到 90°）"}
            <input
              type="number"
              aria-label={isEn ? "Rotation Angle" : "旋转角度"}
              min={-90}
              max={90}
              step={1}
              value={options.rotate}
              disabled={busy}
              onChange={(e) => patch({rotate: Number(e.target.value)})}
            />
          </label>

          <label>
            {isEn ? "Watermark Color" : "水印颜色"}
            <span className="img-wm-color-field">
              <input
                type="color"
                aria-label={isEn ? "Select Watermark Color" : "选择水印颜色"}
                value={/^#[0-9a-fA-F]{6}$/.test(options.color) ? options.color : '#c9232c'}
                disabled={busy}
                onChange={(e) => patch({color: e.target.value})}
              />
              <input
                aria-label={isEn ? "Watermark Color Hex Value" : "水印颜色十六进制值"}
                value={options.color}
                maxLength={7}
                disabled={busy}
                onChange={(e) => patch({color: e.target.value})}
              />
            </span>
          </label>

          <label>
            {isEn ? "Output Format" : "输出格式"}
            <select
              aria-label={isEn ? "Output Format" : "输出格式"}
              value={options.format}
              disabled={busy}
              onChange={(e) => patch({format: e.target.value as ImageWatermarkOutputFormat})}
            >
              <option value="keep">{isEn ? "Keep Original Format (Recommended)" : "保持原图格式（推荐）"}</option>
              <option value="png">{isEn ? "PNG (Lossless)" : "PNG（无损）"}</option>
              <option value="jpeg">{isEn ? "JPEG (Good for size control)" : "JPEG（适合控制报名附件大小）"}</option>
              <option value="webp">{isEn ? "WebP (High compression)" : "WebP（高压缩比）"}</option>
            </select>
          </label>

          {options.layout === 'tile' && (
            <>
              <label>
                水平间距系数（{IMAGE_WATERMARK_LIMITS.minGapFactor}–{IMAGE_WATERMARK_LIMITS.maxGapFactor}，越小越密）
                <input
                  type="number"
                  aria-label="水平间距系数"
                  min={IMAGE_WATERMARK_LIMITS.minGapFactor}
                  max={IMAGE_WATERMARK_LIMITS.maxGapFactor}
                  step={0.1}
                  value={options.gapX}
                  disabled={busy}
                  onChange={(e) => patch({gapX: Number(e.target.value)})}
                />
              </label>
              <label>
                垂直间距系数（{IMAGE_WATERMARK_LIMITS.minGapFactor}–{IMAGE_WATERMARK_LIMITS.maxGapFactor}，越小越密）
                <input
                  type="number"
                  aria-label="垂直间距系数"
                  min={IMAGE_WATERMARK_LIMITS.minGapFactor}
                  max={IMAGE_WATERMARK_LIMITS.maxGapFactor}
                  step={0.1}
                  value={options.gapY}
                  disabled={busy}
                  onChange={(e) => patch({gapY: Number(e.target.value)})}
                />
              </label>
            </>
          )}

          {options.layout === 'grid' && (
            <>
              <div>
                <span>九宫格位置</span>
                <div className="img-wm-grid-picker" role="group" aria-label="九宫格位置选择">
                  {POSITION_LABELS.map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      disabled={busy}
                      className={options.position === pos.id ? 'active' : ''}
                      aria-pressed={options.position === pos.id}
                      onClick={() => patch({position: pos.id as WatermarkPosition})}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                距离边缘比例（{IMAGE_WATERMARK_LIMITS.minMarginPercent}%–{IMAGE_WATERMARK_LIMITS.maxMarginPercent}%）
                <input
                  type="number"
                  aria-label="距离边缘比例"
                  min={IMAGE_WATERMARK_LIMITS.minMarginPercent}
                  max={IMAGE_WATERMARK_LIMITS.maxMarginPercent}
                  step={0.5}
                  value={options.margin}
                  disabled={busy}
                  onChange={(e) => patch({margin: Number(e.target.value)})}
                />
              </label>
            </>
          )}

          {options.format !== 'png' && (
            <label>
              导出图片质量（{IMAGE_WATERMARK_LIMITS.minQuality}–{IMAGE_WATERMARK_LIMITS.maxQuality}，仅 JPEG/WebP 生效）
              <input
                type="number"
                aria-label="导出图片质量"
                min={IMAGE_WATERMARK_LIMITS.minQuality}
                max={IMAGE_WATERMARK_LIMITS.maxQuality}
                step={0.02}
                value={options.quality}
                disabled={busy}
                onChange={(e) => patch({quality: Number(e.target.value)})}
              />
            </label>
          )}
        </div>

        <label className="study-check">
          <input
            type="checkbox"
            checked={options.stroke}
            disabled={busy}
            onChange={(e) => patch({stroke: e.target.checked})}
          />
          <span>开启反色描边护航（在深浅明暗交错的身份证/成绩单/照片背景上自动加反差描边，避免文字被背景吞没）</span>
        </label>

        <div className="img-wm-logo-box">
          <div className="img-wm-logo-header">
            <strong>{isEn ? "Optional: Add Logo / Icon Watermark (Transparent PNG seal, crest, or signature)" : "可选：叠加 Logo / 图标水印（透明 PNG 社团章、校徽或个人签名图）"}</strong>
            {logoFile && (
              <button
                type="button"
                className="img-wm-inline-btn"
                disabled={busy}
                onClick={() => {
                  setLogoFile(null);
                  patch({includeLogo: false});
                }}
              >
                {isEn ? `Remove Logo (${logoFile.name})` : `移除 Logo（${logoFile.name}）`}
              </button>
            )}
          </div>
          <input
            key={logoInputKey}
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            aria-label={isEn ? "Upload Logo watermark image" : "上传 Logo 水印图片"}
            disabled={busy}
            onChange={(e) => void handleLogoUpload(e.target.files?.[0])}
          />
          {logoFile && (
            <div className="study-fields" style={{marginTop: 10}}>
              <label className="study-check">
                <input
                  type="checkbox"
                  checked={options.includeLogo}
                  disabled={busy}
                  onChange={(e) => patch({includeLogo: e.target.checked})}
                />
                <span>{isEn ? `Enable this Logo watermark (${logoFile.width}×${logoFile.height}px)` : `启用该 Logo 水印（${logoFile.width}×${logoFile.height}px）`}</span>
              </label>
              <label>
                {isEn
                  ? `Logo size ratio of short edge (${IMAGE_WATERMARK_LIMITS.minLogoScale}%–${IMAGE_WATERMARK_LIMITS.maxLogoScale}%)`
                  : `Logo 宽度占原图短边比例（${IMAGE_WATERMARK_LIMITS.minLogoScale}%–${IMAGE_WATERMARK_LIMITS.maxLogoScale}%）`}
                <input
                  type="number"
                  aria-label={isEn ? "Logo size ratio" : "Logo 大小比例"}
                  min={IMAGE_WATERMARK_LIMITS.minLogoScale}
                  max={IMAGE_WATERMARK_LIMITS.maxLogoScale}
                  step={1}
                  value={options.logoScale}
                  disabled={busy}
                  onChange={(e) => patch({logoScale: Number(e.target.value)})}
                />
              </label>
            </div>
          )}
        </div>

        <h3 style={{marginTop: 18, marginBottom: 8}}>
          {isEn
            ? `Live Preview (${previewInfo.isSample ? 'Sample ID Card' : `Current: ${activeFile?.name}`} · ${previewInfo.width}×${previewInfo.height}px · ${previewInfo.stamps} watermark stamps)`
            : `实时效果预览（${previewInfo.isSample ? '示例证件底图' : `当前：${activeFile?.name}`} · ${previewInfo.width}×${previewInfo.height}px · 共叠加 ${previewInfo.stamps} 处水印）`}
        </h3>
        <div className="img-wm-preview-wrap">
          {previewError && <p className="study-warning" role="alert">{previewError}</p>}
          <canvas
            ref={previewCanvasRef}
            hidden={Boolean(previewError)}
            aria-label={isEn ? "Live watermark canvas preview" : "图片水印实时预览画布"}
            role="img"
          />
        </div>
        <p className="study-note">
          {isEn
            ? "Preview and export share the identical responsive scaling algorithm: font size and spacing automatically scale with image dimensions, ensuring legibility on high-res photos."
            : "预览与最终导出使用同一套自适应比例算法：无论手机原图是 4000×3000 还是截图 1080×720，水印字号与间距都会按原图短边自动等比放大，不会出现大图水印太小看不清的问题。"}
        </p>
      </section>

      <section className="study-card">
        <h2>{isEn ? "3 Generate & Download" : "3 生成与下载"}</h2>
        {validationError ? (
          <p className="study-warning" role="alert">{validationError}</p>
        ) : files.length === 0 ? (
          <p className="study-note">{isEn ? "Please select at least 1 image in Step 1." : "请先在第 1 步选择至少 1 张需要加水印的图片。"}</p>
        ) : (
          <p>
            {isEn ? (
              <>
                Ready to process <strong>{files.length}</strong> image{files.length === 1 ? '' : 's'} · Mode: {options.layout === 'tile' ? 'Full Image Tiling' : options.layout === 'grid' ? `3x3 Grid (${options.position})` : 'Center Stamp'} · Opacity {options.opacity} · Angle {options.rotate}°
              </>
            ) : (
              <>
                准备处理 <strong>{files.length}</strong> 张图片 · 模式：
                {options.layout === 'tile' ? '全图错位密铺' : options.layout === 'grid' ? `九宫格（${POSITION_LABELS.find((p) => p.id === options.position)?.label}）` : '正中单条大章'} · 透明度 {options.opacity} · 角度 {options.rotate}°
              </>
            )}
          </p>
        )}

        <div className="study-actions">
          <button
            type="button"
            className="study-btn"
            disabled={!files.length || Boolean(validationError) || busy}
            onClick={generateAll}
          >
            {isEn
              ? (files.length > 1 ? `Batch Generate ${files.length} Watermarked Images` : 'Generate Watermarked Image')
              : (files.length > 1 ? `批量生成 ${files.length} 张带水印图片` : '生成带水印图片')}
          </button>
          <button type="button" className="study-btn alt" disabled={busy} onClick={resetAll}>
            {isEn ? "Reset All" : "重置全部"}
          </button>
        </div>

        {notice && <p className="study-message" role="status">{notice}</p>}

        {results.length > 0 && (
          <div>
            <div className="study-actions" style={{marginTop: 14}}>
              {results.length === 1 ? (
                <button type="button" className="study-btn" onClick={() => downloadSingle(results[0])}>
                  {isEn ? `Download Watermarked Image (${results[0].outputName})` : `下载带水印图片（${results[0].outputName}）`}
                </button>
              ) : (
                <button type="button" className="study-btn" onClick={downloadZip}>
                  {isEn ? `Download All as ZIP (${results.length} images)` : `一键打包下载 ZIP（共 ${results.length} 张）`}
                </button>
              )}
            </div>

            <div className="img-wm-results" role="list" aria-label={isEn ? "Generated watermarked images list" : "已生成的水印图片列表"}>
              {results.map((item) => (
                <div key={item.id} role="listitem" className="img-wm-result-row">
                  <div className="img-wm-result-meta">
                    <strong>{item.outputName}</strong>
                    <span>
                      {isEn
                        ? `${item.width}×${item.height}px · ${formatBytes(item.beforeBytes)} → ${formatBytes(item.afterBytes)} · ${item.stampCount} stamps added`
                        : `${item.width}×${item.height}px · ${formatBytes(item.beforeBytes)} → ${formatBytes(item.afterBytes)} · 已叠加 ${item.stampCount} 处水印`}
                    </span>
                  </div>
                  <button type="button" className="study-btn alt" onClick={() => downloadSingle(item)}>
                    {isEn ? "Download" : "单独下载"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="study-note">
          {isEn
            ? "Security notice: Watermarks effectively deter unauthorized reuse and clarify purpose upon leaks. For highly sensitive ID numbers, combining with redaction is strongly recommended."
            : "安全提示：图片水印可有效提高他人盗图、冒用证件照或二次涂抹的成本，并在发生泄露时明确标识用途来源；但对于极端敏感的证件号码局部，仍建议配合打码遮挡。"}
        </p>
      </section>
    </ToolPage>
  );
}
