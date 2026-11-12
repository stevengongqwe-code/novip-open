// 图片取色 / 颜色转换的纯函数层：不依赖 DOM，便于 node:test 直接覆盖。
// 颜色转换、量化色板、指针坐标映射、预览尺寸计算全部集中在这里。

export interface RGB {r:number;g:number;b:number}
export interface HSL {h:number;s:number;l:number}
export interface ColorValue {hex:string;rgb:RGB;hsl:HSL}
export interface PaletteColor {hex:string;rgb:RGB;count:number;ratio:number}
export type ColorInputMode='hex'|'rgb'|'hsl';
export interface PointerRect {left:number;top:number;width:number;height:number}
export interface PixelPoint {x:number;y:number}
export interface PaletteOptions {maxColors?:number;maxSamples?:number;bucketBits?:number;alphaThreshold?:number}

const HEX_PATTERN=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_WRAPPER=/^rgb\((.*)\)$/i;
const HSL_WRAPPER=/^hsl\((.*)\)$/i;
const RGB_CHANNEL=/^\d{1,3}$/;
const HSL_NUMBER=/^-?\d+(?:\.\d+)?%?$/;

/** 统一成大写 #RRGGBB；非法输入抛中文错误。 */
export function normalizeHex(input:string):string{
 const text=typeof input==='string'?input.trim():'';
 const match=HEX_PATTERN.exec(text);
 if(!match)throw new Error('请输入 3 位或 6 位十六进制颜色，如 #1A2B3C。');
 let digits=match[1];
 if(digits.length===3)digits=digits.split('').map(char=>char+char).join('');
 return `#${digits.toUpperCase()}`;
}

export function hexToRgb(input:string):RGB{
 const hex=normalizeHex(input);
 return {r:Number.parseInt(hex.slice(1,3),16),g:Number.parseInt(hex.slice(3,5),16),b:Number.parseInt(hex.slice(5,7),16)};
}

export function rgbToHex(rgb:RGB):string{
 const {r,g,b}=checkedRgb(rgb);
 return `#${[r,g,b].map(value=>value.toString(16).padStart(2,'0')).join('').toUpperCase()}`;
}

export function rgbToHsl(rgb:RGB):HSL{
 const {r,g,b}=checkedRgb(rgb);
 const red=r/255,green=g/255,blue=b/255;
 const max=Math.max(red,green,blue),min=Math.min(red,green,blue);
 const lightness=(max+min)/2;
 if(max===min)return {h:0,s:0,l:lightness*100};
 const delta=max-min;
 const saturation=lightness>0.5?delta/(2-max-min):delta/(max+min);
 let hue:number;
 if(max===red)hue=(green-blue)/delta+(green<blue?6:0);
 else if(max===green)hue=(blue-red)/delta+2;
 else hue=(red-green)/delta+4;
 return {h:hue*60,s:saturation*100,l:lightness*100};
}

export function hslToRgb(hsl:HSL):RGB{
 const {h,s,l}=checkedHsl(hsl);
 const saturation=s/100,lightness=l/100;
 const chroma=(1-Math.abs(2*lightness-1))*saturation;
 const sector=h/60;
 const second=chroma*(1-Math.abs((sector%2)-1));
 const match=lightness-chroma/2;
 let red=0,green=0,blue=0;
 if(sector<1){red=chroma;green=second;}
 else if(sector<2){red=second;green=chroma;}
 else if(sector<3){green=chroma;blue=second;}
 else if(sector<4){green=second;blue=chroma;}
 else if(sector<5){red=second;blue=chroma;}
 else{red=chroma;blue=second;}
 return {
  r:Math.min(255,Math.max(0,Math.round((red+match)*255))),
  g:Math.min(255,Math.max(0,Math.round((green+match)*255))),
  b:Math.min(255,Math.max(0,Math.round((blue+match)*255))),
 };
}

export function formatRgb(rgb:RGB):string{
 const {r,g,b}=checkedRgb(rgb);
 return `rgb(${r}, ${g}, ${b})`;
}

