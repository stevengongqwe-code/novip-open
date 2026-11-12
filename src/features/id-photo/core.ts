export type Point={x:number;y:number};
export type Crop={sx:number;sy:number;sw:number;sh:number};
export const clamp=(n:number,min:number,max:number)=>Math.min(Math.max(n,min),max);
export const mmToPixels=(mm:number,dpi:number)=>Math.round(mm*dpi/25.4);
export function validateSpec(width:number,height:number,kb:number){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<80||height<80||width>3500||height>3500||width*height>8_000_000)return '宽、高须为80–3500的整数像素，总像素不超过800万。';
 if(!Number.isFinite(kb)||kb<5||kb>10000)return 'KB上限须为5–10000之间的数值。';
 return '';
}
export function getCrop(image:{naturalWidth:number;naturalHeight:number},width:number,height:number,zoom:number,center:Point):Crop{
 const iw=image.naturalWidth,ih=image.naturalHeight;
 if(!iw||!ih||!Number.isFinite(zoom)||zoom<1||!Number.isFinite(center.x)||!Number.isFinite(center.y))throw new Error('照片或裁剪参数无效。');
 const scale=Math.max(width/iw,height/ih)*zoom,sw=Math.min(iw,width/scale),sh=Math.min(ih,height/scale);
 return {sx:clamp(center.x*iw-sw/2,0,iw-sw),sy:clamp(center.y*ih-sh/2,0,ih-sh),sw,sh};
}
export function moveCrop(image:{naturalWidth:number;naturalHeight:number},crop:Crop,dx:number,dy:number,viewWidth:number,viewHeight:number):Point{
 if(viewWidth<=0||viewHeight<=0)return {x:(crop.sx+crop.sw/2)/image.naturalWidth,y:(crop.sy+crop.sh/2)/image.naturalHeight};
 return {x:clamp((crop.sx+crop.sw/2)-dx/viewWidth*crop.sw,crop.sw/2,image.naturalWidth-crop.sw/2)/image.naturalWidth,y:clamp((crop.sy+crop.sh/2)-dy/viewHeight*crop.sh,crop.sh/2,image.naturalHeight-crop.sh/2)/image.naturalHeight};
}
export interface DrawCropOptions {
  bgColor?: string;
  tolerance?: number;
}

