import {PDFDocument,StandardFonts,degrees,rgb,type PDFFont,type PDFPage} from 'pdf-lib';

// PDF 加页码核心：单位换算、页码范围解析、编号计划、九宫格定位、pdf-lib 落盘。
// 纯函数与浏览器无关，可在 node --test 中直接验证；输出为副本，不修改输入字节。
export const PDF_PAGE_NUMBER_LIMITS={maxBytes:50*1024*1024,maxPages:500,minFontSize:6,maxFontSize:36,maxMarginMm:50,maxStart:99999} as const;
export type PageNumberPosition='top-left'|'top-center'|'top-right'|'middle-left'|'middle-center'|'middle-right'|'bottom-left'|'bottom-center'|'bottom-right';
export type PageNumberFormat='plain'|'slash'|'page-of';
export interface PageNumberOptions{position:PageNumberPosition;format:PageNumberFormat;start:number;range:string;skipCount:number;fontSize:number;marginMm:number}
export interface PageSize{width:number;height:number}
export interface PdfInfo{pageCount:number;sizes:PageSize[]}

export const PAGE_NUMBER_POSITIONS=[{id:'top-left',label:'左上'},{id:'top-center',label:'上中'},{id:'top-right',label:'右上'},{id:'middle-left',label:'左中'},{id:'middle-center',label:'居中'},{id:'middle-right',label:'右中'},{id:'bottom-left',label:'左下'},{id:'bottom-center',label:'下中'},{id:'bottom-right',label:'右下'}] as const;
export const PAGE_NUMBER_FORMATS=[{id:'plain',label:'1（仅数字）'},{id:'slash',label:'1 / N'},{id:'page-of',label:'Page 1 of N'}] as const;
export const PAGE_NUMBER_DEFAULTS:PageNumberOptions={position:'bottom-center',format:'plain',start:1,range:'',skipCount:0,fontSize:11,marginMm:10};
export const MM_TO_PT=72/25.4;
export function mmToPt(mm:number){return Number(mm)*MM_TO_PT;}
export function ptToMm(pt:number){return Number(pt)/MM_TO_PT;}
export function normalizeRotation(angle:number){const value=Number(angle);if(!Number.isFinite(value))return 0;const snapped=Math.round(value/90)*90;return ((snapped%360)+360)%360;}

export function assertPdfBytes(bytes:Uint8Array,maxBytes:number=PDF_PAGE_NUMBER_LIMITS.maxBytes){
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
 if(pageCount>PDF_PAGE_NUMBER_LIMITS.maxPages)throw new Error(`PDF最多${PDF_PAGE_NUMBER_LIMITS.maxPages}页，当前${pageCount}页。`);
 return {pageCount,sizes:doc.getPages().map(page=>{const box=page.getCropBox();return{width:box.width,height:box.height};})};
}

// 解析 1-3,5 形式的页码范围，返回 0 起始的升序页索引；空字符串表示全部页面。
export function parsePageRange(input:string,totalPages:number):number[]{
 if(!Number.isInteger(totalPages)||totalPages<1)throw new Error('PDF页数无效，无法解析页码范围。');
 const text=String(input??'').replace(/[，、;；]/g,',').replace(/[–—－~～]/g,'-').trim();
 if(!text)return Array.from({length:totalPages},(_,i)=>i);
 const pages=new Set<number>();
 for(const raw of text.split(',')){
  const part=raw.trim();
  if(!part)continue;
  const single=/^(\d+)$/.exec(part),range=/^(\d+)\s*-\s*(\d+)$/.exec(part);
  if(single){
   const page=Number(single[1]);
   if(page<1||page>totalPages)throw new Error(`页码超出范围：${part}（共${totalPages}页）。`);
   pages.add(page-1);
  }else if(range){
   const from=Number(range[1]),to=Number(range[2]);
   if(from<1||to>totalPages)throw new Error(`页码范围超出范围：${part}（共${totalPages}页）。`);
   if(from>to)throw new Error(`页码范围起点大于终点：${part}。`);
   for(let page=from;page<=to;page+=1)pages.add(page-1);
  }else throw new Error(`页码格式不正确：${part}。请使用如 1-3,5 的格式。`);
 }
 if(!pages.size)throw new Error('没有解析出有效页码，请检查页码范围。');
 return [...pages].sort((a,b)=>a-b);
}

// 仅输出 ASCII，避免引入中文页码所需的字体嵌入问题。
export function formatPageNumber(value:number,total:number,format:PageNumberFormat):string{
 const number=Math.trunc(Number(value)),totalValue=Math.trunc(Number(total));
 if(!Number.isFinite(number)||!Number.isFinite(totalValue))throw new Error('页码数值无效。');
 if(format==='slash')return `${number} / ${totalValue}`;
 if(format==='page-of')return `Page ${number} of ${totalValue}`;
 return String(number);
}

