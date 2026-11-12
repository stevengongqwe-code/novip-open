import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
 colorValueFromHex,
 extractPalette,
 fitPreviewSize,
 formatHsl,
 formatRgb,
 hexToRgb,
 hslToRgb,
 mapPointerToPixel,
 normalizeHex,
 parseColorValue,
 rgbToHex,
 rgbToHsl,
 type RGB,
} from '../src/tools/color-core';

const rgba=(colors:[number,number,number,number?][],count=colors.length)=>{const data=new Uint8ClampedArray(count*4);for(let i=0;i<count;i++){const [r,g,b,a=255]=colors[i%colors.length];data[i*4]=r;data[i*4+1]=g;data[i*4+2]=b;data[i*4+3]=a;}return data;};

describe('NOVIP 图片取色 · 颜色转换',()=>{
 it('HEX 解析支持 3/6 位与大小写，非法输入报中文错误',()=>{
  assert.deepEqual(hexToRgb('#FF0000'),{r:255,g:0,b:0});
  assert.deepEqual(hexToRgb('00ff00'),{r:0,g:255,b:0});
  assert.deepEqual(hexToRgb('#0f8'),{r:0,g:255,b:136});
  assert.deepEqual(hexToRgb(' #1A2B3C '),{r:26,g:43,b:60});
  assert.equal(normalizeHex('#abc'),'#AABBCC');
  assert.throws(()=>normalizeHex('ggg'),/十六进制/);
  assert.throws(()=>normalizeHex('#12345'),/十六进制/);
  assert.throws(()=>normalizeHex(''),/十六进制/);
 });

 it('RGB 与 HEX 往返',()=>{
  assert.equal(rgbToHex({r:26,g:43,b:60}),'#1A2B3C');
  assert.equal(rgbToHex({r:255,g:255,b:255}),'#FFFFFF');
  for(const color of [{r:0,g:0,b:0},{r:255,g:0,b:0},{r:12,g:200,b:175},{r:127,g:128,b:129}])assert.deepEqual(hexToRgb(rgbToHex(color)),color);
  assert.throws(()=>rgbToHex({r:256,g:0,b:0}),/0–255/);
 });

 it('RGB 与 HSL 已知值及往返',()=>{
  const around=(actual:number,expected:number,label:string)=>assert.ok(Math.abs(actual-expected)<1e-6,`${label}: ${actual} != ${expected}`);
  const red=rgbToHsl({r:255,g:0,b:0});around(red.h,0,'red h');around(red.s,100,'red s');around(red.l,50,'red l');
  const white=rgbToHsl({r:255,g:255,b:255});around(white.s,0,'white s');around(white.l,100,'white l');
  const gray=rgbToHsl({r:128,g:128,b:128});around(gray.h,0,'gray h');around(gray.s,0,'gray s');
  const teal=rgbToHsl({r:51,g:102,b:153});around(teal.h,210,'teal h');around(teal.s,50,'teal s');around(teal.l,40,'teal l');
  assert.deepEqual(hslToRgb({h:0,s:100,l:50}),{r:255,g:0,b:0});
  assert.deepEqual(hslToRgb({h:120,s:100,l:50}),{r:0,g:255,b:0});
  assert.deepEqual(hslToRgb({h:240,s:100,l:50}),{r:0,g:0,b:255});
  assert.deepEqual(hslToRgb({h:210,s:50,l:40}),{r:51,g:102,b:153});
  assert.deepEqual(hslToRgb({h:360,s:100,l:50}),{r:255,g:0,b:0});
  for(const color of [{r:255,g:0,b:0},{r:0,g:255,b:0},{r:0,g:0,b:255},{r:255,g:255,b:0},{r:0,g:255,b:255},{r:255,g:0,b:255},{r:0,g:0,b:0},{r:255,g:255,b:255},{r:26,g:43,b:60},{r:51,g:102,b:153},{r:127,g:0,b:255},{r:200,g:180,b:30},{r:12,g:200,b:175}] as RGB[])assert.deepEqual(hslToRgb(rgbToHsl(color)),color,JSON.stringify(color));
  assert.throws(()=>hslToRgb({h:361,s:50,l:50}),/HSL/);
  assert.throws(()=>hslToRgb({h:0,s:101,l:50}),/HSL/);
 });

 it('格式化 RGB / HSL',()=>{
  assert.equal(formatRgb({r:1,g:2,b:3}),'rgb(1, 2, 3)');
  assert.equal(formatHsl({h:210.4,s:50.2,l:40}),'hsl(210, 50%, 40%)');
  assert.equal(formatHsl({h:359.6,s:0,l:100}),'hsl(0, 0%, 100%)');
 });

 it('手动转换：HEX / RGB / HSL 互转',()=>{
  assert.equal(parseColorValue('hex','#abc').hex,'#AABBCC');
  assert.equal(parseColorValue('rgb','rgb(255, 0, 0)').hex,'#FF0000');
  assert.equal(parseColorValue('rgb','255 0 0').hex,'#FF0000');
  assert.equal(parseColorValue('rgb','0,0,255').hex,'#0000FF');
  assert.equal(parseColorValue('hsl','hsl(210, 50%, 40%)').hex,'#336699');
  assert.equal(parseColorValue('hsl','0, 100%, 50%').hex,'#FF0000');
  assert.equal(parseColorValue('hsl','210 50 40').hex,'#336699');
  const value=colorValueFromHex('#336699');
  assert.equal(value.hex,'#336699');
  assert.deepEqual(value.rgb,{r:51,g:102,b:153});
  assert.match(formatHsl(value.hsl),/^hsl\(210, 50%, 40%\)$/);
 });

 it('手动转换：非法输入给中文错误',()=>{
  assert.throws(()=>parseColorValue('hex','#zzzzzz'),/十六进制/);
  assert.throws(()=>parseColorValue('rgb','256, 0, 0'),/0–255/);
  assert.throws(()=>parseColorValue('rgb','a, b, c'),/整数/);
  assert.throws(()=>parseColorValue('rgb','1, 2'),/三个/);
  assert.throws(()=>parseColorValue('hsl','361, 50%, 50%'),/色相/);
  assert.throws(()=>parseColorValue('hsl','210, 120%, 50%'),/饱和度/);
  assert.throws(()=>parseColorValue('hsl','210, 50%, 101%'),/亮度/);
  assert.throws(()=>parseColorValue('hsl','hsl(a, b, c)'),/HSL/);
 });
});

