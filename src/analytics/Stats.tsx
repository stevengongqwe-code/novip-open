import React,{useEffect,useMemo,useState} from 'react';
import {tools} from '../tools/registry';
import {getPublicAnalytics,type AnalyticsPublic,type AnalyticsRange,type AnalyticsPoint} from './types';
import {isWebmasterMode,enableWebmasterMode,disableWebmasterMode} from './client';
import SiteFacts from './SiteFacts';
import './styles.css';
const ranges:[AnalyticsRange,string][]=[['24h','24 小时'],['7d','7 天'],['30d','30 天'],['90d','90 天'],['all','全部']];
const fmt=(n:number|null|undefined)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('zh-CN'):'暂无数据';
const date=(s:string)=>{const ms=Date.parse(s);return Number.isFinite(ms)?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):'未知';};
const formatPoint=(s:string)=>{const ms=Date.parse(s);return Number.isFinite(ms)?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit'}).format(new Date(ms)):s;};
const uvEmptyLabel=(data:AnalyticsPublic|null|undefined)=>{
 if(!data)return '未接入';
 if(!data.uvConfigured)return '未启用';
 return '此前未采集';
};
function Metric({name,value,sub,emptyLabel}:{name:string;value:number|null|undefined;sub?:string;emptyLabel?:string}){
 const text=typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('zh-CN'):(emptyLabel||'暂无数据');
 return <div className="analytics-card"><div className="label">{name}</div><strong>{text}</strong>{sub&&<small>{sub}</small>}</div>;
}
type TrendMode='pv'|'uv'|'both';
function Trend({points}:{points:AnalyticsPoint[]}){
 const [mode,setMode]=useState<TrendMode>('both');
 const [focus,setFocus]=useState<number|null>(null);
 const vals=points.filter(p=>Number.isFinite(p.y)&&p.y>=0);
 const showPv=mode==='pv'||mode==='both';
 const showUv=mode==='uv'||mode==='both';
 const maxPv=Math.max(0,...vals.map(p=>p.y));
 const maxUv=Math.max(0,...vals.map(p=>typeof p.uv==='number'?p.uv:0));
 const max=Math.max(1,showPv?maxPv:0,showUv?maxUv:0);
 const left=18,right=885,top=22,bottom=205;
 const X=(i:number)=>vals.length===1?(left+right)/2:left+(right-left)*i/(vals.length-1);
 const Y=(v:number)=>bottom-v/max*(bottom-top);
 const pvCoords=vals.map((p,i)=>({x:X(i),y:Y(p.y)}));
 const pvPath=pvCoords.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ');
 const pvArea=pvPath+(pvCoords.length?' L '+pvCoords.at(-1)!.x+' '+bottom+' L '+pvCoords[0].x+' '+bottom+' Z':'');
 // UV: split into contiguous runs where uv is a real number (null = not collected -> gap).
 const uvRuns: {x:number;y:number}[][]=[];
 {
  let run:{x:number;y:number}[]=[];
  vals.forEach((p,i)=>{
   if(typeof p.uv==='number'&&p.uv>=0){run.push({x:X(i),y:Y(p.uv)});}
   else if(run.length){uvRuns.push(run);run=[];}
  });
  if(run.length)uvRuns.push(run);
 }
 const uvPaths=uvRuns.map(run=>run.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' '));
 const hasUvGap=vals.some(p=>!(typeof p.uv==='number'&&p.uv>=0));
 const hasAnyUv=vals.some(p=>typeof p.uv==='number');
 const selected=focus!==null?Math.min(focus,vals.length-1):vals.length-1;
 const datum=vals[selected];
 const onMove=(e:React.PointerEvent<SVGSVGElement>)=>{const rect=e.currentTarget.getBoundingClientRect();const x=((e.clientX-rect.left)/rect.width)*900;const pos=Math.max(0,Math.min(vals.length-1,Math.round((x-left)/(right-left)*(vals.length-1))));setFocus(pos);};
 if(!vals.length)return <div className="analytics-empty">暂无可用趋势数据</div>;
 return <>
 <div className="analytics-tabs" role="group" aria-label="趋势指标切换" style={{marginBottom:10}}>
  {([['pv','浏览量 PV'],['uv','访客 UV'],['both','PV + UV']] as [TrendMode,string][]).map(([id,title])=><button key={id} aria-pressed={mode===id} onClick={()=>setMode(id)}>{title}</button>)}
 </div>
 <div className="analytics-plot"><svg viewBox="0 0 900 240" role="img" aria-label="页面浏览与访客趋势图" onPointerMove={onMove} onPointerLeave={()=>setFocus(null)}>
 <defs><linearGradient id="novip-analytics-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d12b35" stopOpacity=".19"/><stop offset="100%" stopColor="#d12b35" stopOpacity=".015"/></linearGradient></defs>
 {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={left} y1={bottom-t*(bottom-top)} x2={right} y2={bottom-t*(bottom-top)} stroke="#ececef"/><text x="893" y={bottom-t*(bottom-top)+4} fontSize="10" textAnchor="end" fill="#a1a1aa">{Math.round(max*t)}</text></g>)}
 {showPv&&<><path d={pvArea} fill="url(#novip-analytics-fill)"/><path d={pvPath} fill="none" stroke="#cb2631" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>}
 {showUv&&uvPaths.map((d,i)=><path key={i} d={d} fill="none" stroke="#2b2b30" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>)}
 {datum&&selected!==null&&selected!==undefined&&<>
  <line x1={X(selected)} y1={top} x2={X(selected)} y2={bottom} stroke="#c9232c" strokeDasharray="3 4" strokeOpacity=".4"/>
  {showPv&&<circle cx={X(selected)} cy={Y(datum.y)} r="6" fill="white" stroke="#c9232c" strokeWidth="3"/>}
  {showUv&&typeof datum.uv==='number'&&<circle cx={X(selected)} cy={Y(datum.uv)} r="5" fill="white" stroke="#2b2b30" strokeWidth="3"/>}
 </>}
 <text x={left} y="235" fontSize="11" fill="#888">{formatPoint(vals[0].x)}</text><text x={right} y="235" textAnchor="end" fontSize="11" fill="#888">{formatPoint(vals.at(-1)!.x)}</text>
 </svg></div>
 <div className="analytics-dot-label">
  {datum?formatPoint(datum.x)+' · '+(showPv?'浏览 '+fmt(datum.y)+' 次':'')+(showPv&&showUv?'　':'')+(showUv?'访客 '+(typeof datum.uv==='number'?datum.uv.toLocaleString('zh-CN')+' 位':'此前未采集'):''):'暂无数据'}
  　<span className="analytics-status">移动鼠标或触摸曲线查看数据</span>
 </div>
 <div className="analytics-status" style={{marginTop:4}}>
  <span style={{color:'#cb2631'}}>●</span> PV 页面浏览量　<span style={{color:'#2b2b30'}}>●</span> UV 独立访客（去重）
  {showUv&&hasUvGap&&<>　· 曲线缺口表示该时期尚未采集 UV（此前未采集），不是 0</>}
  {showUv&&!hasAnyUv&&vals.length>0&&<>　· 当前时间范围暂无 UV 数据</>}
 </div></>;
}
function WebmasterMode(){
 const [on,setOn]=useState<boolean>(()=>{try{return isWebmasterMode();}catch{return false;}});
 const [secret,setSecret]=useState('');
 const [busy,setBusy]=useState(false);
 const [msg,setMsg]=useState('');
 async function enable(){
  const s=secret.trim();
  if(!s){setMsg('请先输入站长密钥');return;}
  setBusy(true);setMsg('');
  const r=await enableWebmasterMode(s);
  setBusy(false);
  if(r.ok){setOn(true);setSecret('');setMsg('已启用：此浏览器将不再上报任何统计事件。');}
  else setMsg(r.error||'启用失败');
 }
 function disable(){disableWebmasterMode();setOn(false);setMsg('已关闭：此浏览器恢复正常上报。');}
 return <section className="analytics-card analytics-block" aria-label="站长模式">
 <div className="analytics-section-heading"><h2>站长模式：不计入统计</h2><span className="analytics-pill">{on?'已启用':'未启用'}</span></div>
 {on
  ?<><p className="analytics-note">此浏览器当前处于站长模式：页面访问与工具事件<strong>不会</strong>进入公开统计。站长测试请放心进行。</p>
     <p className="analytics-note">注意：不同浏览器、无痕窗口、不同设备需要<strong>分别设置</strong>。清除浏览器数据后需要重新启用。</p>
     <button className="analytics-btn" type="button" onClick={disable}>关闭站长模式</button></>
  :<><p className="analytics-note">站长在自己的设备上启用后，该浏览器的访问不再污染公开数据。普通访客不需要任何操作。</p>
     <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
      <input type="password" value={secret} onChange={e=>setSecret(e.target.value)} placeholder="输入站长密钥"
       aria-label="站长密钥" autoComplete="off"
       style={{flex:'1 1 200px',minHeight:40,border:'1px solid #e4e4e7',borderRadius:9,padding:'0 12px',fontSize:13}}/>
      <button className="analytics-btn" type="button" onClick={()=>void enable()} disabled={busy}>{busy?'验证中…':'启用站长模式'}</button>
     </div>
     <p className="analytics-note">密钥仅用于本次验证，不会保存在浏览器中。不同浏览器、无痕窗口、不同设备需要分别设置。</p></>}
 {msg&&<p className="analytics-status" role="status" style={{marginTop:8}}>{msg}</p>}
 </section>;
}
export default function Stats(){
 const [range,setRange]=useState<AnalyticsRange>('7d');
 const [data,setData]=useState<AnalyticsPublic|null>(null);
 const [busy,setBusy]=useState(true),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 useEffect(()=>{document.title='NOVIP 网站数据｜公开透明的成长记录';
 const desc='无需登录，查看 NOVIP 真实访问趋势、工具使用统计和公开成长数据。统计仅从启用分析服务之日开始。';
 let meta=document.querySelector('meta[name="description"]');
 const original=meta?.getAttribute('content');
 if(meta)meta.setAttribute('content',desc);
 const og=document.querySelector('meta[property="og:title"]');const originalOg=og?.getAttribute('content');
 og?.setAttribute('content','NOVIP 网站数据｜公开透明的成长记录');
 return()=>{if(meta&&typeof original==='string')meta.setAttribute('content',original);if(og&&typeof originalOg==='string')og.setAttribute('content',originalOg);};},[]);
 useEffect(()=>{let alive=true;setBusy(true);setError('');getPublicAnalytics(range).then(v=>{if(alive)setData(v);}).catch(e=>{if(alive){setData(null);setError(e instanceof Error?e.message:'加载失败');}}).finally(()=>{if(alive)setBusy(false);});return()=>{alive=false;};},[range]);
 const indexed=useMemo(()=>new Map<string,{name:string;path:string}>(tools.map(t=>[t.id,t])),[]);
 const ranked=(data?.tools||[]).map(t=>({...t,name:indexed.get(t.id)?.name||t.id,path:indexed.get(t.id)?.path||'/'})).sort((a,b)=>(b.success||0)-(a.success||0)||(b.starts||0)-(a.starts||0));
 const summed=data?.totals;
 const uvEmpty=busy?'读取中':uvEmptyLabel(data);
 const successRate=summed?.toolStarts&&summed.toolSuccess!==null&&summed.toolSuccess!==undefined&&summed.toolSuccess<=summed.toolStarts?Math.round(summed.toolSuccess/summed.toolStarts*1000)/10:null;
 const sampleEnough=(summed?.toolSuccess||0)>=20;
 async function copy(){try{await navigator.clipboard.writeText('https://novip.site/stats');setCopied(true);}catch{setCopied(false);}}
 return <main className="analytics-page">
 <header className="analytics-head"><div><span className="analytics-kicker">PUBLIC ANALYTICS / 数据公开</span><h1>NOVIP 网站数据</h1><p>真实使用，公开呈现。无需注册、无需登录，不展示个人访问记录。</p></div><div className="analytics-actions"><a className="analytics-btn" href="/">← 返回工具首页</a><button className="analytics-btn" type="button" onClick={()=>void copy()}>{copied?'已复制链接':'复制分享链接'}</button></div></header>
 <SiteFacts apiOk={!!data} loading={busy}/>
 <section aria-label="网站总体数据" className="analytics-metrics">
 <Metric name="今日独立访客 UV" value={summed?.today} sub="北京时间今日去重" emptyLabel={uvEmpty}/>
 <Metric name="昨日独立访客 UV" value={summed?.yesterday} sub="北京时间昨日去重" emptyLabel={uvEmpty}/>
 <Metric name="最近 7 天去重 UV" value={summed?.sevenDays} sub="整个窗口去重，非每日相加" emptyLabel={uvEmpty}/>
 <Metric name="最近 30 天去重 UV" value={summed?.thirtyDays} sub="整个窗口去重" emptyLabel={uvEmpty}/>
 <Metric name="历史累计去重 UV" value={summed?.uv} sub="仅限可去重的采集时期" emptyLabel={uvEmpty}/>
 <Metric name="今日页面浏览 PV" value={summed?.todayPv} sub="北京时间 00:00 起" emptyLabel={busy?'读取中':'未接入'}/>
 <Metric name="历史累计 PV" value={summed?.pv} sub="从统计启用日期开始" emptyLabel={busy?'读取中':'未接入'}/>
 <Metric name="成功处理任务" value={summed?.toolSuccess} sub="由实际完成回调上报" emptyLabel={busy?'读取中':'未接入'}/>
 </section>
 {busy&&<div role="status" className="analytics-card analytics-block"><div className="analytics-skeleton"/><p className="analytics-status">正在读取真实统计数据…</p></div>}
 {error&&<div className="analytics-error analytics-block" role="alert">{error}。未接入真实统计服务前，所有未核实指标均显示「暂无数据」，不会生成演示曲线。<button className="analytics-btn" type="button" onClick={()=>{setRange(r=>r==='7d'?'24h':'7d');}}>重新尝试读取</button></div>}
 <div className="analytics-main"><section className="analytics-card"><div className="analytics-section-heading"><h2>访问趋势</h2><div className="analytics-tabs" role="group" aria-label="趋势时间范围">{ranges.map(([id,title])=><button key={id} aria-pressed={range===id} onClick={()=>setRange(id)}>{title}</button>)}</div></div>{data?<Trend key={range} points={data.trends}/>:<div className="analytics-empty">全站统计接口未接通，暂无趋势数据</div>}<div className="analytics-status">统计时区：北京时间 UTC+8 · {data?'更新于 '+date(data.generatedAt):'尚无更新时间'}</div></section>
 <section className="analytics-card"><div className="analytics-section-heading"><h2>工具使用表现</h2><span className="analytics-pill">从开始到完成</span></div>
 <Metric name="任务开始" value={summed?.toolStarts}/><div style={{height:8}}/><Metric name="成功完成" value={summed?.toolSuccess}/><div style={{height:8}}/><Metric name="任务失败" value={summed?.toolErrors}/><h3 style={{fontSize:12,marginTop:15}}>最近 7 天工具任务趋势</h3>{data?.usageTrend?.length?<div style={{fontSize:12}}>{data.usageTrend.map(p=><div key={p.x} style={{display:'flex',justifyContent:'space-between',gap:8,borderBottom:'1px solid #f0f0f2',padding:'8px 0'}}><span>{formatPoint(p.x)}</span><span>开始 {fmt(p.starts)}　成功 {fmt(p.success)}　失败 {fmt(p.errors)}</span></div>)}</div>:<p className="analytics-muted">暂无真实任务趋势数据</p>}<p className="analytics-muted">总体成功率：<strong>{successRate===null?'暂无数据':successRate+'%'}</strong>。分母为工具任务开始次数；未上报完成的任务不算成功。任务取消或离线可能未产生失败事件。</p></section></div>
 <WebmasterMode/>
 <section className="analytics-card analytics-block"><div className="analytics-section-heading"><h2>工具热度排行榜</h2><span className="analytics-status">按真实成功次数排序 · 所有已识别工具</span></div>
 {data?<div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>排名 / 工具</th><th>打开</th><th>使用开始</th><th>成功</th><th>失败</th></tr></thead><tbody>{ranked.map((item,i)=><tr key={item.id}><td><span className="analytics-rank">{String(i+1).padStart(2,'0')}</span>　<a href={item.path}>{item.name} ↗</a></td><td>{fmt(item.opens)}</td><td>{fmt(item.starts)}</td><td>{fmt(item.success)}</td><td>{fmt(item.errors)}</td></tr>)}</tbody></table></div>:<div className="analytics-empty">暂无工具使用数据</div>}
 </section>
 <div className="analytics-main"><section className="analytics-card"><div className="analytics-section-heading"><h2>最常被成功使用的工具 TOP 10</h2><span className="analytics-pill">不代表满意度</span></div>{!sampleEnough?<div className="analytics-empty">有效完成样本不足（需至少 20 次成功任务）</div>:<div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>工具</th><th>成功次数</th></tr></thead><tbody>{ranked.filter(t=>(t.success||0)>0).slice(0,10).map(t=><tr key={t.id}><td><a href={t.path}>{t.name} ↗</a></td><td>{fmt(t.success)}</td></tr>)}</tbody></table></div>}</section>
 <section className="analytics-card"><div className="analytics-section-heading"><h2>访问地区（仅聚合）</h2><span className="analytics-pill">低样本不公开</span></div>{data?.countries.length?<div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>国家或地区代码</th><th>30 天访客</th></tr></thead><tbody>{data.countries.map(c=><tr key={c.code}><td>{c.code}</td><td>{fmt(c.visitors)}</td></tr>)}</tbody></table></div>:<div className="analytics-empty">暂无符合隐私门槛的地区数据</div>}<p className="analytics-status">仅展示至少 5 位访客的聚合地区，不显示 IP、城市、具体位置。</p></section></div>
 <section className="analytics-card analytics-block"><h2>UV / PV 口径说明</h2>
 <p className="analytics-note"><strong>PV（页面浏览量）</strong>：浏览器上报的页面访问事件次数。同一人刷新 5 次计 5 次 PV。</p>
 <p className="analytics-note"><strong>UV（独立访客）</strong>：去重后的独立浏览器估算数。浏览器生成随机匿名标识并持久保存，服务端用密钥做不可逆 HMAC 标记后去重；不保存原始标识、IP、指纹或实名信息。同一人换浏览器或设备可能被重复计数，因此它是估算，不是精确人数。</p>
 <p className="analytics-note"><strong>今日 / 昨日</strong>：以北京时间（UTC+8）00:00 为日界。跨越午夜的同一访客，分别计入两天的 UV，但在 7 天窗口内只去重计数一次。</p>
 <p className="analytics-note"><strong>此前未采集</strong>：UV 采集自 V17.1 开始；只有 PV、没有访客标识的旧时期，UV 显示「此前未采集」，不会用 PV 估算人数。</p>
 </section>
 <section className="analytics-card analytics-block"><h2>网站成长记录</h2><div className="analytics-empty">暂无经核实、可公开的历史里程碑。不会编造上线日期或访问数字。</div></section>
 <section className="analytics-card"><h2>统计口径与数据透明度</h2>
 <p className="analytics-note">数据提供者：{data?.source||'尚未连接'} · 统计起始：{data?date(data.startDate):'尚未配置'} · UV 采集起始：{data?(data.uvStartDate?date(data.uvStartDate):uvEmptyLabel(data)):'尚未配置'} · 数据更新：{data?date(data.generatedAt):'暂无'}。</p>
 {(data?.collectionNotes||['PV：页面访问计数，不包括资源请求。','UV：只有经过匿名访客识别规则验收后才会显示。','工具开始、成功、失败是互相区分的采集事件；浏览器上报无法作为防作弊的绝对证明。','不上传用户文档正文、图片内容或文件名。统计不可用不影响原有工具。']).map((line,i)=><p key={i} className="analytics-note">{i+1}. {line}</p>)}
 <p className="analytics-note">启用统计后，浏览器通过同域 API 提交页面访问和工具事件。EdgeOne Blob 仅保存事件时间、类型及已登记的工具编号；不保存文件内容、文件名、IP 或原始页面路径。可通过浏览器的「请勿跟踪」设置选择退出。</p></section>
 </main>;
}
