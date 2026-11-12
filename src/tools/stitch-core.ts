// 长图拼接的纯计算层：输入校验、统一尺寸缩放、画布布局与输出上限判断。
// 不依赖 DOM/Canvas，便于 node:test 直接覆盖布局边界。
import {normalizeHex} from './color-core';

export const STITCH_LIMITS={
 minImages:2,
 maxImages:10,
 maxTotalBytes:40*1024*1024,
 maxSide:20000,
 maxPixels:80_000_000,
 maxSpacing:500,
 maxUnifiedSize:20000,
} as const;

const MEBIBYTE=1024*1024;

export type StitchMode='vertical'|'horizontal';
export type StitchSizeMode='largest'|'smallest'|'custom';
export type StitchFormat='png'|'jpeg';

export interface StitchImageInput {name?:string;width:number;height:number;bytes?:number}
export interface StitchSettings {
 mode:StitchMode;
 spacing:number;
 background:string;
 sizeMode:StitchSizeMode;
 customSize:number;
 format:StitchFormat;
 quality:number;
}
export interface StitchItem {index:number;x:number;y:number;width:number;height:number;sourceWidth:number;sourceHeight:number}
export interface StitchLayout {
 mode:StitchMode;
 spacing:number;
 background:string;
 sizeMode:StitchSizeMode;
 format:StitchFormat;
 quality:number;
 targetSize:number;
 width:number;
 height:number;
 pixels:number;
 items:StitchItem[];
}
export interface StitchFileInfo {name?:string;size:number}

export function stitchMime(format:StitchFormat):'image/png'|'image/jpeg'{return format==='jpeg'?'image/jpeg':'image/png';}
export function stitchExtension(format:StitchFormat):'png'|'jpg'{return format==='jpeg'?'jpg':'png';}

/** 追加图片时校验：最多 10 张、合计 ≤40MB（此时允许只有 1 张，攒够 2 张才能拼接）。 */
export function validateStitchUpload(files:readonly StitchFileInfo[]):void{
 if(!Number.isInteger(files.length)||files.length>STITCH_LIMITS.maxImages)throw new Error('最多拼接 10 张图片，请删减后再试。');
 let total=0;
 for(const file of files)total+=Number.isFinite(file?.size)&&file.size>0?file.size:0;
 if(total>STITCH_LIMITS.maxTotalBytes)throw new Error(`所有图片合计 ${(total/MEBIBYTE).toFixed(1)}MB，超过 40MB 上限，请减少或压缩图片。`);
}

/** 拼接前校验：数量 2–10 张、合计 ≤40MB。 */
export function validateStitchFiles(files:readonly StitchFileInfo[]):void{
 assertImageCount(files.length);
 validateStitchUpload(files);
}

function assertImageCount(count:number):void{
 if(!Number.isInteger(count)||count<STITCH_LIMITS.minImages)throw new Error('请至少选择 2 张图片再拼接。');
 if(count>STITCH_LIMITS.maxImages)throw new Error('最多拼接 10 张图片，请删减后再试。');
}

/** 校验并标准化参数；非法值一律抛中文错误，避免画布阶段才失败。 */
export function normalizeStitchSettings(settings:StitchSettings):StitchSettings{
 if(settings.mode!=='vertical'&&settings.mode!=='horizontal')throw new Error('拼接方向无效，请选择纵向或横向。');
 if(!Number.isInteger(settings.spacing)||settings.spacing<0||settings.spacing>STITCH_LIMITS.maxSpacing)throw new Error('拼接间距须为 0–500 的整数像素。');
 if(settings.sizeMode!=='largest'&&settings.sizeMode!=='smallest'&&settings.sizeMode!=='custom')throw new Error('统一尺寸方式无效，请选择最大、最小或指定。');
 if(settings.sizeMode==='custom'&&(!Number.isInteger(settings.customSize)||settings.customSize<1||settings.customSize>STITCH_LIMITS.maxUnifiedSize))throw new Error('指定的统一尺寸须为 1–20000 的整数像素。');
 if(settings.format!=='png'&&settings.format!=='jpeg')throw new Error('输出格式仅支持 PNG 或 JPEG。');
 const quality=settings.quality;
 if(settings.format==='jpeg'&&(!Number.isFinite(quality)||quality<0.1||quality>1))throw new Error('JPEG 质量须为 0.1–1 之间（1 为最高）。');
 let background:string;
 try{background=normalizeHex(settings.background);}catch{throw new Error('背景色须为 #RRGGBB 或 #RGB 十六进制颜色。');}
 return {
  mode:settings.mode,
  spacing:settings.spacing,
  background,
  sizeMode:settings.sizeMode,
  customSize:settings.sizeMode==='custom'?settings.customSize:0,
  format:settings.format,
  quality:settings.format==='jpeg'?quality:0.92,
 };
}

/**
 * 计算拼接布局：纵向拼接统一宽度、横向拼接统一高度，均按比例缩放。
 * 返回每张图的画布位置、最终画布尺寸与像素数；超过 20000px/边或 8000 万像素时抛错拒绝。
 */
export function computeStitchLayout(images:readonly StitchImageInput[],rawSettings:StitchSettings):StitchLayout{
 assertImageCount(images.length);
 const settings=normalizeStitchSettings(rawSettings);
 const safeImages=images.map((image,index)=>{
  if(!Number.isInteger(image?.width)||!Number.isInteger(image?.height)||image.width<1||image.height<1)throw new Error(`第 ${index+1} 张图片尺寸无效，请重新选择。`);
  return {width:image.width,height:image.height};
 });
 const vertical=settings.mode==='vertical';
 const axis=vertical?'width':'height';
 const sizes=safeImages.map(image=>vertical?image.width:image.height);
 let targetSize:number;
 if(settings.sizeMode==='custom')targetSize=settings.customSize;
 else if(settings.sizeMode==='largest')targetSize=Math.max(...sizes);
 else targetSize=Math.min(...sizes);
 const items:StitchItem[]=safeImages.map((image,index)=>{
  if(vertical){
   const height=Math.max(1,Math.round(image.height*targetSize/image.width));
   return {index,x:0,y:0,width:targetSize,height,sourceWidth:image.width,sourceHeight:image.height};
  }
  const width=Math.max(1,Math.round(image.width*targetSize/image.height));
  return {index,x:0,y:0,width,height:targetSize,sourceWidth:image.width,sourceHeight:image.height};
 });
 const gapTotal=settings.spacing*(items.length-1);
 let cursor=0;
 for(const item of items){
  if(vertical){item.y=cursor;cursor+=item.height+settings.spacing;}
  else{item.x=cursor;cursor+=item.width+settings.spacing;}
 }
 const width=vertical?targetSize:items.reduce((sum,item)=>sum+item.width,0)+gapTotal;
 const height=vertical?items.reduce((sum,item)=>sum+item.height,0)+gapTotal:targetSize;
 const unifiedName=vertical?'宽度':'高度';
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height))throw new Error('拼接结果尺寸超出可处理范围，请减少图片。');
 if(width>STITCH_LIMITS.maxSide||height>STITCH_LIMITS.maxSide)throw new Error(`拼接结果 ${width}×${height}px 超过单边 20000px 上限，请减少图片或调小统一${unifiedName}。`);
 const pixels=width*height;
 if(pixels>STITCH_LIMITS.maxPixels)throw new Error(`拼接结果 ${width}×${height}px 约 ${(pixels/1_000_000).toFixed(1)} 百万像素，超过 8000 万像素上限，请减少图片或调小统一${unifiedName}。`);
 return {...settings,targetSize,width,height,pixels,items};
}
