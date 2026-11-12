/**
 * NOVIP V17.1 · Public aggregates computed only from immutable EdgeOne Blob
 * event objects. No historic traffic is backfilled. Visitor identity is never
 * stored or inferred — UV is the count of distinct HMAC-derived anonymous
 * visitor marks (see collect.js), i.e. an estimate of distinct browsers, not
 * of real-name humans. One person using two browsers/devices may count twice.
 *
 * Performance: complete Beijing days are cached as daily rollups
 * (v1/rollup/YYYY-MM-DD.json). A request reads only the rollups it needs plus
 * the raw events of the current partial day, instead of listing the whole
 * history every time. Missing rollups are backfilled once (bounded by the
 * same 50,000-event honesty cap) and then reused.
 */
const TOOL_IDS=['batch-pdf','materials','ppt','scan','privacy','wishes','handwrite','files','photo','images','background','ocr','references','docx-check','compare','resume','course','sheets','table-clean','lab','grades','cost'];
const TYPES=['tool_open','tool_start','tool_success','tool_error','pageview'];
const TZ='Asia/Shanghai',MAX_EVENTS=50000,MAX_ROLLUPS_PER_READ=400;
const ROLLUP_PREFIX='v1/rollup/';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':status===200?'public, max-age=60, s-maxage=120':'no-store','X-Content-Type-Options':'nosniff'}});
async function storeFor(env,request){if(env?.ANALYTICS_STORE)return env.ANALYTICS_STORE;const host=new URL(request.url).hostname;return (await import('@edgeone/pages-blob')).getStore(host==='novip.site'?'novip-v17-analytics-prod':'novip-v17-analytics-preview');}
const dayStart=ms=>{const d=new Date(ms+28800000);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-28800000;};
const beijingDate=ms=>{const d=new Date(ms+28800000);return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');};
const utcDir=ms=>{const d=new Date(ms);return d.getUTCFullYear()+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+String(d.getUTCDate()).padStart(2,'0');};
const bucket=(ms,unit)=>{
 if(unit==='hour')return new Date(Math.floor(ms/3600000)*3600000).toISOString();
 if(unit==='month'){const d=new Date(ms+28800000);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)-28800000).toISOString();}
 return new Date(dayStart(ms)).toISOString();
};
function parseRest(rest){
 for(const type of TYPES){
  if(rest===type+'_site'&&type==='pageview')return {type,tool:null};
  if(rest.startsWith(type+'_')&&type!=='pageview'){
   const tool=rest.slice(type.length+1);
   if(TOOL_IDS.includes(tool))return {type,tool};
  }
 }
 return null;
}
// Exported for tests. Returns {ms,type,tool,eid,vh,v} or null.
export function parseEventKey(key,nowMs){
 const now=nowMs===undefined?Date.now():nowMs;
 let m=/^v1\/events\/\d{4}\/\d{2}\/\d{2}\/(\d{13})_(.+)_v2_([a-f0-9]{32})_([a-f0-9]{32}|-)$/.exec(key);
 if(m){
  const ms=Number(m[1]);
  if(!Number.isSafeInteger(ms)||ms>now+60000)return null;
  const r=parseRest(m[2]);
  if(!r)return null;
  return {ms,type:r.type,tool:r.tool,eid:m[3],vh:m[4]==='-'?null:m[4],v:2};
 }
 m=/^v1\/events\/\d{4}\/\d{2}\/\d{2}\/(\d{13})_(.+)_([a-f0-9]{32})$/.exec(key);
 if(m){
  const ms=Number(m[1]);
  if(!Number.isSafeInteger(ms)||ms>now+60000)return null;
  const r=parseRest(m[2]);
  if(!r)return null;
  return {ms,type:r.type,tool:r.tool,eid:null,vh:null,v:1};
 }
 return null;
}
// A day summary: either from a rollup file or aggregated from raw events.
function emptyDay(dateStr){return {v:2,date:dateStr,pv:0,uv:[],tools:{},hours:{},v1:0,v2:0,firstMs:null,uvFirstMs:null};}
function dayFromEvents(dateStr,events){
 const day=emptyDay(dateStr);
 const uvSet=new Set();
 for(const e of events){
  if(e.v===1)day.v1++;else day.v2++;
  if(day.firstMs===null||e.ms<day.firstMs)day.firstMs=e.ms;
  if(e.vh&&(day.uvFirstMs===null||e.ms<day.uvFirstMs))day.uvFirstMs=e.ms;
  if(e.type==='pageview'){
   day.pv++;
   const hh=String(new Date(e.ms+28800000).getUTCHours()).padStart(2,'0');
   const h=day.hours[hh]||(day.hours[hh]={p:0,u:[]});
   h.p++;
   if(e.vh){h.u.push(e.vh);uvSet.add(e.vh);}
  }else{
   const name=e.type+':'+e.tool;
   day.tools[name]=(day.tools[name]||0)+1;
  }
 }
 for(const hh of Object.keys(day.hours))day.hours[hh].u=[...new Set(day.hours[hh].u)];
 day.uv=[...uvSet];
 return day;
}
function mergeDayInto(day,acc){
 acc.pv+=day.pv;
 for(const v of day.uv)acc.uvSet.add(v);
 for(const [k,n] of Object.entries(day.tools))acc.toolCounts.set(k,(acc.toolCounts.get(k)||0)+n);
}
async function readRollup(store,dateStr){
 try{
  const raw=await store.get(ROLLUP_PREFIX+dateStr+'.json');
  if(!raw)return null;
  const d=JSON.parse(raw);
  if(!d||d.v!==2||d.date!==dateStr||!Array.isArray(d.uv))return null;
  return d;
 }catch{return null;}
}
async function writeRollup(store,day){
 try{await store.set(ROLLUP_PREFIX+day.date+'.json',JSON.stringify(day));return true;}
 catch{return false;}
}
/**
 * Pure aggregation over raw events (exported for tests).
 * rollups: Map<beijingDate, daySummary> for complete days already cached.
 */
