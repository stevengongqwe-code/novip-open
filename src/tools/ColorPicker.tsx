import {useRef,useState} from 'react';
import {ToolPage} from './common';
import {copyLocal} from '../tool-common';
import {inspectPhoto} from '../features/id-photo/core';
import {
 colorValueFromHex,
 colorValueFromRgb,
 extractPalette,
 fitPreviewSize,
 formatHsl,
 formatRgb,
 mapPointerToPixel,
 parseColorValue,
 type ColorInputMode,
 type ColorValue,
 type PaletteColor,
} from './color-core';

// 取色页限制：与任务规格一致（单张 ≤15MB / ≤4000 万像素）。
const MAX_FILE_BYTES=15*1024*1024;
const MAX_PIXELS=40_000_000;
// 预览画布额外缩小，保证手机对超大图也能流畅取色；关闭插值后颜色仍是原图真实像素。
const PREVIEW_MAX_SIDE=2400;
const PREVIEW_MAX_PIXELS=4_000_000;

const MODE_LABEL:Record<ColorInputMode,string>={hex:'HEX',rgb:'RGB',hsl:'HSL'};
const MODE_PLACEHOLDER:Record<ColorInputMode,string>={hex:'#1A2B3C',rgb:'255, 0, 0',hsl:'210, 50%, 40%'};
const MODE_HINT:Record<ColorInputMode,string>={
 hex:'支持 3 位或 6 位十六进制，可带 #。',
 rgb:'三个 0–255 的整数，可写 255, 0, 0 或 rgb(255, 0, 0)。',
 hsl:'色相 0–360、饱和度/亮度 0–100%，可写 210, 50%, 40% 或 hsl(210, 50%, 40%)。',
};

interface LoadedImage {name:string;size:number;width:number;height:number;previewWidth:number;previewHeight:number}
interface PickedColor extends ColorValue {alpha:number}

function contrastText(rgb:{r:number;g:number;b:number}):string{
 return 0.2126*rgb.r+0.7152*rgb.g+0.0722*rgb.b>150?'#202024':'#FFFFFF';
}

function ValueRow({label,value,onCopy}:{label:string;value:string;onCopy:(text:string)=>void}){
 return <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',borderTop:'1px solid #e4e4e7',paddingTop:10}}>
  <span style={{width:34,fontSize:11,color:'#71717a',flex:'none'}}>{label}</span>
  <code style={{flex:'1 1 150px',minWidth:0,overflowWrap:'anywhere',fontSize:13,color:'#202024'}}>{value}</code>
  <button type="button" className="study-btn alt" onClick={()=>onCopy(value)} aria-label={`复制 ${label} ${value}`}>复制</button>
 </div>;
}

function ColorValueCard({color,alpha,onCopy}:{color:ColorValue;alpha:number;onCopy:(text:string)=>void}){
 return <div style={{padding:16,border:'1px solid #e4e4e7',borderRadius:10,background:'#fafafa',marginTop:14}}>
  <div style={{display:'flex',gap:14,alignItems:'center',flexWrap:'wrap',marginBottom:10}}>
   <span aria-hidden="true" style={{width:64,height:64,borderRadius:12,border:'1px solid rgba(0,0,0,.15)',background:color.hex,flex:'none'}}/>
   <div style={{minWidth:0}}>
    <strong style={{fontSize:18,display:'block',overflowWrap:'anywhere'}}>{color.hex}</strong>
    <span style={{fontSize:11,color:'#71717a',overflowWrap:'anywhere'}}>{formatRgb(color.rgb)} · {formatHsl(color.hsl)}{alpha<255?` · 透明度 ${Math.round(alpha/255*100)}%`:''}</span>
   </div>
  </div>
  <div style={{display:'grid',gap:8}}>
   <ValueRow label="HEX" value={color.hex} onCopy={onCopy}/>
   <ValueRow label="RGB" value={formatRgb(color.rgb)} onCopy={onCopy}/>
   <ValueRow label="HSL" value={formatHsl(color.hsl)} onCopy={onCopy}/>
  </div>
 </div>;
}

