import {drawPage,dimensions,type Page,type Settings} from './engine';
const pause=()=>new Promise<void>(r=>setTimeout(r,0));
export function download(blob:Blob,name:string) {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);if(typeof window!=='undefined'&&typeof window.dispatchEvent==='function'){window.dispatchEvent(new CustomEvent('novip:download',{detail:{name,type:blob.type||'',size:blob.size||0}}));}}
function rawBlob(canvas:HTMLCanvasElement) {return new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片生成失败，请降低清晰度后重试。')),'image/png'));}
export function pngWithDpi(bytes:Uint8Array,dpi:number):Uint8Array {
  const chunk=new Uint8Array(21),v=new DataView(chunk.buffer);v.setUint32(0,9);chunk.set([112,72,89,115],4);v.setUint32(8,Math.round(dpi/.0254));v.setUint32(12,Math.round(dpi/.0254));chunk[16]=1;
  let crc=0xffffffff;for(const n of chunk.slice(4,17)){crc^=n;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}v.setUint32(17,(crc^0xffffffff)>>>0);
  const parts:Uint8Array[]=[bytes.slice(0,8)];let inserted=false;
  for(let offset=8;offset<bytes.length;){const len=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0),end=offset+12+len,type=String.fromCharCode(...bytes.slice(offset+4,offset+8));if(type!=='pHYs')parts.push(bytes.slice(offset,end));if(type==='IHDR'&&!inserted){parts.push(chunk);inserted=true;}offset=end;}
  const output=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){output.set(p,o);o+=p.length;}return output;
}
async function blobOf(canvas:HTMLCanvasElement,dpi:number) {const bytes=pngWithDpi(new Uint8Array(await (await rawBlob(canvas)).arrayBuffer()),dpi);return new Blob([bytes.buffer as ArrayBuffer],{type:'image/png'});}
export async function exportPages(kind:'png'|'pdf',pages:Page[],s:Settings,dpi:number,fontFor:(c:string,index?:number)=>string,progress:(n:number)=>void) {
  const scale=dpi/96,canvas=document.createElement('canvas');
  if(kind==='pdf'){const {jsPDF}=await import('jspdf'),{mmW,mmH}=dimensions(s),orientation=s.landscape?'landscape':'portrait';const pdf=new jsPDF({unit:'mm',format:[mmW,mmH],orientation,compress:true});
    for(let i=0;i<pages.length;i++){drawPage(canvas,pages[i],s,scale,fontFor);if(i)pdf.addPage([mmW,mmH],orientation);pdf.addImage(canvas.toDataURL('image/jpeg',.97),'JPEG',0,0,mmW,mmH,undefined,'FAST');progress(i+1);await pause();}
    download(pdf.output('blob'),'NOVIP-手写文稿.pdf');
  }else if(pages.length===1){drawPage(canvas,pages[0],s,scale,fontFor);download(await blobOf(canvas,dpi),'NOVIP-手写文稿.png');progress(1);}
  else {const {zipSync}=await import('fflate');const files:Record<string,Uint8Array>={};
    for(let i=0;i<pages.length;i++){drawPage(canvas,pages[i],s,scale,fontFor);files[`page-${String(i+1).padStart(3,'0')}.png`]=new Uint8Array(await (await blobOf(canvas,dpi)).arrayBuffer());progress(i+1);await pause();}
    const bytes=zipSync(files,{level:0});download(new Blob([bytes.slice().buffer as ArrayBuffer],{type:'application/zip'}),'NOVIP-多页PNG.zip');
  }
  canvas.width=canvas.height=1;
}