export function aggregate(parsedEvents,rollups,nowMs){
 const now=nowMs;
 const today0=dayStart(now);
 let first=Infinity,uvStart=null;
 for(const e of parsedEvents){
  if(e.ms<first)first=e.ms;
  if(e.v===2&&e.vh&&(uvStart===null||e.ms<uvStart))uvStart=e.ms;
 }
 for(const day of rollups.values()){
  // Exact bounds recorded in the rollup; fall back to day midnight only for
  // rollups written before V17.1.1.
  const dms=day.firstMs!==null&&day.firstMs!==undefined?day.firstMs:Date.parse(day.date+'T00:00:00+08:00');
  if(day.pv>0&&dms<first)first=dms;
  const udms=day.uvFirstMs!==null&&day.uvFirstMs!==undefined?day.uvFirstMs:(day.uv.length?Date.parse(day.date+'T00:00:00+08:00'):null);
  if(udms!==null&&(uvStart===null||udms<uvStart))uvStart=udms;
 }
 if(first===Infinity)first=now;
 const acc={pv:0,uvSet:new Set(),toolCounts:new Map(),todayPv:0};
 const windows={today:new Set(),yesterday:new Set(),d7:new Set(),d30:new Set()};
 const y0=today0-86400000,d70=today0-6*86400000,d300=today0-29*86400000;
 const addVh=(vh,ms)=>{
  acc.uvSet.add(vh);
  if(ms>=today0)windows.today.add(vh);
  else if(ms>=y0)windows.yesterday.add(vh);
  if(ms>=d70)windows.d7.add(vh);
  if(ms>=d300)windows.d30.add(vh);
 };
 for(const day of rollups.values()){
  mergeDayInto(day,acc);
  const dms=Date.parse(day.date+'T00:00:00+08:00');
  for(const vh of day.uv)addVh(vh,dms+43200000); // midday representative
  if(day.date===beijingDate(today0))acc.todayPv+=day.pv;
 }
 for(const e of parsedEvents){
  if(e.type==='pageview'){
   acc.pv++;
   if(e.ms>=today0)acc.todayPv++;
  }else{
   const name=e.type+':'+e.tool;
   acc.toolCounts.set(name,(acc.toolCounts.get(name)||0)+1);
  }
  if(e.vh)addVh(e.vh,e.ms);
 }
 const uvCount=s=>uvStart===null?null:s.size;
 return {
  first,uvStart,
  pv:acc.pv,todayPv:acc.todayPv,
  uv:uvCount(acc.uvSet),
  today:uvCount(windows.today),yesterday:uvCount(windows.yesterday),
  sevenDays:uvCount(windows.d7),thirtyDays:uvCount(windows.d30),
  toolCounts:acc.toolCounts,
 };
}
function trendPoints(parsedEvents,rollups,now,range,uvStart){
 const periodStart=range==='all'?0:range==='24h'?now-86400000:dayStart(now)-(Number(range.slice(0,-1))-1)*86400000;
 const spanDays=(now-periodStart)/86400000;
 const unit=range==='24h'?'hour':range==='all'&&spanDays>366?'month':'day';
 const buckets=new Map(); // x -> {pv, uvSet, preEra}
 const get=x=>{let b=buckets.get(x);if(!b){b={x,pv:0,uv:new Set(),preEra:true};buckets.set(x,b);}return b;};
 const inWindow=ms=>ms>=periodStart&&ms<=now;
 // From rollups (complete days): expand day/hour summaries into buckets.
 for(const day of rollups.values()){
  const dms=Date.parse(day.date+'T00:00:00+08:00');
  if(unit==='hour'){
   for(const [hh,h] of Object.entries(day.hours)){
    const ms=dms+Number(hh)*3600000;
    if(!inWindow(ms))continue;
    const b=get(bucket(ms,'hour'));
    b.pv+=h.p;b.preEra=false;
    for(const v of h.u)b.uv.add(v);
   }
  }else{
   const ms=dms+43200000;
   if(!inWindow(ms))continue;
   const b=get(bucket(ms,unit));
   b.pv+=day.pv;b.preEra=false;
   for(const v of day.uv)b.uv.add(v);
  }
 }
 for(const e of parsedEvents){
  if(!inWindow(e.ms))continue;
  const b=get(bucket(e.ms,unit));
  if(e.type==='pageview')b.pv++;
  if(e.v===2)b.preEra=false; // v2 era touched this bucket
  if(e.vh)b.uv.add(e.vh);
 }
 const points=[...buckets.values()].sort((a,b)=>a.x.localeCompare(b.x)).map(b=>{
  // UV is null (not zero) when the whole bucket predates UV collection.
  const bucketEndMs=Date.parse(b.x)+(unit==='hour'?3600000:unit==='month'?32*86400000:86400000);
  const uv=uvStart!==null&&bucketEndMs>uvStart?b.uv.size:null;
  return {x:b.x,y:b.pv,uv};
 });
 return {points,unit};
}
export async function onRequestGet({request,env}){
 const now=Date.now(),range=new URL(request.url).searchParams.get('range')||'7d';
 if(!['24h','7d','30d','90d','all'].includes(range))return json({error:'invalid range'},400);
 const uvConfigured=!!(env&&env.ANALYTICS_HMAC_SECRET);
 try{
  const store=await storeFor(env,request);
  const today0=dayStart(now);
  const todayStr=beijingDate(now);
  const rollups=new Map();
  let backfillPending=false;
  // Bounded full history listing; used only when backfill is required.
  async function fullListing(){
   const {blobs}=await store.list({prefix:'v1/events/',consistency:'strong'});
   if(!Array.isArray(blobs)||blobs.length>MAX_EVENTS)throw Error('analytics capacity exceeded');
   return blobs.map(x=>parseEventKey(x.key,now)).filter(e=>e&&e.ms<=now);
  }
  // Compute + persist rollups for the given complete Beijing days from raw events.
  async function backfillFrom(all,days){
   const wanted=[...new Set(days)];
   if(wanted.length>100)backfillPending=true;
   const targets=new Set(wanted.slice(0,100));
   const byDay=new Map();
   for(const e of all){
    if(e.ms>=today0)continue; // the partial current day is never rolled up
    const ds=beijingDate(e.ms);
    if(targets.has(ds)){
     if(!byDay.has(ds))byDay.set(ds,[]);
     byDay.get(ds).push(e);
    }
   }
   await Promise.all([...targets].map(async ds=>{
    const day=dayFromEvents(ds,byDay.get(ds)||[]);
    if(await writeRollup(store,day))rollups.set(ds,day);
   }));
  }
  if(range==='all'){
   // Correctness first for 'all': every complete day with data must be covered.
   const all=await fullListing();
   const daysWithData=new Set();
   for(const e of all)if(e.ms<today0)daysWithData.add(beijingDate(e.ms));
   const existing=new Set();
   try{
    const listed=await store.list({prefix:ROLLUP_PREFIX,consistency:'strong'});
    for(const b of ((listed&&listed.blobs)||[])){
     const m=/^v1\/rollup\/(\d{4}-\d{2}-\d{2})\.json$/.exec(b.key);
     if(m&&m[1]<todayStr)existing.add(m[1]);
    }
   }catch{/* treat as no rollups */}
   const missing=[...daysWithData].filter(ds=>!existing.has(ds)).sort();
   await backfillFrom(all,missing);
   const allDays=[...existing].filter(ds=>ds<todayStr).sort();
   if(allDays.length>MAX_ROLLUPS_PER_READ)throw Error('analytics capacity exceeded');
   await Promise.all(allDays.map(async ds=>{
    if(!rollups.has(ds)){const r=await readRollup(store,ds);if(r)rollups.set(ds,r);}
   }));
  }else{
   // Fast path: read only the rollups the range needs, backfill once if any
   // complete day is missing its rollup.
   const needDays=[];
   if(range==='24h'){needDays.push(beijingDate(today0-86400000));}
   else{const n=Number(range.slice(0,-1));for(let i=1;i<n;i++)needDays.push(beijingDate(today0-i*86400000));}
   if(needDays.length>MAX_ROLLUPS_PER_READ)throw Error('analytics capacity exceeded');
   const missing=[];
   await Promise.all(needDays.map(async ds=>{
    const r=await readRollup(store,ds);
    if(r)rollups.set(ds,r);else missing.push(ds);
   }));
   if(missing.length)await backfillFrom(await fullListing(),missing);
  }
  // Partial current Beijing day: raw events from the UTC dirs it spans.
  // keyMs is clamped to [now-5min, now], so a third prefix covers the rare
  // case where the window straddles a UTC midnight.
  const dirA=utcDir(today0),dirB=utcDir(now),dirC=utcDir(now-300000);
  const prefixes=[...new Set(['v1/events/'+dirA+'/','v1/events/'+dirB+'/','v1/events/'+dirC+'/'])];
  const partialLists=await Promise.all(prefixes.map(p=>store.list({prefix:p,consistency:'strong'})));
  let partialBlobs=[];
  for(const l of partialLists)partialBlobs.push(...((l&&l.blobs)||[]).map(b=>b.key));
  if(partialBlobs.length>MAX_EVENTS)throw Error('analytics capacity exceeded');
  const partialEvents=partialBlobs.map(k=>parseEventKey(k,now)).filter(e=>e&&e.ms>=today0&&e.ms<=now);
  const agg=aggregate(partialEvents,rollups,now);
  const {points:trends}=trendPoints(partialEvents,rollups,now,range,agg.uvStart);
  // usageTrend: last 7 Beijing days tool starts/success/errors.
  const usage=[];
  for(let i=6;i>=0;i--){
   const ds=beijingDate(today0-i*86400000);
   const row={x:new Date((i===0?today0:today0-i*86400000)).toISOString(),starts:0,success:0,errors:0};
   const acc2={starts:0,success:0,errors:0};
   const count=(name,n)=>{if(name.startsWith('tool_start:'))acc2.starts+=n;else if(name.startsWith('tool_success:'))acc2.success+=n;else if(name.startsWith('tool_error:'))acc2.errors+=n;};
   const r=rollups.get(ds);
   if(r)for(const [k,n] of Object.entries(r.tools))count(k,n);
   if(i===0)for(const e of partialEvents){if(e.type!=='pageview')count(e.type+':'+e.tool,1);}
   row.starts=acc2.starts;row.success=acc2.success;row.errors=acc2.errors;
   usage.push(row);
  }
  const tools=TOOL_IDS.map(id=>({id,
   opens:agg.toolCounts.get('tool_open:'+id)||0,
   starts:agg.toolCounts.get('tool_start:'+id)||0,
   success:agg.toolCounts.get('tool_success:'+id)||0,
   errors:agg.toolCounts.get('tool_error:'+id)||0}));
  const sum=k=>tools.reduce((a,t)=>a+t[k],0);
  const uvNote=uvConfigured
   ?(agg.uvStart?'UV 为去重后的独立浏览器估算（第一方匿名标识 + 服务端 HMAC），同一人使用多个浏览器或设备可能被重复计数；不是实名人数。':'UV 采集已配置，尚无访客数据。')
   :'UV 采集未配置（缺少服务端匿名化密钥），UV 指标保持空白；PV 不受影响。';
  return json({status:'ok',source:'EdgeOne Blob',timezone:TZ,generatedAt:new Date(now).toISOString(),
   startDate:new Date(agg.first).toISOString(),
   uvStartDate:agg.uvStart?new Date(agg.uvStart).toISOString():null,
   uvConfigured,range,backfillPending:backfillPending||undefined,
   totals:{pv:agg.pv,todayPv:agg.todayPv,uv:agg.uv,today:agg.today,yesterday:agg.yesterday,
    sevenDays:agg.sevenDays,thirtyDays:agg.thirtyDays,
    toolStarts:sum('starts'),toolSuccess:sum('success'),toolErrors:sum('errors')},
   trends,usageTrend:usage,tools,countries:[],
   collectionNotes:[
    '统计只从 EdgeOne Blob 实际采集的事件开始；既往访问不补造。',
    'PV 是浏览器提交的页面访问事件，不包含图片、字体等静态资源请求。',
    '7 天 / 30 天 / 累计 UV 是整个窗口去重后的独立浏览器数，不是每日 UV 相加。',
    'UV 采集自 V17.1 开始；此前只有 PV 的时期，UV 显示「此前未采集」，不生成估算人数。',
    uvNote,
    '站长测试访问可通过「站长模式」排除；历史数据中无法确认为站长的访问不删除。',
    '任务开始、成功、失败由现有工具工作流分别上报；浏览器遥测不能作为不可伪造的审计。',
    '不保存上传文件、文件名、原始页面路径、完整 IP、原始访客标识或浏览器指纹；仅保存时间、事件类型、允许的工具编号与不可逆的匿名访客标记。',
    '统计可能受浏览器隐私设置、网络丢包和自动化流量影响；DNT/GPC 用户默认不采集。'
   ]});
 }catch(err){return json({error:err&&err.message==='analytics capacity exceeded'?'analytics capacity exceeded':'analytics storage unavailable'},503);}
}
export function onRequestPost(){return json({error:'method not allowed'},405);}