function numberInRange(value:unknown,label:string,min:number,max:number,integer:boolean):number{
 const text=typeof value==='string'?value.trim():value;
 const number=typeof text==='number'?text:Number(text??'');
 if(!Number.isFinite(number))throw new Error(`${label}必须是数字。`);
 if(integer&&!Number.isInteger(number))throw new Error(`${label}必须是整数。`);
 if(number<min||number>max)throw new Error(`${label}需在${min}到${max}之间。`);
 return number;
}
export interface NormalizedPageNumberOptions extends PageNumberOptions{pageCount:number;rangePages:number[];totalValue:number}
export function normalizePageNumberOptions(input:Partial<PageNumberOptions>|undefined,totalPages:number):NormalizedPageNumberOptions{
 if(!Number.isInteger(totalPages)||totalPages<1||totalPages>PDF_PAGE_NUMBER_LIMITS.maxPages)throw new Error(`PDF页数需在1到${PDF_PAGE_NUMBER_LIMITS.maxPages}之间。`);
 const raw=input??{};
 const positionId=String(raw.position??''),formatId=String(raw.format??'');
 const position=(PAGE_NUMBER_POSITIONS as readonly {id:string}[]).some(item=>item.id===positionId)?positionId as PageNumberPosition:PAGE_NUMBER_DEFAULTS.position;
 const format=(PAGE_NUMBER_FORMATS as readonly {id:string}[]).some(item=>item.id===formatId)?formatId as PageNumberFormat:PAGE_NUMBER_DEFAULTS.format;
 const start=numberInRange(raw.start??PAGE_NUMBER_DEFAULTS.start,'起始编号',0,PDF_PAGE_NUMBER_LIMITS.maxStart,true);
 const skipCount=numberInRange(raw.skipCount??PAGE_NUMBER_DEFAULTS.skipCount,'跳过页数',0,totalPages,true);
 const fontSize=numberInRange(raw.fontSize??PAGE_NUMBER_DEFAULTS.fontSize,`字号`,PDF_PAGE_NUMBER_LIMITS.minFontSize,PDF_PAGE_NUMBER_LIMITS.maxFontSize,false);
 const marginMm=numberInRange(raw.marginMm??PAGE_NUMBER_DEFAULTS.marginMm,'页边距',0,PDF_PAGE_NUMBER_LIMITS.maxMarginMm,false);
 const range=String(raw.range??'').trim();
 const rangePages=parsePageRange(range,totalPages).filter(index=>index>=skipCount);
 if(skipCount>=totalPages)throw new Error('跳过页数不能覆盖全部页面。');
 if(!rangePages.length)throw new Error('所选页码范围与跳过页数组合后没有可编号的页面。');
 return {position,format,start,range,skipCount,fontSize,marginMm,pageCount:totalPages,rangePages,totalValue:totalPages-skipCount};
}

export interface PageNumberPlanEntry{pageIndex:number;pageNumber:number;total:number;text:string}
// 编号跟随实际页位：第 i 页（0始）显示 start + (i - skipCount)；
// 范围只决定哪些页打印页码，不会让后面的页码重新连续。N = 总页数 - 跳过页数。
export function planPageNumbers(options:NormalizedPageNumberOptions):PageNumberPlanEntry[]{
 return options.rangePages.filter(pageIndex=>pageIndex>=options.skipCount).map(pageIndex=>{
  const pageNumber=options.start+(pageIndex-options.skipCount);
  return {pageIndex,pageNumber,total:options.totalValue,text:formatPageNumber(pageNumber,options.totalValue,options.format)};
 });
}