export default function ColorPicker(){
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const contextRef=useRef<CanvasRenderingContext2D|null>(null);
 const pressRef=useRef<{id:number;x:number;y:number}|null>(null);
 const [loading,setLoading]=useState(false);
 const [loadError,setLoadError]=useState('');
 const [image,setImage]=useState<LoadedImage|null>(null);
 const [loaded,setLoaded]=useState(false);
 const [palette,setPalette]=useState<PaletteColor[]>([]);
 const [picked,setPicked]=useState<PickedColor|null>(null);
 const [notice,setNotice]=useState('');
 const [manualMode,setManualMode]=useState<ColorInputMode>('hex');
 const [manualInput,setManualInput]=useState('#1A2B3C');
 const [manualResult,setManualResult]=useState<ColorValue|null>(()=>colorValueFromHex('#1A2B3C'));
 const [manualError,setManualError]=useState('');

 const copy=async(text:string)=>{
  try{await copyLocal(text);setNotice(`已复制 ${text}。`);}
  catch(error){setNotice(error instanceof Error?error.message:'浏览器未允许复制，请手动选中结果。');}
 };

 const load=async(file:File)=>{
  if(loading)return;
  const canvas=canvasRef.current;
  setLoading(true);setLoadError('');setNotice('');setPicked(null);
  setImage(null);setLoaded(false);setPalette([]);contextRef.current=null;
  let bitmap:ImageBitmap|undefined;
  try{
   if(file.size>MAX_FILE_BYTES)throw new Error(`图片 ${(file.size/1024/1024).toFixed(1)}MB 超过 15MB 上限，请先压缩或缩小后再试。`);
   const bytes=new Uint8Array(await file.arrayBuffer());
   // 先用文件头校验格式与像素（不整图解码），超限时给出明确中文原因。
   const info=inspectPhoto(bytes);
   if(info.width*info.height>MAX_PIXELS)throw new Error('图片超过 4000 万像素，请先缩小后再试。');
   try{bitmap=await createImageBitmap(new Blob([bytes.slice().buffer],{type:info.mime}));}
   catch{throw new Error('图片解码失败，文件可能损坏或浏览器不支持该格式（仅支持 JPG / PNG / 静态 WebP）。');}
   const width=bitmap.width,height=bitmap.height;
   if(width*height>MAX_PIXELS)throw new Error('图片超过 4000 万像素，请先缩小后再试。');
   if(!canvas)throw new Error('取色画布未就绪，请刷新页面后重试。');
   const preview=fitPreviewSize(width,height,PREVIEW_MAX_SIDE,PREVIEW_MAX_PIXELS);
   canvas.width=preview.width;
   canvas.height=preview.height;
   const context=canvas.getContext('2d',{willReadFrequently:true});
   if(!context)throw new Error('当前浏览器无法创建取色画布。');
   context.clearRect(0,0,preview.width,preview.height);
   // 大图缩小时关闭插值：取到的是原图真实像素，而不是平均后的混合色。
   context.imageSmoothingEnabled=preview.scale===1;
   context.imageSmoothingQuality='high';
   context.drawImage(bitmap,0,0,preview.width,preview.height);
   const colors=extractPalette(context.getImageData(0,0,preview.width,preview.height).data,{maxColors:8,maxSamples:400_000});
   contextRef.current=context;
   setImage({name:file.name,size:file.size,width,height,previewWidth:preview.width,previewHeight:preview.height});
   setPalette(colors);
   setLoaded(true);
   setNotice(colors.length?`已提取 ${colors.length} 个主色，点击色块可复制 HEX。`:'图片没有可统计的不透明像素（可能是全透明 PNG），仍可尝试点击取色。');
  }catch(error){
   setLoadError(error instanceof Error?error.message:'图片载入失败，请换一张图片重试。');
  }finally{
   bitmap?.close();
   setLoading(false);
  }
 };

 const pickAt=(clientX:number,clientY:number)=>{
  const canvas=canvasRef.current,context=contextRef.current;
  if(!canvas||!context||!loaded)return;
  const point=mapPointerToPixel(clientX,clientY,canvas.getBoundingClientRect(),canvas.width,canvas.height);
  if(!point)return;
  const data=context.getImageData(point.x,point.y,1,1).data;
  setPicked({...colorValueFromRgb({r:data[0],g:data[1],b:data[2]}),alpha:data[3]});
  setNotice(`已在第 ${point.x+1} 列、第 ${point.y+1} 行取色。`);
 };

 const convert=()=>{
  try{
   setManualResult(parseColorValue(manualMode,manualInput));
   setManualError('');
  }catch(error){
   setManualResult(null);
   setManualError(error instanceof Error?error.message:'颜色格式不正确，请检查输入。');
  }
 };

 return <ToolPage
  id="color-picker"
  title="图片取色 / 颜色转换"
  description="上传图片后点击任意位置取色，得到 HEX / RGB / HSL 并一键复制；自动提取前 8 个主色及占比；也可手动互转颜色值。文件只在本机内存处理，不上传。"
 >
  <section className="study-card">
   <h2><span className="study-step">1</span>选择图片</h2>
   <input
    type="file"
    accept="image/jpeg,image/png,image/webp"
    aria-label="选择要取色的图片"
    disabled={loading}
    onChange={event=>{const file=event.target.files?.[0];if(file)void load(file);event.target.value='';}}
   />
   <p className="study-note">支持 JPG / PNG / 静态 WebP；单张 ≤15MB 且 ≤4000 万像素，超限会拒绝并说明原因。取色与主色统计全部在浏览器内完成。</p>
   {loading&&<progress aria-label="正在读取图片"/>}
   {loadError&&<div role="alert" className="study-error">{loadError}</div>}
   {image&&<p className="study-note">已载入：{image.name}；{image.width}×{image.height}px（{(image.size/1024/1024).toFixed(2)}MB）{image.previewWidth<image.width?`；为流畅取色预览缩至 ${image.previewWidth}×${image.previewHeight}px`:'；按原尺寸显示'}。</p>}
  </section>

  <section className="study-card">
   <h2><span className="study-step">2</span>点击 / 触摸图片取色</h2>
   <canvas
    ref={canvasRef}
    role="img"
    aria-label="图片取色画布：点击或触摸图片上的任意位置取色"
    style={{display:loaded?'block':'none',width:'100%',height:'auto',maxWidth:'100%',border:'1px solid #e4e4e7',borderRadius:8,touchAction:'pan-y',cursor:'crosshair',margin:'4px 0 12px'}}
    onPointerDown={event=>{if(event.isPrimary)pressRef.current={id:event.pointerId,x:event.clientX,y:event.clientY};}}
    onPointerUp={event=>{
     const press=pressRef.current;
     pressRef.current=null;
     if(!press||press.id!==event.pointerId)return;
     // 手指滑动用于滚动页面，移动超过 10px 不取色，避免误触。
     if(Math.hypot(event.clientX-press.x,event.clientY-press.y)<=10)pickAt(event.clientX,event.clientY);
    }}
    onPointerCancel={()=>{pressRef.current=null;}}
    onPointerLeave={()=>{pressRef.current=null;}}
   />
   {!loaded&&<p className="study-note">选择图片后这里会出现取色画布。</p>}
   {loaded&&<p className="study-note">鼠标点击或手机点按取色；在画布上滑动页面不会误取色。透明像素会标注透明度。</p>}
   {picked&&<ColorValueCard color={picked} alpha={picked.alpha} onCopy={text=>void copy(text)}/>}
  </section>

  {palette.length>0&&<section className="study-card">
   <h2><span className="study-step">3</span>主色板（前 8 色）</h2>
   <p className="study-note">对图片做降采样直方图量化后按占比排序；占比 = 该色在抽样不透明像素中的比例。点击色块复制 HEX。</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(112px,1fr))',gap:10,marginTop:12}}>
    {palette.map((color,index)=><button
     key={`${color.hex}-${index}`}
     type="button"
     onClick={()=>void copy(color.hex)}
     aria-label={`复制主色 ${color.hex}，占比 ${(color.ratio*100).toFixed(1)}%`}
     style={{minHeight:78,padding:8,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,borderRadius:9,border:'1px solid rgba(0,0,0,.16)',background:color.hex,color:contrastText(color.rgb),cursor:'pointer',fontSize:12,lineHeight:1.35}}
    >
     <strong style={{fontWeight:600}}>{color.hex}</strong>
     <span>{(color.ratio*100).toFixed(1)}%</span>
    </button>)}
   </div>
  </section>}

  <section className="study-card">
   <h2><span className="study-step">4</span>手动颜色转换</h2>
   <div className="study-fields">
    <label>输入格式<select value={manualMode} onChange={event=>{setManualMode(event.target.value as ColorInputMode);setManualError('');}}>
     {(['hex','rgb','hsl'] as ColorInputMode[]).map(mode=><option key={mode} value={mode}>{MODE_LABEL[mode]}</option>)}
    </select></label>
    <label>输入值<input
     value={manualInput}
     placeholder={MODE_PLACEHOLDER[manualMode]}
     aria-label={`${MODE_LABEL[manualMode]} 颜色输入`}
     onChange={event=>{setManualInput(event.target.value);setManualError('');}}
     onKeyDown={event=>{if(event.key==='Enter')convert();}}
    /></label>
   </div>
   <p className="study-note">{MODE_HINT[manualMode]}</p>
   <div className="study-actions">
    <button type="button" className="study-btn" onClick={convert}>转换</button>
    <button type="button" className="study-btn alt" onClick={()=>void copy(manualInput.trim())}>复制输入</button>
   </div>
   {manualError&&<div role="alert" className="study-error">{manualError}</div>}
   {manualResult&&<ColorValueCard color={manualResult} alpha={255} onCopy={text=>void copy(text)}/>}
  </section>

  {notice&&<p role="status" className="study-message">{notice}</p>}
  <p className="study-note">对照说明：主色提取只统计不透明像素；超大图片会等比缩小预览后再取色，关闭插值以保证颜色来自原图像素。手动转换不依赖图片。</p>
 </ToolPage>;
}
