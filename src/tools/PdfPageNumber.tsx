import {useState} from 'react';
import {ToolPage,useJob,saveLocal,isWeChat,WeChatNotice} from './common';
import {PAGE_NUMBER_DEFAULTS,PAGE_NUMBER_FORMATS,PAGE_NUMBER_POSITIONS,addPageNumbers,inspectPdf,normalizePageNumberOptions,orderedPdfName,planPageNumbers,ptToMm,type AddPageNumbersResult,type PageNumberOptions,type PdfInfo} from './pdf-page-number-core';
import './pdf-tools.css';

const formatBytes=(bytes:number)=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;
const positionLabel=(id:string)=>PAGE_NUMBER_POSITIONS.find(item=>item.id===id)?.label??id;
const formatLabel=(id:string)=>PAGE_NUMBER_FORMATS.find(item=>item.id===id)?.label??id;

export default function PdfPageNumber(){
 const job=useJob();
 const [file,setFile]=useState<File>();
 const [bytes,setBytes]=useState<Uint8Array>();
 const [info,setInfo]=useState<PdfInfo>();
 const [options,setOptions]=useState<PageNumberOptions>({...PAGE_NUMBER_DEFAULTS});
 const [result,setResult]=useState<AddPageNumbersResult>();
 const [loading,setLoading]=useState(false);
 const [fileKey,setFileKey]=useState(0);
 const patch=(value:Partial<PageNumberOptions>)=>{job.setError('');setResult(undefined);setOptions(current=>({...current,...value}));};
 const reset=()=>{job.reset();setFile(undefined);setBytes(undefined);setInfo(undefined);setResult(undefined);setLoading(false);setFileKey(key=>key+1);};
 const read=async(next:File|undefined)=>{
  setFile(next);setBytes(undefined);setInfo(undefined);setResult(undefined);job.reset();
  if(!next)return;
  setLoading(true);job.setStatus('正在读取PDF信息（大文件可能需要数秒）…');
  try{
   if(next.size>50*1024*1024){
    throw new Error(`文件大小为 ${(next.size/1024/1024).toFixed(1)}MB（超过 50MB 建议上限）。为防浏览器崩溃，建议：1. 先前往「PDF 合并与拆分」提取所需页码；2. 或先压缩后再加页码。`);
   }
   const buffer=new Uint8Array(await next.arrayBuffer());
   const inspected=await inspectPdf(buffer);
   setBytes(buffer);setInfo(inspected);job.setStatus('已读取PDF，请设置页码参数。');
  }catch(error){
   job.setError(error instanceof Error?error.message:'PDF读取失败，请换一个文件。');job.setStatus('未完成。');
  }finally{setLoading(false);}
 };
 let planError='',plannedCount=0;
 if(info&&bytes){
  try{plannedCount=planPageNumbers(normalizePageNumberOptions(options,info.pageCount)).length;}
  catch(error){planError=error instanceof Error?error.message:'页码参数有误。';}
 }
 const generate=()=>{setResult(undefined);void job.run(async check=>{if(!bytes)throw new Error('请先选择PDF文件。');return addPageNumbers(bytes,options,check,(cur,tot)=>job.setStatus(`正在处理第 ${cur}/${tot} 页…`));},setResult);};
 const download=()=>{if(!result)return;saveLocal(new Blob([result.bytes.slice().buffer],{type:'application/pdf'}),orderedPdfName(file?.name??'document.pdf'));if(isWeChat())job.setStatus('已触发下载。如微信未提示保存，请点击右上角「···」在浏览器中打开。');};
 return <ToolPage id="pdf-page-number" title="PDF加页码" description="给PDF逐页加页码：九宫格位置、起始编号、自定义范围、跳过封面、字号与毫米边距，本机生成新副本。" job={job}>
  <section className="study-card"><h2>1 选择PDF</h2>
   <div className="upload-limit-banner"><strong>文件上限：</strong>单文件建议 ≤ 50MB（最多 500 页）· 纯本地内存处理，不上传正文与个人信息</div>
   <div className="tool-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files?.[0])void read(e.dataTransfer.files[0]);}}>
    <p style={{margin:'0 0 8px',fontWeight:600}}>拖入 PDF 文件，或点击选择</p>
    <input key={fileKey} type="file" accept=".pdf,application/pdf" disabled={job.busy||loading} onChange={event=>void read(event.target.files?.[0])}/>
    <small style={{display:'block',marginTop:'6px',color:'#71717a'}}>⚡ 纯本地内存处理 · 建议单个 ≤ 50MB · 500页以内 · 不上传服务器</small>
   </div>
   {loading&&<p className="study-message" role="status">正在读取PDF信息…</p>}
  </section>
  {info&&<section className="study-card"><h2>2 页码参数</h2>
   <div className="study-fields">
    <label>首页显示编号<input type="number" min={0} max={99999} step={1} value={options.start} disabled={job.busy} onChange={event=>patch({start:Number(event.target.value)})}/></label>
    <label>跳过前几页不编号（1=封面）<input type="number" min={0} max={Math.max(0,info.pageCount-1)} step={1} value={options.skipCount} disabled={job.busy} onChange={event=>patch({skipCount:Number(event.target.value)})}/></label>
    <label>页码范围（留空=全部，如 1-3,5）<input value={options.range} placeholder="1-3,5" disabled={job.busy} onChange={event=>patch({range:event.target.value})}/></label>
    <label>字号（pt）<input type="number" min={6} max={36} step={1} value={options.fontSize} disabled={job.busy} onChange={event=>patch({fontSize:Number(event.target.value)})}/></label>
    <label>距页边距（mm）<input type="number" min={0} max={50} step={1} value={options.marginMm} disabled={job.busy} onChange={event=>patch({marginMm:Number(event.target.value)})}/></label>
    <label>编号格式<select value={options.format} disabled={job.busy} onChange={event=>patch({format:event.target.value as PageNumberOptions['format']})}>{PAGE_NUMBER_FORMATS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
   </div>
   <fieldset className="pdf-fieldset" disabled={job.busy}><legend>页码位置（九宫格）</legend>
    <div className="pdf-position-grid" role="radiogroup" aria-label="页码位置">
     {PAGE_NUMBER_POSITIONS.map(item=><label key={item.id} className={options.position===item.id?'selected':''}><input type="radio" name="pdf-page-number-position" value={item.id} checked={options.position===item.id} onChange={()=>patch({position:item.id})}/><span>{item.label}</span></label>)}
    </div>
   </fieldset>
   <p className="study-note">页码格式只提供 ASCII（数字与英文）。中文页码需要嵌入中文字体，本工具暂不提供。</p>
  </section>}
  {info&&bytes&&<section className="study-card"><h2>3 生成前核对</h2>
   <p>{info.pageCount} 页 · 原文件 {formatBytes(file?.size??0)} · 第1页 {ptToMm(info.sizes[0].width).toFixed(1)} × {ptToMm(info.sizes[0].height).toFixed(1)} mm</p>
   {planError?<p className="study-warning" role="alert">{planError}</p>:<p>将给 <strong>{plannedCount}</strong> 页加页码；从第 {options.skipCount+1} 页开始显示「{options.start}」；位置：{positionLabel(options.position)}；格式：{formatLabel(options.format)}；字号：{options.fontSize}pt；边距：{options.marginMm}mm。</p>}
   <p className="study-note">编号跟随实际页位：范围内被跳过的页不会让后续页码重新连续；「1 / N」和「Page 1 of N」中的 N = 总页数 − 跳过页数。</p>
   <div className="study-actions">
    <button className="study-btn" disabled={!!planError||job.busy} onClick={generate}>生成带页码的PDF</button>
    <button className="study-btn alt" onClick={reset}>取消 / 重置</button>
   </div>
  </section>}
  {result&&<section className="study-card"><h2>4 结果与下载</h2>
   <p>{result.pageCount} 页 · 已编号 {result.numberedCount} 页 · 输出 {formatBytes(result.bytes.length)}</p>
   <p className="study-note">已在原页面尺寸上叠加页码，原PDF保持不变。若原页面已有页码，新页码会同时显示并与原内容重叠。</p>
   <WeChatNotice customText="📱 微信提示：若点击下载未弹出保存文件提示，请点击右上角「···」选择「在浏览器打开」即可保存到手机文件。" />
   <button className="study-btn" onClick={download}>下载新PDF</button>
  </section>}
 </ToolPage>;
}
