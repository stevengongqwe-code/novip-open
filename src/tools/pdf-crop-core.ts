import {PDFDocument} from 'pdf-lib';

// PDF 裁剪核心：毫米->点换算、四边裁剪框计算、边界校验、pdf-lib 写入并复核。
// 语义：裁剪通过同步缩小 MediaBox 与 CropBox 改变“可见区域”，页面内容并没有被删除。
export const PDF_CROP_LIMITS={maxBytes:50*1024*1024,maxPages:500,maxMarginMm:500,sizeTolerance:0.01} as const;
export interface CropMarginsMm{top:number;bottom:number;left:number;right:number}
export interface PageBox{x:number;y:number;width:number;height:number}
export type CropBox=PageBox;
export interface PdfInfo{pageCount:number;sizes:{width:number;height:number}[]}
export const CROP_PRESETS=[{id:'trim10',label:'去掉 10 mm 白边',margins:{top:10,bottom:10,left:10,right:10}},{id:'trim5',label:'去掉 5 mm 白边',margins:{top:5,bottom:5,left:5,right:5}},{id:'custom',label:'自定义四边',margins:null}] as const;
export const CROP_DEFAULTS:CropMarginsMm={top:10,bottom:10,left:10,right:10};
export const MM_TO_PT=72/25.4;
export function mmToPt(mm:number){return Number(mm)*MM_TO_PT;}
export function ptToMm(pt:number){return Number(pt)/MM_TO_PT;}
export function roundMm(value:number){return Math.round(Number(value)*100)/100;}

export function assertPdfBytes(bytes:Uint8Array,maxBytes:number=PDF_CROP_LIMITS.maxBytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<8)throw new Error('文件为空或不是有效PDF。');
 if(bytes.length>maxBytes)throw new Error(`PDF最多${Math.round(maxBytes/1024/1024)}MB，建议先压缩或拆分后再处理。`);
 let header=false;
 for(let i=0;i<Math.min(bytes.length,1024)-4;i++){if(bytes[i]===0x25&&bytes[i+1]===0x50&&bytes[i+2]===0x44&&bytes[i+3]===0x46&&bytes[i+4]===0x2d){header=true;break;}}
 if(!header)throw new Error('这不是PDF文件（缺少PDF文件头），请确认文件未损坏。');
}
function loadError(error:unknown):Error{
 const message=error instanceof Error?error.message:'';
 if(/encrypt/i.test(message))return new Error('PDF已加密，请先在自己的阅读器中解除密码保护再处理。');
 return new Error('PDF读取失败：文件可能损坏或使用了不支持的结构。');
}
export async function inspectPdf(bytes:Uint8Array):Promise<PdfInfo>{
 assertPdfBytes(bytes);
 let doc:PDFDocument;
 try{doc=await PDFDocument.load(bytes,{updateMetadata:false});}catch(error){throw loadError(error);}
 if(doc.isEncrypted)throw new Error('PDF已加密，请先在自己的阅读器中解除密码保护再处理。');
 const pageCount=doc.getPageCount();
 if(pageCount<1)throw new Error('PDF没有可处理的页面。');
 if(pageCount>PDF_CROP_LIMITS.maxPages)throw new Error(`PDF最多${PDF_CROP_LIMITS.maxPages}页，当前${pageCount}页。`);
 return {pageCount,sizes:doc.getPages().map(page=>{const box=page.getCropBox();return{width:box.width,height:box.height};})};
}

// 允许留空表示 0；拒绝负数、非数字和超大值，错误信息带具体边名。
export function parseMarginMm(value:string|number|undefined,label:string):number{
 const text=typeof value==='string'?value.trim():value;
 if(text===''||text===undefined)return 0;
 const number=typeof text==='number'?text:Number(text);
 if(!Number.isFinite(number))throw new Error(`${label}必须是数字（单位毫米）。`);
 if(number<0)throw new Error(`${label}不能是负数。`);
 if(number>PDF_CROP_LIMITS.maxMarginMm)throw new Error(`${label}不能超过${PDF_CROP_LIMITS.maxMarginMm}毫米。`);
 return number;
}
export function normalizeCropMargins(input:{top?:string|number;bottom?:string|number;left?:string|number;right?:string|number}|undefined):CropMarginsMm{
 const raw=input??{};
 const margins={top:parseMarginMm(raw.top,'上边距'),bottom:parseMarginMm(raw.bottom,'下边距'),left:parseMarginMm(raw.left,'左边距'),right:parseMarginMm(raw.right,'右边距')};
 if(!margins.top&&!margins.bottom&&!margins.left&&!margins.right)throw new Error('请至少为一个边设置大于 0 的裁剪量。');
 return margins;
}