export interface VisualPlacement{u:number;v:number;rotation:number}
export interface PlacementInput{pageWidth:number;pageHeight:number;textWidth:number;textHeight:number;ascentHeight:number;position:PageNumberPosition;marginPt:number;rotation:number}
// 在“显示方向”的页面坐标（左下为原点）中计算文本基线左端位置。
export function pageNumberPlacement(input:PlacementInput):VisualPlacement{
 const {pageWidth,pageHeight,textWidth,textHeight,ascentHeight,position,marginPt}=input;
 if(![pageWidth,pageHeight].every(value=>Number.isFinite(value)&&value>0))throw new Error('页面尺寸无效，无法放置页码。');
 if(!Number.isFinite(textWidth)||textWidth<0||!Number.isFinite(textHeight)||textHeight<0)throw new Error('页码文本尺寸无效。');
 if(!Number.isFinite(ascentHeight)||ascentHeight<0||ascentHeight>textHeight+0.001)throw new Error('字体高度信息无效。');
 if(!Number.isFinite(marginPt)||marginPt<0)throw new Error('页边距无效。');
 const valid=(PAGE_NUMBER_POSITIONS as readonly {id:string}[]).some(item=>item.id===position);
 if(!valid)throw new Error('页码位置无效。');
 const [vertical,horizontal]=position.split('-');
 const descent=Math.max(0,textHeight-ascentHeight);
 const u=horizontal==='left'?marginPt:horizontal==='right'?pageWidth-marginPt-textWidth:(pageWidth-textWidth)/2;
 const v=vertical==='bottom'?marginPt+descent:vertical==='top'?pageHeight-marginPt-ascentHeight:(pageHeight-textHeight)/2+descent;
 if(u<0||v<0||u+textWidth>pageWidth+1e-6||v+ascentHeight>pageHeight+1e-6)throw new Error('字号、页边距或页面尺寸组合导致页码超出页面范围，请调小字号或边距。');
 return {u,v,rotation:normalizeRotation(input.rotation)};
}
// /Rotate 90 表示展示时顺时针旋转：显示坐标 -> 原始内容坐标需要反向换算。
export function visualPointToPagePoint(box:{x:number;y:number;width:number;height:number},rotation:number,u:number,v:number){
 const angle=normalizeRotation(rotation);
 if(angle===90)return {x:box.x+box.width-v,y:box.y+u};
 if(angle===180)return {x:box.x+box.width-u,y:box.y+box.height-v};
 if(angle===270)return {x:box.x+v,y:box.y+box.height-u};
 return {x:box.x+u,y:box.y+v};
}
export function orderedPdfName(fileName:string){const base=String(fileName||'document').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]/g,'_').trim()||'document';return `${base}-已加页码.pdf`;}

export interface AddPageNumbersResult{bytes:Uint8Array;pageCount:number;numberedCount:number;settings:NormalizedPageNumberOptions;entries:PageNumberPlanEntry[]}
// 用 pdf-lib 写入页码并保留原页面尺寸；每个页面循环内调用 check() 以支持取消，并定期 yield 避免主线程卡顿。
export async function addPageNumbers(bytes:Uint8Array,options:Partial<PageNumberOptions>|undefined,check:()=>void=()=>{},onProgress?:(current:number,total:number)=>void):Promise<AddPageNumbersResult>{
 assertPdfBytes(bytes);
 let doc:PDFDocument;
 try{doc=await PDFDocument.load(bytes,{updateMetadata:false});}catch(error){throw loadError(error);}
 if(doc.isEncrypted)throw new Error('PDF已加密，请先在自己的阅读器中解除密码保护再处理。');
 const pageCount=doc.getPageCount();
 if(pageCount>PDF_PAGE_NUMBER_LIMITS.maxPages)throw new Error(`PDF最多${PDF_PAGE_NUMBER_LIMITS.maxPages}页，当前${pageCount}页。`);
 const settings=normalizePageNumberOptions(options,pageCount);
 const plan=planPageNumbers(settings);
 check();
 let font:PDFFont;
 try{font=await doc.embedFont(StandardFonts.Helvetica);}catch{throw new Error('页码字体加载失败，请重试。');}
 const marginPt=mmToPt(settings.marginMm),size=settings.fontSize;
 for(let index=0;index<plan.length;index++){
  check();
  if(index%5===0){
   onProgress?.(index,plan.length);
   await new Promise(r=>setTimeout(r,0));
  }
  const entry=plan[index];
  const page:PDFPage=doc.getPage(entry.pageIndex);
  const rotation=normalizeRotation(page.getRotation().angle);
  const box=page.getCropBox();
  const visualWidth=rotation%180===0?box.width:box.height;
  const visualHeight=rotation%180===0?box.height:box.width;
  const textWidth=font.widthOfTextAtSize(entry.text,size);
  const textHeight=font.heightAtSize(size);
  const ascentHeight=font.heightAtSize(size,{descender:false});
  const placement=pageNumberPlacement({pageWidth:visualWidth,pageHeight:visualHeight,textWidth,textHeight,ascentHeight,position:settings.position,marginPt,rotation});
  const point=visualPointToPagePoint(box,rotation,placement.u,placement.v);
  page.drawText(entry.text,{x:point.x,y:point.y,size,font,color:rgb(0,0,0),rotate:degrees(rotation)});
 }
 check();
 onProgress?.(plan.length,plan.length);
 await new Promise(r=>setTimeout(r,0));
 let output:Uint8Array;
 try{output=await doc.save({useObjectStreams:true});}catch{throw new Error('PDF生成失败：文件结构不受支持，请换一个PDF再试。');}
 if(!output.length)throw new Error('PDF生成失败：输出为空。');
 return {bytes:output,pageCount,numberedCount:plan.length,settings,entries:plan};
}