describe('NOVIP 图片取色 · 主色量化',()=>{
 it('纯色图片只得到一个 100% 主色',()=>{
  const palette=extractPalette(rgba([[200,30,40]],64));
  assert.equal(palette.length,1);
  assert.equal(palette[0].hex,'#C81E28');
  assert.equal(palette[0].count,64);
  assert.equal(palette[0].ratio,1);
 });

 it('两色按 3:1 比例时主色与占比正确',()=>{
  const data=rgba([[255,0,0],[0,0,255]],100);
  for(let i=0;i<100;i++){const blue=i>=75;data[i*4]=blue?0:255;data[i*4+1]=0;data[i*4+2]=blue?255:0;}
  const palette=extractPalette(data);
  assert.equal(palette.length,2);
  assert.equal(palette[0].hex,'#FF0000');
  assert.equal(palette[0].ratio,0.75);
  assert.equal(palette[1].hex,'#0000FF');
  assert.equal(palette[1].ratio,0.25);
 });

 it('透明像素不参与统计',()=>{
  const data=rgba([[0,255,0,255],[0,0,255,0]],20);
  const palette=extractPalette(data);
  assert.equal(palette.length,1);
  assert.equal(palette[0].hex,'#00FF00');
  assert.equal(palette[0].ratio,1);
 });

 it('主色数量上限与确定性排序',()=>{
  const colors:[number,number,number][]=[[255,0,0],[0,255,0],[0,0,255],[255,255,0],[0,255,255],[255,0,255],[128,128,128],[255,255,255],[0,0,0],[64,64,64]];
  const data=rgba(colors as [number,number,number][],colors.length);
  const palette=extractPalette(data);
  assert.equal(palette.length,8);
  assert.equal(new Set(palette.map(color=>color.hex)).size,8);
  assert.equal(extractPalette(data,{maxColors:3}).length,3);
  assert.deepEqual(extractPalette(new Uint8ClampedArray(0)),[]);
 });

 it('超过采样上限时等步长降采样',()=>{
  const data=rgba([[255,0,0],[0,0,255]],200);
  for(let i=0;i<200;i++){data[i*4]=i%2===0?255:0;data[i*4+2]=i%2===0?0:255;}
  const palette=extractPalette(data,{maxSamples:100});
  assert.equal(palette.length,1);
  assert.equal(palette[0].hex,'#FF0000');
  assert.equal(palette[0].count,100);
 });
});

describe('NOVIP 图片取色 · 坐标与预览',()=>{
 it('指针坐标按 CSS 缩放映射到画布像素',()=>{
  const rect={left:10,top:20,width:200,height:100};
  assert.deepEqual(mapPointerToPixel(10,20,rect,400,200),{x:0,y:0});
  assert.deepEqual(mapPointerToPixel(110,70,rect,400,200),{x:200,y:100});
  assert.deepEqual(mapPointerToPixel(60,20,rect,400,200),{x:100,y:0});
  assert.deepEqual(mapPointerToPixel(210,120,rect,400,200),{x:399,y:199});
  assert.equal(mapPointerToPixel(9,20,rect,400,200),null);
  assert.equal(mapPointerToPixel(10,121,rect,400,200),null);
  assert.equal(mapPointerToPixel(10,20,{left:0,top:0,width:0,height:10},400,200),null);
  assert.equal(mapPointerToPixel(10,20,rect,0,200),null);
 });

 it('预览尺寸等比缩到边长/像素上限内',()=>{
  assert.deepEqual(fitPreviewSize(800,600),{width:800,height:600,scale:1});
  assert.deepEqual(fitPreviewSize(8000,4000),{width:2400,height:1200,scale:0.3});
  assert.deepEqual(fitPreviewSize(4000,4000),{width:2000,height:2000,scale:0.5});
  assert.deepEqual(fitPreviewSize(1,1),{width:1,height:1,scale:1});
  assert.throws(()=>fitPreviewSize(0,10),/尺寸无效/);
 });
});
