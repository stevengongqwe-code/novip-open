// PDF 工具 · UI 集成测试（jsdom + React 19 act）
// 覆盖：加页码工具选择PDF→参数摘要→生成→下载；裁剪工具关闭预览→生成→下载。
// 运行：node --import tsx --test tests/pdf-tools-ui.test.ts（不属于核心测试命令）
import {after,describe,it,before} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

let React:typeof import('react');
let act:(fn:()=>void|Promise<void>)=>Promise<void>;
let createRoot:(container:Element)=>{render:(node:unknown)=>void;unmount:()=>void};
let PdfPageNumber:()=>unknown;
let PdfCrop:()=>unknown;
let PdfMergeSplit:()=>unknown;
let PDFDocument:typeof import('pdf-lib').PDFDocument;
let StandardFonts:typeof import('pdf-lib').StandardFonts;
let dom:import('jsdom').JSDOM;
const downloads:{blob:Blob;name:string}[]=[];

async function settle(ms=120){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});}
async function waitFor(check:()=>boolean,message:string,timeout=8000){
 const started=Date.now();
 while(Date.now()-started<timeout){if(check())return;await settle(60);}
 assert.ok(check(),message);
}
function buttonIn(root:ParentNode,text:string){const found=[...root.querySelectorAll('button')].find(item=>(item.textContent??'').includes(text));assert.ok(found,`找不到按钮：${text}`);return found as HTMLButtonElement;}
async function makePdf(pages=3):Promise<File>{
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
 for(let index=0;index<pages;index+=1){const page=doc.addPage([400,600]);page.drawText(`sample ${index+1}`,{x:30,y:300,size:12,font});}
 const bytes=await doc.save();
 return new dom.window.File([bytes],'示例文档.pdf',{type:'application/pdf'}) as unknown as File;
}
async function selectFile(container:HTMLElement,file:File){
 const input=container.querySelector('input[type=file]') as HTMLInputElement;
 Object.defineProperty(input,'files',{value:[file],configurable:true});
 await act(async()=>{input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
}
async function selectMultipleFiles(container:HTMLElement,files:File[]){
 const input=container.querySelector('input[type=file]') as HTMLInputElement;
 Object.defineProperty(input,'files',{value:files,configurable:true});
 await act(async()=>{input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
}
async function makeNamedPdf(name:string,pages=2):Promise<File>{
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
 for(let index=0;index<pages;index+=1){const page=doc.addPage([400,600]);page.drawText(`doc page ${index+1}`,{x:30,y:300,size:12,font});}
 const bytes=await doc.save();
 return new dom.window.File([bytes],name,{type:'application/pdf'}) as unknown as File;
}
async function setControlValue(element:HTMLInputElement|HTMLSelectElement,value:string){
 await act(async()=>{
  if(element instanceof dom.window.HTMLInputElement){
   const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')?.set;
   setter?.call(element,value);
   element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  }else{
   const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value')?.set;
   setter?.call(element,value);
   element.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  }
 });
}

before(async()=>{
 const {JSDOM}=await import('jsdom');
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
 (globalThis as Record<string,unknown>).window=dom.window;
 (globalThis as Record<string,unknown>).document=dom.window.document;
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 (globalThis as Record<string,unknown>).Blob=dom.window.Blob;
 (globalThis as Record<string,unknown>).File=dom.window.File;
 (globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true;
 Object.defineProperty(dom.window.URL,'createObjectURL',{value:(blob:Blob)=>{downloads.push({blob,name:''});return `blob:fake-${downloads.length}`;},configurable:true});
 Object.defineProperty(dom.window.URL,'revokeObjectURL',{value:()=>undefined,configurable:true});
 (globalThis as Record<string,unknown>).URL=dom.window.URL;
 const originalClick=dom.window.HTMLAnchorElement.prototype.click;
 dom.window.HTMLAnchorElement.prototype.click=function(){const anchor=this as unknown as HTMLAnchorElement;if(downloads.length&&anchor.download)downloads[downloads.length-1].name=anchor.download;return originalClick.call(this);};
 React=(await import('react')).default;
 ({act}=await import('react'));
 ({createRoot}=await import('react-dom/client'));
 ({PDFDocument,StandardFonts}=await import('pdf-lib'));
 PdfPageNumber=(await import('../src/tools/PdfPageNumber.tsx')).default;
 PdfCrop=(await import('../src/tools/PdfCrop.tsx')).default;
 PdfMergeSplit=(await import('../src/tools/PdfMergeSplit.tsx')).default;
});

describe('PDF工具 UI',()=>{
 it('加页码：选择PDF后显示摘要，生成并下载带页码副本',async()=>{
  downloads.length=0;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  await act(async()=>{root.render(React.createElement(PdfPageNumber as never));});
  assert.ok((container.textContent??'').includes('PDF加页码'));
  const limitBanner=container.querySelector('.upload-limit-banner');
  assert.ok(limitBanner, '加页码应展示上传区上方上限提示条');
  assert.ok((limitBanner?.textContent??'').includes('50MB'));
  assert.ok((limitBanner?.textContent??'').includes('500 页'));
  await selectFile(container,await makePdf(3));
  await waitFor(()=>!!container.querySelector('input[type=file]')&&(container.textContent??'').includes('生成前核对'),'应显示生成前核对摘要');
  assert.ok((container.textContent??'').includes('3 页'),'摘要应显示3页');
  await act(async()=>{buttonIn(container,'生成带页码的PDF').click();});
  await waitFor(()=>(container.textContent??'').includes('结果与下载'),'应显示结果卡',20000);
  await act(async()=>{buttonIn(container,'下载新PDF').click();});
  await waitFor(()=>downloads.length>0,'应触发一次下载');
  const download=downloads[0];
  assert.ok(download.name.endsWith('-已加页码.pdf'),`文件名应含 -已加页码.pdf，实际 ${download.name}`);
  const output=new Uint8Array(await download.blob.arrayBuffer());
  const reopened=await PDFDocument.load(output,{updateMetadata:false});
  assert.equal(reopened.getPageCount(),3);
  await act(async()=>{root.unmount();});
  container.remove();
 });
 it('裁剪：关闭预览后选择PDF，裁剪并下载已裁剪副本',async()=>{
  downloads.length=0;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  await act(async()=>{root.render(React.createElement(PdfCrop as never));});
  assert.ok((container.textContent??'').includes('PDF裁剪'));
  const cropBanner=container.querySelector('.upload-limit-banner');
  assert.ok(cropBanner, 'PDF裁剪应展示上传区上方上限提示条');
  assert.ok((cropBanner?.textContent??'').includes('50MB'));
  assert.ok((cropBanner?.textContent??'').includes('500 页'));
  await selectFile(container,await makePdf(2));
  await waitFor(()=>!!container.querySelector('input[type=checkbox]'),'应有预览开关');
  const previewCheckbox=container.querySelector('input[type=checkbox]') as HTMLInputElement;
  assert.equal(previewCheckbox.checked,false,'预览默认关闭，由用户主动开启');
  await waitFor(()=>(container.textContent??'').includes('生成前核对'),'应显示生成前核对摘要');
  await act(async()=>{buttonIn(container,'裁剪并验证').click();});
  await waitFor(()=>(container.textContent??'').includes('结果与下载'),'应显示结果卡',20000);
  await act(async()=>{buttonIn(container,'下载裁剪后的PDF').click();});
  await waitFor(()=>downloads.length>0,'应触发一次下载');
  const download=downloads[0];
  assert.ok(download.name.endsWith('-已裁剪.pdf'),`文件名应含 -已裁剪.pdf，实际 ${download.name}`);
  const output=new Uint8Array(await download.blob.arrayBuffer());
  const reopened=await PDFDocument.load(output,{updateMetadata:false});
  assert.equal(reopened.getPageCount(),2);
  assert.ok(reopened.getPage(0).getCropBox().width<400,'裁剪后宽度应变小');
  assert.ok(reopened.getPage(0).getMediaBox().width<400,'MediaBox 应同步缩小');
  await act(async()=>{root.unmount();});
  container.remove();
 });

 it('合并拆分：选择多个PDF，合并并下载结果',async()=>{
  downloads.length=0;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  await act(async()=>{root.render(React.createElement(PdfMergeSplit as never));});
  assert.ok((container.textContent??'').includes('PDF 合并与拆分'));
  assert.ok((container.textContent??'').includes('PDF 合并'));
  const mergeBanner=container.querySelector('.upload-limit-banner');
  assert.ok(mergeBanner, 'PDF合并应展示上传区上方上限提示条');
  assert.ok((mergeBanner?.textContent??'').includes('100MB'));
  assert.ok((mergeBanner?.textContent??'').includes('50MB'));

  const file1=await makeNamedPdf('文档A.pdf',2);
  const file2=await makeNamedPdf('文档B.pdf',3);
  await selectMultipleFiles(container,[file1,file2]);

  await waitFor(()=>(container.textContent??'').includes('调整文件顺序')&&(container.textContent??'').includes('文档A.pdf'),'应显示文件列表');
  await waitFor(()=>(container.textContent??'').includes('5 页'),'应显示总计5页');

  await act(async()=>{buttonIn(container,'开始合并 PDF').click();});
  await waitFor(()=>(container.textContent??'').includes('合并结果与下载'),'应显示合并结果卡片',20000);
  assert.ok((container.textContent??'').includes('共 5 页'));

  await act(async()=>{buttonIn(container,'下载合并后的 PDF').click();});
  await waitFor(()=>downloads.length>0,'应触发合并文件下载');
  const download=downloads[0];
  assert.ok(download.name.endsWith('-合并.pdf'),`文件名应含 -合并.pdf，实际 ${download.name}`);
  const output=new Uint8Array(await download.blob.arrayBuffer());
  const reopened=await PDFDocument.load(output,{updateMetadata:false});
  assert.equal(reopened.getPageCount(),5);

  await act(async()=>{root.unmount();});
  container.remove();
 });

 it('合并拆分：切换到拆分Tab，按页码范围拆分',async()=>{
  downloads.length=0;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  await act(async()=>{root.render(React.createElement(PdfMergeSplit as never));});

  // 点击切换到拆分 Tab
  const splitTabBtn=buttonIn(container,'PDF 拆分');
  await act(async()=>{splitTabBtn.click();});
  assert.ok((container.textContent??'').includes('选择要拆分的 PDF 文件'));

  const testFile=await makeNamedPdf('待拆分文档.pdf',5);
  await selectFile(container,testFile);

  await waitFor(()=>(container.textContent??'').includes('拆分规则'),'应进入拆分规则卡片');
  assert.ok((container.textContent??'').includes('共 5 页'));

  // 填写范围 1-2; 3-5
  const rangeInput=container.querySelector('input[type=text]') as HTMLInputElement;
  assert.ok(rangeInput,'应有页码范围输入框');
  await setControlValue(rangeInput,'1-2; 3-5');

  await waitFor(()=>(container.textContent??'').includes('预计将拆分为 2 个文件'),'应提示拆分为2个文件');

  await act(async()=>{buttonIn(container,'开始拆分 PDF').click();});
  await waitFor(()=>(container.textContent??'').includes('拆分结果与下载'),'应显示拆分结果卡片',20000);
  assert.ok((container.textContent??'').includes('共生成 2 个文件'));

  // 验证打包下载 ZIP 按钮存在
  const zipBtn=buttonIn(container,'打包下载全部');
  assert.ok(zipBtn,'应有打包下载ZIP按钮');
  await act(async()=>{zipBtn.click();});
  await waitFor(()=>downloads.length>0,'应触发ZIP下载');
  assert.ok(downloads[0].name.endsWith('-拆分集合.zip'),`下载文件应为ZIP包，实际 ${downloads[0].name}`);

  await act(async()=>{root.unmount();});
  container.remove();
 });

 it('合并拆分：切换到拆分Tab，每页拆为一个独立文件（逐页模式）',async()=>{
  downloads.length=0;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  await act(async()=>{root.render(React.createElement(PdfMergeSplit as never));});

  const splitTabBtn=buttonIn(container,'PDF 拆分');
  await act(async()=>{splitTabBtn.click();});

  const testFile=await makeNamedPdf('课件讲义.pdf',3);
  await selectFile(container,testFile);

  await waitFor(()=>(container.textContent??'').includes('拆分规则'),'应进入拆分规则卡片');
  await waitFor(()=>!!container.querySelector('select'),'应有拆分方式下拉框');

  // 切换为每页一个文件
  const selectMode=container.querySelector('select') as HTMLSelectElement;
  assert.ok(selectMode,'应有拆分方式下拉框');
  await setControlValue(selectMode,'each');

  await waitFor(()=>(container.textContent??'').includes('全部 3 页将被分别导出为单独的单页 PDF 文件'),'应提示每页拆分说明');

  await act(async()=>{buttonIn(container,'开始拆分 PDF').click();});
  await waitFor(()=>(container.textContent??'').includes('拆分结果与下载'),'应显示拆分结果卡片',20000);
  assert.ok((container.textContent??'').includes('共生成 3 个文件'));

  await act(async()=>{root.unmount();});
  container.remove();
 });

 it('合并拆分：未选文件时显示插画感空状态，选择文件后支持通过上移/下移及键盘微调顺序', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
   root.render(React.createElement(PdfMergeSplit as never));
  });

  // 验证空状态存在
  const emptyState = container.querySelector('.study-empty-illustration-box');
  assert.ok(emptyState, '未添加文件时应展示有温度的插画感空状态');
  assert.ok((emptyState?.textContent ?? '').includes('尚未添加要合并的 PDF 文件'));

  // 添加三个文件
  const file1 = await makeNamedPdf('第1章.pdf', 1);
  const file2 = await makeNamedPdf('第2章.pdf', 1);
  const file3 = await makeNamedPdf('第3章.pdf', 1);
  await selectMultipleFiles(container, [file1, file2, file3]);

  await waitFor(() => (container.textContent ?? '').includes('已选 3 个文件'), '应加载出3个文件');

  // 检查初始顺序
  let items = container.querySelectorAll('.pdf-queue-item');
  assert.equal(items.length, 3);
  assert.ok((items[0].textContent ?? '').includes('第1章.pdf'));
  assert.ok((items[1].textContent ?? '').includes('第2章.pdf'));
  assert.ok((items[2].textContent ?? '').includes('第3章.pdf'));

  // 点击第二个文件的「下移」按钮
  const downBtns = container.querySelectorAll('.pdf-queue-actions button[aria-label^="下移"]');
  assert.equal(downBtns.length, 3);
  await act(async () => {
   (downBtns[1] as HTMLButtonElement).click();
  });

  // 验证顺序变为：第1章、第3章、第2章
  items = container.querySelectorAll('.pdf-queue-item');
  assert.ok((items[0].textContent ?? '').includes('第1章.pdf'));
  assert.ok((items[1].textContent ?? '').includes('第3章.pdf'));
  assert.ok((items[2].textContent ?? '').includes('第2章.pdf'));

  // 验证键盘可访问性：在第3个项目上按 Alt+ArrowUp 进行上移
  await act(async () => {
   items[2].dispatchEvent(
    new dom.window.KeyboardEvent('keydown', {
     bubbles: true,
     key: 'ArrowUp',
     altKey: true,
    })
   );
  });

  // 验证上移后第2章又回到中间位置
  items = container.querySelectorAll('.pdf-queue-item');
  assert.ok((items[1].textContent ?? '').includes('第2章.pdf'));

  await act(async () => {
   root.unmount();
  });
  container.remove();
 });

 after(()=>{
  try{dom?.window?.close();}catch{}
 });
});
