// 图片工具 UI 集成测试（jsdom + React act，Canvas/位图用桩替代）
// 覆盖：取色页渲染、手动转换与错误提示、图片载入+主色板、pointer 取色、复制；
//       拼接页添加图片、预计尺寸、拼接、下载、参数变更后结果作废、重置。
// 运行：node --import tsx --test tests/image-tools-ui.test.ts
import {after,describe,it,before} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

type AnyRecord=Record<string,unknown>;

let React:typeof import('react');
let act:(fn:()=>void|Promise<void>)=>Promise<void>;
let createRoot:(container:Element)=>{render:(node:unknown)=>void;unmount:()=>void};
let ColorPicker:()=>unknown;
let ImageStitch:()=>unknown;
let dom:import('jsdom').JSDOM;
let root:{render:(node:unknown)=>void;unmount:()=>void};
let clipboardText='';
const downloads:{name:string;blob:Blob}[]=[];

const pngHeader=(width:number,height:number)=>{
 const bytes=new Uint8Array(2048);
 bytes.set([137,80,78,71,13,10,26,10],0);
 bytes[11]=13;
 bytes.set([73,72,68,82],12);
 const view=new DataView(bytes.buffer);
 view.setUint32(16,width);
 view.setUint32(20,height);
 return bytes;
};
const pngFile=(name:string,width:number,height:number)=>{
 const bytes=pngHeader(width,height);
 return new dom.window.File([bytes],name,{type:'image/png'});
};

const btn=(text:string):HTMLButtonElement=>{
 const found=[...dom.window.document.querySelectorAll('button')].find(button=>(button.textContent??'').includes(text));
 assert.ok(found,`找不到按钮：${text}`);
 return found as HTMLButtonElement;
};
const buttonByLabel=(label:string):HTMLButtonElement=>{
 const found=dom.window.document.querySelector(`button[aria-label^="${label}"]`);
 assert.ok(found,`找不到按钮：${label}`);
 return found as HTMLButtonElement;
};
const setInputValue=(element:HTMLInputElement,value:string)=>{
 const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!;
 setter.call(element,value);
 element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
};
const click=async(element:Element)=>{await act(async()=>{(element as HTMLElement).click();});};
const settle=async(ms=60)=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});};
const bodyText=()=>dom.window.document.body.textContent??'';

before(async()=>{
 const {JSDOM}=await import('jsdom');
 dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost/'});
 (globalThis as AnyRecord).window=dom.window;
 (globalThis as AnyRecord).document=dom.window.document;
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 (globalThis as AnyRecord).Blob=dom.window.Blob;
 (globalThis as AnyRecord).File=dom.window.File;
 (globalThis as AnyRecord).URL=dom.window.URL;
 (globalThis as AnyRecord).IS_REACT_ACT_ENVIRONMENT=true;
 Object.defineProperty(dom.window.navigator,'clipboard',{value:{writeText:async(text:string)=>{clipboardText=text;}},configurable:true});
 Object.defineProperty(dom.window.URL,'createObjectURL',{value:()=>`blob:fake-${downloads.length}`,configurable:true});
 Object.defineProperty(dom.window.URL,'revokeObjectURL',{value:()=>undefined,configurable:true});
 dom.window.HTMLAnchorElement.prototype.click=function(){
  const anchor=this as unknown as HTMLAnchorElement;
  downloads.push({name:anchor.download,blob:new dom.window.Blob([])});
 };
 // jsdom 无真实 Canvas：getImageData 返回 4×4 测试图案（左两列红、右两列蓝；取色坐标 (2,2) 为蓝）。
 const contexts=new WeakMap<HTMLCanvasElement,AnyRecord>();
 (dom.window.HTMLCanvasElement.prototype as AnyRecord).getContext=function(){
  const canvas=this as HTMLCanvasElement;
  let context=contexts.get(canvas);
  if(!context){
   context={
    canvas,
    fillStyle:'#000000',
    imageSmoothingEnabled:true,
    imageSmoothingQuality:'high',
    clearRect:()=>undefined,
    fillRect:()=>undefined,
    drawImage:()=>undefined,
    getImageData:(x:number,y:number,width:number,height:number)=>{
     const data=new Uint8ClampedArray(width*height*4);
     for(let row=0;row<height;row++)for(let column=0;column<width;column++){
      const red=x+column<2;
      const offset=(row*width+column)*4;
      data[offset]=red?255:0;
      data[offset+1]=0;
      data[offset+2]=red?0:255;
      data[offset+3]=255;
     }
     return {data,width,height};
    },
   };
   contexts.set(canvas,context);
  }
  return context;
 };
 (dom.window.HTMLCanvasElement.prototype as AnyRecord).getBoundingClientRect=()=>({left:0,top:0,width:200,height:100,right:200,bottom:100,x:0,y:0,toJSON:()=>({})});
 (dom.window.HTMLCanvasElement.prototype as AnyRecord).toBlob=function(callback:(blob:Blob)=>void,type?:string){
  callback(new dom.window.Blob([new Uint8Array(2048)],{type:type??'image/png'}));
 };
 (globalThis as AnyRecord).createImageBitmap=async(blob:Blob)=>{
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(bytes.length<24||bytes[0]!==137)throw new Error('图片解码失败');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return {width:view.getUint32(16),height:view.getUint32(20),close:()=>undefined};
 };
 React=(await import('react')).default;
 ({act}=await import('react'));
 ({createRoot}=await import('react-dom/client'));
 ColorPicker=(await import('../src/tools/ColorPicker.tsx')).default;
 ImageStitch=(await import('../src/tools/ImageStitch.tsx')).default;
 root=createRoot(dom.window.document.getElementById('root')!);
});

