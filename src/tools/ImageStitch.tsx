import {useEffect,useRef,useState} from 'react';
import {ToolPage,useJob,saveLocal} from './common';
import {
 STITCH_LIMITS,
 computeStitchLayout,
 stitchExtension,
 stitchMime,
 validateStitchFiles,
 validateStitchUpload,
 type StitchFormat,
 type StitchLayout,
 type StitchMode,
 type StitchSettings,
 type StitchSizeMode,
} from './stitch-core';

const MEBIBYTE=1024*1024;

interface StitchFile {id:number;name:string;size:number;width:number;height:number;file:File}
interface StitchResult {width:number;height:number;bytes:number;format:StitchFormat;name:string}

const pad=(value:number)=>String(value).padStart(2,'0');
const timestamp=()=>{const now=new Date();return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;};
const decodeFile=async(file:File):Promise<ImageBitmap>=>{
 try{return await createImageBitmap(file);}
 catch{throw new Error(`无法读取「${file.name}」：仅支持 JPG、PNG、WebP 静态图片，或文件已损坏。`);}
};

export default function ImageStitch(){
 const job=useJob();
 const outputRef=useRef<HTMLCanvasElement>(null);
 const blobRef=useRef<Blob|null>(null);
 const fileIdRef=useRef(1);
 const [files,setFiles]=useState<StitchFile[]>([]);
 const [scanning,setScanning]=useState(false);
 const [scanError,setScanError]=useState('');
 const [progress,setProgress]=useState('');
 const [notice,setNotice]=useState('');
 const [mode,setMode]=useState<StitchMode>('vertical');
 const [spacing,setSpacing]=useState(0);
 const [background,setBackground]=useState('#FFFFFF');
 const [sizeMode,setSizeMode]=useState<StitchSizeMode>('largest');
 const [customSize,setCustomSize]=useState(1080);
 const [format,setFormat]=useState<StitchFormat>('png');
 const [quality,setQuality]=useState(0.92);
 const [result,setResult]=useState<StitchResult|null>(null);
 const busy=scanning||job.busy;
 const settings:StitchSettings={mode,spacing,background,sizeMode,customSize,format,quality};
 const totalBytes=files.reduce((sum,file)=>sum+file.size,0);

 // 任一输入或参数变化后，旧结果不再可信：丢弃预览与已编码的下载数据。
 useEffect(()=>{
  blobRef.current=null;
  setResult(null);
  setNotice('');
  const canvas=outputRef.current;
  if(canvas){canvas.width=1;canvas.height=1;}
 },[files,mode,spacing,background,sizeMode,customSize,format,quality]);

 useEffect(()=>{if(job.error)setProgress('');},[job.error]);

 let layout:StitchLayout|null=null;
 let layoutError='';
 if(files.length>=2){
  try{
   layout=computeStitchLayout(files.map(file=>({name:file.name,width:file.width,height:file.height,bytes:file.size})),settings);
  }catch(error){layoutError=error instanceof Error?error.message:'当前参数无法拼接。';}
 }
 const unifiedName=mode==='vertical'?'宽度':'高度';

 const addFiles=async(picked:FileList|null)=>{
  if(!picked?.length||busy)return;
  const list=[...picked];
  setScanning(true);setScanError('');setNotice('');
  try{
   // 先按张数和合计大小整体校验，再逐张解码读取尺寸（只读文件头信息会丢失 EXIF 旋转，故用解码结果）。
   validateStitchUpload([...files.map(file=>({size:file.size})),...list.map(file=>({size:file.size}))]);
   const prepared:StitchFile[]=[];
   for(let index=0;index<list.length;index++){
    setProgress(`正在读取第 ${files.length+index+1}/${files.length+list.length} 张图片信息…`);
    const file=list[index];
    const bitmap=await decodeFile(file);
    try{prepared.push({id:fileIdRef.current++,name:file.name,size:file.size,width:bitmap.width,height:bitmap.height,file});}
    finally{bitmap.close();}
   }
   setFiles(old=>[...old,...prepared]);
  }catch(error){
   setScanError(error instanceof Error?error.message:'图片读取失败，请重试。');
  }finally{
   setScanning(false);setProgress('');
  }
 };

 const moveFile=(index:number,delta:number)=>{
  setFiles(old=>{
   const target=index+delta;
   if(target<0||target>=old.length)return old;
   const next=[...old];
   const moved=next[index];
   next[index]=next[target];
   next[target]=moved;
   return next;
  });
 };

 const removeFile=(id:number)=>{setFiles(old=>old.filter(file=>file.id!==id));};

 const clearOutput=()=>{
  blobRef.current=null;
  setResult(null);
  const canvas=outputRef.current;
  if(canvas){canvas.width=1;canvas.height=1;}
 };

 const cancel=()=>{
  // useJob 内部用 generation token：递增后本次异步结果与后续 check 全部作废。
  job.reset();
  setProgress('');
  clearOutput();
  job.setStatus('已取消，本次拼接结果已丢弃。');
 };

 const reset=()=>{
  job.reset();
  setFiles([]);
  setScanError('');
  setProgress('');
  setNotice('');
  clearOutput();
  setMode('vertical');setSpacing(0);setBackground('#FFFFFF');setSizeMode('largest');setCustomSize(1080);setFormat('png');setQuality(0.92);
 };

 const runStitch=()=>{
  void job.run(async check=>{
   validateStitchFiles(files.map(file=>({size:file.size})));
   const currentLayout=computeStitchLayout(files.map(file=>({name:file.name,width:file.width,height:file.height,bytes:file.size})),settings);
   const canvas=outputRef.current;
   if(!canvas)throw new Error('拼接画布未就绪，请刷新页面后重试。');
   canvas.width=currentLayout.width;
   canvas.height=currentLayout.height;
   const context=canvas.getContext('2d');
   if(!context)throw new Error('当前浏览器无法创建拼接画布。');
   context.fillStyle=currentLayout.background;
   context.fillRect(0,0,currentLayout.width,currentLayout.height);
   context.imageSmoothingEnabled=true;
   context.imageSmoothingQuality='high';
   for(let index=0;index<files.length;index++){
    check();
    setProgress(`正在拼接第 ${index+1}/${files.length} 张…`);
    // 让出主线程，避免长图处理时页面完全卡死，同时给取消留出响应窗口。
    await new Promise(resolve=>setTimeout(resolve,0));
    check();
    const file=files[index];
    let bitmap:ImageBitmap;
    try{bitmap=await decodeFile(file.file);}
    catch{throw new Error(`第 ${index+1} 张「${file.name}」解码失败，请移除后重新选择。`);}
    try{
     check();
     const item=currentLayout.items[index];
     context.drawImage(bitmap,item.x,item.y,item.width,item.height);
    }finally{bitmap.close();}
    check();
   }
   setProgress('正在编码输出图片…');
   const mime=stitchMime(currentLayout.format);
   const blob=await new Promise<Blob>((resolve,reject)=>{
    try{
     canvas.toBlob(encoded=>{
      if(!encoded?.size)reject(new Error('生成图片失败：输出尺寸过大或浏览器内存不足，请减少图片或调小统一尺寸。'));
      else resolve(encoded);
     },mime,currentLayout.format==='jpeg'?currentLayout.quality:undefined);
    }catch(error){reject(error instanceof Error?error:new Error('生成图片失败，请重试。'));}
   });
   check();
   return {layout:currentLayout,blob};
  },({layout:doneLayout,blob})=>{
   blobRef.current=blob;
   setResult({
    width:doneLayout.width,
    height:doneLayout.height,
    bytes:blob.size,
    format:doneLayout.format,
    name:`拼接长图-${timestamp()}.${stitchExtension(doneLayout.format)}`,
   });
   setProgress('');setNotice('');
  });
 };

 const download=()=>{
  const blob=blobRef.current;
  if(!blob||!result)return;
  saveLocal(blob,result.name);
  setNotice(`已开始下载「${result.name}」，请核对长图顺序与内容。`);
 };

 return <ToolPage
  id="stitch"
  title="长图拼接"
  description="把 2–10 张图片按顺序纵向或横向拼成一张长图：可设间距、背景色、统一宽度/高度，输出 PNG/JPEG；超过 20000px/边或 8000 万像素会拒绝并提示。文件只在本机处理。"
  job={job}
 >
  <section className="study-card">
   <h2><span className="study-step">1</span>添加图片（2–10 张，合计 ≤40MB）</h2>
   <input
    type="file"
    accept="image/jpeg,image/png,image/webp"
    multiple
    aria-label="添加要拼接的图片"
    disabled={busy}
    onChange={event=>{void addFiles(event.target.files);event.target.value='';}}
   />
   <p className="study-note">支持 JPG / PNG / WebP；当前已选 {files.length} 张，合计 {(totalBytes/MEBIBYTE).toFixed(1)}MB / 40MB。列表顺序就是拼接顺序，可用「上移 / 下移」调整。</p>
   {scanning&&<progress aria-label="正在读取图片信息"/>}
   {scanning&&progress&&<p role="status" className="study-message">{progress}</p>}
   {scanError&&<div role="alert" className="study-error">{scanError}</div>}
   {files.length>0&&<ol className="tool-queue" style={{listStyle:'none',padding:0,margin:'14px 0 0'}}>
    {files.map((file,index)=><li key={file.id} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
     <span style={{flex:'1 1 170px',minWidth:0,overflowWrap:'anywhere'}}>{index+1}. {file.name}<br/><small style={{color:'#71717a'}}>{file.width}×{file.height}px · {(file.size/MEBIBYTE).toFixed(2)}MB</small></span>
     <button type="button" className="study-btn alt" disabled={busy||index===0} onClick={()=>moveFile(index,-1)} aria-label={`上移第 ${index+1} 张图片`}>上移</button>
     <button type="button" className="study-btn alt" disabled={busy||index===files.length-1} onClick={()=>moveFile(index,1)} aria-label={`下移第 ${index+1} 张图片`}>下移</button>
     <button type="button" className="study-btn alt" disabled={busy} onClick={()=>removeFile(file.id)} aria-label={`移除第 ${index+1} 张图片`}>移除</button>
    </li>)}
   </ol>}
  </section>

  <section className="study-card">
   <h2><span className="study-step">2</span>拼接参数</h2>
   <fieldset disabled={busy}>
    <div className="study-fields">
     <label>拼接方向<select value={mode} onChange={event=>setMode(event.target.value as StitchMode)}>
      <option value="vertical">纵向（上下）</option>
      <option value="horizontal">横向（左右）</option>
     </select></label>
     <label>间距（px）<input type="number" min={0} max={STITCH_LIMITS.maxSpacing} step={1} value={spacing} onChange={event=>setSpacing(Number(event.target.value))}/></label>
     <label>背景色<input type="color" value={background} onChange={event=>setBackground(event.target.value)}/></label>
     <label>统一{unifiedName}<select value={sizeMode} onChange={event=>setSizeMode(event.target.value as StitchSizeMode)}>
      <option value="largest">按图片最大{unifiedName}</option>
      <option value="smallest">按图片最小{unifiedName}</option>
      <option value="custom">指定像素</option>
     </select></label>
     {sizeMode==='custom'&&<label>指定{unifiedName}（px）<input type="number" min={1} max={STITCH_LIMITS.maxUnifiedSize} step={1} value={customSize} onChange={event=>setCustomSize(Number(event.target.value))}/></label>}
     <label>输出格式<select value={format} onChange={event=>setFormat(event.target.value as StitchFormat)}>
      <option value="png">PNG</option>
      <option value="jpeg">JPEG</option>
     </select></label>
     {format==='jpeg'&&<label>JPEG 质量（0.1–1）<input type="number" min={0.1} max={1} step={0.01} value={quality} onChange={event=>setQuality(Number(event.target.value)||0.92)}/></label>}
    </div>
    <p className="study-note">纵向拼接统一宽度、横向拼接统一高度，均按比例缩放不拉伸；背景色填满画布与间距。输出上限：单边 ≤20000px、总像素 ≤8000 万。</p>
    {layout
     ?<p className="study-note">预计输出：{layout.width}×{layout.height}px（{(layout.pixels/1_000_000).toFixed(1)} 百万像素，{files.length} 张，{format==='png'?'PNG':'JPEG'}）。</p>
     :layoutError
      ?<div role="status" className="study-warning">{layoutError}</div>
      :<p className="study-note">添加至少 2 张图片后，这里会显示预计输出尺寸与超限提示。</p>}
   </fieldset>
  </section>

  <section className="study-card">
   <h2><span className="study-step">3</span>生成与下载</h2>
   <div className="study-actions">
    <button type="button" className="study-btn" disabled={busy||files.length<2||!!layoutError} onClick={runStitch}>开始拼接</button>
    <button type="button" className="study-btn alt" disabled={!job.busy} onClick={cancel}>取消处理</button>
    <button type="button" className="study-btn alt" disabled={busy} onClick={reset}>重置全部</button>
   </div>
   {progress&&job.busy&&<p role="status" className="study-message">{progress}</p>}
   <canvas
    ref={outputRef}
    role="img"
    aria-label="拼接结果预览"
    style={{display:result?'block':'none',maxWidth:'100%',maxHeight:'70vh',width:'auto',height:'auto',margin:'14px auto',border:'1px solid #e4e4e7',borderRadius:8}}
   />
   {result&&<div style={{marginTop:14}}>
    <p className="study-success">拼接完成：{result.width}×{result.height}px，{result.format==='png'?'PNG':'JPEG'}，{(result.bytes/MEBIBYTE).toFixed(2)}MB。请先核对顺序再下载。</p>
    <div className="study-actions"><button type="button" className="study-btn" onClick={download}>下载 {result.format==='png'?'PNG':'JPG'}</button></div>
   </div>}
   {notice&&<p role="status" className="study-message">{notice}</p>}
   {!result&&!job.busy&&<p className="study-note">处理中可随时「取消处理」，未完成的结果会被丢弃；「重置全部」清空图片与参数。</p>}
  </section>
 </ToolPage>;
}
