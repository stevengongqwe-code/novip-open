import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {CROP_DEFAULTS,CROP_PRESETS,assertPdfBytes,computeCropBox,cropPdf,croppedPdfName,inspectPdf,mmToPt,normalizeCropMargins,parseMarginMm,ptToMm,roundMm,type CropMarginsMm} from '../src/tools/pdf-crop-core';

// PDF 裁剪：纯函数 + 真实 pdf-lib 集成测试。
// 运行：node --import tsx --test tests/pdf-crop-core.test.ts

const close=(actual:number,expected:number,message='',epsilon=1e-6)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${message} 期望 ${expected}，实际 ${actual}`);
const margins=(overrides:Partial<CropMarginsMm>={}):CropMarginsMm=>({...CROP_DEFAULTS,...overrides});
async function makePdf(sizes:[number,number][]):Promise<Uint8Array>{
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
 sizes.forEach((size,index)=>{const page=doc.addPage(size);page.drawText(`KEEP THIS CONTENT ${index+1}`,{x:60,y:size[1]/2,size:12,font});});
 return doc.save();
}
async function loadPdfjs(){return import('pdfjs-dist/legacy/build/pdf.mjs');}
async function pdfjsPages(bytes:Uint8Array){
 const pdfjs=await loadPdfjs();
 const task=pdfjs.getDocument({data:bytes.slice(),useSystemFonts:true,disableFontFace:true,isEvalSupported:false,useWorkerFetch:false});
 const doc=await task.promise,result:{view:number[];width:number;height:number;texts:string[]}[]=[];
 try{
  for(let index=1;index<=doc.numPages;index+=1){
   const page=await doc.getPage(index),viewport=page.getViewport({scale:1}),content=await page.getTextContent();
   result.push({view:page.view as number[],width:viewport.width,height:viewport.height,texts:content.items.map(item=>'str'in item?item.str:'')});
   page.cleanup();
  }
 }finally{await task.destroy();}
 return result;
}

describe('PDF裁剪 · 纯函数',()=>{
 it('毫米与点换算按 72/25.4',()=>{
  close(mmToPt(25.4),72);
  close(mmToPt(10),28.346456692913385);
  close(ptToMm(72),25.4);
  assert.equal(roundMm(12.3456),12.35);
 });
 it('裁剪量解析：留空视为 0，负值/非数字/超大值拒绝',()=>{
  assert.equal(parseMarginMm('10','左边距'),10);
  assert.equal(parseMarginMm('12.5','左边距'),12.5);
  assert.equal(parseMarginMm('', '左边距'),0);
  assert.equal(parseMarginMm('  7  ','左边距'),7);
  assert.throws(()=>parseMarginMm('-1','左边距'),/不能是负数/);
  assert.throws(()=>parseMarginMm('abc','左边距'),/必须是数字/);
  assert.throws(()=>parseMarginMm('501','左边距'),/不能超过500毫米/);
 });
 it('四边裁剪量归一化：全 0 拒绝、预设有效',()=>{
  assert.deepEqual(normalizeCropMargins({top:'10',bottom:10,left:'5',right:'0'}),{top:10,bottom:10,left:5,right:0});
  assert.throws(()=>normalizeCropMargins({top:'0',bottom:'0',left:'0',right:'0'}),/至少为一个边/);
  assert.throws(()=>normalizeCropMargins({top:-2}),/不能是负数/);
  const trim10=CROP_PRESETS.find(preset=>preset.id==='trim10');
  assert.ok(trim10&&trim10.margins&&trim10.margins.left===10&&trim10.margins.bottom===10);
 });
 it('裁剪框计算：正常四边内缩，保留页面原点偏移',()=>{
  const box=computeCropBox({x:0,y:0,width:595.28,height:841.89},margins({top:10,bottom:20,left:5,right:15}));
  close(box.x,mmToPt(5));
  close(box.y,mmToPt(20));
  close(box.width,595.28-mmToPt(20));
  close(box.height,841.89-mmToPt(30));
  const offset=computeCropBox({x:20,y:30,width:400,height:500},margins({top:5,bottom:10,left:15,right:0}));
  close(offset.x,20+mmToPt(15));
  close(offset.y,30+mmToPt(10));
  close(offset.width,400-mmToPt(15));
  close(offset.height,500-mmToPt(15));
 });
 it('裁剪框边界：刚好等于页面宽高时拒绝，接近边界仍可裁',()=>{
  assert.throws(()=>computeCropBox({x:0,y:0,width:100,height:100},margins({top:0,bottom:0,left:ptToMm(50),right:ptToMm(50)})),/页面宽度/);
  assert.throws(()=>computeCropBox({x:0,y:0,width:100,height:100},margins({top:ptToMm(50),bottom:ptToMm(50),left:0,right:0})),/页面高度/);
  const near=computeCropBox({x:0,y:0,width:100,height:100},margins({top:0,bottom:0,left:ptToMm(40),right:ptToMm(59.9)}));
  close(near.width,0.1,'接近边界的宽度',1e-6);
  assert.throws(()=>computeCropBox({x:0,y:0,width:100,height:100},margins({top:0,bottom:0,left:0,right:0})),/没有变化/);
  assert.throws(()=>computeCropBox({x:0,y:0,width:0,height:100},margins()),/页面宽高必须大于 0/);
 });
 it('输出文件名保留原名后缀',()=>{
  assert.equal(croppedPdfName('报名表.PDF'),'报名表-已裁剪.pdf');
  assert.equal(croppedPdfName('a/b:c.pdf'),'a_b_c-已裁剪.pdf');
 });
});

describe('PDF裁剪 · pdf-lib 集成',()=>{
 it('3页不同尺寸PDF裁剪：重开验证 cropBox/mediaBox 同步且尺寸正确',async()=>{
  const sizes:[number,number][]=[[595.28,841.89],[841.89,595.28],[300,400]];
  const original=await makePdf(sizes);
  const trimmed=cropPdf(original,{top:10,bottom:20,left:5,right:15});
  const result=await trimmed;
  assert.equal(result.verified,true);
  assert.equal(result.pageCount,3);
  assert.equal(result.boxes.length,3);
  assert.notEqual(result.bytes.length,0);
  const reopened=await PDFDocument.load(result.bytes,{updateMetadata:false});
  assert.equal(reopened.getPageCount(),3);
  reopened.getPages().forEach((page,index)=>{
   const expected=computeCropBox({x:0,y:0,width:sizes[index][0],height:sizes[index][1]},margins({top:10,bottom:20,left:5,right:15}));
   const crop=page.getCropBox(),media=page.getMediaBox();
   close(crop.x,expected.x,`第${index+1}页 cropBox.x`);
   close(crop.y,expected.y,`第${index+1}页 cropBox.y`);
   close(crop.width,expected.width,`第${index+1}页 cropBox.width`);
   close(crop.height,expected.height,`第${index+1}页 cropBox.height`);
   close(media.x,expected.x,`第${index+1}页 mediaBox.x`);
   close(media.width,expected.width,`第${index+1}页 mediaBox.width`);
   close(media.height,expected.height,`第${index+1}页 mediaBox.height`);
  });
 });
 it('裁剪后阅读器可见区域变小，正文内容仍然保留（不是删除内容）',async()=>{
  const sizes:[number,number][]=[[595,842],[595,842]];
  const result=await cropPdf(await makePdf(sizes),{top:10,bottom:10,left:10,right:10});
  const pages=await pdfjsPages(result.bytes);
  assert.equal(pages.length,2);
  pages.forEach((page,index)=>{
   close(page.width,sizes[index][0]-mmToPt(20),`第${index+1}页可见宽度`);
   close(page.height,sizes[index][1]-mmToPt(20),`第${index+1}页可见高度`);
   close(page.view[0],mmToPt(10),`第${index+1}页 view.x`);
   close(page.view[1],mmToPt(10),`第${index+1}页 view.y`);
   assert.ok(page.texts.some(text=>text.includes('KEEP THIS CONTENT')),`第${index+1}页正文应保留`);
  });
 });
 it('已有CropBox的页面以当前可见区域为基准继续裁剪',async()=>{
  const doc=await PDFDocument.create();
  const page=doc.addPage([600,800]);
  page.setCropBox(50,60,500,700);
  const original=await doc.save();
  const result=await cropPdf(original,{top:10,bottom:10,left:10,right:10});
  const reopened=await PDFDocument.load(result.bytes,{updateMetadata:false});
  const crop=reopened.getPage(0).getCropBox(),media=reopened.getPage(0).getMediaBox();
  const expected=computeCropBox({x:50,y:60,width:500,height:700},margins());
  for(const box of [crop,media]){
   close(box.x,expected.x);close(box.y,expected.y);close(box.width,expected.width);close(box.height,expected.height);
  }
 });
 it('多页中任意一页裁剪量超限时整体拒绝并指出页码',async()=>{
  const original=await makePdf([[600,800],[100,100]]);
  await assert.rejects(()=>cropPdf(original,{top:10,bottom:10,left:50,right:50}),/第 2 页/);
  await assert.rejects(()=>cropPdf(original,{top:'0',bottom:'0',left:'0',right:'0'}),/至少为一个边/);
 });
 it('非PDF与超50MB输入在读页数前被拒绝，25MB中等大文件放行',async()=>{
  assert.throws(()=>assertPdfBytes(new TextEncoder().encode('not a pdf at all')),/不是PDF/);
  const tooLarge=new Uint8Array(50*1024*1024+1);tooLarge.set([0x25,0x50,0x44,0x46,0x2d],0);
  assert.throws(()=>assertPdfBytes(tooLarge),/50MB/);
  const mediumLarge=new Uint8Array(25*1024*1024);mediumLarge.set([0x25,0x50,0x44,0x46,0x2d],0);
  assert.doesNotThrow(()=>assertPdfBytes(mediumLarge));
  const original=await makePdf([[200,300]]);
  const info=await inspectPdf(original);
  assert.equal(info.pageCount,1);
  close(info.sizes[0].width,200);
 });
 it('取消回调可中断处理',async()=>{
  const original=await makePdf([[300,400]]);
  await assert.rejects(()=>cropPdf(original,{top:5,bottom:5,left:5,right:5},()=>{throw new Error('已取消。');}),/已取消/);
 });
});