describe('图片取色页 UI',()=>{
 it('渲染并完成 HEX/RGB/HSL 手动转换与错误提示',async()=>{
  await act(async()=>{root.render(React.createElement(ColorPicker as never));});
  assert.ok(bodyText().includes('图片取色 / 颜色转换'),'应渲染标题');
  assert.ok(bodyText().includes('手动颜色转换'),'应有手动转换区');
  const select=dom.window.document.querySelector('select') as HTMLSelectElement;
  await act(async()=>{
   select.value='rgb';
   select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  });
  const input=dom.window.document.querySelector('input[aria-label="RGB 颜色输入"]') as HTMLInputElement;
  assert.ok(input,'应出现 RGB 输入框');
  await act(async()=>setInputValue(input,'0, 255, 0'));
  await click(btn('转换'));
  assert.ok(bodyText().includes('rgb(0, 255, 0)'),'应显示 RGB 结果');
  assert.ok(bodyText().includes('#00FF00'),'应显示 HEX 结果');
  await act(async()=>setInputValue(input,'999, 0, 0'));
  await click(btn('转换'));
  const alert=dom.window.document.querySelector('[role="alert"]');
  assert.ok(alert&&(alert.textContent??'').includes('0–255'),'非法输入应给中文错误');
 });

 it('载入图片后显示主色板，pointer 取色并复制',async()=>{
  const fileInput=dom.window.document.querySelector('input[aria-label="选择要取色的图片"]') as HTMLInputElement;
  Object.defineProperty(fileInput,'files',{value:[pngFile('示例.png',4,4)],configurable:true});
  await act(async()=>{fileInput.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  await settle(100);
  assert.ok(bodyText().includes('已载入：示例.png'),'应显示已载入图片');
  assert.ok(bodyText().includes('主色板'),'应显示主色板');
  assert.ok(bodyText().includes('50.0%'),'主色板应显示占比');
  const canvas=dom.window.document.querySelector('canvas[aria-label="图片取色画布：点击或触摸图片上的任意位置取色"]') as HTMLCanvasElement;
  assert.ok(canvas,'应渲染取色画布');
  await act(async()=>{
   canvas.dispatchEvent(new dom.window.PointerEvent('pointerdown',{bubbles:true,pointerId:1,isPrimary:true,clientX:100,clientY:50}));
   canvas.dispatchEvent(new dom.window.PointerEvent('pointerup',{bubbles:true,pointerId:1,isPrimary:true,clientX:100,clientY:50}));
  });
  await settle(30);
  assert.ok(bodyText().includes('#0000FF'),'应取到蓝色像素');
  assert.ok(bodyText().includes('第 3 列'),'应提示取色坐标');
  await click(buttonByLabel('复制主色 #FF0000'));
  await settle(20);
  assert.equal(clipboardText,'#FF0000','点击色板应复制 HEX');
 });
});

describe('长图拼接页 UI',()=>{
 it('添加 2 张图片显示预计尺寸，拼接后下载 PNG',async()=>{
  await act(async()=>{root.render(React.createElement(ImageStitch as never));});
  assert.ok(bodyText().includes('长图拼接'),'应渲染标题');
  const fileInput=dom.window.document.querySelector('input[aria-label="添加要拼接的图片"]') as HTMLInputElement;
  Object.defineProperty(fileInput,'files',{value:[pngFile('a.png',800,600),pngFile('b.png',400,300)],configurable:true});
  await act(async()=>{fileInput.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  await settle(100);
  assert.ok(bodyText().includes('已选 2 张'),'应显示已选张数');
  assert.ok(bodyText().includes('预计输出：800×1200px'),'应显示预计输出尺寸');
  await click(btn('开始拼接'));
  await settle(150);
  assert.ok(bodyText().includes('拼接完成：800×1200px'),'应显示拼接结果');
  downloads.length=0;
  await click(btn('下载 PNG'));
  await settle(20);
  assert.equal(downloads.length,1,'应触发一次下载');
  assert.ok(downloads[0].name.endsWith('.png'),'下载文件应为 PNG');
 });

 it('修改间距后旧结果作废并按新参数预计；重置清空',async()=>{
  const spacingInput=[...dom.window.document.querySelectorAll('input[type="number"]')][0] as HTMLInputElement;
  await act(async()=>setInputValue(spacingInput,'20'));
  await settle(30);
  assert.ok(!bodyText().includes('拼接完成'),'参数变化后旧结果应清除');
  assert.ok(bodyText().includes('预计输出：800×1220px'),'应按新间距重新预计');
  await click(btn('重置全部'));
  await settle(30);
  assert.ok(bodyText().includes('已选 0 张'),'重置应清空图片');
  assert.ok(!bodyText().includes('预计输出：'),'重置后不应保留预计尺寸');
 });
});
