/**
 * A4 证件拼版复印打印（Apple / Chess.com 级微交互与触感设计）。
 * 针对大学生评奖学金、兼职签约、四六级/考研报考痛点：
 * 纯端侧 1:1 毫米级排版到 A4 页面，内置防盗水印与黑白去灰底复印滤波。
 * 100% 本地内存处理，绝不上传个人身份证隐私。
 */
import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Download,
  FileText,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Printer,
  Sliders,
  HelpCircle,
} from 'lucide-react';
import { saveLocal } from '../tool-common';
import { ToolPage, useJob, isWeChat } from './common';
import { useI18n } from '../i18n';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  CARD_PRESETS,
  calculateCardPlacement,
  DEFAULT_WATERMARK,
  generateA4PdfFromImage,
  getMockCardSvg,
  LAYOUT_OPTIONS,
  mmToPx,
  normalizeWatermarkText,
  WATERMARK_PRESETS,
  type CardPresetId,
  type ColorFilterMode,
  type LayoutMode,
  type WatermarkColor,
  type WatermarkOptions,
} from './id-card-layout-core';

interface CardSlot {
  file: File | null;
  dataUrl: string;
  rotation: number; // 0, 90, 180, 270
}

export default function IdCardLayout() {
  const { lang } = useI18n();
  const isEn = lang === 'en-US';
  const job = useJob();
  const [preset, setPreset] = useState<CardPresetId>('id-card');
  const [layout, setLayout] = useState<LayoutMode>('stacked');
  const [colorMode, setColorMode] = useState<ColorFilterMode>('photocopy');
  const [watermark, setWatermark] = useState<WatermarkOptions>({ ...DEFAULT_WATERMARK });
  const [customWatermark, setCustomWatermark] = useState(DEFAULT_WATERMARK.text);

  const [front, setFront] = useState<CardSlot>({
    file: null,
    dataUrl: getMockCardSvg('front', 'id-card'),
    rotation: 0,
  });

  const [back, setBack] = useState<CardSlot>({
    file: null,
    dataUrl: getMockCardSvg('back', 'id-card'),
    rotation: 0,
  });

  const [isSampleLoaded, setIsSampleLoaded] = useState(true);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // 加载脱敏示范卡
  const loadSample = () => {
    setFront({
      file: null,
      dataUrl: getMockCardSvg('front', preset),
      rotation: 0,
    });
    setBack({
      file: null,
      dataUrl: getMockCardSvg('back', preset),
      rotation: 0,
    });
    setIsSampleLoaded(true);
  };

  // 读取上传图片
  const handleUpload = (file: File, side: 'front' | 'back') => {
    if (!file.type.startsWith('image/')) {
      alert('请上传有效的图片格式（JPG、PNG、WebP）');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      if (side === 'front') {
        setFront({ file, dataUrl: url, rotation: 0 });
      } else {
        setBack({ file, dataUrl: url, rotation: 0 });
      }
      setIsSampleLoaded(false);
    };
    reader.readAsDataURL(file);
  };

  // 旋转证件图片
  const rotateCard = (side: 'front' | 'back') => {
    if (side === 'front') {
      setFront((prev) => ({ ...prev, rotation: (prev.rotation + 90) % 360 }));
    } else {
      setBack((prev) => ({ ...prev, rotation: (prev.rotation + 90) % 360 }));
    }
  };

  // 清除证件图片
  const clearCard = (side: 'front' | 'back') => {
    if (side === 'front') {
      setFront({ file: null, dataUrl: '', rotation: 0 });
    } else {
      setBack({ file: null, dataUrl: '', rotation: 0 });
    }
    setIsSampleLoaded(false);
  };

  // 渲染 A4 Canvas (支持指定 DPI，预览用低 DPI，导出用 300 DPI)
  const drawA4Canvas = async (dpi: number = 150): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    const widthPx = mmToPx(A4_WIDTH_MM, dpi);
    const heightPx = mmToPx(A4_HEIGHT_MM, dpi);

    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法初始化 Canvas 绘图上下文');

    // 1. 绘制纯白 A4 底纸
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, widthPx, heightPx);

    // 2. 计算卡片放置位置
    const placement = calculateCardPlacement(preset, layout);

    // 辅助绘制单张卡片
    const drawSlot = async (slot: CardSlot, rectMm: typeof placement.front, label: string) => {
      const x = mmToPx(rectMm.x, dpi);
      const y = mmToPx(rectMm.y, dpi);
      const w = mmToPx(rectMm.width, dpi);
      const h = mmToPx(rectMm.height, dpi);

      if (!slot.dataUrl) {
        // 空白未上传虚线槽
        ctx.save();
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = Math.max(1, Math.round(dpi / 100));
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = '#94A3B8';
        ctx.font = `${Math.round(14 * (dpi / 72))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`待添加：${label}`, x + w / 2, y + h / 2);
        ctx.restore();
        return;
      }

      // 加载图片对象
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = slot.dataUrl;
      await new Promise<void>((resolve, reject) => {
        if (img.complete) resolve();
        else {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error(`图片加载失败: ${label}`));
        }
      });

      // 临时卡片 Canvas 用于处理旋转和滤镜
      const cardCanvas = document.createElement('canvas');
      cardCanvas.width = w;
      cardCanvas.height = h;
      const cardCtx = cardCanvas.getContext('2d')!;

      cardCtx.save();
      // 处理旋转
      if (slot.rotation !== 0) {
        cardCtx.translate(w / 2, h / 2);
        cardCtx.rotate((slot.rotation * Math.PI) / 180);
        const isTurned = slot.rotation === 90 || slot.rotation === 270;
        const dw = isTurned ? h : w;
        const dh = isTurned ? w : h;
        cardCtx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      } else {
        cardCtx.drawImage(img, 0, 0, w, h);
      }
      cardCtx.restore();

      // 3. 处理色彩模式 (原色 / 黑白复印 / 灰度)
      if (colorMode !== 'color') {
        const imgData = cardCtx.getImageData(0, 0, w, h);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          if (colorMode === 'grayscale') {
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
          } else if (colorMode === 'photocopy') {
            // 复印模式：滤去拍摄阴影灰底
            let v = gray;
            if (gray > 195) v = 255;
            else if (gray < 80) v = Math.max(0, gray - 25);
            else v = Math.round(((gray - 80) / 115) * 190 + 60);
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
          }
        }
        cardCtx.putImageData(imgData, 0, 0);
      }

      // 4. 绘制防盗水印（倾斜重复铺陈在卡片表面）
      if (watermark.enabled && watermark.text.trim()) {
        const text = normalizeWatermarkText(watermark.text);
        cardCtx.save();
        cardCtx.beginPath();
        cardCtx.rect(0, 0, w, h);
        cardCtx.clip();

        let strokeColor = 'rgba(40, 40, 40, 0.26)';
        if (watermark.color === 'red') strokeColor = 'rgba(220, 38, 38, 0.30)';
        else if (watermark.color === 'blue') strokeColor = 'rgba(37, 99, 235, 0.30)';

        cardCtx.fillStyle = strokeColor;
        const fontSize = Math.max(12, Math.round(w / 22));
        cardCtx.font = `bold ${fontSize}px sans-serif`;
        cardCtx.textAlign = 'center';

        const stepY = watermark.density === 'dense' ? fontSize * 3.2 : fontSize * 4.6;
        const stepX = fontSize * 14;

        cardCtx.translate(w / 2, h / 2);
        cardCtx.rotate((-22 * Math.PI) / 180);
        cardCtx.translate(-w / 2, -h / 2);

        for (let wy = -h; wy < h * 2.2; wy += stepY) {
          for (let wx = -w; wx < w * 2.2; wx += stepX) {
            cardCtx.fillText(text, wx, wy);
          }
        }
        cardCtx.restore();
      }

      // 将卡片绘制到 A4 画布
      ctx.drawImage(cardCanvas, x, y);

      // 绘制极细浅灰裁切虚线框（方便打印后用剪刀剪下）
      ctx.save();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    };

    await drawSlot(front, placement.front, '正面（人像面）');
    await drawSlot(back, placement.back, '反面（国徽面）');

    // 5. 底部微弱安全水印与 1:1 打印提示
    ctx.save();
    ctx.fillStyle = '#94A3B8';
    ctx.font = `${Math.round(10 * (dpi / 72))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('A4 标准 1:1 证件复印件 · 打印时选择「实际大小 / 100%」尺寸分毫不差 · NOVIP 端侧安全生成', widthPx / 2, heightPx - Math.round(18 * (dpi / 72)));
    ctx.restore();

    return canvas;
  };

  // 更新实时预览
  useEffect(() => {
    let active = true;
    const updatePreview = async () => {
      try {
        setGenerating(true);
        const canvas = await drawA4Canvas(110); // 110 DPI 极速预览
        if (!active) return;
        setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.88));
      } catch (err) {
        console.error('Preview error:', err);
      } finally {
        if (active) setGenerating(false);
      }
    };
    const timer = setTimeout(updatePreview, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [preset, layout, colorMode, watermark, front, back]);

  // 导出标准 A4 矢量 PDF
  const handleExportPdf = () => {
    job.run(
      async (check) => {
        check();
        // 渲染 300 DPI 打印级 Canvas
        const highCanvas = await drawA4Canvas(300);
        check();

        const blob = await new Promise<Blob>((resolve, reject) => {
          highCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas 编码失败'))), 'image/jpeg', 0.95);
        });
        check();

        const arrayBuffer = await blob.arrayBuffer();
        const pdfBytes = await generateA4PdfFromImage(new Uint8Array(arrayBuffer), 'image/jpeg');
        check();

        const pdfBlob = new Blob([pdfBytes.slice().buffer], { type: 'application/pdf' });
        const filename = `证件复印件_A4排版_${new Date().toISOString().slice(0, 10)}.pdf`;
        saveLocal(pdfBlob, filename);
        return filename;
      },
      (filename) => {
        job.setStatus(`✅ 已导出 A4 标准打印 PDF：${filename}（发给打印店选择 100% 比例打印即可）`);
      },
    );
  };

  // 导出 A4 高清图片
  const handleExportImage = () => {
    job.run(
      async (check) => {
        check();
        const highCanvas = await drawA4Canvas(300);
        check();

        const blob = await new Promise<Blob>((resolve, reject) => {
          highCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片编码失败'))), 'image/jpeg', 0.95);
        });
        check();

        const filename = `证件复印件_A4高清图_${new Date().toISOString().slice(0, 10)}.jpg`;
        saveLocal(blob, filename);
        return filename;
      },
      (filename) => {
        job.setStatus(`✅ 已保存高清 A4 复印图片：${filename}（手机可长按预览图存入相册）`);
      },
    );
  };

  return (
    <ToolPage
      id="id-card-layout"
      title={isEn ? "A4 ID Card Multi-up Copy & Print" : "A4 证件拼版复印打印"}
      description={isEn
        ? "Need front-and-back copies of your ID/Student card for scholarships, jobs, or exam signups? Automatically layouts photos to exact 1:1 mm scale on standard A4 paper with anti-theft watermarks and shadow removal. 100% offline!"
        : "评奖学金、兼职签约、四六级考研报名要交身份证正反面复印件？手机拍照自动按 1:1 毫米级真实尺寸排版到 A4 纸，支持防盗水印与去灰底，纯本地处理绝不上传！"}
      job={job}
    >
      {/* 隐私与安全护盾横幅 */}
      <div className="novip-trust-banner">
        <ShieldCheck size={20} className="novip-trust-icon" />
        <div className="novip-trust-text">
          <strong>{isEn ? "100% Local In-Browser Layout · ID Photos Never Leave Your Device" : "100% 浏览器本地排版 · 身份证原图绝不离机"}</strong>
          <span>{isEn ? "All dimension calculations, security watermarks, and PDF exports are processed inside your device memory, working entirely offline." : "所有尺寸计算、防盗水印与 PDF 合成均在你的手机本地内存完成，断网也可照常使用。"}</span>
        </div>
      </div>

      <div className="novip-idcard-layout-grid">
        {/* 左侧/上方：上传与参数控制面板 */}
        <section className="novip-idcard-control-panel" aria-label={isEn ? "Layout and ID settings" : "排版与证件设置"}>
          {/* 1. 证件槽位上传 */}
          <div className="novip-card-slot-row">
            {/* 正面卡槽 */}
            <div className={`novip-card-slot-box ${front.dataUrl ? 'has-image' : ''}`}>
              <div className="novip-card-slot-head">
                <span className="novip-slot-badge">{isEn ? "① Front (Portrait Side)" : "① 正面（人像面）"}</span>
                {front.dataUrl && (
                  <div className="novip-slot-actions">
                    <button
                      type="button"
                      className="novip-btn-icon"
                      onClick={() => rotateCard('front')}
                      title={isEn ? "Rotate 90° clockwise" : "顺时针旋转90度"}
                      aria-label={isEn ? "Rotate front clockwise" : "顺时针旋转正面"}
                    >
                      <RotateCw size={14} />
                    </button>
                    <button
                      type="button"
                      className="novip-btn-icon novip-btn-icon--danger"
                      onClick={() => clearCard('front')}
                      title={isEn ? "Clear photo" : "清除图片"}
                      aria-label={isEn ? "Clear front photo" : "清除正面图片"}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div
                className="novip-slot-dropzone"
                onClick={() => frontInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && frontInputRef.current?.click()}
              >
                {front.dataUrl ? (
                  <div className="novip-slot-preview-wrap">
                    <img
                      src={front.dataUrl}
                      alt={isEn ? "Front card preview" : "证件正面预览"}
                      style={{ transform: `rotate(${front.rotation}deg)` }}
                    />
                    <div className="novip-slot-replace-mask">{isEn ? "Click to change photo" : "点击更换照片"}</div>
                  </div>
                ) : (
                  <div className="novip-slot-empty-prompt">
                    <Camera size={26} />
                    <span>{isEn ? "Take photo or upload front" : "点击拍照或上传正面"}</span>
                    <small>{isEn ? "JPG / PNG, auto-aligned" : "支持 JPG / PNG，自动对齐比例"}</small>
                  </div>
                )}
                <input
                  ref={frontInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'front')}
                />
              </div>
            </div>

            {/* 反面卡槽 */}
            <div className={`novip-card-slot-box ${back.dataUrl ? 'has-image' : ''}`}>
              <div className="novip-card-slot-head">
                <span className="novip-slot-badge">{isEn ? "② Back (Emblem Side)" : "② 反面（国徽面）"}</span>
                {back.dataUrl && (
                  <div className="novip-slot-actions">
                    <button
                      type="button"
                      className="novip-btn-icon"
                      onClick={() => rotateCard('back')}
                      title={isEn ? "Rotate 90° clockwise" : "顺时针旋转90度"}
                      aria-label={isEn ? "Rotate back clockwise" : "顺时针旋转反面"}
                    >
                      <RotateCw size={14} />
                    </button>
                    <button
                      type="button"
                      className="novip-btn-icon novip-btn-icon--danger"
                      onClick={() => clearCard('back')}
                      title={isEn ? "Clear photo" : "清除图片"}
                      aria-label={isEn ? "Clear back photo" : "清除反面图片"}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div
                className="novip-slot-dropzone"
                onClick={() => backInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && backInputRef.current?.click()}
              >
                {back.dataUrl ? (
                  <div className="novip-slot-preview-wrap">
                    <img
                      src={back.dataUrl}
                      alt={isEn ? "Back card preview" : "证件反面预览"}
                      style={{ transform: `rotate(${back.rotation}deg)` }}
                    />
                    <div className="novip-slot-replace-mask">{isEn ? "Click to change photo" : "点击更换照片"}</div>
                  </div>
                ) : (
                  <div className="novip-slot-empty-prompt">
                    <Camera size={26} />
                    <span>{isEn ? "Take photo or upload back" : "点击拍照或上传反面"}</span>
                    <small>{isEn ? "JPG / PNG, auto-aligned" : "支持 JPG / PNG，自动对齐比例"}</small>
                  </div>
                )}
                <input
                  ref={backInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'back')}
                />
              </div>
            </div>
          </div>

          {/* 示例体验按钮 */}
          <div className="novip-sample-bar">
            <button type="button" className="novip-btn-tactile novip-btn-tactile--secondary" onClick={loadSample}>
              <Sparkles size={15} />
              <span>{isEn ? (isSampleLoaded ? 'Reset Sample Cards' : 'Load Sample Cards') : (isSampleLoaded ? '重置脱敏示范卡' : '载入示例证件（免传照片快速体验）')}</span>
            </button>
            {isSampleLoaded && <span className="novip-sample-hint">{isEn ? "Sample cards loaded. Tap above to replace with your own photos anytime." : "当前为示例卡，点击上方随时拍照替换为你自己的证件"}</span>}
          </div>

          {/* 2. 证件与版式规格 */}
          <div className="novip-settings-group">
            <h3 className="novip-group-title">
              <Sliders size={16} /> {isEn ? "Card Specs & Layout Modes" : "证件规格与排版模式"}
            </h3>

            <div className="novip-field-row">
              <label htmlFor="idcard-preset">{isEn ? "Card Type" : "证件类型"}</label>
              <select
                id="idcard-preset"
                value={preset}
                onChange={(e) => setPreset(e.target.value as CardPresetId)}
                className="novip-select"
              >
                {Object.values(CARD_PRESETS).map((p) => (
                  <option key={p.id} value={p.id}>
                    {isEn ? (p.id === 'id-card' ? 'Chinese National ID Card' : p.id === 'driver-license' ? "Driver's License" : 'Student ID Card') : `${p.name} (${p.desc.split('（')[0]})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="novip-field-row">
              <label htmlFor="idcard-layout">{isEn ? "A4 Layout" : "A4 布局方式"}</label>
              <select
                id="idcard-layout"
                value={layout}
                onChange={(e) => setLayout(e.target.value as LayoutMode)}
                className="novip-select"
              >
                {Object.values(LAYOUT_OPTIONS).map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {isEn ? (opt.id === 'stacked' ? 'Standard Vertical Stack (Centered)' : opt.id === 'side-by-side' ? 'Horizontal Side-by-Side' : 'Compact Top Half (Space for Stamp)') : `${opt.name} — ${opt.desc.split('，')[0]}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="novip-field-row">
              <label>{isEn ? "Copy Color Style" : "复印色彩风格"}</label>
              <div className="novip-segmented-control" role="radiogroup" aria-label={isEn ? "Copy color mode" : "复印色彩模式"}>
                <button
                  type="button"
                  className={colorMode === 'photocopy' ? 'active' : ''}
                  onClick={() => setColorMode('photocopy')}
                >
                  {isEn ? "🖨️ B&W Copy" : "🖨️ 黑白复印"}
                </button>
                <button
                  type="button"
                  className={colorMode === 'grayscale' ? 'active' : ''}
                  onClick={() => setColorMode('grayscale')}
                >
                  {isEn ? "🔘 Grayscale" : "🔘 经典灰度"}
                </button>
                <button
                  type="button"
                  className={colorMode === 'color' ? 'active' : ''}
                  onClick={() => setColorMode('color')}
                >
                  {isEn ? "🎨 Original Color" : "🎨 原色照片"}
                </button>
              </div>
            </div>
            {colorMode === 'photocopy' && (
              <p className="novip-field-tip">
                {isEn
                  ? "✨ 'B&W Copy' automatically removes dark phone photo background shadows, saving printer ink with crisp high-contrast text."
                  : "✨「黑白复印」已自动滤除手机拍证件常见的灰暗阴影背景，省墨且复印字迹高对比更清晰。"}
              </p>
            )}
          </div>

          {/* 3. 安全防盗水印配置 */}
          <div className="novip-settings-group">
            <div className="novip-group-title-row">
              <h3 className="novip-group-title">
                <ShieldCheck size={16} /> {isEn ? "Security Anti-Theft Watermark" : "安全防盗水印（防他人盗用/防借贷）"}
              </h3>
              <label className="novip-switch">
                <input
                  type="checkbox"
                  checked={watermark.enabled}
                  onChange={(e) => setWatermark((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
                <span className="novip-switch-slider" />
              </label>
            </div>

            {watermark.enabled && (
              <div className="novip-watermark-config-body">
                <div className="novip-preset-chips" role="group" aria-label={isEn ? "Watermark Presets" : "水印常用快捷预设"}>
                  <span className="novip-preset-chips-label">{isEn ? "Presets:" : "大学高频预设："}</span>
                  {WATERMARK_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`novip-chip-pill ${watermark.text === p ? 'active' : ''}`}
                      onClick={() => {
                        setWatermark((prev) => ({ ...prev, text: p }));
                        setCustomWatermark(p);
                      }}
                    >
                      {p.replace('仅供', '').replace(' 他用无效', '')}
                    </button>
                  ))}
                </div>

                <div className="novip-field-row" style={{ marginTop: 8 }}>
                  <label htmlFor="watermark-text-input">{isEn ? "Custom Watermark Text" : "自定义水印文字"}</label>
                  <input
                    id="watermark-text-input"
                    type="text"
                    value={customWatermark}
                    maxLength={48}
                    className="novip-input"
                    placeholder={isEn ? "e.g. For verification only · Invalid for other uses" : "输入防盗文字，如：仅供保研资格复审使用 他用无效"}
                    onChange={(e) => {
                      setCustomWatermark(e.target.value);
                      setWatermark((prev) => ({ ...prev, text: e.target.value }));
                    }}
                  />
                </div>

                <div className="novip-watermark-attrs-row">
                  <div className="novip-field-inline">
                    <label>{isEn ? "Color:" : "水印颜色："}</label>
                    <div className="novip-color-dots">
                      <button
                        type="button"
                        className={`novip-dot-btn gray ${watermark.color === 'gray' ? 'active' : ''}`}
                        onClick={() => setWatermark((prev) => ({ ...prev, color: 'gray' }))}
                        title={isEn ? "Subtle Gray" : "安全暗灰"}
                        aria-label={isEn ? "Subtle Gray Watermark" : "安全暗灰色水印"}
                      />
                      <button
                        type="button"
                        className={`novip-dot-btn red ${watermark.color === 'red' ? 'active' : ''}`}
                        onClick={() => setWatermark((prev) => ({ ...prev, color: 'red' }))}
                        title={isEn ? "Warning Red" : "醒目警示红"}
                        aria-label={isEn ? "Warning Red Watermark" : "警示红色水印"}
                      />
                      <button
                        type="button"
                        className={`novip-dot-btn blue ${watermark.color === 'blue' ? 'active' : ''}`}
                        onClick={() => setWatermark((prev) => ({ ...prev, color: 'blue' }))}
                        title={isEn ? "Seal Ghost Blue" : "印章幽灵蓝"}
                        aria-label={isEn ? "Seal Blue Watermark" : "印章幽灵蓝色水印"}
                      />
                    </div>
                  </div>

                  <div className="novip-field-inline">
                    <label>{isEn ? "Density:" : "水印密度："}</label>
                    <select
                      value={watermark.density}
                      onChange={(e) =>
                        setWatermark((prev) => ({ ...prev, density: e.target.value as 'standard' | 'dense' }))
                      }
                      className="novip-select novip-select--compact"
                    >
                      <option value="standard">{isEn ? "Standard (Recommended)" : "适中（推荐）"}</option>
                      <option value="dense">{isEn ? "Dense (Maximum Anti-Theft)" : "密集（防盗强）"}</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 右侧/下方：A4 纸张实时预览与导出操作区 */}
        <section className="novip-idcard-preview-panel" aria-label={isEn ? "A4 paper live preview" : "A4 纸张效果实时预览"}>
          <div className="novip-preview-head">
            <div className="novip-preview-title">
              <strong>{isEn ? "Live A4 Paper Layout Preview" : "A4 纸张排版效果实时预览"}</strong>
              <small>{isEn ? "Standard 1:1 Physical Scale · 210 × 297 mm" : "标准 1:1 物理尺寸 · 210 × 297 mm"}</small>
            </div>
            {generating && <span className="novip-badge-pulse">{isEn ? "Rendering…" : "渲染中…"}</span>}
          </div>

          <div className="novip-a4-desk">
            <div className="novip-a4-sheet" style={{ aspectRatio: `${A4_WIDTH_MM} / ${A4_HEIGHT_MM}` }}>
              {previewDataUrl ? (
                <img src={previewDataUrl} alt={isEn ? "A4 Multi-up layout preview" : "A4 拼版排版预览"} className="novip-a4-img" />
              ) : (
                <div className="novip-a4-loading">{isEn ? "Generating layout…" : "正在排版生成…"}</div>
              )}
            </div>
          </div>

          {/* 导出主操作按钮 */}
          <div className="novip-export-actions-card">
            <div className="novip-export-btns">
              <button
                type="button"
                className="novip-btn-tactile novip-btn-tactile--primary"
                onClick={handleExportPdf}
                disabled={job.busy}
              >
                <FileText size={18} />
                <span>{isEn ? "⚡ Export Standard A4 Print PDF (1:1 Exact)" : "⚡ 导出标准 A4 打印 PDF（1:1精准）"}</span>
              </button>

              <button
                type="button"
                className="novip-btn-tactile novip-btn-tactile--secondary"
                onClick={handleExportImage}
                disabled={job.busy}
              >
                <Download size={18} />
                <span>{isEn ? "📷 Save 300 DPI HD Image" : "📷 保存 300DPI 高清图片"}</span>
              </button>
            </div>

            {/* 微信与手机端直存提示 */}
            {isWeChat() && (
              <p className="novip-wechat-guide-tip">
                {isEn
                  ? "💡 WeChat Tip: Long-press the full A4 preview above for 1 second and select 'Save to Phone' to directly save it to your camera roll!"
                  : "💡 微信小技巧：长按上方整张 A4 预览图 1 秒，选择「保存到手机」，即可直接把清晰复印件存进手机相册！"}
              </p>
            )}

            {/* 打印避坑指南 */}
            <div className="novip-printer-guide">
              <Printer size={15} className="novip-printer-icon" />
              <div className="novip-printer-guide-text">
                <strong>{isEn ? "🖨️ Printing Shop Tips:" : "🖨️ 打印店避坑小贴士："}</strong>
                {isEn
                  ? "When printing the PDF or image, ask the shop to select 'Actual Size / 100% Scale' (do NOT select 'Fit to Page'). This ensures the printed ID cards match the exact physical dimensions without distortion."
                  : "把下载的 PDF 或图片发给打印店老板时，请嘱咐「按实际大小 / 100% 比例打印」（不要选“适应纸张大小”），打印出来的身份证就能和实体卡分毫不差，绝不会因比例变形被学校审核退回！"}
              </div>
            </div>
          </div>
        </section>
      </div>
    </ToolPage>
  );
}
