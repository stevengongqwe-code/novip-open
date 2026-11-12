import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
 STITCH_LIMITS,
 computeStitchLayout,
 normalizeStitchSettings,
 stitchExtension,
 stitchMime,
 validateStitchFiles,
 validateStitchUpload,
 type StitchImageInput,
 type StitchSettings,
} from '../src/tools/stitch-core';

const MEBIBYTE=1024*1024;
const makeSettings=(over:Partial<StitchSettings>={}):StitchSettings=>({
 mode:'vertical',spacing:0,background:'#FFFFFF',sizeMode:'largest',customSize:1000,format:'png',quality:0.92,...over,
});
const img=(width:number,height:number):StitchImageInput=>({width,height});

describe('NOVIP 长图拼接 · 输入限制',()=>{
 it('图片数量须为 2–10 张',()=>{
  assert.throws(()=>validateStitchFiles([]),/至少选择 2 张/);
  assert.throws(()=>validateStitchFiles([{size:1}]),/至少选择 2 张/);
  assert.doesNotThrow(()=>validateStitchFiles([{size:1},{size:1}]));
  assert.doesNotThrow(()=>validateStitchFiles(Array.from({length:10},()=>({size:1}))));
  assert.throws(()=>validateStitchFiles(Array.from({length:11},()=>({size:1}))),/最多拼接 10 张/);
 });

 it('追加图片时允许先选 1 张，但张数与总量仍受限',()=>{
  assert.doesNotThrow(()=>validateStitchUpload([]));
  assert.doesNotThrow(()=>validateStitchUpload([{size:1}]));
  assert.doesNotThrow(()=>validateStitchUpload(Array.from({length:10},()=>({size:1}))));
  assert.throws(()=>validateStitchUpload(Array.from({length:11},()=>({size:1}))),/最多拼接 10 张/);
  assert.throws(()=>validateStitchUpload([{size:41*MEBIBYTE}]),/40MB/);
 });

 it('总大小合计不超过 40MB',()=>{
  assert.doesNotThrow(()=>validateStitchFiles([{size:20*MEBIBYTE},{size:20*MEBIBYTE}]));
  assert.throws(()=>validateStitchFiles([{size:20*MEBIBYTE},{size:20*MEBIBYTE+1}]),/40MB/);
  assert.throws(()=>validateStitchFiles([{size:21*MEBIBYTE},{size:20*MEBIBYTE}]),/40MB/);
  assert.equal(STITCH_LIMITS.maxTotalBytes,40*MEBIBYTE);
 });
});

describe('NOVIP 长图拼接 · 参数校验',()=>{
 it('标准化参数：背景色大写、PNG 忽略质量',()=>{
  const normalized=normalizeStitchSettings(makeSettings({background:'#fff',sizeMode:'largest',customSize:1234}));
  assert.equal(normalized.background,'#FFFFFF');
  assert.equal(normalized.customSize,0);
  assert.equal(normalized.quality,0.92);
  assert.equal(normalizeStitchSettings(makeSettings({format:'jpeg',quality:0.5})).quality,0.5);
 });

 it('非法参数报中文错误',()=>{
  assert.throws(()=>normalizeStitchSettings(makeSettings({mode:'diagonal' as StitchSettings['mode']})),/方向/);
  assert.throws(()=>normalizeStitchSettings(makeSettings({spacing:-1})),/间距/);
  assert.throws(()=>normalizeStitchSettings(makeSettings({spacing:501})),/间距/);
  assert.throws(()=>normalizeStitchSettings(makeSettings({spacing:1.5})),/间距/);
  assert.throws(()=>normalizeStitchSettings(makeSettings({sizeMode:'middle' as StitchSettings['sizeMode']})),/统一尺寸/);
  assert.throws(()=>normalizeStitchSettings(makeSettings({sizeMode:'custom',customSize:0})),/1–20000/);
  assert.throws(()=>normalizeStitchSettings(makeSettings({format:'webp' as StitchSettings['format']})),/格式/);
  assert.throws(()=>normalizeStitchSettings(makeSettings({format:'jpeg',quality:2})),/质量/);
  assert.throws(()=>normalizeStitchSettings(makeSettings({background:'red'})),/背景色/);
  assert.throws(()=>normalizeStitchSettings(makeSettings({background:'#12345'})),/背景色/);
 });
});

