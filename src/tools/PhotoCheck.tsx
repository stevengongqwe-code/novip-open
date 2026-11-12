import {useState, useRef, useEffect} from 'react';
import {ToolPage, useJob, saveLocal, appNavigate, WeChatNotice, ShareToClassmates} from './common';
import { useI18n } from '../i18n';
import {inspectPhoto, compressUnderLimit, drawCrop, getCrop} from '../features/id-photo/core';
import {
  diagnosePhoto,
  setPhotoTransfer,
  type PhotoDiagnosisResult,
  type RgbColor,
} from '../features/id-photo/photo-check-core';
import './tools.css';

export default function PhotoCheck() {
  const { lang } = useI18n();
  const isEn = lang === 'en-US';
  const job = useJob();
  const [file, setFile] = useState<File>();
  const [imageUrl, setImageUrl] = useState<string>();
  const [report, setReport] = useState<PhotoDiagnosisResult>();
  const [fileError, setFileError] = useState<string>('');
  const [fixing, setFixing] = useState(false);
  const [fixedBlob, setFixedBlob] = useState<Blob>();
  const [fixedUrl, setFixedUrl] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (fixedUrl) URL.revokeObjectURL(fixedUrl);
    };
  }, [imageUrl, fixedUrl]);

  const reset = () => {
    job.reset();
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    if (fixedUrl) URL.revokeObjectURL(fixedUrl);
    setImageUrl(undefined);
    setFixedUrl(undefined);
    setFile(undefined);
    setReport(undefined);
    setFixedBlob(undefined);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (selected: File | undefined) => {
    if (!selected) return;
    reset();

    if (selected.size === 0) {
      setFileError('所选图片文件为空（0 字节），请重新选择有效的证件照。');
      job.setError('文件为空（0 字节）');
      job.setStatus('体检未能完成。');
      return;
    }
    if (selected.size > 20 * 1024 * 1024) {
      const sizeMb = (selected.size / (1024 * 1024)).toFixed(1);
      setFileError(`图片文件过大（${sizeMb} MB，已超出 20MB 上限）。建议先用手机相册适当裁剪或缩小后再体检。`);
      job.setError('图片超过 20MB 上限');
      job.setStatus('体检未能完成。');
      return;
    }

    setFile(selected);
    job.setStatus('正在体检照片规格与底色…');

    try {
      const buffer = new Uint8Array(await selected.arrayBuffer());
      const info = inspectPhoto(buffer);

      const url = URL.createObjectURL(selected);
      setImageUrl(url);

      // 加载图片并提取边缘背景样本（顶部与两肩上方）
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片解码失败，请换一张图片。'));
        img.src = url;
      });

      // 用 Canvas 采样边缘像素（避开人物面部）
      const canvas = document.createElement('canvas');
      const w = 100;
      const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建图片采样画布');
      ctx.drawImage(img, 0, 0, w, h);

      // 在四角与顶部边缘取 12 个样本点
      const sampleCoords = [
        [5, 5], [w / 2, 5], [w - 5, 5],
        [5, 15], [w - 5, 15],
        [5, 25], [w - 5, 25],
        [5, h / 3], [w - 5, h / 3],
        [10, 5], [w - 10, 5], [w / 4, 5],
      ];

      const samples: RgbColor[] = [];
      for (const [x, y] of sampleCoords) {
        const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
        samples.push({r: pixel[0], g: pixel[1], b: pixel[2]});
      }

      const diagnosis = diagnosePhoto(
        info.width,
        info.height,
        selected.size,
        info.mime,
        samples
      );

      setReport(diagnosis);
      job.setStatus(diagnosis.overall === 'pass' ? '体检完成：照片符合标准！' : '体检完成：发现部分待优化项。');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '照片分析失败，请确认文件格式。';
      setFileError(msg);
      job.setError(msg);
      job.setStatus('体检未能完成。');
    }
  };

  // 一键快速修复（自动居中裁剪到 480×640 并压到 100KB JPG）
  const fixPhoto = async () => {
    if (!file || !imageUrl) return;
    setFixing(true);
    job.setStatus('正在自动裁剪到标准 480×640 并优化至 ≤100KB…');

    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = imageUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 640;

      // 居中智能裁切
      const crop = getCrop(
        {naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight},
        480,
        640,
        1,
        {x: 0.5, y: 0.45} // 略偏上，贴合人脸位置
      );

      drawCrop(canvas, img, crop);

      // 压至 100KB
      const res = await compressUnderLimit(canvas, 100 * 1024);
      setFixedBlob(res.blob);
      if (fixedUrl) URL.revokeObjectURL(fixedUrl);
      const u = URL.createObjectURL(res.blob);
      setFixedUrl(u);
      job.setStatus(`修复成功！已生成 480×640 标准照片（${Math.round(res.blob.size / 1024)} KB）。`);
    } catch (err) {
      job.setError(err instanceof Error ? err.message : '修复失败');
    } finally {
      setFixing(false);
    }
  };

  const downloadFixed = () => {
    if (!fixedBlob) return;
    const base = (file?.name || 'photo').replace(/\.[^.]+$/, '');
    saveLocal(fixedBlob, `${base}-合规修复-480x640.jpg`);
    job.setStatus('已触发下载。在手机微信中亦可长按下方修复图直接保存到相册。');
  };

  return (
    <ToolPage
      id="photo-check"
      title={isEn ? "ID & Application Photo Compliance Check" : "一键证件照体检诊断"}
      description={isEn
        ? "Upload your application photo to verify dimensions, KB size, 3:4 aspect ratio, background purity, and format against official requirements with 1-click smart fix."
        : "上传报名照片，一键检测尺寸、KB体积、3:4比例、背景纯净度与文件格式；对照四六级/教资/考研规范给出诊断报告，并支持一键智能修复。"}
      job={job}
    >
      <section className="study-card">
        <h2>{isEn ? "1 Select Photo for Inspection" : "1 选择需要体检的照片"}</h2>
        <div
          className="tool-drop"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            if (e.dataTransfer.files?.[0]) void handleFile(e.dataTransfer.files[0]);
          }}
        >
          <p style={{margin: '0 0 8px', fontWeight: 600}}>{isEn ? "Drop photo here or click below to select" : "拖入证件照图片，或点击下方选择"}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.webp"
            disabled={job.busy}
            onChange={e => {
              if (e.target.files?.[0]) void handleFile(e.target.files[0]);
            }}
          />
          <small style={{display: 'block', marginTop: '6px', color: '#71717a'}}>
            {isEn ? "Supports JPG, PNG, WebP · Recommended ≤ 20MB · Ready for mobile & WeChat" : "支持 JPG、PNG、WebP · 建议 ≤ 20MB · 手机微信直接可用"}
          </small>
        </div>
        <p className="study-note">
          🔒 <strong>{isEn ? "Privacy First:" : "隐私第一："}</strong>{isEn ? " Photos are inspected 100% inside your local device memory and never uploaded to any server." : "照片 100% 仅在您当前设备的浏览器内存中进行几何与像素分析，绝不上传到任何服务器，绝不泄露人脸隐私。"}
        </p>
      </section>

      {/* 空态：未上传时展示体检范围与官方规范 */}
      {!file && !fileError && (
        <section className="study-card">
          <h2>{isEn ? "📋 Inspection Scope & Official Standards" : "📋 体检范围与主流官方规范"}</h2>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '12px'}}>
            <div style={{border: '1px solid #e4e4e7', borderRadius: '8px', padding: '12px', background: '#fafafa'}}>
              <strong style={{color: '#18181b', fontSize: '13px'}}>{isEn ? "📏 Dimensions & Ratio" : "📏 尺寸与比例"}</strong>
              <p style={{margin: '4px 0 0', color: '#71717a', fontSize: '12px'}}>
                {isEn ? "Recognizes CET/Teacher Cert 480×640, 1-inch 295×413, 2-inch 358×441 in standard 3:4 aspect ratio, flagging landscape or stretched photos." : "智能识别四六级/教资 480×640、1寸 295×413、2寸 358×441 等标准 3:4 比例，预警横向或变形照片。"}
              </p>
            </div>
            <div style={{border: '1px solid #e4e4e7', borderRadius: '8px', padding: '12px', background: '#fafafa'}}>
              <strong style={{color: '#18181b', fontSize: '13px'}}>{isEn ? "📦 File Size Compliance" : "📦 体积合规性"}</strong>
              <p style={{margin: '4px 0 0', color: '#71717a', fontSize: '12px'}}>
                {isEn ? "Checks if file size is between 10KB ~ 100KB, preventing >200KB upload rejections or <10KB blurry files." : "检测是否在 10KB ~ 100KB 之间，阻断 >200KB 上传失败或 <10KB 模糊不达标文件。"}
              </p>
            </div>
            <div style={{border: '1px solid #e4e4e7', borderRadius: '8px', padding: '12px', background: '#fafafa'}}>
              <strong style={{color: '#18181b', fontSize: '13px'}}>{isEn ? "🖼️ Format Standards" : "🖼️ 文件格式规范"}</strong>
              <p style={{margin: '4px 0 0', color: '#71717a', fontSize: '12px'}}>
                {isEn ? "Strictly validates true JPG/JPEG formats, warning about non-standard PNG/WebP files that could cause verification failure." : "严格识别真实 JPG/JPEG 格式，提示非标 PNG/WebP，避免报名审核直接打回。"}
              </p>
            </div>
            <div style={{border: '1px solid #e4e4e7', borderRadius: '8px', padding: '12px', background: '#fafafa'}}>
              <strong style={{color: '#18181b', fontSize: '13px'}}>{isEn ? "🎨 Background Purity" : "🎨 背景纯净度"}</strong>
              <p style={{margin: '4px 0 0', color: '#71717a', fontSize: '12px'}}>
                {isEn ? "Samples background edges to reliably detect pure white, sky blue, standard red, or cluttered real-life backgrounds." : "算法在四角与顶部边缘取样分析，精准识别纯白底、纯蓝底、纯红底或生活杂色背景。"}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 失败态：解析异常或非标准格式提示 */}
      {fileError && (
        <section className="study-card" style={{borderLeft: '4px solid #c9232c', background: '#fff9f9'}}>
          <h2 style={{color: '#991b1b'}}>{isEn ? "⚠️ Photo Inspection Could Not Complete" : "⚠️ 照片体检未能完成"}</h2>
          <p style={{color: '#7f1d1d', margin: '6px 0 10px'}}>{fileError}</p>
          <div style={{background: '#fff', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#4b5563', lineHeight: '1.7'}}>
            <strong>{isEn ? "💡 Troubleshooting & Solutions:" : "💡 常见排查与解决方法："}</strong>
            <ul style={{margin: '4px 0 0', paddingLeft: '18px'}}>
              <li>
                {isEn
                  ? "iPhone HEIC photos: Send as original in WeChat or Photos app, save as image to auto-convert to standard JPG, then upload."
                  : "苹果手机 HEIC 照片：在微信聊天窗口发送原图，长按该图选择「保存图片」，通常会自动转为标准 JPG，再上传即可。"}
              </li>
              <li>
                {isEn
                  ? "File too large: If larger than 20MB, crop or resize in your phone album before inspecting."
                  : "文件过大：如单张超过 20MB，请先用截图或相册裁剪适当缩小后再上传。"}
              </li>
              <li>
                {isEn
                  ? "Non-image format: Ensure the uploaded file is in .jpg / .jpeg / .png / .webp format."
                  : "非图片文件：请确认上传的是 .jpg / .jpeg / .png / .webp 格式的证件照。"}
              </li>
            </ul>
          </div>
          <div className="study-actions" style={{marginTop: '14px'}}>
            <button type="button" className="study-btn" onClick={reset}>
              {isEn ? "Select Another Photo" : "重新选择照片"}
            </button>
          </div>
        </section>
      )}

      {report && file && (
        <section className="study-card">
          <h2>{isEn ? "2 Inspection Diagnostic Report" : "2 体检诊断报告"}</h2>

          <div style={{display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', margin: '14px 0'}}>
            {imageUrl && (
              <div style={{textAlign: 'center'}}>
                <img
                  src={imageUrl}
                  alt={isEn ? "Inspected photo" : "待体检照片"}
                  style={{
                    maxHeight: '160px',
                    maxWidth: '120px',
                    borderRadius: '6px',
                    border: '1px solid #e4e4e7',
                    boxShadow: '0 2px 4px rgba(0,0,0,.08)',
                    display: 'block',
                  }}
                />
                <small style={{color: '#71717a', fontSize: '11px', marginTop: '4px', display: 'block'}}>
                  {report.width} × {report.height}
                </small>
              </div>
            )}

            <div style={{flex: 1, minWidth: '220px'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px'}}>
                <span
                  style={{
                    fontSize: '28px',
                    fontWeight: 800,
                    color: report.overall === 'pass' ? '#16a34a' : '#ea580c',
                  }}
                >
                  {report.score} {isEn ? "pts" : "分"}
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontWeight: 600,
                    background: report.overall === 'pass' ? '#dcfce7' : '#ffedd5',
                    color: report.overall === 'pass' ? '#166534' : '#9a3412',
                  }}
                >
                  {report.overall === 'pass'
                    ? (isEn ? '✓ Pass (Ready to submit)' : '✓ 合格建议提交')
                    : (isEn ? '⚠️ Needs optimization before submitting' : '⚠️ 需优化后再提交')}
                </span>
              </div>
              <p style={{margin: '4px 0', fontSize: '14px', color: '#3f3f46'}}>{report.overallMessage}</p>
            </div>
          </div>

          {/* 逐项诊断清单 */}
          <ul className="study-checklist" style={{marginTop: '16px'}}>
            {report.checks.map(item => (
              <li
                key={item.id}
                className={
                  item.status === 'pass' ? 'st-pass' : item.status === 'warn' ? 'st-warn' : 'st-warn'
                }
              >
                <strong>
                  {item.status === 'pass' ? '🟢' : item.status === 'warn' ? '🟡' : '🔴'} {item.label}：
                  <span style={{fontWeight: 400, marginLeft: '6px'}}>{item.summary}</span>
                </strong>
                {item.advice && (
                  <p style={{margin: '4px 0 0', color: '#c9232c', fontSize: '12px'}}>
                    💡 {isEn ? "Tip:" : "提示："} {item.advice}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {/* 快捷操作区 */}
          <div className="study-actions" style={{marginTop: '20px'}}>
            {report.overall !== 'pass' && (
              <button
                type="button"
                className="study-btn"
                disabled={fixing}
                onClick={fixPhoto}
              >
                {fixing
                  ? (isEn ? 'Smart fixing…' : '正在智能修复…')
                  : (isEn ? '✨ 1-Click Fix to 480×640 Standard Photo (≤100KB)' : '✨ 一键修复为 480×640 标准照 (≤100KB)')}
              </button>
            )}

            <button
              type="button"
              className="study-btn alt"
              onClick={() => {
                if (file) {
                  setPhotoTransfer({
                    file,
                    width: 480,
                    height: 640,
                    limitKB: 100,
                    source: 'photo-check',
                  });
                }
                appNavigate('/tools/id-photo?width=480&height=640&limitKB=100');
              }}
            >
              {isEn ? "📐 Take Photo to Accurate Crop (480×640)" : "📐 带照片去精确裁剪 (480×640)"}
            </button>

            <button
              type="button"
              className="study-btn alt"
              onClick={() => {
                if (file) {
                  setPhotoTransfer({
                    file,
                    source: 'photo-check',
                  });
                }
                appNavigate('/tools/background');
              }}
            >
              {isEn ? "🎨 Change Background Color" : "🎨 抠图换底色"}
            </button>

            <button
              type="button"
              className="study-btn alt"
              onClick={() => {
                if (file) {
                  setPhotoTransfer({
                    file,
                    width: 480,
                    height: 640,
                    limitKB: 100,
                    source: 'photo-check',
                  });
                }
                appNavigate('/tools/materials?width=480&height=640&maxKiB=100');
              }}
            >
              {isEn ? "📋 Application Material Verification" : "📋 报名材料客观核验"}
            </button>

            <button type="button" className="study-btn alt" onClick={reset}>
              {isEn ? "Change Photo" : "换一张照片"}
            </button>
          </div>
        </section>
      )}

      {fixedBlob && fixedUrl && (
        <section className="study-card" style={{borderLeft: '4px solid #16a34a'}}>
          <h2>{isEn ? "3 Fix Completed & Download" : "3 修复完成与下载"}</h2>
          <p>
            {isEn ? (
              <>🎉 Photo centered to <strong>480 × 640 px</strong>, converted to <strong>Standard JPG</strong>, and optimized to <strong>{Math.round(fixedBlob.size / 1024)} KB</strong> (≤ 100KB).</>
            ) : (
              <>🎉 已按主流官方系统要求，将照片居中调整为 <strong>480 × 640 像素</strong>，格式转为 <strong>标准 JPG</strong>，体积优化至 <strong>{Math.round(fixedBlob.size / 1024)} KB</strong>（≤ 100KB）。</>
            )}
          </p>

          <div style={{display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', margin: '14px 0'}}>
            {imageUrl && (
              <div style={{textAlign: 'center'}}>
                <span style={{fontSize: '12px', color: '#71717a', display: 'block', marginBottom: '4px'}}>{isEn ? "Original" : "原图"}</span>
                <img
                  src={imageUrl}
                  alt={isEn ? "Original" : "原图"}
                  style={{
                    maxHeight: '140px',
                    maxWidth: '105px',
                    borderRadius: '6px',
                    border: '1px solid #e4e4e7',
                    display: 'block',
                  }}
                />
                <small style={{color: '#71717a', fontSize: '11px', marginTop: '4px', display: 'block'}}>
                  {report?.width} × {report?.height}
                </small>
              </div>
            )}
            <div style={{fontSize: '22px', color: '#16a34a'}}>➔</div>
            <div style={{textAlign: 'center'}}>
              <span style={{fontSize: '12px', color: '#16a34a', fontWeight: 600, display: 'block', marginBottom: '4px'}}>{isEn ? "Fixed Standard Photo" : "修复后标准照"}</span>
              <img
                src={fixedUrl}
                alt={isEn ? "Fixed Photo" : "修复后照片"}
                style={{
                  maxHeight: '140px',
                  maxWidth: '105px',
                  borderRadius: '6px',
                  border: '2px solid #16a34a',
                  display: 'block',
                  boxShadow: '0 2px 6px rgba(22,163,74,0.15)',
                }}
              />
              <small style={{color: '#166534', fontWeight: 600, fontSize: '11px', marginTop: '4px', display: 'block'}}>
                480 × 640 · {Math.round(fixedBlob.size / 1024)} KB (JPG)
              </small>
            </div>
          </div>

          <p style={{fontSize: '12px', color: '#16a34a', margin: '8px 0', textAlign: 'center'}}>
            {isEn ? "💡 Mobile & WeChat: Long-press the fixed photo above to 'Save to Camera Roll'" : "💡 手机与微信用户：长按上方修复后图片即可「保存到手机相册」"}
          </p>
          <WeChatNotice isImage={true} />

          <div className="study-actions">
            <button type="button" className="study-btn" onClick={downloadFixed} style={{background: '#16a34a', borderColor: '#16a34a'}}>
              {isEn ? "📥 Download Fixed Compliant Photo" : "📥 下载修复后的合规照片"}
            </button>
            <button type="button" className="study-btn alt" onClick={reset}>
              {isEn ? "Finish & Reset" : "完成并重置"}
            </button>
          </div>
          <div style={{marginTop: 16}}>
            <ShareToClassmates toolId="photo-check" />
          </div>
        </section>
      )}
    </ToolPage>
  );
}