/** 显示用 HSL：色相取整到 0–359，饱和度/亮度取整百分数。 */
export function formatHsl(hsl:HSL):string{
 const {h,s,l}=checkedHsl(hsl);
 return `hsl(${Math.round(h)%360}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

export function colorValueFromRgb(rgb:RGB):ColorValue{
 const safe=checkedRgb(rgb);
 return {hex:rgbToHex(safe),rgb:safe,hsl:rgbToHsl(safe)};
}

export function colorValueFromHex(input:string):ColorValue{return colorValueFromRgb(hexToRgb(input));}

export function colorValueFromHsl(hsl:HSL):ColorValue{return colorValueFromRgb(hslToRgb(hsl));}

/** 手动转换入口：按输入形态解析并返回三种表示；非法输入抛中文错误。 */
export function parseColorValue(mode:ColorInputMode,input:string):ColorValue{
 if(mode==='hex')return colorValueFromHex(input);
 if(mode==='rgb')return colorValueFromRgb(parseRgbText(input));
 if(mode==='hsl')return colorValueFromHsl(parseHslText(input));
 throw new Error('颜色输入格式无效，请选择 HEX、RGB 或 HSL。');
}

function parseRgbText(input:string):RGB{
 const text=typeof input==='string'?input.trim():'';
 if(!text)throw new Error('请输入 RGB 颜色，如 255, 0, 0。');
 const wrapper=RGB_WRAPPER.exec(text);
 const body=wrapper?wrapper[1]:text;
 const parts=body.split(/[\s,/]+/).filter(part=>part.length>0);
 if(parts.length!==3)throw new Error('RGB 请输入三个 0–255 的整数，如 255, 0, 0。');
 const values=parts.map(part=>{
  if(!RGB_CHANNEL.test(part))throw new Error('RGB 只接受 0–255 的整数，如 255, 0, 0。');
  const value=Number(part);
  if(value>255)throw new Error('RGB 每个通道须在 0–255 之间。');
  return value;
 });
 return {r:values[0],g:values[1],b:values[2]};
}

function parseHslText(input:string):HSL{
 const text=typeof input==='string'?input.trim():'';
 if(!text)throw new Error('请输入 HSL 颜色，如 210, 50%, 40%。');
 const wrapper=HSL_WRAPPER.exec(text);
 const body=wrapper?wrapper[1]:text;
 const parts=body.split(/[\s,/]+/).filter(part=>part.length>0);
 if(parts.length!==3||parts.some(part=>!HSL_NUMBER.test(part)))throw new Error('HSL 请输入色相 0–360、饱和度/亮度 0–100%，如 210, 50%, 40%。');
 const hue=Number(parts[0].replace('%',''));
 const saturation=Number(parts[1].replace('%',''));
 const lightness=Number(parts[2].replace('%',''));
 if(!Number.isFinite(hue)||hue<0||hue>360)throw new Error('HSL 色相须在 0–360 之间。');
 if(!Number.isFinite(saturation)||saturation<0||saturation>100)throw new Error('HSL 饱和度须在 0–100% 之间。');
 if(!Number.isFinite(lightness)||lightness<0||lightness>100)throw new Error('HSL 亮度须在 0–100% 之间。');
 return {h:hue,s:saturation,l:lightness};
}

function checkedRgb(rgb:RGB):RGB{
 for(const key of ['r','g','b'] as const){
  const value=rgb[key];
  if(!Number.isFinite(value)||value<0||value>255)throw new Error('RGB 值须为 0–255 的数值。');
 }
 return {r:Math.round(rgb.r),g:Math.round(rgb.g),b:Math.round(rgb.b)};
}

function checkedHsl(hsl:HSL):HSL{
 if(!Number.isFinite(hsl.h)||hsl.h<0||hsl.h>360)throw new Error('HSL 值须为色相 0–360、饱和度与亮度 0–100。');
 if(!Number.isFinite(hsl.s)||hsl.s<0||hsl.s>100)throw new Error('HSL 值须为色相 0–360、饱和度与亮度 0–100。');
 if(!Number.isFinite(hsl.l)||hsl.l<0||hsl.l>100)throw new Error('HSL 值须为色相 0–360、饱和度与亮度 0–100。');
 return hsl;
}

/**
 * 降采样直方图量化：按 bucketBits 把通道压到较少档位累计，返回占比最高的颜色。
 * 大图先由调用方等比缩小画布，这里再按 maxSamples 等步长抽样，避免逐像素遍历整张原图。
 * 透明度低于 alphaThreshold 的像素不参与统计（透明 PNG 不留黑色底色占比）。
 */
export function extractPalette(rgba:ArrayLike<number>,options:PaletteOptions={}):PaletteColor[]{
 const maxColors=options.maxColors??8;
 const maxSamples=options.maxSamples??400_000;
 const bucketBits=options.bucketBits??4;
 const alphaThreshold=options.alphaThreshold??128;
 if(!Number.isInteger(maxColors)||maxColors<1||maxColors>64)throw new Error('主色数量须为 1–64 的整数。');
 if(!Number.isInteger(maxSamples)||maxSamples<1)throw new Error('主色采样数量无效。');
 if(!Number.isInteger(bucketBits)||bucketBits<1||bucketBits>8)throw new Error('主色量化档位须为 1–8 位。');
 if(!Number.isFinite(alphaThreshold)||alphaThreshold<0||alphaThreshold>255)throw new Error('透明度阈值无效。');
 if(!rgba||rgba.length<4)return [];
 const totalPixels=Math.floor(rgba.length/4);
 const stride=Math.max(1,Math.ceil(totalPixels/maxSamples));
 const shift=8-bucketBits;
 const buckets=new Map<number,{count:number;red:number;green:number;blue:number}>();
 let samples=0;
 for(let pixel=0;pixel<totalPixels;pixel+=stride){
  const offset=pixel*4;
  if(rgba[offset+3]<alphaThreshold)continue;
  const red=Math.min(255,Math.max(0,Math.round(rgba[offset])));
  const green=Math.min(255,Math.max(0,Math.round(rgba[offset+1])));
  const blue=Math.min(255,Math.max(0,Math.round(rgba[offset+2])));
  const key=((red>>shift)<<(2*bucketBits))|((green>>shift)<<bucketBits)|(blue>>shift);
  const bucket=buckets.get(key);
  if(bucket){bucket.count++;bucket.red+=red;bucket.green+=green;bucket.blue+=blue;}
  else buckets.set(key,{count:1,red,green,blue});
  samples++;
 }
 if(!samples)return [];
 const list:[number,{count:number;red:number;green:number;blue:number}][]=[];
 for(const entry of buckets.entries())list.push(entry);
 list.sort((first,second)=>second[1].count-first[1].count||first[0]-second[0]);
 return list.slice(0,maxColors).map(([,bucket])=>{
  const rgb:RGB={
   r:Math.round(bucket.red/bucket.count),
   g:Math.round(bucket.green/bucket.count),
   b:Math.round(bucket.blue/bucket.count),
  };
  return {hex:rgbToHex(rgb),rgb,count:bucket.count,ratio:bucket.count/samples};
 });
}

/**
 * 把页面指针坐标映射成画布像素坐标（画布以 CSS 缩放显示时仍准确）。
 * 落在画布外返回 null；命中右/下边界时夹到最后一个像素。
 */
export function mapPointerToPixel(clientX:number,clientY:number,rect:PointerRect,imageWidth:number,imageHeight:number):PixelPoint|null{
 if(!Number.isFinite(clientX)||!Number.isFinite(clientY))return null;
 if(!Number.isInteger(imageWidth)||!Number.isInteger(imageHeight)||imageWidth<1||imageHeight<1)return null;
 if(!Number.isFinite(rect.left)||!Number.isFinite(rect.top)||!Number.isFinite(rect.width)||!Number.isFinite(rect.height))return null;
 if(rect.width<=0||rect.height<=0)return null;
 const fractionX=(clientX-rect.left)/rect.width;
 const fractionY=(clientY-rect.top)/rect.height;
 if(fractionX<0||fractionX>1||fractionY<0||fractionY>1)return null;
 return {
  x:Math.min(imageWidth-1,Math.floor(fractionX*imageWidth)),
  y:Math.min(imageHeight-1,Math.floor(fractionY*imageHeight)),
 };
}

/**
 * 取色画布预览尺寸：大图等比缩小到 maxSide / maxPixels 以内，保证手机能流畅取色。
 * 缩放时画布关闭插值，取到的是原图真实像素，而不是平均后的混合色。
 */
export function fitPreviewSize(width:number,height:number,maxSide=2400,maxPixels=4_000_000):{width:number;height:number;scale:number}{
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('图片尺寸无效。');
 if(!Number.isInteger(maxSide)||maxSide<1)throw new Error('预览边长上限无效。');
 if(!Number.isFinite(maxPixels)||maxPixels<1)throw new Error('预览像素上限无效。');
 const scale=Math.min(1,maxSide/width,maxSide/height,Math.sqrt(maxPixels/(width*height)));
 const previewWidth=Math.min(width,Math.max(1,Math.round(width*scale)));
 const previewHeight=Math.min(height,Math.max(1,Math.round(height*scale)));
 return {width:previewWidth,height:previewHeight,scale:previewWidth/width};
}