export function drawCrop(canvas:HTMLCanvasElement,image:HTMLImageElement,crop:Crop, options?: DrawCropOptions){
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('当前浏览器无法创建图片处理画布。');
 const bgColor = options?.bgColor && options.bgColor !== 'original' ? options.bgColor : null;
 ctx.fillStyle = bgColor || '#fff';
 ctx.fillRect(0,0,canvas.width,canvas.height); // Explicit fill for transparent PNG/WebP -> JPEG.
 ctx.imageSmoothingEnabled=true;
 ctx.imageSmoothingQuality='high';

 ctx.drawImage(image,crop.sx,crop.sy,crop.sw,crop.sh,0,0,canvas.width,canvas.height);
 if (!bgColor) return;

 try {
   const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
   const data = imgData.data;
   const w = canvas.width;
   const h = canvas.height;

   const hex = bgColor.replace('#', '');
   const tr = parseInt(hex.slice(0, 2), 16) || 0;
   const tg = parseInt(hex.slice(2, 4), 16) || 0;
   const tb = parseInt(hex.slice(4, 6), 16) || 0;

   // 1. Transparency check
   let hasAlpha = false;
   for (let i = 3; i < data.length; i += 16) {
     if (data[i] < 240) {
       hasAlpha = true;
       break;
     }
   }

   if (hasAlpha) {
     for (let i = 0; i < data.length; i += 4) {
       const a = data[i + 3] / 255;
       if (a < 1) {
         data[i] = Math.round(data[i] * a + tr * (1 - a));
         data[i + 1] = Math.round(data[i + 1] * a + tg * (1 - a));
         data[i + 2] = Math.round(data[i + 2] * a + tb * (1 - a));
         data[i + 3] = 255;
       }
     }
     ctx.putImageData(imgData, 0, 0);
     return;
   }

   // 2. Uniform edge background replacement: Sample top edge corners
   const corners = [0, Math.max(0, (w - 1) * 4), Math.floor(w / 2) * 4];
   let sr = 0, sg = 0, sb = 0;
   for (const idx of corners) {
     sr += data[idx];
     sg += data[idx + 1];
     sb += data[idx + 2];
   }
   const br = sr / corners.length;
   const bg = sg / corners.length;
   const bb = sb / corners.length;

   const tol = options?.tolerance ?? 38;
   const maxDist = Math.max(15, tol * 2.2);

   for (let i = 0; i < data.length; i += 4) {
     const r = data[i], g = data[i + 1], b = data[i + 2];
     const dist = Math.hypot(r - br, g - bg, b - bb);
     if (dist <= maxDist) {
       const blend = dist < maxDist * 0.7 ? 1 : (maxDist - dist) / (maxDist * 0.3);
       data[i] = Math.round(tr * blend + r * (1 - blend));
       data[i + 1] = Math.round(tg * blend + g * (1 - blend));
       data[i + 2] = Math.round(tb * blend + b * (1 - blend));
     }
   }
   ctx.putImageData(imgData, 0, 0);
 } catch {
   // Fallback to standard draw
 }
}
export function toJpeg(canvas:Pick<HTMLCanvasElement,'toBlob'>,quality:number):Promise<Blob>{
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('图片编码超过15秒，请换较小的源照片或其他浏览器重试。')),15000);
  try{canvas.toBlob(blob=>{clearTimeout(timer);if(blob?.size&&blob.type==='image/jpeg')resolve(blob);else reject(new Error('生成JPG失败，浏览器未返回有效JPEG。'));},'image/jpeg',quality);}catch(e){clearTimeout(timer);reject(e);}
 });
}
// Keep the canvas dimensions fixed. Each returned candidate is measured; no resolution fallback.
export async function compressUnderLimit(canvas:Pick<HTMLCanvasElement,'toBlob'>,limitBytes:number,check:()=>void=()=>{}){
 if(!Number.isSafeInteger(limitBytes)||limitBytes<1)throw new Error('文件大小上限无效。');
 const start=Date.now();
 const encode=async(q:number)=>{check();if(Date.now()-start>45000)throw new Error('压缩超过45秒，已停止；请手动调整参数后重试。');const blob=await toJpeg(canvas,q);check();return blob;};
 const high=await encode(1);if(high.size<=limitBytes)return {blob:high,quality:1};
 let best:Blob|undefined,quality=0,low=0,upper=1;
 const smallest=await encode(0);if(smallest.size<=limitBytes)best=smallest;
 // Probe low-quality plateaus too: encoder size is not guaranteed to be monotonic.
 if(!best){for(const q of [.02,.04,.08,.12]){const b=await encode(q);if(b.size<=limitBytes){best=b;quality=q;low=q;break;}}}
 if(!best)throw new Error('保持当前像素尺寸时，当前浏览器无法压到该KB上限。请手动提高KB上限或修改像素；本次不下载，不自动降低分辨率。');
 for(let i=0;i<10;i++){const mid=(low+upper)/2,b=await encode(mid);if(b.size<=limitBytes){if(mid>quality){best=b;quality=mid;}low=mid;}else upper=mid;}
 if(best.size>limitBytes)throw new Error('文件超过上限，已阻止下载。');return {blob:best,quality};
}
// Inspect magic and dimensions before allocating a decoded image. MIME/extension are not trusted.
export function inspectPhoto(b:Uint8Array):{mime:string;width:number;height:number}{
 if(!b.length)throw new Error('照片为空。');if(b.length>20*1024*1024)throw new Error('源照片请勿超过20MB。');
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),ascii=(at:number,n:number)=>String.fromCharCode(...b.subarray(at,at+n));let mime='',width=0,height=0;
 if(b.length>=24&&b[0]===137&&ascii(1,3)==='PNG'&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10&&ascii(12,4)==='IHDR'){mime='image/png';width=v.getUint32(16);height=v.getUint32(20);}
 else if(b.length>=4&&b[0]===255&&b[1]===216){
  mime='image/jpeg';let p=2;while(p+3<b.length){if(b[p++]!==255)throw new Error('JPEG标记损坏。');while(b[p]===255)p++;const marker=b[p++];if(marker===0xd9||marker===0xda)break;if(marker===1||marker>=0xd0&&marker<=0xd7)continue;if(p+2>b.length)break;const size=v.getUint16(p);if(size<2||p+size>b.length)throw new Error('JPEG数据不完整。');if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&size>=8){height=v.getUint16(p+3);width=v.getUint16(p+5);break;}p+=size;}
 }else if(b.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
  mime='image/webp';let p=12;while(p+8<=b.length){const kind=ascii(p,4),size=v.getUint32(p+4,true),a=p+8;if(a+size>b.length)throw new Error('WebP数据不完整。');if(kind==='ANIM'||kind==='ANMF')throw new Error('暂不支持动态WebP，请选择静态照片。');if(kind==='VP8X'&&size>=10){if(b[a]&2)throw new Error('暂不支持动态WebP，请选择静态照片。');width=1+(b[a+4]|b[a+5]<<8|b[a+6]<<16);height=1+(b[a+7]|b[a+8]<<8|b[a+9]<<16);break;}if(kind==='VP8 '&&size>=10&&b[a+3]===157&&b[a+4]===1&&b[a+5]===42){width=v.getUint16(a+6,true)&0x3fff;height=v.getUint16(a+8,true)&0x3fff;break;}if(kind==='VP8L'&&size>=5&&b[a]===47){const packed=v.getUint32(a+1,true);width=1+(packed&0x3fff);height=1+((packed>>>14)&0x3fff);break;}p=a+size+(size%2);}
 }
 if(!mime||!width||!height)throw new Error('无法识别完整照片。仅支持真实JPG、PNG、静态WebP；HEIC请先转为JPG。');
 if(width>20000||height>20000||width*height>40_000_000)throw new Error('源照片超过4000万像素或单边20000像素，手机可能无法安全处理，请先缩小原图。');
 return {mime,width,height};
}
