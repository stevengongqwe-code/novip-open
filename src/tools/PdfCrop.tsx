import {useEffect,useRef,useState} from 'react';
import {ToolPage,useJob,saveLocal,isWeChat,WeChatNotice} from './common';
import {CROP_PRESETS,computeCropBox,cropPdf,croppedPdfName,inspectPdf,normalizeCropMargins,ptToMm,type CropMarginsMm,type CropPdfResult,type PdfInfo} from './pdf-crop-core';
import './pdf-tools.css';

const formatBytes=(bytes:number)=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;
interface MarginText{top:string;bottom:string;left:string;right:string}
const initialMargins:MarginText={top:'10',bottom:'10',left:'10',right:'10'};
interface PreviewThumb{url:string;pageBox:{x:number;y:number;width:number;height:number};viewportWidth:number;viewportHeight:number;toViewport:(x:number,y:number)=>number[]}
interface FrameStyle{left:string;top:string;width:string;height:string}

export default function PdfCrop(){
 const job=useJob();
 const [file,setFile]=useState<File>();
 const [bytes,setBytes]=useState<Uint8Array>();
 const [info,setInfo]=useState<PdfInfo>();
 const [margins,setMargins]=useState<MarginText>({...initialMargins});
 const [result,setResult]=useState<CropPdfResult>();
 const [loading,setLoading]=useState(false);
 const [fileKey,setFileKey]=useState(0);
 const [previewEnabled,setPreviewEnabled]=useState(false);
 const [thumb,setThumb]=useState<PreviewThumb>();
 const [previewLoading,setPreviewLoading]=useState(false);
 const [previewError,setPreviewError]=useState('');
 const cleanupRef=useRef<(()=>void)|undefined>(undefined);

 // 第一页缩略图：pdfjs-dist 动态加载；组件卸载或换文件时必须取消渲染并销毁 worker 文档。
 useEffect(()=>{
  if(!previewEnabled||!bytes){
   cleanupRef.current?.();cleanupRef.current=undefined;
   setThumb(undefined);setPreviewLoading(false);setPreviewError('');
   return;
  }
  let cancelled=false;
  const resources:{cancel?:()=>unknown;destroy?:()=>Promise<unknown>}={};
  cleanupRef.current=()=>{
   cancelled=true;
   try{resources.cancel?.();}catch{/* 取消渲染失败不影响数据 */}
   try{resources.destroy?.().catch(()=>undefined);}catch{/* 销毁失败时交给浏览器回收 */}
  };
  setThumb(undefined);setPreviewError('');setPreviewLoading(true);
  void (async()=>{
   try{
    const pdfjs=await import('pdfjs-dist');
    const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
    const baseUrl=import.meta.env?.BASE_URL??'/';
    const task=pdfjs.getDocument({data:bytes.slice(),stopAtErrors:true,useSystemFonts:true,cMapUrl:`${baseUrl}pdfjs/cmaps/`,cMapPacked:true,standardFontDataUrl:`${baseUrl}pdfjs/standard_fonts/`,wasmUrl:`${baseUrl}pdfjs/wasm/`});
    resources.destroy=()=>task.destroy();
    const doc=await task.promise;
    const page=await doc.getPage(1);
    const base=page.getViewport({scale:1});
    const scale=Math.min(2,Math.max(0.4,480/Math.max(1,base.width)));
    const viewport=page.getViewport({scale});
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(viewport.width));canvas.height=Math.max(1,Math.round(viewport.height));
    const context=canvas.getContext('2d');
    if(!context)throw new Error('浏览器无法创建预览画布。');
    const renderTask=page.render({canvas,canvasContext:context,viewport,background:'#fff'});
    resources.cancel=()=>renderTask.cancel();
    await renderTask.promise;
    const view=page.view;
    const pageBox={x:view[0],y:view[1],width:view[2]-view[0],height:view[3]-view[1]};
    const url=canvas.toDataURL('image/png');
    canvas.width=1;canvas.height=1;
    page.cleanup();
    if(!cancelled)setThumb({url,pageBox,viewportWidth:viewport.width,viewportHeight:viewport.height,toViewport:(x,y)=>viewport.convertToViewportPoint(x,y)});
    await task.destroy();resources.destroy=undefined;
   }catch(error){
    if(!cancelled)setPreviewError(error instanceof Error?error.message:'第一页缩略图渲染失败，可关闭预览后直接裁剪。');
   }finally{if(!cancelled)setPreviewLoading(false);}
  })();
  return ()=>{cleanupRef.current?.();cleanupRef.current=undefined;};
 },[previewEnabled,bytes]);
 useEffect(()=>()=>{cleanupRef.current?.();cleanupRef.current=undefined;},[]);

 const patchMargins=(side:keyof MarginText,value:string)=>{job.setError('');setResult(undefined);setMargins(current=>({...current,[side]:value}));};
 const applyPreset=(presetMargins:CropMarginsMm)=>{job.setError('');setResult(undefined);setMargins({top:String(presetMargins.top),bottom:String(presetMargins.bottom),left:String(presetMargins.left),right:String(presetMargins.right)});};
 const reset=()=>{job.reset();setFile(undefined);setBytes(undefined);setInfo(undefined);setResult(undefined);setMargins({...initialMargins});setLoading(false);setFileKey(key=>key+1);};
 const read=async(next:File|undefined)=>{
  setFile(next);setBytes(undefined);setInfo(undefined);setResult(undefined);job.reset();
  if(!next)return;
  setLoading(true);job.setStatus('正在读取PDF信息（大文件可能需要数秒）…');
  try{
   if(next.size>50*1024*1024){
    throw new Error(`文件大小为 ${(next.size/1024/1024).toFixed(1)}MB（超过 50MB 建议上限）。为防浏览器崩溃，建议：1. 先前往「PDF 合并与拆分」提取所需章节；2. 或先压缩后再统一裁剪。`);
   }
   const buffer=new Uint8Array(await next.arrayBuffer());
   const inspected=await inspectPdf(buffer);
   setBytes(buffer);setInfo(inspected);job.setStatus('已读取PDF，请设置四边裁剪量。');
  }catch(error){job.setError(error instanceof Error?error.message:'PDF读取失败，请换一个文件。');job.setStatus('未完成。');}
  finally{setLoading(false);}
 };
 let cropError='',afterSize='';
 let parsedMargins:CropMarginsMm|undefined;
 if(info){
  try{parsedMargins=normalizeCropMargins(margins);}catch(error){cropError=error instanceof Error?error.message:'裁剪量有误。';}
  if(parsedMargins)try{const box=computeCropBox({x:0,y:0,width:info.sizes[0].width,height:info.sizes[0].height},parsedMargins);afterSize=`${ptToMm(box.width).toFixed(1)} × ${ptToMm(box.height).toFixed(1)} mm`;}
  catch(error){cropError=cropError||(error instanceof Error?error.message:'裁剪量有误。');}
 }
 let frameStyle:FrameStyle|undefined;
 if(thumb&&parsedMargins)try{
  const box=computeCropBox(thumb.pageBox,parsedMargins);
  const start=thumb.toViewport(box.x,box.y),end=thumb.toViewport(box.x+box.width,box.y+box.height);
  const left=Math.min(start[0],end[0]),top=Math.min(start[1],end[1]),right=Math.max(start[0],end[0]),bottom=Math.max(start[1],end[1]);
  frameStyle={left:`${left/thumb.viewportWidth*100}%`,top:`${top/thumb.viewportHeight*100}%`,width:`${(right-left)/thumb.viewportWidth*100}%`,height:`${(bottom-top)/thumb.viewportHeight*100}%`};
 }catch{frameStyle=undefined;}
 const generate=()=>{setResult(undefined);void job.run(async check=>{if(!bytes)throw new Error('请先选择PDF文件。');return cropPdf(bytes,margins,check,(cur,tot)=>job.setStatus(`正在裁剪第 ${cur}/${tot} 页…`));},setResult);};
 const download=()=>{if(!result)return;saveLocal(new Blob([result.bytes.slice().buffer],{type:'application/pdf'}),croppedPdfName(file?.name??'document.pdf'));if(isWeChat())job.setStatus('已触发下载。如微信未提示保存，请点击右上角「···」在浏览器中打开。');};
 return <ToolPage id="pdf-crop" title="PDF裁剪（统一页边距）" description="按毫米统一裁掉PDF四边（或去掉10mm白边），可选第一页缩略图预览裁剪框；本机处理并复核输出尺寸。" job={job}>
  <section className="study-card"><h2>1 选择PDF</h2>
   <div className="upload-limit-banner"><strong>文件上限：</strong>单文件建议 ≤ 50MB（最多 500 页）· 仅调整可视边距，不损坏原文件与文字</div>
   <div className="tool-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files?.[0])void read(e.dataTransfer.files[0]);}}>
    <p style={{margin:'0 0 8px',fontWeight:600}}>拖入 PDF 文件，或点击选择</p>
    <input key={fileKey} type="file" accept=".pdf,application/pdf" disabled={job.busy||loading} onChange={event=>void read(event.target.files?.[0])}/>
    <small style={{display:'block',marginTop:'6px',color:'#71717a'}}>⚡ 纯本地内存处理 · 建议单个 ≤ 50MB · 500页以内 · 仅调整可视边距，不损坏原文件</small>
   </div>
   {loading&&<p className="study-message" role="status">正在读取PDF信息…</p>}
  </section>
  {info&&<section className="study-card"><h2>2 四边裁剪量（毫米）</h2>
   <div className="pdf-preset-row">
    {CROP_PRESETS.map(preset=>{const presetMargins=preset.margins;return presetMargins?<button key={preset.id} type="button" disabled={job.busy} onClick={()=>applyPreset(presetMargins)}>{preset.label}</button>:null;})}
    <button type="button" disabled={job.busy} onClick={()=>{job.setError('');setResult(undefined);setMargins({top:'',bottom:'',left:'',right:''});}}>清空</button>
   </div>
   <div className="study-fields">
    <label>上边距（mm）<input type="number" min={0} max={500} step={0.5} value={margins.top} disabled={job.busy} onChange={event=>patchMargins('top',event.target.value)}/></label>
    <label>下边距（mm）<input type="number" min={0} max={500} step={0.5} value={margins.bottom} disabled={job.busy} onChange={event=>patchMargins('bottom',event.target.value)}/></label>
    <label>左边距（mm）<input type="number" min={0} max={500} step={0.5} value={margins.left} disabled={job.busy} onChange={event=>patchMargins('left',event.target.value)}/></label>
    <label>右边距（mm）<input type="number" min={0} max={500} step={0.5} value={margins.right} disabled={job.busy} onChange={event=>patchMargins('right',event.target.value)}/></label>
   </div>
   <label className="study-check"><input type="checkbox" checked={previewEnabled} disabled={job.busy} onChange={event=>setPreviewEnabled(event.target.checked)}/>预览第一页与裁剪框（本机渲染，不联网）</label>
   {previewEnabled&&<div>
    {previewLoading&&<p className="study-message" role="status">正在渲染第一页缩略图…</p>}
    {previewError&&<p className="study-warning" role="status">预览不可用：{previewError}</p>}
    {thumb&&<div className="pdf-preview"><img src={thumb.url} alt="第一页缩略图与裁剪范围预览"/>{frameStyle&&<span className="pdf-preview-frame" style={frameStyle} aria-hidden="true"/>}</div>}
    {thumb&&<p className="study-note">红框内为裁剪后保留的可见区域，灰暗部分将被裁掉。</p>}
   </div>}
   <p className="study-note">裁剪语义：同步写入 MediaBox 与 CropBox，改变页面“可见区域”，页面内容没有被删除或压缩；被裁掉的部分仍在文件里，只是不再显示。</p>
  </section>}
  {info&&<section className="study-card"><h2>3 生成前核对</h2>
   <p>{info.pageCount} 页 · 原文件 {formatBytes(file?.size??0)} · 第1页 {ptToMm(info.sizes[0].width).toFixed(1)} × {ptToMm(info.sizes[0].height).toFixed(1)} mm</p>
   {cropError?<p className="study-warning" role="alert">{cropError}</p>:<p>裁剪后第1页约 {afterSize}；全部 {info.pageCount} 页按各自页面尺寸应用同一组毫米边距。</p>}
   <p className="study-note">裁剪后宽高必须大于 0 且小于原页面，否则拒绝输出；保存后会重新载入逐页核对尺寸。</p>
   <div className="study-actions">
    <button className="study-btn" disabled={!!cropError||job.busy} onClick={generate}>裁剪并验证</button>
    <button className="study-btn alt" onClick={reset}>取消 / 重置</button>
   </div>
  </section>}
  {result&&<section className="study-card"><h2>4 结果与下载</h2>
   <p>{result.pageCount} 页全部裁剪 · 第1页输出 {ptToMm(result.boxes[0].width).toFixed(1)} × {ptToMm(result.boxes[0].height).toFixed(1)} mm · {formatBytes(result.bytes.length)} · 尺寸复核通过</p>
   <p className="study-note">下载的是新副本，原PDF保持不变。如预览与结果有细微差异，以文件实际 CropBox 与 MediaBox 为准。</p>
   <WeChatNotice customText="📱 微信提示：若点击下载未弹出保存文件提示，请点击右上角「···」选择「在浏览器打开」即可保存到手机文件。" />
   <button className="study-btn" onClick={download}>下载裁剪后的PDF</button>
  </section>}
 </ToolPage>;
}
