import {useEffect, useState} from 'react';import {ToolPage,useJob,Table,jsonDownload} from './common';import {checkMaterial,defaultRules,parseRules} from './materials-core';
import {consumePhotoTransfer} from '../features/id-photo/photo-check-core';
export default function Materials(){const job=useJob(),[r,setR]=useState(defaultRules),[files,setFiles]=useState<File[]>([]),[rows,setRows]=useState<unknown[][]>([]);
useEffect(()=>{
  try{
    const search=typeof window!=='undefined'?window.location.search:'';
    if(search){
      const params=new URLSearchParams(search);
      const w=Number(params.get('width')||params.get('w')),h=Number(params.get('height')||params.get('h')),k=Number(params.get('maxKiB')||params.get('limitKB')||params.get('limit'));
      if(w>0||h>0||k>0){setR(old=>({...old,...(w>0?{width:w}:{}),...(h>0?{height:h}:{}),...(k>0?{maxKiB:k}:{})}));}
    }
  }catch{/* ignore */}
  const transfer=consumePhotoTransfer();
  if(transfer){
    if(transfer.width||transfer.height||transfer.limitKB){
      setR(old=>({...old,...(transfer.width?{width:transfer.width}:{}),...(transfer.height?{height:transfer.height}:{}),...(transfer.limitKB?{maxKiB:transfer.limitKB}:{})}));
    }
    if(transfer.file){setFiles(prev=>[...prev,transfer.file!]);}
  }
},[]);return <ToolPage id="materials" title="报名材料检查" description="使用你自己的报名规则；只检查客观数据，不保证审核通过。1 KiB = 1024 bytes。" job={job}><fieldset disabled={job.busy}><div className="study-fields">{(['width','height','maxKiB','ratio','dpi'] as const).map((k,i)=><label key={k}>{['宽px（0不限）','高px（0不限）','大小上限KiB','宽高比（0不限）','DPI（人工复核）'][i]}<input type="number" min="0" value={r[k]} onChange={e=>{setR({...r,[k]:+e.target.value});setRows([]);}}/></label>)}<label>允许扩展名<input value={r.extensions} onChange={e=>{setR({...r,extensions:e.target.value});setRows([]);}}/></label><label>文件名（不含扩展名）<select value={r.filename} onChange={e=>{setR({...r,filename:e.target.value as typeof r.filename});setRows([]);}}><option value="any">不限</option><option value="ascii">字母数字下划线短横线</option><option value="digits">纯数字</option></select></label><label>背景色要求<input value={r.background} onChange={e=>setR({...r,background:e.target.value})}/></label></div><input type="file" multiple accept="image/png,image/jpeg,image/webp,.pdf" onChange={e=>{setFiles([...e.target.files??[]]);setRows([]);}}/><p>{files.map(f=>f.name).join('、')}</p><label>导入JSON规则<input type="file" accept=".json" onChange={e=>{const f=e.target.files?.[0];if(f)void job.run(async()=>{if(f.size>10000)throw new Error('规则文件最多10KB。');return parseRules(await f.text());},v=>{setR(v);setRows([]);});}}/></label></fieldset><div className="study-actions"><button className="study-btn" disabled={job.busy||!files.length} onClick={()=>void job.run(async check=>{if(files.length>20)throw new Error('最多20个文件。');parseRules(JSON.stringify(r));const all:unknown[][]=[['文件','检查项','状态','详情']];for(const f of files){check();try{all.push(...(await checkMaterial(f,r)).map(row=>[f.name,...row]));}catch(e){all.push([f.name,'读取','失败',(e as Error).message]);}}return all;},setRows)}>检查材料</button><button className="study-btn alt" onClick={()=>jsonDownload(r,'报名规则.json')}>导出规则</button><button className="study-btn alt" onClick={()=>{job.reset();setFiles([]);setRows([]);setR(defaultRules);}}>重置</button></div>{rows.length>0&&<><Table rows={rows}/><button className="study-btn" onClick={()=>jsonDownload(rows,'材料检查报告.json')}>下载报告</button></>}<p><a href="/tools/id-photo">前往照片裁剪 / 压缩修复</a> · <a href="/tools/images">批量转换图片</a></p></ToolPage>;}