// 计算单页裁剪框：以当前可见区域（CropBox）为基准，四边按毫米内缩。
// 要求裁剪后宽高都 >0、均不超过原尺寸，且至少一个方向真的变小。
export function computeCropBox(page:PageBox,margins:CropMarginsMm):CropBox{
 if(!page||![page.x,page.y,page.width,page.height].every(value=>Number.isFinite(value)))throw new Error('页面尺寸无效，无法裁剪。');
 if(!(page.width>0)||!(page.height>0))throw new Error('页面宽高必须大于 0。');
 for(const [key,label]of [['top','上边距'],['bottom','下边距'],['left','左边距'],['right','右边距']] as const){
  const value=margins[key];
  if(!Number.isFinite(value)||value<0)throw new Error(`${label}无效。`);
 }
 const left=mmToPt(margins.left),right=mmToPt(margins.right),top=mmToPt(margins.top),bottom=mmToPt(margins.bottom);
 const width=page.width-left-right,height=page.height-top-bottom;
 if(!(width>1e-6))throw new Error(`左右裁剪量合计 ${roundMm(margins.left+margins.right)} mm，已达到或超过页面宽度 ${roundMm(ptToMm(page.width))} mm，请调小。`);
 if(!(height>1e-6))throw new Error(`上下裁剪量合计 ${roundMm(margins.top+margins.bottom)} mm，已达到或超过页面高度 ${roundMm(ptToMm(page.height))} mm，请调小。`);
 if(width>page.width+1e-6||height>page.height+1e-6)throw new Error('裁剪后尺寸不能大于原页面。');
 if(width>=page.width-1e-9&&height>=page.height-1e-9)throw new Error('裁剪后页面尺寸没有变化，请增大裁剪量。');
 return {x:page.x+left,y:page.y+bottom,width,height};
}
export function croppedPdfName(fileName:string){const base=String(fileName||'document').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]/g,'_').trim()||'document';return `${base}-已裁剪.pdf`;}

export interface CropPdfResult{bytes:Uint8Array;pageCount:number;croppedPages:number;boxes:CropBox[];margins:CropMarginsMm;verified:boolean}
// 逐页同步写入 MediaBox 与 CropBox，保存后重新载入逐页复核尺寸，复核失败不提供结果；支持 yield 宏任务切片避免主线程长时间阻塞。
export async function cropPdf(bytes:Uint8Array,marginsInput:{top?:string|number;bottom?:string|number;left?:string|number;right?:string|number}|undefined,check:()=>void=()=>{},onProgress?:(current:number,total:number)=>void):Promise<CropPdfResult>{
 assertPdfBytes(bytes);
 let doc:PDFDocument;
 try{doc=await PDFDocument.load(bytes,{updateMetadata:false});}catch(error){throw loadError(error);}
 if(doc.isEncrypted)throw new Error('PDF已加密，请先在自己的阅读器中解除密码保护再处理。');
 const pageCount=doc.getPageCount();
 if(pageCount>PDF_CROP_LIMITS.maxPages)throw new Error(`PDF最多${PDF_CROP_LIMITS.maxPages}页，当前${pageCount}页。`);
 const margins=normalizeCropMargins(marginsInput);
 const boxes:CropBox[]=[];
 for(let index=0;index<pageCount;index+=1){
  check();
  if(index%5===0){
   onProgress?.(index,pageCount);
   await new Promise(r=>setTimeout(r,0));
  }
  const page=doc.getPage(index);
  const current=page.getCropBox();
  let box:CropBox;
  try{box=computeCropBox({x:current.x,y:current.y,width:current.width,height:current.height},margins);}
  catch(error){throw new Error(`第 ${index+1} 页：${error instanceof Error?error.message:'裁剪参数无效。'}`);}
  page.setMediaBox(box.x,box.y,box.width,box.height);
  page.setCropBox(box.x,box.y,box.width,box.height);
  boxes.push(box);
 }
 check();
 let output:Uint8Array;
 try{output=await doc.save({useObjectStreams:true});}catch{throw new Error('PDF生成失败：文件结构不受支持，请换一个PDF再试。');}
 if(!output.length)throw new Error('PDF生成失败：输出为空。');
 // 输出页尺寸验证：重新打开，确认页数、MediaBox、CropBox 与预期一致。
 let reopened:PDFDocument;
 try{reopened=await PDFDocument.load(output,{updateMetadata:false});}catch{throw new Error('裁剪结果复核失败：输出文件无法重新打开。');}
 if(reopened.getPageCount()!==pageCount)throw new Error('裁剪结果复核失败：输出页数与原文不一致。');
 for(let index=0;index<pageCount;index+=1){
  check();
  const page=reopened.getPage(index),expected=boxes[index],media=page.getMediaBox(),crop=page.getCropBox();
  const matches=(actual:PageBox)=>Math.abs(actual.x-expected.x)<=PDF_CROP_LIMITS.sizeTolerance&&Math.abs(actual.y-expected.y)<=PDF_CROP_LIMITS.sizeTolerance&&Math.abs(actual.width-expected.width)<=PDF_CROP_LIMITS.sizeTolerance&&Math.abs(actual.height-expected.height)<=PDF_CROP_LIMITS.sizeTolerance;
  if(!matches(media)||!matches(crop))throw new Error(`裁剪结果复核失败：第 ${index+1} 页尺寸与预期不一致，不提供下载。`);
 }
 return {bytes:output,pageCount,croppedPages:pageCount,boxes,margins,verified:true};
}
