import {LIMITS} from './files';
export interface Frame {bytes:Uint8Array;mime:'image/png'|'image/jpeg';width:number;height:number;ptWidth:number;ptHeight:number;}
export const FONT='"Noto Sans SC", Arial, "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
export function createCanvas(width:number,height:number){if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('页面尺寸无效。');const c=document.createElement('canvas');c.width=Math.max(1,Math.round(width));c.height=Math.max(1,Math.round(height));if(c.width*c.height>LIMITS.pixels)throw new Error('页面像素超过手机处理限制，请降低清晰度。');return c;}
export function dataURL(bytes:Uint8Array,mime:string){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return `data:${mime};base64,${btoa(s)}`;}
export async function decodeImage(bytes:Uint8Array,mime:string){const blob=new Blob([bytes.slice().buffer],{type:mime});let im:ImageBitmap;try{im=await createImageBitmap(blob);}catch{throw new Error('PNG/JPG 解码失败，文件可能损坏。');}if(im.width*im.height>40_000_000){im.close();throw new Error('图片超过 4000 万像素，请先缩小。');}return im;}
export async function frameOf(canvas:HTMLCanvasElement,ptWidth:number,ptHeight:number,jpeg=false,quality=.84):Promise<Frame>{const mime=jpeg?'image/jpeg':'image/png',blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片编码失败。')),mime,quality));return {bytes:new Uint8Array(await blob.arrayBuffer()),mime,width:canvas.width,height:canvas.height,ptWidth,ptHeight};}
export function textLines(c:CanvasRenderingContext2D,text:string,width:number){const lines:string[]=[];let line='';for(const char of Array.from(text)){if(char==='\n'){lines.push(line);line='';continue;}if(line&&c.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}if(line||!lines.length)lines.push(line);return lines;}
export function fontStyle(size:number,bold=false,italic=false){return `${italic?'italic ':''}${bold?'bold ':''}${size}px ${FONT}`;}

export async function ensureFonts(text:string){if(typeof document!=='undefined'&&document.fonts){await document.fonts.load('16px "Noto Sans SC"',[...new Set(Array.from(text))].join(''));}}

export function appendFrame(frames:Frame[],frame:Frame){if(frames.reduce((n,f)=>n+f.bytes.length,0)+frame.bytes.length>LIMITS.outputBytes)throw new Error('页面图像超过 100 MB，请降低清晰度或减少页数。');frames.push(frame);}
