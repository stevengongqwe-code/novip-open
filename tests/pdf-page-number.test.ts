import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts,PageSizes,degrees} from 'pdf-lib';
import {addPageNumbers,assertPdfBytes,formatPageNumber,inspectPdf,mmToPt,normalizePageNumberOptions,normalizeRotation,pageNumberPlacement,parsePageRange,planPageNumbers,ptToMm,visualPointToPagePoint,type PageNumberOptions} from '../src/tools/pdf-page-number-core';

// PDF 加页码：纯函数 + 真实 pdf-lib 集成测试。
// 运行：node --import tsx --test tests/pdf-page-number.test.ts

const close=(actual:number,expected:number,message='',epsilon=1e-6)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${message} 期望 ${expected}，实际 ${actual}`);
const MM_TO_PT_CONST=72/25.4;
const pageNumberOptions=(overrides:Partial<PageNumberOptions>={}):PageNumberOptions=>({position:'bottom-center',format:'plain',start:1,range:'',skipCount:0,fontSize:11,marginMm:10,...overrides});
async function makePdf(sizes:[number,number][]):Promise<Uint8Array>{
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
 sizes.forEach((size,index)=>{const page=doc.addPage(size);page.drawText(`body content ${index+1}`,{x:40,y:size[1]-60,size:14,font});});
 return doc.save();
}
async function loadPdfjs(){return import('pdfjs-dist/legacy/build/pdf.mjs');}
async function pageTexts(bytes:Uint8Array){
 const pdfjs=await loadPdfjs();
 const task=pdfjs.getDocument({data:bytes.slice(),useSystemFonts:true,disableFontFace:true,isEvalSupported:false,useWorkerFetch:false});
 const doc=await task.promise,result:{texts:string[];transforms:number[][]}[]=[];
 try{
  for(let index=1;index<=doc.numPages;index+=1){
   const page=await doc.getPage(index),content=await page.getTextContent();
   result.push({texts:content.items.map(item=>'str'in item?item.str:''),transforms:content.items.map(item=>'transform'in item?item.transform as number[]:[])});
   page.cleanup();
  }
 }finally{await task.destroy();}
 return result;
}

describe('PDF加页码 · 纯函数',()=>{
 it('毫米与点换算按 72/25.4',()=>{
  close(mmToPt(25.4),72,'25.4mm=72pt');
  close(mmToPt(10),28.346456692913385,'10mm');
  close(ptToMm(72),25.4,'72pt=25.4mm');
  close(ptToMm(MM_TO_PT_CONST),1,'1pt');
 });
 it('页码范围：留空为全部，支持 1-3,5 与中文逗号',()=>{
  assert.deepEqual(parsePageRange('',5),[0,1,2,3,4]);
  assert.deepEqual(parsePageRange('1-3,5',5),[0,1,2,4]);
  assert.deepEqual(parsePageRange('5,2',5),[1,4]);
  assert.deepEqual(parsePageRange('1，3、5',5),[0,2,4]);
  assert.deepEqual(parsePageRange('2-2',5),[1]);
 });
 it('页码范围非法时给出中文错误',()=>{
  assert.throws(()=>parsePageRange('0',5),/页码超出范围/);
  assert.throws(()=>parsePageRange('6',5),/页码超出范围/);
  assert.throws(()=>parsePageRange('2-6',5),/页码范围超出范围/);
  assert.throws(()=>parsePageRange('3-2',5),/起点大于终点/);
  assert.throws(()=>parsePageRange('abc',5),/格式不正确/);
  assert.throws(()=>parsePageRange('1-',5),/格式不正确/);
  assert.throws(()=>parsePageRange('',0),/页数无效/);
 });
 it('页码格式固定 ASCII',()=>{
  assert.equal(formatPageNumber(4,9,'plain'),'4');
  assert.equal(formatPageNumber(4,9,'slash'),'4 / 9');
  assert.equal(formatPageNumber(4,9,'page-of'),'Page 4 of 9');
  for(const format of ['plain','slash','page-of'] as const)assert.match(formatPageNumber(12,200,format),/^[\x20-\x7e]+$/);
 });
 it('参数归一化：起始编号/跳过封面/字号/边距校验',()=>{
  const normalized=normalizePageNumberOptions({start:3,skipCount:1,fontSize:13,marginMm:12.5},5);
  assert.equal(normalized.start,3);
  assert.equal(normalized.totalValue,4);
  assert.deepEqual(normalized.rangePages,[1,2,3,4]);
  assert.throws(()=>normalizePageNumberOptions({start:1.5},5),/必须是整数/);
  assert.throws(()=>normalizePageNumberOptions({start:-1},5),/起始编号需在/);
  assert.throws(()=>normalizePageNumberOptions({fontSize:2},5),/字号需在/);
  assert.throws(()=>normalizePageNumberOptions({marginMm:80},5),/页边距需在/);
  assert.throws(()=>normalizePageNumberOptions({skipCount:5},5),/跳过页数不能覆盖全部页面/);
  assert.throws(()=>normalizePageNumberOptions({skipCount:4,range:'1-3'},5),/没有可编号的页面/);
 });
 it('编号计划：无封面/跳封面/起始编号/范围过滤',()=>{
  const plain=planPageNumbers(normalizePageNumberOptions(pageNumberOptions(),5));
  assert.deepEqual(plain.map(entry=>entry.pageNumber),[1,2,3,4,5]);
  assert.deepEqual(plain.map(entry=>entry.text),['1','2','3','4','5']);
  assert.equal(plain[0].total,5);

  const skipCover=planPageNumbers(normalizePageNumberOptions(pageNumberOptions({skipCount:1}),5));
  assert.deepEqual(skipCover.map(entry=>entry.pageIndex),[1,2,3,4]);
  assert.deepEqual(skipCover.map(entry=>entry.pageNumber),[1,2,3,4]);
  assert.equal(skipCover[0].total,4);

  const startFive=planPageNumbers(normalizePageNumberOptions(pageNumberOptions({start:3}),5));
  assert.deepEqual(startFive.map(entry=>entry.pageNumber),[3,4,5,6,7]);

  const filtered=planPageNumbers(normalizePageNumberOptions(pageNumberOptions({range:'1-2,4',format:'page-of'}),5));
  assert.deepEqual(filtered.map(entry=>entry.pageIndex),[0,1,3]);
  assert.deepEqual(filtered.map(entry=>entry.pageNumber),[1,2,4]);
  assert.deepEqual(filtered.map(entry=>entry.text),['Page 1 of 5','Page 2 of 5','Page 4 of 5']);
 });
 it('九宫格坐标：mm→pt 边距与文本基线位置',()=>{
  const pageWidth=595,pageHeight=842,textWidth=42,textHeight=12,ascentHeight=9;
  const marginPt=mmToPt(10),descent=textHeight-ascentHeight;
  const expectedX:Record<string,number>={left:marginPt,center:(pageWidth-textWidth)/2,right:pageWidth-marginPt-textWidth};
  const expectedY:Record<string,number>={top:pageHeight-marginPt-ascentHeight,middle:(pageHeight-textHeight)/2+descent,bottom:marginPt+descent};
  const positions=['top-left','top-center','top-right','middle-left','middle-center','middle-right','bottom-left','bottom-center','bottom-right'] as const;
  for(const position of positions){
   const [vertical,horizontal]=position.split('-');
   const placement=pageNumberPlacement({pageWidth,pageHeight,textWidth,textHeight,ascentHeight,position,marginPt,rotation:0});
   close(placement.u,expectedX[horizontal],`${position} 的横坐标`);
   close(placement.v,expectedY[vertical],`${position} 的纵坐标`);
   assert.equal(placement.rotation,0);
  }
 });
 it('整页边距大于可用空间时拒绝创建负宽高',()=>{
  assert.throws(()=>pageNumberPlacement({pageWidth:10,pageHeight:10,textWidth:100,textHeight:10,ascentHeight:8,position:'bottom-center',marginPt:0,rotation:0}),/超出页面范围/);
  assert.throws(()=>pageNumberPlacement({pageWidth:0,pageHeight:10,textWidth:10,textHeight:10,ascentHeight:8,position:'bottom-center',marginPt:0,rotation:0}),/页面尺寸/);
 });
 it('旋转页面坐标换算 0/90/180/270 度与规范化',()=>{
  assert.equal(normalizeRotation(-90),270);
  assert.equal(normalizeRotation(450),90);
  assert.equal(normalizeRotation(Number.NaN),0);
  const box={x:5,y:7,width:100,height:200};
  assert.deepEqual(visualPointToPagePoint(box,0,0,0),{x:5,y:7});
  assert.deepEqual(visualPointToPagePoint(box,90,0,0),{x:105,y:7});
  assert.deepEqual(visualPointToPagePoint(box,180,0,0),{x:105,y:207});
  assert.deepEqual(visualPointToPagePoint(box,270,0,0),{x:5,y:207});
 });
});

describe('PDF加页码 · pdf-lib 集成',()=>{
 it('5页PDF加页码：页数不变、每页尺寸不变、输入字节不被修改',async()=>{
  const sizes:[number,number][]=[PageSizes.A4,[612,792],PageSizes.A5,[400,600],[841.89,595.28]];
  const original=await makePdf(sizes),snapshot=original.slice();
  assert.equal((await inspectPdf(original)).pageCount,5);
  const result=await addPageNumbers(original,pageNumberOptions({format:'page-of'}),()=>{});
  assert.equal(result.pageCount,5);
  assert.equal(result.numberedCount,5);
  assert.deepEqual([...original], [...snapshot],'输入字节应保持不变');
  const reopened=await PDFDocument.load(result.bytes,{updateMetadata:false});
  assert.equal(reopened.getPageCount(),5);
  reopened.getPages().forEach((page,index)=>{const size=page.getSize();close(size.width,sizes[index][0],`第${index+1}页宽`);close(size.height,sizes[index][1],`第${index+1}页高`);});
 });
 it('输出可被阅读器解析：每页出现页码文本且位置在底部居中',async()=>{
  const sizes:[number,number][]=[PageSizes.A4,[612,792],[500,700],[400,600],[595,842]];
  const measure=await PDFDocument.create(),font=await measure.embedFont(StandardFonts.Helvetica);
  const fontSize=12,marginMm=10,textHeight=font.heightAtSize(fontSize),ascentHeight=font.heightAtSize(fontSize,{descender:false}),descent=textHeight-ascentHeight;
  const numbered=await addPageNumbers(await makePdf(sizes),pageNumberOptions({format:'page-of',fontSize,marginMm:marginMm}),()=>{});
  const pages=await pageTexts(numbered.bytes);
  assert.equal(pages.length,5);
  pages.forEach((page,index)=>{
   const expectedText=`Page ${index+1} of 5`,itemIndex=page.texts.indexOf(expectedText);
   assert.ok(itemIndex>=0,`第${index+1}页应出现页码文本 ${expectedText}，实际 ${JSON.stringify(page.texts)}`);
   const textWidth=font.widthOfTextAtSize(expectedText,fontSize),expectedX=(sizes[index][0]-textWidth)/2,expectedY=mmToPt(marginMm)+descent;
   const transform=page.transforms[itemIndex];
   close(transform[4],expectedX,`第${index+1}页页码横坐标`,1e-3);
   close(transform[5],expectedY,`第${index+1}页页码纵坐标`,1e-3);
  });
 });
 it('跳过封面+起始编号+自定义范围只给目标页加页码',async()=>{
  const original=await makePdf([[595,842],[595,842],[595,842],[595,842],[595,842]]);
  const result=await addPageNumbers(original,pageNumberOptions({skipCount:1,start:2,range:'2-4',format:'slash'}),()=>{});
  assert.equal(result.numberedCount,3);
  assert.deepEqual(result.entries.map(entry=>entry.pageNumber),[2,3,4]);
  const pages=await pageTexts(result.bytes);
  assert.deepEqual(pages.map(page=>page.texts.filter(text=>/^\d+ \/ \d+$/.test(text))),[[],['2 / 4'],['3 / 4'],['4 / 4'],[]]);
 });
 it('旋转页面（/Rotate 90）加页码后旋转角度保留且文本可提取',async()=>{
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),page=doc.addPage([300,500]);
  page.setRotation(degrees(90));page.drawText('rotated body',{x:30,y:250,size:12,font});
  const result=await addPageNumbers(await doc.save(),pageNumberOptions({marginMm:10}),()=>{});
  const reopened=await PDFDocument.load(result.bytes,{updateMetadata:false});
  assert.equal(reopened.getPage(0).getRotation().angle,90);
  assert.equal(reopened.getPage(0).getSize().width,300);
  const pages=await pageTexts(result.bytes);
  assert.ok(pages[0].texts.includes('1'),`旋转页应出现页码 1，实际 ${JSON.stringify(pages[0].texts)}`);
 });
 it('取消回调可中断处理',async()=>{
  const original=await makePdf([[300,400],[300,400]]);
  await assert.rejects(()=>addPageNumbers(original,pageNumberOptions(),()=>{throw new Error('已取消。');}),/已取消/);
 });
 it('非PDF、超50MB、超500页与空文件均被拒绝',async()=>{
  assert.throws(()=>assertPdfBytes(new TextEncoder().encode('hello world, not a pdf')),/不是PDF/);
  assert.throws(()=>assertPdfBytes(new Uint8Array(0)),/为空/);
  const tooLarge=new Uint8Array(50*1024*1024+1);tooLarge.set([0x25,0x50,0x44,0x46,0x2d],0);
  assert.throws(()=>assertPdfBytes(tooLarge),/50MB/);
  const manyPages=await makePdf(Array.from({length:501},()=>[300,400] as [number,number]));
  await assert.rejects(()=>inspectPdf(manyPages),/最多500页/);
 });
 it('中等偏大PDF（25MB）在上限放宽后顺利通过assertPdfBytes',async()=>{
  const mediumLarge=new Uint8Array(25*1024*1024);
  mediumLarge.set([0x25,0x50,0x44,0x46,0x2d],0);
  assert.doesNotThrow(()=>assertPdfBytes(mediumLarge));
 });
});
