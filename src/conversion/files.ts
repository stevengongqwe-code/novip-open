import {unzipSync} from 'fflate';
export type Kind='pdf'|'docx'|'pptx'|'png'|'jpg';
export const LIMITS={fileBytes:50*1024*1024,totalBytes:150*1024*1024,files:50,pages:200,pixels:8_000_000,zipInflated:80*1024*1024,outputBytes:150*1024*1024,timeoutMs:120000};
export interface Input {name:string;bytes:Uint8Array;kind:Kind;}
// Validate the central/local directories before inflating any untrusted Office input.
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes:Uint8Array){let c=0xffffffff;for(const n of bytes)c=crcTable[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function zipEntries(bytes:Uint8Array):Record<string,Uint8Array>{
 if(bytes.length<22||bytes.length>LIMITS.fileBytes)throw new Error('Office ZIP压缩包为空、损坏或超过20MB。');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0)throw new Error('Office文件不是有效ZIP包，文件可能损坏。');
 const count=v.getUint16(end+10,true),offset=v.getUint32(end+16,true),size=v.getUint32(end+12,true);
 if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||v.getUint16(end+8,true)!==count)throw new Error('暂不支持多卷压缩包。');
 if(!count||count>2000||count===65535||offset===0xffffffff||offset+size!==end)throw new Error('压缩包目录损坏、内容过多或使用不支持的ZIP64格式。');
 const records=new Map<string,{size:number;crc:number}>(),ranges:[number,number][]=[];let p=offset,total=0;
 const nameAt=(at:number,length:number)=>{try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at,at+length));}catch{throw new Error('压缩包文件名称不是有效UTF-8。');}};
 for(let i=0;i<count;i++){
  if(p+46>end||v.getUint32(p,true)!==0x02014b50)throw new Error('压缩包目录损坏。');
  const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),crc=v.getUint32(p+16,true),compressed=v.getUint32(p+20,true),inflated=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),local=v.getUint32(p+42,true),next=p+46+nl+extra+comment;
  if(flags&1)throw new Error('暂不支持加密Office文件。');
  if(![0,8].includes(method)||v.getUint16(p+34,true))throw new Error('不支持此压缩方式或多卷目录。');
  if(!nl||next>end)throw new Error('压缩包文件名称或目录损坏。');
  const name=nameAt(p+46,nl);
  if(name.startsWith('/')||name.includes('\\')||name.includes(':')||/[\x00-\x1f]/.test(name)||name.split('/').some(s=>s==='..'||s==='.'))throw new Error('压缩包路径不安全。');
  if(records.has(name))throw new Error('压缩包含重复文件名称。');
  total+=inflated;if(inflated>LIMITS.fileBytes*2||total>LIMITS.zipInflated)throw new Error('解压后的文档过大，请拆分文件。');
  if(local+30>offset||v.getUint32(local,true)!==0x04034b50)throw new Error('压缩包本地目录损坏。');
  const localNl=v.getUint16(local+26,true),localExtra=v.getUint16(local+28,true),data=local+30+localNl+localExtra;
  if(data+compressed>offset||nameAt(local+30,localNl)!==name||v.getUint16(local+6,true)!==flags||v.getUint16(local+8,true)!==method)throw new Error('压缩包目录与文件名称不一致。');
  if(!(flags&8)&&(v.getUint32(local+18,true)!==compressed||v.getUint32(local+22,true)!==inflated||v.getUint32(local+14,true)!==crc))throw new Error('压缩包目录与文件大小/校验不一致。');
  records.set(name,{size:inflated,crc});ranges.push([local,data+compressed]);p=next;
 }
 if(p!==end)throw new Error('压缩包目录长度不一致。');ranges.sort((a,b)=>a[0]-b[0]);if(ranges.some((r,i)=>i>0&&r[0]<ranges[i-1][1]))throw new Error('压缩包文件区域重叠。');
 let entries:Record<string,Uint8Array>;try{entries=unzipSync(bytes);}catch{throw new Error('文件解压失败，请重新保存文档。');}
 if(Object.keys(entries).length!==records.size)throw new Error('压缩包目录与解压文件数量不一致。');
 for(const [name,record]of records){const b=Object.prototype.hasOwnProperty.call(entries,name)?entries[name]:undefined;if(!b||b.length!==record.size||crc32(b)!==record.crc)throw new Error('压缩包文件校验失败，文件可能损坏。');}
 return entries;
}
export function identify(bytes:Uint8Array):Kind {
 if(bytes.length<8)throw new Error('文件为空或已损坏。');
 if(bytes[0]===0x89&&new TextDecoder().decode(bytes.slice(1,4))==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
 if(new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))return 'pdf';
 if(bytes[0]===80&&bytes[1]===75){const entries=zipEntries(bytes),names=Object.keys(entries);if(names.some(n=>!n.endsWith('/')&&/vbaProject|activeX|embeddings\//i.test(n)))throw new Error('不接受含宏、ActiveX 或嵌入程序的文档。');if(!entries['[Content_Types].xml'])throw new Error('不是有效的 Office 文档。');const types=new TextDecoder().decode(entries['[Content_Types].xml']);if(/macroEnabled/i.test(types))throw new Error('暂不接受含宏的 Office 文档。');if(entries['word/document.xml'])return 'docx';if(entries['ppt/presentation.xml'])return 'pptx';}
 throw new Error('不支持此文件的真实格式。支持 PDF、DOCX、PPTX、PNG、JPG，不支持旧版 DOC / PPT。');
}
export async function readInput(file:File):Promise<Input>{if(file.size>LIMITS.fileBytes)throw new Error(`${file.name} 超过 50 MB。建议先压缩后再处理。`);const bytes=new Uint8Array(await file.arrayBuffer());return {name:file.name,bytes,kind:identify(bytes)};}
export function checkInputs(inputs:Input[]){if(!inputs.length)throw new Error('请先选择文件。');if(inputs.length>LIMITS.files||inputs.reduce((n,f)=>n+f.bytes.length,0)>LIMITS.totalBytes)throw new Error('最多 50 个文件，总大小不超过 80 MB。');}
export function rangePages(value:string,count:number):number[]{if(!value.trim())return Array.from({length:count},(_,i)=>i);const result:number[]=[];for(const token of value.split(',')){const m=token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw new Error('页码格式示例：1-3,5。');const a=+m[1],b=+(m[2]??m[1]);if(a<1||b<a||b>count)throw new Error(`页码应在 1–${count} 之间，范围不能倒序。`);for(let n=a;n<=b;n++)if(!result.includes(n-1))result.push(n-1);}return result;}
export function baseName(name:string){return name.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)||'转换结果';}