describe('NOVIP 长图拼接 · 布局计算',()=>{
 it('纵向拼接按最大宽度统一并累加高度',()=>{
  const layout=computeStitchLayout([img(800,600),img(400,300)],makeSettings());
  assert.equal(layout.targetSize,800);
  assert.equal(layout.width,800);
  assert.equal(layout.height,1200);
  assert.equal(layout.pixels,800*1200);
  assert.deepEqual(layout.items,[
   {index:0,x:0,y:0,width:800,height:600,sourceWidth:800,sourceHeight:600},
   {index:1,x:0,y:600,width:800,height:600,sourceWidth:400,sourceHeight:300},
  ]);
 });

 it('纵向拼接按最小宽度统一',()=>{
  const layout=computeStitchLayout([img(800,600),img(400,300)],makeSettings({sizeMode:'smallest'}));
  assert.equal(layout.targetSize,400);
  assert.equal(layout.width,400);
  assert.equal(layout.height,600);
  assert.deepEqual(layout.items.map(item=>[item.y,item.width,item.height]),[[0,400,300],[300,400,300]]);
 });

 it('纵向拼接：指定宽度 + 间距',()=>{
  const layout=computeStitchLayout([img(800,600),img(400,300)],makeSettings({sizeMode:'custom',customSize:500,spacing:10}));
  assert.equal(layout.targetSize,500);
  assert.equal(layout.width,500);
  assert.equal(layout.height,760);
  assert.deepEqual(layout.items.map(item=>[item.y,item.height]),[[0,375],[385,375]]);
 });

 it('横向拼接统一高度并累加宽度',()=>{
  const layout=computeStitchLayout([img(800,600),img(400,300)],makeSettings({mode:'horizontal',spacing:20}));
  assert.equal(layout.targetSize,600);
  assert.equal(layout.width,1620);
  assert.equal(layout.height,600);
  assert.deepEqual(layout.items.map(item=>[item.x,item.width,item.height]),[[0,800,600],[820,800,600]]);
 });

 it('横向拼接：指定高度',()=>{
  const layout=computeStitchLayout([img(800,600),img(400,300)],makeSettings({mode:'horizontal',sizeMode:'custom',customSize:300}));
  assert.equal(layout.width,800);
  assert.equal(layout.height,300);
  assert.deepEqual(layout.items.map(item=>[item.x,item.width,item.height]),[[0,400,300],[400,400,300]]);
 });

 it('0 张 / 1 张 / 超过 10 张拒绝',()=>{
  assert.throws(()=>computeStitchLayout([],makeSettings()),/至少选择 2 张/);
  assert.throws(()=>computeStitchLayout([img(100,100)],makeSettings()),/至少选择 2 张/);
  assert.throws(()=>computeStitchLayout(Array.from({length:11},()=>img(10,10)),makeSettings()),/最多拼接 10 张/);
 });

 it('图片尺寸非法时指出第几张',()=>{
  assert.throws(()=>computeStitchLayout([img(100,100),{width:0,height:100}],makeSettings()),/第 2 张/);
  assert.throws(()=>computeStitchLayout([{width:100.5,height:100},img(10,10)],makeSettings()),/第 1 张/);
 });
});

describe('NOVIP 长图拼接 · 输出上限',()=>{
 it('单边超过 20000px 拒绝（纵向/横向）',()=>{
  assert.throws(()=>computeStitchLayout([img(25000,250),img(25000,250)],makeSettings()),/20000/);
  assert.throws(()=>computeStitchLayout([img(500,25000),img(500,25000)],makeSettings({mode:'horizontal'})),/20000/);
 });

 it('超过 8000 万像素拒绝',()=>{
  assert.throws(()=>computeStitchLayout([img(2000,1000),img(2000,1000)],makeSettings({sizeMode:'custom',customSize:20000})),/8000 万/);
 });

 it('8000 万像素恰好等于上限时允许',()=>{
  const layout=computeStitchLayout([img(10,1),img(10,1)],makeSettings({sizeMode:'custom',customSize:20000}));
  assert.equal(layout.width,20000);
  assert.equal(layout.height,4000);
  assert.equal(layout.pixels,80_000_000);
 });

 it('常规大图（6400 万像素）正常返回',()=>{
  const layout=computeStitchLayout([img(2000,1000),img(2000,1000)],makeSettings({sizeMode:'custom',customSize:8000}));
  assert.equal(layout.width,8000);
  assert.equal(layout.height,8000);
  assert.equal(layout.pixels,64_000_000);
 });

 it('拼接辅助函数给出 MIME 与扩展名',()=>{
  assert.equal(stitchMime('png'),'image/png');
  assert.equal(stitchMime('jpeg'),'image/jpeg');
  assert.equal(stitchExtension('png'),'png');
  assert.equal(stitchExtension('jpeg'),'jpg');
 });
});
