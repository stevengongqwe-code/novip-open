import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequestPost as collect} from '../edge-functions/api/analytics/collect.js';
import {onRequestGet as getPublic,parseEventKey,aggregate} from '../edge-functions/api/analytics/public.js';
import {onRequestPost as webmaster} from '../edge-functions/api/analytics/webmaster.js';
import {tools} from '../src/tools/registry.ts';

const HMAC_SECRET='test-hmac-secret-171';
const WM_SECRET='test-webmaster-secret-171';
const dayStart=ms=>{const d=new Date(ms+28800000);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-28800000;};
async function hmacHex(secret,msg){
 const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=await webcrypto.subtle.sign('HMAC',key,new TextEncoder().encode(msg));
 return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function mockStore(){
 const objects=new Map();
 const calls=[];
 return {objects,calls,
  async set(key,value){objects.set(key,value);calls.push(['set',key]);},
  async get(key){calls.push(['get',key]);return objects.has(key)?objects.get(key):null;},
  async list({prefix}){calls.push(['list',prefix]);return {blobs:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}};
}
function eventRequest(event,origin='https://novip.site'){
 return new Request('https://novip.site/api/analytics/collect',{method:'POST',
  headers:{'Content-Type':'application/json','User-Agent':'Mozilla/5.0 Test','Sec-Fetch-Site':'same-origin',Origin:origin},
  body:JSON.stringify(event)});
}
const publicRequest=range=>new Request('https://novip.site/api/analytics/public?range='+range);
const secEnv=store=>({ANALYTICS_STORE:store,ANALYTICS_HMAC_SECRET:HMAC_SECRET,NOVIP_WEBMASTER_SECRET:WM_SECRET});

test('reject cross-origin, unknown event, and sensitive file path',async()=>{
 const env={ANALYTICS_STORE:mockStore()};
 assert.equal((await collect({request:eventRequest({type:'pageview',path:'/'},'https://evil.test'),env})).status,403);
 assert.equal((await collect({request:eventRequest({type:'tool_success',toolId:'fake',path:'/'}),env})).status,400);
 assert.equal((await collect({request:eventRequest({type:'pageview',path:'/secret?filename=id.pdf'}),env})).status,400);
 assert.equal(env.ANALYTICS_STORE.objects.size,0);
});

test('real immutable writes are aggregated without exposing identity',async()=>{
 const store=mockStore(),env={ANALYTICS_STORE:store};
 for(const event of [
  {type:'pageview',path:'/'},{type:'pageview',path:'/stats'},
  {type:'tool_open',toolId:'files',path:'/tools/files'},
  {type:'tool_start',toolId:'files',path:'/tools/files'},
  {type:'tool_success',toolId:'files',path:'/tools/files'}
 ]){
  const result=await collect({request:eventRequest(event),env});
  assert.equal(result.status,202);
  assert.equal((await result.json()).accepted,true);
 }
 assert.equal(store.objects.size,5);
 assert.equal([...store.objects.keys()].some(x=>x.includes('tools/files')||x.includes('Mozilla')),false);
 const response=await getPublic({request:publicRequest('7d'),env});
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.source,'EdgeOne Blob');
 assert.deepEqual([data.totals.pv,data.totals.toolStarts,data.totals.toolSuccess],[2,1,1]);
 assert.equal(data.tools.find(x=>x.id==='files').opens,1);
 assert.equal(data.totals.uv,null); // no HMAC secret -> no UV, honest null
 assert.equal(data.uvConfigured,false);
 assert.deepEqual(data.countries,[]);
 assert.equal(data.trends.reduce((n,x)=>n+x.y,0),2);
 assert.ok(data.trends.every(p=>p.uv===null));
});

test('missing storage returns 503, never invented zero',async()=>{
 const response=await getPublic({request:publicRequest('7d'),env:{ANALYTICS_STORE:{async list(){throw Error('offline');}}}});
 assert.equal(response.status,503);
});

test('bot, DNT and GPC events are not stored',async()=>{
 const store=mockStore(),env={ANALYTICS_STORE:store};
 const dnt=eventRequest({type:'pageview',path:'/'});
 dnt.headers.set('DNT','1');
 assert.equal((await collect({request:dnt,env})).status,202);
 const gpc=eventRequest({type:'pageview',path:'/'});
 gpc.headers.set('Sec-GPC','1');
 assert.equal((await collect({request:gpc,env})).status,202);
 assert.equal(store.objects.size,0);
});

test('registered tool IDs are unique and stable',()=>{
 const ids=tools.map(t=>t.id);
 assert.ok(ids.length>=36,`工具数不应少于 36，实际 ${ids.length}`);
 assert.equal(new Set(ids).size,ids.length);
});

// ---- V17.1: UV ----

test('V17.1: same browser 5 pageviews -> PV grows, UV stays 1',async()=>{
 const store=mockStore(),env=secEnv(store);
 const vid='visitor-aaaa-1111';
 for(let i=0;i<5;i++){
  const r=await collect({request:eventRequest({type:'pageview',path:'/',vid,eid:('a'.repeat(31))+i}),env});
  assert.equal(r.status,202);
  assert.equal((await r.json()).uv,true);
 }
 const data=await (await getPublic({request:publicRequest('7d'),env})).json();
 assert.equal(data.totals.pv,5);
 assert.equal(data.totals.today,1);
 assert.equal(data.totals.sevenDays,1);
 assert.equal(data.totals.uv,1);
 assert.equal(data.uvConfigured,true);
 assert.ok(typeof data.uvStartDate==='string');
});

test('V17.1: distinct browsers count as distinct UVs',async()=>{
 const store=mockStore(),env=secEnv(store);
 for(const vid of ['v-one','v-two','v-three']){
  const r=await collect({request:eventRequest({type:'pageview',path:'/',vid}),env});
  assert.equal(r.status,202);
 }
 const data=await (await getPublic({request:publicRequest('7d'),env})).json();
 assert.equal(data.totals.pv,3);
 assert.equal(data.totals.today,3);
});

test('V17.1: raw vid is never persisted; stored mark is HMAC',async()=>{
 const store=mockStore(),env=secEnv(store);
 const vid='my-secret-visitor-xyz';
 await collect({request:eventRequest({type:'pageview',path:'/',vid}),env});
 const keys=[...store.objects.keys()];
 assert.equal(keys.length,1);
 assert.ok(!keys[0].includes(vid),'raw vid leaked into key');
 const expectVh=(await hmacHex(HMAC_SECRET,'novip-vid:'+vid)).slice(0,32);
 assert.ok(keys[0].endsWith('_'+expectVh),'key must carry the HMAC mark, not the raw vid');
 const parsed=parseEventKey(keys[0]);
 assert.equal(parsed.vh,expectVh);
 assert.equal(parsed.v,2);
});

test('V17.1: malformed vid/eid are rejected, storage failure is 503',async()=>{
 const store=mockStore(),env=secEnv(store);
 assert.equal((await collect({request:eventRequest({type:'pageview',path:'/',vid:'bad vid!!'}),env})).status,400);
 assert.equal((await collect({request:eventRequest({type:'pageview',path:'/',eid:'xyz'}),env})).status,400);
 assert.equal(store.objects.size,0);
 const broken={ANALYTICS_STORE:{async set(){throw Error('down');},async list(){return {blobs:[]};},async get(){return null;}}};
 const r=await collect({request:eventRequest({type:'pageview',path:'/'}),env:broken});
 assert.equal(r.status,503);
 assert.equal((await r.json()).accepted,false);
});

test('V17.1: network retry with identical eid is idempotent',async()=>{
 const store=mockStore(),env=secEnv(store);
 // A browser-level replay resends the identical body (same eid AND ts).
 const body={type:'pageview',path:'/',vid:'retry-u',eid:'b'.repeat(32),ts:Date.now()};
 for(let i=0;i<3;i++){
  const r=await collect({request:eventRequest(body),env});
  assert.equal((await r.json()).accepted,true);
 }
 assert.equal(store.objects.size,1);
 const data=await (await getPublic({request:publicRequest('7d'),env})).json();
 assert.equal(data.totals.pv,1);
});

// ---- V17.1: webmaster mode ----

async function webmasterTokenForNow(){
 return (await hmacHex(HMAC_SECRET,'novip-wm:'+dayStart(Date.now()))).slice(0,32);
}

test('V17.1: webmaster verify endpoint issues token; wrong secret rejected',async()=>{
 const env=secEnv(mockStore());
 const post=secret=>new Request('https://novip.site/api/analytics/webmaster',{method:'POST',
  headers:{'Content-Type':'application/json','Sec-Fetch-Site':'same-origin',Origin:'https://novip.site'},
  body:JSON.stringify({secret})});
 const okRes=await webmaster({request:post(WM_SECRET),env});
 assert.equal(okRes.status,200);
 const ok=await okRes.json();
 assert.equal(ok.ok,true);
 assert.match(ok.token,/^[a-f0-9]{32}$/);
 assert.equal(ok.token,await webmasterTokenForNow());
 const badRes=await webmaster({request:post('wrong'),env});
 assert.equal(badRes.status,403);
 assert.equal((await badRes.json()).ok,false);
 const unconf=await webmaster({request:post('x'),env:{ANALYTICS_STORE:mockStore()}});
 assert.equal(unconf.status,503);
});

test('V17.1: events carrying a valid webmaster token are excluded',async()=>{
 const store=mockStore(),env=secEnv(store);
 const wmt=await webmasterTokenForNow();
 const r=await collect({request:eventRequest({type:'pageview',path:'/',vid:'boss',wmt}),env});
 assert.equal(r.status,202);
 const body=await r.json();
 assert.equal(body.accepted,false);
 assert.equal(body.webmaster,true);
 assert.equal(store.objects.size,0);
 // A forged/expired token does not exclude and does not break collection.
 const r2=await collect({request:eventRequest({type:'pageview',path:'/',vid:'boss',wmt:'0'.repeat(32)}),env});
 assert.equal((await r2.json()).accepted,true);
 assert.equal(store.objects.size,1);
});

// ---- V17.1: history, midnight boundary, rollups ----

test('V17.1: legacy V17 PV is preserved; its UV stays null (此前未采集)',async()=>{
 const store=mockStore(),env=secEnv(store);
 // Simulate a V17-era event (old key format, no visitor mark).
 const oldMs=Date.now()-3*86400000;
 const oldKey='v1/events/2026/10/15/'+oldMs+'_pageview_site_'+'c'.repeat(32);
 await store.set(oldKey,'1');
 // And a V17.1 event today.
 await collect({request:eventRequest({type:'pageview',path:'/',vid:'newbie'}),env});
 const data=await (await getPublic({request:publicRequest('30d'),env})).json();
 assert.equal(data.totals.pv,2); // old PV preserved
 assert.equal(data.totals.uv,1); // only the identifiable era counts
 assert.equal(data.totals.thirtyDays,1);
 const oldBucket=data.trends.find(p=>p.y>=1&&p.uv===null);
 assert.ok(oldBucket,'pre-UV bucket must report uv:null, not an estimate');
 assert.ok(data.collectionNotes.some(n=>n.includes('此前未采集')));
});

test('V17.1: same visitor across Beijing midnight counts per-day but dedupes 7d',async()=>{
 const store=mockStore(),env=secEnv(store);
 const T1=Date.UTC(2026,9,20,15,59,30); // 2026-10-20 23:59:30 CST
 const T2=Date.UTC(2026,9,20,16,1,0);  // 2026-10-21 00:01:00 CST
 mock.timers.enable({apis:['Date'],now:T1});
 try{
  await collect({request:eventRequest({type:'pageview',path:'/',vid:'night-owl'}),env});
  mock.timers.setTime(T2);
  await collect({request:eventRequest({type:'pageview',path:'/',vid:'night-owl'}),env});
  const data=await (await getPublic({request:publicRequest('7d'),env})).json();
  assert.equal(data.totals.pv,2);
  assert.equal(data.totals.today,1);
  assert.equal(data.totals.yesterday,1);
  assert.equal(data.totals.sevenDays,1); // deduped across the window, not summed
 }finally{mock.timers.reset();}
});

test('V17.1: daily rollup is written once then reused (no full re-list)',async()=>{
 const store=mockStore(),env=secEnv(store);
 // Seed a complete-day event for yesterday (raw key, bypassing collect clock).
 const yMs=dayStart(Date.now())-3600000;
 const dir=new Date(yMs).toISOString().slice(0,10).replaceAll('-','/');
 await store.set('v1/events/'+dir+'/'+yMs+'_pageview_site_v2_'+'d'.repeat(32)+'_'+'e'.repeat(32),'1');
 await collect({request:eventRequest({type:'pageview',path:'/',vid:'today-u'}),env});
 const before=store.calls.filter(c=>c[0]==='list'&&c[1]==='v1/events/').length;
 const d1=await (await getPublic({request:publicRequest('7d'),env})).json();
 assert.equal(d1.totals.pv,2);
 const rollupKeys=[...store.objects.keys()].filter(k=>k.startsWith('v1/rollup/'));
 assert.ok(rollupKeys.length>=1,'rollup should be backfilled');
 const listsAfterFirst=store.calls.filter(c=>c[0]==='list'&&c[1]==='v1/events/').length;
 assert.ok(listsAfterFirst>before,'first request backfills via full listing');
 const d2=await (await getPublic({request:publicRequest('7d'),env})).json();
 assert.deepEqual([d2.totals.pv,d2.totals.uv],[d1.totals.pv,d1.totals.uv]);
 const fullLists=store.calls.filter(c=>c[0]==='list'&&c[1]==='v1/events/').length;
 assert.equal(fullLists,listsAfterFirst,'second request must not re-list full history');
});

test('V17.1: public JSON matches the documented contract',async()=>{
 const store=mockStore(),env=secEnv(store);
 await collect({request:eventRequest({type:'pageview',path:'/',vid:'shape-u'}),env});
 await collect({request:eventRequest({type:'tool_success',toolId:'files',path:'/',vid:'shape-u'}),env});
 for(const range of ['24h','7d','30d','90d','all']){
  const res=await getPublic({request:publicRequest(range),env});
  assert.equal(res.status,200);
  const d=await res.json();
  assert.equal(d.status,'ok');
  assert.equal(d.source,'EdgeOne Blob');
  assert.equal(d.timezone,'Asia/Shanghai');
  for(const k of ['pv','todayPv','uv','today','yesterday','sevenDays','thirtyDays','toolStarts','toolSuccess','toolErrors'])
   assert.ok(k in d.totals,'missing totals.'+k);
  assert.ok(Array.isArray(d.trends)&&d.trends.every(p=>typeof p.x==='string'&&typeof p.y==='number'&&('uv' in p)));
  assert.ok(Array.isArray(d.tools)&&d.tools.length===22);
  assert.ok(Array.isArray(d.collectionNotes)&&d.collectionNotes.length>0);
  assert.equal(typeof d.uvConfigured,'boolean');
  assert.ok('uvStartDate' in d);
 }
});

test('V17.1: capacity cap is an honest 503, never silent truncation',async()=>{
 const store=mockStore();
 for(let i=0;i<50001;i++)store.objects.set('v1/events/2026/10/18/'+(1700000000000+i)+'_pageview_site_'+String(i).padStart(32,'0'),'1');
 const res=await getPublic({request:publicRequest('7d'),env:{ANALYTICS_STORE:store}});
 assert.equal(res.status,503);
});
