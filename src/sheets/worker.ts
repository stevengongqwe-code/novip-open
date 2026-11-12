/// <reference lib="webworker" />
import {readSpreadsheet,describe,mergeSheets,exportMerge,SHEET_LIMITS,type Grid,type SheetConfig,type MergeOptions} from './core';
const grids=new Map<string,Grid>(),files=new Map<string,number>();
self.onmessage=(e:MessageEvent)=>{const {id,op,payload}=e.data;try{let result:unknown;
 if(op==='load'){
  if(files.size>=SHEET_LIMITS.files||[...files.values()].reduce((a,b)=>a+b,0)+payload.bytes.length>SHEET_LIMITS.totalBytes)throw new Error('最多10个文件，累计不超过20MB。');
  const read=readSpreadsheet(payload.bytes,payload.name,payload.fileId);if([...grids.values()].reduce((n,g)=>n+g.rows.reduce((s,r)=>s+r.length,0),0)+read.reduce((n,g)=>n+g.rows.reduce((s,r)=>s+r.length,0),0)>SHEET_LIMITS.cells)throw new Error('累计最多50万单元格，请清空后分批。');
  read.forEach(g=>grids.set(g.id,g));files.set(payload.fileId,payload.bytes.length);result=read.map(g=>describe(g));
 }else if(op==='header'){const g=grids.get(payload.sourceId);if(!g)throw new Error('来源不存在。');result=describe(g,payload.headerRow);}
 else if(op==='remove'){for(const [key,g]of grids)if(g.fileId===payload.fileId)grids.delete(key);files.delete(payload.fileId);result=true;}
 else if(op==='merge'){const data=mergeSheets([...grids.values()],payload.configs as SheetConfig[],payload.options as MergeOptions);const xlsx=exportMerge(data,'xlsx'),csv=exportMerge(data,'csv');self.postMessage({id,result:{headers:data.headers,preview:data.rows.slice(0,20),rowCount:data.rows.length,audit:data.audit,warnings:data.warnings,protectedCells:data.protectedCells,xlsx,csv}},[xlsx.buffer,csv.buffer]);return;}
 else throw new Error('未知操作。');
 self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:error instanceof Error?error.message:'处理失败，请重新保存文件后重试。'});}};
