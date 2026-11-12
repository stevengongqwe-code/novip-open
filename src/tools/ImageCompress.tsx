import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ToolPage, saveLocal, useJob } from './common';
import { useI18n } from '../i18n';
import {
  TARGET_PRESETS,
  formatBytes,
  calcCompressionRatio,
  calculateFitDimensions,
  type CompressFormat,
  type TargetPreset,
} from './image-compress-core';
import {
  SlidersHorizontal,
  Download,
  Image as ImageIcon,
  Sparkles,
  ArrowRight,
  Maximize2,
  Check,
  Zap,
} from 'lucide-react';

export default function ImageCompress() {
  const { lang } = useI18n();
  const isEn = lang === 'en-US';
  const job = useJob();
  const [file, setFile] = useState<File | null>(null);
  const [rawUrl, setRawUrl] = useState<string>('');
  const [compressedUrl, setCompressedUrl] = useState<string>('');
  const [rawSize, setRawSize] = useState<number>(0);
  const [compressedSize, setCompressedSize] = useState<number>(0);
  const [rawDims, setRawDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [outputDims, setOutputDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const [format, setFormat] = useState<CompressFormat>('image/jpeg');
  const [quality, setQuality] = useState<number>(0.8);
  const [targetKb, setTargetKb] = useState<number>(100);
  const [isTargetMode, setIsTargetMode] = useState<boolean>(true);

  // Squoosh 风格对比分割线位置 (0 - 100%)
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);
  const compareContainerRef = useRef<HTMLDivElement | null>(null);

  // 加载示例图片
  const handleLoadSample = () => {
    // 动态生成一张带细节渐变与文字的高清 1200x900 示例图
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 绘制高细节背景与网格
    const grad = ctx.createLinearGradient(0, 0, 1200, 900);
    grad.addColorStop(0, '#0071e3');
    grad.addColorStop(0.5, '#5e5ce6');
    grad.addColorStop(1, '#ff2d55');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1200, 900);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NOVIP 考试与报名照片精准压缩', 600, 420);
    ctx.font = '28px -apple-system, sans-serif';
    ctx.fillText('四六级 · 学信网 · 考研网 · 严格 ≤ 100KB 限制测试', 600, 480);

    canvas.toBlob(blob => {
      if (!blob) return;
      const sampleFile = new File([blob], 'sample-photo.jpg', { type: 'image/jpeg' });
      processNewFile(sampleFile);
    }, 'image/jpeg', 0.98);
  };

  const processNewFile = (f: File) => {
    setFile(f);
    setRawSize(f.size);
    const url = URL.createObjectURL(f);
    setRawUrl(url);

    const img = new Image();
    img.onload = () => {
      setRawDims({ width: img.naturalWidth, height: img.naturalHeight });
      // 触发初始压缩
      compressImage(img, f.size, targetKb, format, isTargetMode ? undefined : quality);
    };
    img.src = url;
  };

  // 核心执行：二分逼近精准压到 targetKb
  const compressImage = useCallback(
    async (
      img: HTMLImageElement,
      originalBytes: number,
      targetLimitKb: number,
      targetFormat: CompressFormat,
      manualQuality?: number
    ) => {
      const canvas = document.createElement('canvas');
      const targetBytes = targetLimitKb * 1024;

      if (manualQuality !== undefined) {
        // 手动模式
        const { width, height } = calculateFitDimensions(img.naturalWidth, img.naturalHeight);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(blob => {
          if (!blob) return;
          if (compressedUrl) URL.revokeObjectURL(compressedUrl);
          setCompressedUrl(URL.createObjectURL(blob));
          setCompressedSize(blob.size);
          setOutputDims({ width, height });
        }, targetFormat, manualQuality);
        return;
      }

      // 自动二分模式：在尺寸和质量间自动逼近至 targetBytes 以内
      let minQ = 0.08;
      let maxQ = 0.95;
      let bestBlob: Blob | null = null;
      let bestDims = { width: img.naturalWidth, height: img.naturalHeight };

      // 针对超大图先进行合理预缩放
      let maxDim = 3200;
      if (targetBytes <= 60 * 1024) maxDim = 1200;
      else if (targetBytes <= 120 * 1024) maxDim = 1920;

      const { width, height } = calculateFitDimensions(img.naturalWidth, img.naturalHeight, maxDim, maxDim);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      bestDims = { width, height };

      // 最多 6 次二分探测
      for (let i = 0; i < 6; i++) {
        const midQ = (minQ + maxQ) / 2;
        const curBlob = await new Promise<Blob | null>(res => canvas.toBlob(res, targetFormat, midQ));
        if (!curBlob) break;

        if (curBlob.size <= targetBytes) {
          bestBlob = curBlob;
          minQ = midQ; // 尝试更高画质
        } else {
          maxQ = midQ; // 体积超标，降低质量
        }
      }

      // 如果最低质量仍超标，尝试降低分辨率
      if (!bestBlob || bestBlob.size > targetBytes) {
        const scaleDown = Math.max(0.4, Math.sqrt(targetBytes / (bestBlob?.size || originalBytes)));
        const newW = Math.round(width * scaleDown);
        const newH = Math.round(height * scaleDown);
        canvas.width = newW;
        canvas.height = newH;
        ctx?.drawImage(img, 0, 0, newW, newH);
        bestDims = { width: newW, height: newH };
        bestBlob = await new Promise<Blob | null>(res => canvas.toBlob(res, targetFormat, 0.75));
      }

      if (bestBlob) {
        if (compressedUrl) URL.revokeObjectURL(compressedUrl);
        setCompressedUrl(URL.createObjectURL(bestBlob));
        setCompressedSize(bestBlob.size);
        setOutputDims(bestDims);
      }
    },
    [compressedUrl]
  );

  // 参数改变触发重压缩
  const triggerRecompress = () => {
    if (!rawUrl) return;
    const img = new Image();
    img.onload = () => {
      compressImage(img, rawSize, targetKb, format, isTargetMode ? undefined : quality);
    };
    img.src = rawUrl;
  };

  useEffect(() => {
    triggerRecompress();
  }, [targetKb, format, quality, isTargetMode]);

  // Squoosh 对比滑块拖动
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSlider && e.buttons !== 1) return;
    const container = compareContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    setSliderPos((x / rect.width) * 100);
  };

  const handleDownload = () => {
    if (!compressedUrl) return;
    fetch(compressedUrl)
      .then(res => res.blob())
      .then(blob => {
        const ext = format === 'image/webp' ? 'webp' : format === 'image/png' ? 'png' : 'jpg';
        const name = (file?.name.replace(/\.[^.]+$/, '') || 'compressed-image') + `_target_${targetKb}kb.${ext}`;
        saveLocal(blob, name);
        showToast(`已成功下载 ${formatBytes(blob.size)} 压缩图片`);
      });
  };

  const showToast = (message: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novip:toast', { detail: { message } }));
    }
  };

  const stats = calcCompressionRatio(rawSize, compressedSize);

  return (
    <ToolPage
      id="image-compress"
      title={isEn ? "Precise Image Compression (Squoosh-Level Dual Viewport)" : "图片精准压缩 (Squoosh 级端侧对比)"}
      description={isEn
        ? "Strictly limit image file size in KB (e.g., student portal, exams ≤ 100KB). Interactive Squoosh-style split viewport for live visual quality comparison with zero server upload."
        : "严格限制图片 KB 大小（如学信网、四六级、考研网 ≤ 100KB），基于 Squoosh 交互双视口滑块实时对比画质，零服务器上传。"}
      job={job}
    >
      {/* 1. 若尚未选择文件，首屏第一眼就是上传与体验区 */}
      {!file && (
        <section
          className="novip-card"
          style={{
            padding: '36px 20px',
            textAlign: 'center',
            border: '2px dashed #0071e3',
            borderRadius: 20,
            background: 'rgba(0, 113, 227, 0.02)',
            marginBottom: 20,
          }}
        >
          <ImageIcon size={48} color="#0071e3" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: 18, color: '#1d1d1f', margin: '0 0 6px' }}>
            {isEn ? "Step 1: Select or drag photos / scans to compress" : "第 1 步：选择或拖入需要压缩的照片 / 扫描件"}
          </h3>
          <p style={{ fontSize: 13, color: '#6e6e73', margin: '0 0 18px' }}>
            {isEn
              ? "Supports JPG, PNG, and WebP. 100% in-browser processing; images are never uploaded, ensuring complete privacy."
              : "支持 JPG、PNG、WebP。纯浏览器内存运算，照片绝不上传服务器，保护隐私零风险。"}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label
              className="novip-btn-tactile novip-btn-tactile--primary"
              style={{ padding: '12px 28px', fontSize: 15 }}
            >
              <span>{isEn ? "📁 Select Local Image File" : "📁 选择本地图片文件"}</span>
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    processNewFile(e.target.files[0]);
                  }
                }}
                style={{ display: 'none' }}
              />
            </label>

            <button
              type="button"
              onClick={handleLoadSample}
              className="novip-btn-tactile novip-btn-tactile--secondary"
              style={{ fontSize: 14 }}
            >
              <Sparkles size={15} color="#0071e3" />
              <span>{isEn ? "Try Sample HD Photo" : "载入示例高清大图试试"}</span>
            </button>
          </div>
        </section>
      )}

      {/* 2. 预设目标体积选择器 (无论是上传前设定，还是上传后随时切换) */}
      <section className="novip-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={18} color="#0071e3" />
            <span>{isEn ? "Target File Size Presets" : "选择高校报名与系统上传目标体积"}</span>
          </h3>
          {file && (
            <label
              style={{
                fontSize: 12,
                color: '#0071e3',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 6,
                background: 'rgba(0,113,227,0.06)',
              }}
            >
              <span>{isEn ? "Change Image" : "更换图片"}</span>
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    processNewFile(e.target.files[0]);
                  }
                }}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>

        <div className="compress-options-grid">
          {TARGET_PRESETS.map(preset => {
            const isSelected = isTargetMode && targetKb === preset.targetKb;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setIsTargetMode(true);
                  setTargetKb(preset.targetKb);
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: isSelected ? '2px solid #0071e3' : '1px solid #e2e8f0',
                  background: isSelected ? 'rgba(0, 113, 227, 0.06)' : '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: isSelected ? '#0071e3' : '#1d1d1f' }}>
                  {isEn ? (preset.targetKb >= 1024 ? `≤ ${(preset.targetKb / 1024).toFixed(0)}MB Preset` : `≤ ${preset.targetKb}KB Preset`) : preset.name}
                </div>
                <div style={{ fontSize: 11, color: '#6e6e73', marginTop: 3 }}>
                  {isEn ? `Max target size ≤ ${preset.targetKb}KB` : preset.description}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 控制条：格式切换与手动滑块 */}
      <section className="novip-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
          {/* 格式选择 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#424245' }}>{isEn ? "Output Format:" : "输出格式："}</span>
            {(['image/jpeg', 'image/webp', 'image/png'] as CompressFormat[]).map(fmt => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormat(fmt)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 10,
                  border: format === fmt ? '2px solid #0071e3' : '1px solid #e2e8f0',
                  background: format === fmt ? '#0071e3' : '#fff',
                  color: format === fmt ? '#fff' : '#1d1d1f',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {fmt === 'image/jpeg' ? (isEn ? 'JPEG (Compatible)' : 'JPEG (最兼容)') : fmt === 'image/webp' ? (isEn ? 'WebP (High Ratio)' : 'WebP (高压缩)') : (isEn ? 'PNG (Lossless)' : 'PNG (无损)')}
              </button>
            ))}
          </div>

          {/* 模式切换 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <label style={{ fontSize: 13, color: '#424245', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                checked={isTargetMode}
                onChange={() => setIsTargetMode(true)}
              />
              <span>{isEn ? "Auto Binary Target KB Mode" : "自动二分目标 KB 模式"}</span>
            </label>
            <label style={{ fontSize: 13, color: '#424245', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                checked={!isTargetMode}
                onChange={() => setIsTargetMode(false)}
              />
              <span>{isEn ? "Manual Quality Slider Mode" : "手动质量滑块模式"}</span>
            </label>
          </div>
        </div>

        {/* 手动滑块 */}
        {!isTargetMode && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f0f0f5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6e6e73', marginBottom: 6 }}>
              <span>{isEn ? "Image Quality" : "画质质量 (Quality)"}</span>
              <span>{Math.round(quality * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="1.0"
              step="0.02"
              value={quality}
              onChange={e => setQuality(parseFloat(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>
        )}
      </section>

      {/* Squoosh 风格对比视口 */}
      {rawUrl && compressedUrl && (
        <section className="novip-card" style={{ padding: 16, marginBottom: 20 }}>
          {/* 指标条 HUD */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              borderRadius: 12,
              background: '#f5f5f7',
              marginBottom: 14,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', gap: 16 }}>
              <span>{isEn ? "Original:" : "原图："} <strong>{formatBytes(rawSize)}</strong> ({rawDims.width}×{rawDims.height})</span>
              <ArrowRight size={16} color="#6e6e73" />
              <span>
                {isEn ? "Compressed:" : "压缩后："} <strong style={{ color: compressedSize <= targetKb * 1024 ? '#34c759' : '#d70015' }}>
                  {formatBytes(compressedSize)}
                </strong> ({outputDims.width}×{outputDims.height})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ padding: '2px 8px', borderRadius: 6, background: '#34c759', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                {isEn ? `Change ${stats.percent}` : `体积变化 ${stats.percent}`}
              </span>
              {compressedSize <= targetKb * 1024 && (
                <span style={{ color: '#34c759', fontSize: 12, fontWeight: 600 }}>{isEn ? `✓ Met Target ≤ ${targetKb}KB` : `✓ 达标 ≤ ${targetKb}KB`}</span>
              )}
            </div>
          </div>

          {/* Squoosh 交互拖拽对比框 */}
          <div
            ref={compareContainerRef}
            onPointerDown={() => setIsDraggingSlider(true)}
            onPointerUp={() => setIsDraggingSlider(false)}
            onPointerMove={handlePointerMove}
            style={{
              position: 'relative',
              width: '100%',
              maxHeight: 520,
              aspectRatio: rawDims.width && rawDims.height ? `${rawDims.width} / ${rawDims.height}` : '16 / 9',
              borderRadius: 16,
              overflow: 'hidden',
              userSelect: 'none',
              cursor: 'ew-resize',
              border: '1px solid #e2e8f0',
              background: '#000',
            }}
          >
            {/* 底层：压缩后图片 */}
            <img
              src={compressedUrl}
              alt={isEn ? "Compressed" : "压缩后"}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />

            {/* 顶层裁切：原图 */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${sliderPos}%`,
                height: '100%',
                overflow: 'hidden',
                borderRight: '2px solid #fff',
                boxShadow: '4px 0 16px rgba(0,0,0,0.3)',
              }}
            >
              <img
                src={rawUrl}
                alt={isEn ? "Original" : "原图"}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: compareContainerRef.current?.clientWidth || '100%',
                  height: '100%',
                  objectFit: 'contain',
                  maxWidth: 'none',
                }}
              />
            </div>

            {/* 分割线上的 Apple 风格把手 */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: `${sliderPos}%`,
                transform: 'translate(-50%, -50%)',
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <SlidersHorizontal size={16} color="#0071e3" />
            </div>

            {/* 左右标签 */}
            <div style={{ position: 'absolute', top: 12, left: 16, padding: '4px 10px', background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 8, fontSize: 12 }}>
              {isEn ? `Original (${formatBytes(rawSize)})` : `原图 (${formatBytes(rawSize)})`}
            </div>
            <div style={{ position: 'absolute', top: 12, right: 16, padding: '4px 10px', background: 'rgba(0,113,227,0.85)', color: '#fff', borderRadius: 8, fontSize: 12 }}>
              {isEn ? `Compressed (${formatBytes(compressedSize)})` : `压缩后 (${formatBytes(compressedSize)})`}
            </div>
          </div>
        </section>
      )}

      {/* 底部悬浮/操作按钮 */}
      {compressedUrl && (
        <div
          style={{
            marginTop: 10,
            padding: '16px 20px',
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, color: '#6e6e73' }}>
            {isEn ? (
              <>Target reached: <strong>{formatBytes(compressedSize)}</strong> (saved {stats.percent})</>
            ) : (
              <>已达成目标：<strong>{formatBytes(compressedSize)}</strong> (原图节省 {stats.percent})</>
            )}
          </div>

          <button
            type="button"
            onClick={handleDownload}
            style={{
              padding: '12px 28px',
              borderRadius: 14,
              border: 0,
              background: '#0071e3',
              color: '#fff',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(0, 113, 227, 0.3)',
            }}
          >
            <Download size={18} />
            <span>{isEn ? "Download Compressed Image" : "下载压缩后的图片文件"}</span>
          </button>
        </div>
      )}
    </ToolPage>
  );
}
