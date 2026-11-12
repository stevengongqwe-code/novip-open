import Brand from '../../Brand';
import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import {BeginnerGuide} from '../../tools/beginner-guides';
import {TactileStepper} from '../../motion/components/TactileStepper';
import './IdPhotoTool.css';

import {getCrop,moveCrop,drawCrop,compressUnderLimit,inspectPhoto,mmToPixels,validateSpec,type Point,type Crop} from './core';
import {consumePhotoTransfer} from './photo-check-core';
type Unit='px'|'mm';
type Preset='one'|'two'|'cet'|'academic'|'custom';
export default function IdPhotoTool() {
  const { lang } = useI18n();
  const isEn = lang === 'en-US';
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState('');
  const [preset, setPreset] = useState<Preset>('academic');
  const [unit, setUnit] = useState<Unit>('px');
  const [bgColor, setBgColor] = useState<string>('original');
  const [bgTolerance, setBgTolerance] = useState<number>(38);
  const [pixelWidth, setPixelWidth] = useState(480);
  const [pixelHeight, setPixelHeight] = useState(640);
  const [mmWidth, setMmWidth] = useState(25);
  const [mmHeight, setMmHeight] = useState(35);
  const [dpi, setDpi] = useState(300);
  const [limitKB, setLimitKB] = useState(100);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<Point>({ x: 0.5, y: 0.5 });
  const [busy, setBusy] = useState(false);
  const [loading,setLoading]=useState(false);
  const [outputPreviewUrl, setOutputPreviewUrl] = useState<string | null>(null);
  const generation=useRef(0),locked=useRef(false);
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>()=>{if(outputPreviewUrl)URL.revokeObjectURL(outputPreviewUrl);},[outputPreviewUrl]);

  useEffect(() => {
    // 1. 处理来自 AI 助手或首页场景的一键预设 URL 参数
    try {
      const search = window.location.search;
      if (search) {
        const params = new URLSearchParams(search);
        const specParam = params.get('spec');
        const bgParam = params.get('bg');
        const limitParam = params.get('limit');
        if (specParam && ['one', 'two', 'cet', 'academic'].includes(specParam)) {
          choosePreset(specParam as Preset);
        }
        if (bgParam) {
          if (bgParam === 'blue') setBgColor('#3b82f6');
          else if (bgParam === 'white') setBgColor('#ffffff');
          else if (bgParam === 'red') setBgColor('#ef4444');
          else if (bgParam === 'darkblue') setBgColor('#1e40af');
        }
        if (limitParam) {
          const lim = parseInt(limitParam, 10);
          if (lim >= 5 && lim <= 10000) setLimitKB(lim);
        }
      }
    } catch {}

    // 2. 检查是否有从「换底色工坊」无缝带过来的照片
    try {
      const transferred = sessionStorage.getItem('novip:transfer_photo');
      if (transferred) {
        sessionStorage.removeItem('novip:transfer_photo');
        setImageName('已从换底色工坊带入照片.png');
        setImageUrl(transferred);
      }
    } catch {}
  }, []);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const moveRef = useRef<{ id: number; x: number; y: number; crop: Crop } | null>(null);

  const width = unit === 'px' ? pixelWidth : mmToPixels(mmWidth,dpi);
  const height = unit === 'px' ? pixelHeight : mmToPixels(mmHeight,dpi);
  const validation = unit==='mm'&&(!Number.isFinite(mmWidth)||!Number.isFinite(mmHeight)||mmWidth<=0||mmHeight<=0||!Number.isFinite(dpi)||dpi<72||dpi>1200)?'毫米尺寸须大于0，DPI须为72–1200。':validateSpec(width,height,limitKB);
  const valid = !validation;
  useEffect(()=>{setSuccess('');setError('');},[width,height,limitKB,zoom,center]);
  useEffect(()=>setSuccess(''),[image]);
  useEffect(() => {
    if (!imageUrl) {
      setImage(null);
      return;
    }
    let alive = true;const gen=generation.current;
    const timer=setTimeout(()=>{if(alive&&gen===generation.current){alive=false;setLoading(false);setImage(null);setError('照片解码超过15秒，请换较小的照片或其他浏览器重试。');}},15000);
    const img = new Image();
    img.onload = () => {
      if (!alive||gen!==generation.current) return;
      clearTimeout(timer);setLoading(false);
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth>20000 || img.naturalHeight>20000 || img.naturalWidth * img.naturalHeight > 40_000_000) {
        setImage(null);
        setError('源照片超过 4000 万像素，手机可能无法安全处理，请先缩小原图。');
        return;
      }
      setImage(img);
      setCenter({ x: 0.5, y: 0.5 });
      setZoom(1);
      setError('');
    };
    img.onerror = () => {
      if (alive&&gen===generation.current) {
        clearTimeout(timer);setLoading(false);
        setImage(null);
        setError('照片无法解码。请使用 JPG、PNG 或当前浏览器支持的 WebP 图片。');
      }
    };
    img.src = imageUrl;
    return () => {
      alive = false;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !image || !valid) return;
    const scale = Math.min(1, 420 / width, 600 / height);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    try {
      drawCrop(canvas, image, getCrop(image, width, height, zoom, center), {
        bgColor,
        tolerance: bgTolerance,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '图片预览失败。');
    }
  }, [image, width, height, zoom, center, valid, bgColor, bgTolerance]);

  function choosePreset(next: Preset) {
    setPreset(next);
    setError('');
    setSuccess('');
    if (next === 'one') {
      setUnit('px');
      setPixelWidth(295);
      setPixelHeight(413);
      setMmWidth(25);
      setMmHeight(35);
      setDpi(300);
      setLimitKB(100);
    } else if (next === 'two') {
      setUnit('px');
      setPixelWidth(413);
      setPixelHeight(579);
      setMmWidth(35);
      setMmHeight(49);
      setDpi(300);
      setLimitKB(200);
    } else if (next === 'cet') {
      setUnit('px');
      setPixelWidth(144);
      setPixelHeight(192);
      setLimitKB(100);
    } else if (next === 'academic') {
      setUnit('px');
      setPixelWidth(480);
      setPixelHeight(640);
      setLimitKB(100);
    }
  }

  function loadSamplePhoto() {
    if (locked.current || loading || busy) return;
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 800;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(300, 290, 115, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(300, 690, 210, 210, 0, Math.PI, 0, false);
    ctx.fill();
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setImageName('示例证件照（蓝底）.png');
      setImageUrl(url);
      setSuccess('');
      setError('');
    }, 'image/png');
  }

  function switchUnit(next: Unit) {
    if (next === unit) return;
    if(!valid){setError('请先修正尺寸与KB参数，再切换单位。');return;}
    if (next === 'px') {
      setPixelWidth(width);
      setPixelHeight(height);
    } else {
      setMmWidth(Number((width * 25.4 / dpi).toFixed(6)));
      setMmHeight(Number((height * 25.4 / dpi).toFixed(6)));
    }
    setUnit(next);
    setPreset('custom');
  }

  async function chooseImage(file?: File) {
    if(!file||locked.current)return;
    const gen=++generation.current;setImage(null);setImageUrl(null);setImageName('');setSuccess('');setError('');setLoading(true);moveRef.current=null;
    try{
      if(file.size>20*1024*1024)throw new Error('源照片请勿超过20MB。');
      const bytes=new Uint8Array(await file.arrayBuffer());if(gen!==generation.current)return;
      const {mime}=inspectPhoto(bytes);const url=URL.createObjectURL(new Blob([bytes.buffer],{type:mime}));
      setImageName(file.name);setImageUrl(url);
    }catch(e){if(gen===generation.current){setLoading(false);setError(e instanceof Error?e.message:'读取照片失败，请重新选择。');}}
  }

  useEffect(() => {
    try {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      if (search) {
        const params = new URLSearchParams(search);
        const w = Number(params.get('width') || params.get('w'));
        const h = Number(params.get('height') || params.get('h'));
        const l = Number(params.get('limitKB') || params.get('limit'));
        const p = params.get('preset');
        if (w > 0 && h > 0) {
          setUnit('px');
          setPixelWidth(w);
          setPixelHeight(h);
          setPreset('custom');
        }
        if (l > 0) {
          setLimitKB(l);
        }
        if (p === 'one') choosePreset('one');
        else if (p === 'two') choosePreset('two');
      }
    } catch {
      /* ignore query parse errors */
    }

    const transfer = consumePhotoTransfer();
    if (transfer) {
      if (transfer.width && transfer.height) {
        setUnit('px');
        setPixelWidth(transfer.width);
        setPixelHeight(transfer.height);
        setPreset('custom');
      }
      if (transfer.limitKB) {
        setLimitKB(transfer.limitKB);
      }
      if (transfer.file) {
        void chooseImage(transfer.file);
        setSuccess(`已从证件照体检导入照片（${transfer.width || 480} × ${transfer.height || 640} px，≤ ${transfer.limitKB || 100} KB）。可在下方拖动调整取景位置。`);
      }
    }
  }, []);
  function clearPhoto(){generation.current++;locked.current=false;moveRef.current=null;setImage(null);setImageUrl(null);setImageName('');setLoading(false);setBusy(false);setError('');setSuccess('');}

  function goToBackgroundTool() {
    if (!image) return;
    try {
      const c = document.createElement('canvas');
      c.width = image.naturalWidth;
      c.height = image.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(image, 0, 0);
        sessionStorage.setItem('novip:transfer_photo', c.toDataURL('image/png'));
        history.pushState(null, '', '/tools/background');
        window.dispatchEvent(new PopStateEvent('popstate'));
        window.scrollTo({ top: 0 });
      }
    } catch {
      setError('无法自动传递照片，请先下载后去换底色工具上传。');
    }
  }
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!image || !valid || busy || loading || !e.isPrimary || (e.pointerType==='mouse'&&e.button!==0)) return;
    moveRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, crop:getCrop(image,width,height,zoom,center) };
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* Coordinate controls remain available when capture is unavailable. */}
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const start = moveRef.current;
    if (!start || start.id !== e.pointerId || !image || !valid) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    setCenter(moveCrop(image,start.crop,e.clientX-start.x,e.clientY-start.y,r.width,r.height));
  }

  function onPointerEnd(e: React.PointerEvent<HTMLCanvasElement>) {
    if (moveRef.current?.id === e.pointerId){moveRef.current = null;try{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}catch{/* Already released by the browser. */}}
  }

  async function download() {
    if (!image || !valid || locked.current || loading) return;
    locked.current=true;const gen=generation.current;moveRef.current=null;let canvas:HTMLCanvasElement|undefined;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      drawCrop(canvas, image, getCrop(image, width, height, zoom, center), {
        bgColor,
        tolerance: bgTolerance,
      });
      const maxBytes = Math.floor(limitKB * 1024);
      const {blob,quality} = await compressUnderLimit(canvas, maxBytes,()=>{if(gen!==generation.current)throw new Error('处理已取消。');});
      if (blob.size > maxBytes) throw new Error('文件大小超过设定上限，已阻止下载。');
      const outputUrl = URL.createObjectURL(blob);
      const outFileName = `NOVIP-photo-${width}x${height}-${(blob.size / 1024).toFixed(1)}KB.jpg`;
      setOutputPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      const a = document.createElement('a');
      a.href = outputUrl;
      a.download = outFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(outputUrl), 60_000);
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent('novip:download', {
            detail: { name: outFileName, type: blob.type || 'image/jpeg', size: blob.size },
          }),
        );
      }
      setSuccess(`${quality<0.35?'压缩质量较低，请核对人脸细节。':''}已生成：${width} × ${height} 像素，${(blob.size / 1024).toFixed(1)} KB（不超过 ${limitKB} KB）。手机上可直接长按下方生成的照片保存到相册！`);
    } catch (e) {
      if(gen===generation.current)setError(e instanceof Error ? e.message : '处理失败，请重试。');
    } finally {
      if(canvas){canvas.width=1;canvas.height=1;}
      if(gen===generation.current){locked.current=false;setBusy(false);}
    }
  }

  return (
    <div className="zj-photo-page"><header className="zj-photo-site-header"><Brand/><span>{isEn ? "Free · No Login · No Watermark" : "免费 · 无登录 · 无水印"}</span></header><section className="zj-photo" aria-labelledby="zj-photo-title">
      <header className="zj-photo__heading">
        <div style={{width: '100%'}}>
          <span className="zj-photo__eyebrow">{isEn ? "NOVIP · Free Student Tools" : "NOVIP · 免费工具"}</span>
          <h1 id="zj-photo-title">{isEn ? "ID & Application Photo Resizer" : "报名照片尺寸助手"}</h1>
          <BeginnerGuide
            id="photo"
            technicalDescription={isEn ? "Resize dimensions, set pixel bounds, limit KB. 100% in-browser, no photo upload." : "改尺寸、定像素、限制 KB。纯浏览器处理，不上传照片。"}
          />
          <TactileStepper
            steps={[
              {id: 'upload', label: isEn ? '1. Select Photo' : '1. 选择照片', description: isEn ? 'Selfie or original' : '生活照或原图'},
              {id: 'adjust', label: isEn ? '2. Crop & Specs' : '2. 裁剪与调规格', description: isEn ? '1-inch / 2-inch / Background' : '一寸/二寸/红蓝白底'},
              {id: 'download', label: isEn ? '3. Save & Export' : '3. 导出保存', description: isEn ? 'Strict KB limit' : '严格按 KB 导出'},
            ]}
            currentStepIndex={outputPreviewUrl ? 2 : image ? 1 : 0}
          />
        </div>
      </header>

      <fieldset disabled={busy||loading} className="zj-photo__group" aria-label={isEn ? "Photo editing settings" : "照片编辑设置"}><div className="zj-photo__grid">
        <div className="zj-photo__panel">
          <h3>{isEn ? "Step 1: Choose Your Photo" : "第一步：选择你的照片"}</h3>
          <label className="zj-photo__upload" htmlFor="zj-photo-file">
            <strong>
              {loading
                ? (isEn ? 'Reading photo…' : '正在读取照片…')
                : image
                ? (isEn ? 'Change Photo' : '更换照片')
                : (isEn ? 'Click here to choose photo from phone or computer' : '点这里选择手机或电脑里的照片')}
            </strong>
            <span>{isEn ? "Supports JPG / PNG / WebP, max 20 MB" : "支持 JPG / PNG / WebP，不超过 20 MB"}</span>
            <input id="zj-photo-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void chooseImage(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10}}>
            <button type="button" className="study-btn alt" onClick={loadSamplePhoto}>
              {isEn ? "Try Sample Photo (Quick test without uploading)" : "载入示例照片试试（没准备照片也能先体验）"}
            </button>
          </div>
          {imageName && <p className="zj-photo__filename" title={imageName}>{isEn ? `Selected: ${imageName}` : `已选择：${imageName}`}</p>}
          <div className="zj-photo__preview-wrap">
            {image && valid ? (
              <canvas
                className="zj-photo__canvas"
                ref={previewRef}
                style={{ aspectRatio: `${width} / ${height}` }}
                aria-label={isEn ? "Drag to crop photo preview" : "拖动裁剪预览照片"}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                onLostPointerCapture={()=>{moveRef.current=null;}}
                tabIndex={0}
                onKeyDown={e=>{if(busy||loading||!image||!valid)return;const steps:Record<string,Point>={ArrowLeft:{x:-12,y:0},ArrowRight:{x:12,y:0},ArrowUp:{x:0,y:-12},ArrowDown:{x:0,y:12}};const step=steps[e.key];if(step){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();setCenter(moveCrop(image,getCrop(image,width,height,zoom,center),step.x,step.y,r.width,r.height));}}}
              />
            ) : (
              <div className="zj-photo__placeholder">
                {image
                  ? (isEn ? 'Please specify valid photo dimensions' : '请先填写有效的照片参数')
                  : (isEn ? 'Upload a photo (or click Try Sample Photo above) to adjust crop and position here' : '上传照片（或点击上方「载入示例照片试试」）后，在这里拖动调整位置')}
              </div>
            )}
          </div>
          <p className="zj-photo__hint">{isEn ? "Drag with touch or mouse to adjust avatar position; use slider below to zoom." : "用手指或鼠标拖动照片调整头像位置，拉动下方滑杆可放大照片。"}</p>
          <label className="zj-photo__slider">
            <span>{isEn ? "Zoom & Framing" : "放大与取景"}</span>
            <input type="range" min="1" max="3" step="0.01" value={zoom} disabled={!image} onChange={e => setZoom(e.target.value===''?NaN:Number(e.target.value))} />
            <span>{zoom.toFixed(2)}×</span>
          </label>
          <button className="zj-photo__minor" type="button" disabled={!image} onClick={() => { setZoom(1); setCenter({ x: 0.5, y: 0.5 }); }}>
            {isEn ? "Reset Crop" : "重置裁剪"}
          </button>
        </div>

        <div className="zj-photo__panel">
          <h3>{isEn ? "Step 2: Choose Background Color & Dimensions" : "第二步：选底色与尺寸（一站式搞定蓝底/白底与文件大小）"}</h3>
          <label style={{display: 'block', fontSize: 13, fontWeight: 600, color: '#1c1c1e', marginBottom: 6}}>
            {isEn ? "🎨 Background Color (Blue / White / Red 1-Click Convert)" : "🎨 背景底色（蓝底/白底/红底一键转换）"}
          </label>
          <div className="zj-photo__choices" role="group" aria-label={isEn ? "Background color choices" : "底色选择"}>
            <button type="button" aria-pressed={bgColor === 'original'} onClick={() => setBgColor('original')}>
              {isEn ? "Original Background" : "保持原底色"}
            </button>
            <button
              type="button"
              aria-pressed={bgColor === '#3b82f6'}
              onClick={() => setBgColor('#3b82f6')}
              style={{display: 'inline-flex', alignItems: 'center', gap: 6}}
            >
              <span style={{width: 12, height: 12, borderRadius: '50%', background: '#3b82f6', display: 'inline-block'}} />
              {isEn ? "Sky Blue" : "标准天蓝底"}
            </button>
            <button
              type="button"
              aria-pressed={bgColor === '#ffffff'}
              onClick={() => setBgColor('#ffffff')}
              style={{display: 'inline-flex', alignItems: 'center', gap: 6}}
            >
              <span style={{width: 12, height: 12, borderRadius: '50%', background: '#ffffff', border: '1px solid #cbd5e1', display: 'inline-block'}} />
              {isEn ? "Pure White" : "考试纯白底"}
            </button>
            <button
              type="button"
              aria-pressed={bgColor === '#ef4444'}
              onClick={() => setBgColor('#ef4444')}
              style={{display: 'inline-flex', alignItems: 'center', gap: 6}}
            >
              <span style={{width: 12, height: 12, borderRadius: '50%', background: '#ef4444', display: 'inline-block'}} />
              {isEn ? "Standard Red" : "标准正红底"}
            </button>
            <button
              type="button"
              aria-pressed={bgColor === '#1e40af'}
              onClick={() => setBgColor('#1e40af')}
              style={{display: 'inline-flex', alignItems: 'center', gap: 6}}
            >
              <span style={{width: 12, height: 12, borderRadius: '50%', background: '#1e40af', display: 'inline-block'}} />
              {isEn ? "Dark Blue" : "深邃海蓝"}
            </button>
          </div>

          {bgColor !== 'original' && (
            <div style={{marginTop: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b'}}>
              <span>{isEn ? "✨ Background color automatically replaced. To adjust edges:" : "✨ 已自动为你识别并替换背景颜色。如果边缘需要微调："}</span>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 6}}>
                <span>{isEn ? "Tolerance:" : "识别容差："}</span>
                <input
                  type="range"
                  min="15"
                  max="70"
                  value={bgTolerance}
                  onChange={(e) => setBgTolerance(Number(e.target.value))}
                  style={{flex: 1}}
                />
                <span>{bgTolerance}</span>
              </div>
              {image && (
                <div style={{marginTop: 6}}>
                  <span>{isEn ? "Complex background needing hair-strand precision?" : "背景复杂需要精细修发丝？"}</span>
                  <button
                    type="button"
                    onClick={goToBackgroundTool}
                    style={{background: 'none', border: 'none', color: '#0071e3', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 11, marginLeft: 4}}
                  >
                    {isEn ? "Go to Background Eraser ↗ (Auto-transfer photo)" : "去手动涂抹换底色 ↗（照片自动带过去）"}
                  </button>
                </div>
              )}
            </div>
          )}

          <label style={{display: 'block', fontSize: 13, fontWeight: 600, color: '#1c1c1e', margin: '14px 0 6px'}}>
            {isEn ? "📐 Exam & ID Dimensions" : "📐 考试与证件尺寸"}
          </label>
          <div className="zj-photo__choices" role="group" aria-label={isEn ? "Preset specs" : "参考规格"}>
            <button type="button" aria-pressed={preset === 'academic'} onClick={() => choosePreset('academic')}>{isEn ? "Student Portal (480×640)" : "教务/学信网常用（480×640）"}</button>
            <button type="button" aria-pressed={preset === 'one'} onClick={() => choosePreset('one')}>{isEn ? "1-Inch (295×413)" : "一寸参考（295×413）"}</button>
            <button type="button" aria-pressed={preset === 'two'} onClick={() => choosePreset('two')}>{isEn ? "2-Inch (413×579)" : "二寸参考（413×579）"}</button>
            <button type="button" aria-pressed={preset === 'cet'} onClick={() => choosePreset('cet')}>{isEn ? "CET / Computer Exam (144×192)" : "四六级/计算机（144×192）"}</button>
            <button type="button" aria-pressed={preset === 'custom'} onClick={() => choosePreset('custom')}>{isEn ? "Custom Size" : "自定义尺寸"}</button>
          </div>
          <p className="zj-photo__hint">{isEn ? "Click a preset above to set dimensions, or click Custom Size to enter custom values." : "点一下上面的按钮就能自动设好尺寸；如果学校通知写了别的数字，点「自定义尺寸」修改。"}</p>

          <div className="zj-photo__fields" style={{gridTemplateColumns: '1fr', marginTop: 10}}>
            <label>
              {isEn ? "Maximum allowed file size in KB (e.g. enter 100 if ≤ 100KB required)" : "学校要求照片最大不超过多少 KB？（如要求 100KB 以内就填 100）"}
              <input type="number" inputMode="numeric" min="5" max="10000" value={Number.isFinite(limitKB)?limitKB:''} onChange={e => setLimitKB(e.target.value===''?NaN:Number(e.target.value))} />
            </label>
          </div>
          <div className="zj-photo__choices" style={{marginTop: 8}} role="group" aria-label={isEn ? "Common size limits" : "常见文件大小上限"}>
            <button type="button" aria-pressed={limitKB === 50} onClick={() => setLimitKB(50)}>≤ 50 KB</button>
            <button type="button" aria-pressed={limitKB === 100} onClick={() => setLimitKB(100)}>{isEn ? "≤ 100 KB (Standard)" : "≤ 100 KB（最常用）"}</button>
            <button type="button" aria-pressed={limitKB === 200} onClick={() => setLimitKB(200)}>≤ 200 KB</button>
          </div>

          <details className="novip-advanced-details" open={preset === 'custom'}>
            <summary>{isEn ? "⚙️ Advanced Settings: Custom Pixels W×H, Millimeters, or DPI" : "⚙️ 高级设置：自定义像素宽×高、毫米尺寸或 DPI（常规报名不用改）"}</summary>
            <div className="novip-advanced-body">
              <div className="zj-photo__choices zj-photo__choices--two" role="group" aria-label={isEn ? "Dimension units" : "尺寸单位"}>
                <button type="button" aria-pressed={unit === 'px'} onClick={() => switchUnit('px')}>{isEn ? "Pixels px" : "像素 px"}</button>
                <button type="button" aria-pressed={unit === 'mm'} onClick={() => switchUnit('mm')}>{isEn ? "Millimeters mm + DPI" : "毫米 mm + DPI"}</button>
              </div>
              <div className="zj-photo__fields">
                <label>{isEn ? "Width" : "宽度"} <input type="number" inputMode="decimal" min="1" value={Number.isFinite(unit==='px'?pixelWidth:mmWidth)?(unit==='px'?pixelWidth:mmWidth):''} onChange={e => { setPreset('custom'); if (unit === 'px') setPixelWidth(e.target.value===''?NaN:Number(e.target.value)); else setMmWidth(e.target.value===''?NaN:Number(e.target.value)); }} /></label>
                <label>{isEn ? "Height" : "高度"} <input type="number" inputMode="decimal" min="1" value={Number.isFinite(unit==='px'?pixelHeight:mmHeight)?(unit==='px'?pixelHeight:mmHeight):''} onChange={e => { setPreset('custom'); if (unit === 'px') setPixelHeight(e.target.value===''?NaN:Number(e.target.value)); else setMmHeight(e.target.value===''?NaN:Number(e.target.value)); }} /></label>
                {unit === 'mm' && <label>DPI <input type="number" inputMode="numeric" min="72" max="1200" value={Number.isFinite(dpi)?dpi:''} onChange={e => { setPreset('custom'); setDpi(e.target.value===''?NaN:Number(e.target.value)); }} /></label>}
              </div>
            </div>
          </details>

          <h3 style={{marginTop: 18}}>{isEn ? "Step 3: Preview Result & Save Photo" : "第三步：查看效果并保存新照片"}</h3>
          <div className="zj-photo__summary">
            <strong>{isEn ? "Output Photo Specs:" : "即将生成的照片规格："}</strong>
            {valid
              ? (isEn ? `Width ${width} × Height ${height} px · JPG format · File size ≤ ${limitKB} KB` : `宽 ${width} × 高 ${height} 像素 · JPG 格式 · 体积不超过 ${limitKB} KB`)
              : (isEn ? 'Please correct parameters' : '参数待修正')}
          </div>
          {validation && <div className="zj-photo__notice zj-photo__notice--error" role="alert">{validation}</div>}
          {error && <div className="zj-photo__notice zj-photo__notice--error" role="alert">{error}</div>}
          {success && <div className="zj-photo__notice zj-photo__notice--success" role="status">{success}</div>}
          <button className="zj-photo__download" type="button" disabled={!image || !valid || busy || loading} onClick={() => { void download(); }}>
            {busy ? (isEn ? 'Processing locally…' : '正在本地处理…') : (isEn ? 'Generate & Download Photo' : '生成并下载照片')}
          </button>
          {outputPreviewUrl && (
            <div style={{marginTop: 14, padding: 14, borderRadius: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', textAlign: 'center'}}>
              <strong style={{display: 'block', fontSize: 13, color: '#14532d', marginBottom: 8}}>
                {isEn ? "📱 Mobile / WeChat: Long press the photo below and choose 'Save to Phone'!" : "📱 手机/微信用户：直接长按下方这张生成好的照片，选「保存到手机」即可存进相册！"}
              </strong>
              <img
                src={outputPreviewUrl}
                alt={isEn ? "Generated compliant photo" : "生成后的合规报名照片"}
                style={{maxWidth: 180, height: 'auto', borderRadius: 8, border: '1px solid #cbd5e1', margin: '0 auto', display: 'block'}}
              />
            </div>
          )}
        </div>
      </div></fieldset>
      <button className="zj-photo__minor" type="button" disabled={!imageUrl&&!imageName&&!loading&&!busy} onClick={clearPhoto}>
        {busy||loading ? (isEn ? 'Cancel & Release Photo' : '取消并释放照片') : (isEn ? 'Clear Photo' : '清空照片')}
      </button>
      <footer className="zj-photo__footer">
        {isEn
          ? "Privacy: Photos are cropped and compressed within your device browser and never sent to our servers. Refreshing or clearing releases the photo. Millimeters and DPI are for pixel conversion only."
          : "隐私：照片在当前设备浏览器内裁剪和压缩，不发送到我们的服务器。刷新或点击清空会释放照片；不持久保存。透明区域会填充白色。毫米与DPI只用于换算像素，不保证JPG元数据的DPI值。本站不会自动验证人脸、服装、底色或考试报名审核结果。"}
      </footer>
    </section></div>
  );
}
