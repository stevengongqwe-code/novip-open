/**
 * NOVIP V17.1 · Same-origin, minimal telemetry with privacy-friendly UV support.
 * EdgeOne Blob creates the namespace on first use. Each event is an immutable
 * object, so concurrent writes cannot lose increments.
 *
 * V17.1 key format:
 *   v1/events/YYYY/MM/DD/<ms>_<type>_<scope>_v2_<eid32>_<vh>
 *   scope: 'site' for pageview, allowlisted toolId otherwise
 *   eid:   32-hex client event id — identical eid on retry overwrites the same
 *          object, so network retries never double-count.
 *   vh:    32-hex HMAC-SHA256(ANALYTICS_HMAC_SECRET, vid), or '-' when the
 *          visitor id is absent / the secret is not configured. The raw vid,
 *          IP, User-Agent, path and file data are NEVER persisted.
 *
 * V17 keys (…_<rand32>, no _v2_ marker) keep parsing for PV history.
 */
const IDS=new Set(['batch-pdf','materials','ppt','scan','privacy','wishes','handwrite','files','photo','images','background','ocr','references','docx-check','compare','resume','course','sheets','table-clean','lab','grades','cost']);
const TYPES=new Set(['pageview','tool_open','tool_start','tool_success','tool_error']);
const VID_RE=/^[A-Za-z0-9_-]{1,64}$/;
const HEX32_RE=/^[a-f0-9]{32}$/;
const recent=new Map(); // Best-effort in-isolate throttle; WAF remains necessary.
const json=(data,status)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function storeFor(env,request){if(env?.ANALYTICS_STORE)return env.ANALYTICS_STORE;const host=new URL(request.url).hostname;return (await import('@edgeone/pages-blob')).getStore(host==='novip.site'?'novip-v17-analytics-prod':'novip-v17-analytics-preview');}
function permitted(request){
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return false;
 return request.headers.get('sec-fetch-site')!=='cross-site';
}
// Beijing day start (ms), shared with public.js and webmaster.js.
const dayStart=ms=>{const d=new Date(ms+28800000);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-28800000;};
async function hmacHex(secret,msg){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(msg));
 return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function safeEqual(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);
 return d===0;
}
const hmacSecretOf=env=>env?.ANALYTICS_HMAC_SECRET||'';
// Expected webmaster token for a Beijing day; '' when webmaster auth is not configured.
async function expectedWebmasterToken(env,dayMs){
 const wmSecret=env?.NOVIP_WEBMASTER_SECRET||'';
 if(!wmSecret)return '';
 const secret=hmacSecretOf(env)||wmSecret;
 return (await hmacHex(secret,'novip-wm:'+dayMs)).slice(0,32);
}
export async function onRequestPost({request,env}){
 if(!permitted(request))return json({error:'forbidden'},403);
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'content-type'},415);
 const agent=request.headers.get('user-agent')||'';
 if(!agent||/bot|crawler|spider|headless|lighthouse|prerender|curl|wget/i.test(agent))return json({accepted:false},202);
 if(request.headers.get('dnt')==='1'||request.headers.get('sec-gpc')==='1')return json({accepted:false},202);
 if(Number(request.headers.get('content-length')||'0')>2048)return json({error:'payload too large'},413);
 let event;
 try{const body=await request.text();if(body.length>2048)return json({error:'payload too large'},413);event=JSON.parse(body);}
 catch{return json({error:'invalid json'},400);}
 if(!event||!TYPES.has(event.type))return json({error:'invalid type'},400);
 if(event.type!=='pageview'&&!IDS.has(event.toolId))return json({error:'unknown tool'},400);
 if(typeof event.path!=='string'||event.path.length>100||!event.path.startsWith('/')||!Array.from(event.path).every(c=>'abcdefghijklmnopqrstuvwxyz0123456789_/#-'.includes(c)))return json({error:'invalid path'},400);
 // V17.1: optional first-party anonymous visitor id (never persisted raw).
 let vid=null;
 if(event.vid!==undefined&&event.vid!==null){
  if(typeof event.vid!=='string'||!VID_RE.test(event.vid))return json({error:'invalid vid'},400);
  vid=event.vid;
 }
 // V17.1: optional client event id for retry idempotency.
 let eid;
 if(event.eid!==undefined&&event.eid!==null){
  if(typeof event.eid!=='string'||!HEX32_RE.test(event.eid))return json({error:'invalid eid'},400);
  eid=event.eid;
 }else{
  eid=crypto.randomUUID().replaceAll('-','');
 }
 // V17.1: client event timestamp. A browser-level replay resends the identical
 // body, so using the validated ts in the key makes retries overwrite the same
 // object instead of double-counting. Clamped to [now-5min, now]: it only
 // gives the key determinism, never trusted for far-past/future bucketing.
 const now=Date.now();
 let keyMs=now;
 if(event.ts!==undefined&&event.ts!==null){
  if(typeof event.ts!=='number'||!Number.isSafeInteger(event.ts))return json({error:'invalid ts'},400);
  if(event.ts<=now&&event.ts>=now-300000)keyMs=event.ts;
 }
 // V17.1: webmaster exclusion — a valid token means "do not count this".
 if(typeof event.wmt==='string'&&HEX32_RE.test(event.wmt)){
  const today=dayStart(now);
  const okToday=safeEqual(event.wmt,await expectedWebmasterToken(env,today));
  const okYesterday=!okToday&&safeEqual(event.wmt,await expectedWebmasterToken(env,today-86400000));
  if(okToday||okYesterday)return json({accepted:false,webmaster:true},202);
 }
 const clientIp=request.eo?.clientIp;
 const key=(clientIp||agent).slice(0,100);
 const fresh=(recent.get(key)||[]).filter(t=>now-t<60000);
 if(fresh.length>=45)return json({error:'too many events'},429);
 if(recent.size>3000)recent.clear();
 recent.set(key,[...fresh,now]);
 // Irreversible per-visitor mark. Without a server secret there is no UV.
 const secret=hmacSecretOf(env);
 const vh=secret&&vid?(await hmacHex(secret,'novip-vid:'+vid)).slice(0,32):'-';
 // Keys encode only event kind, allowlisted tool, retry id and the anonymous
 // visitor mark. No path, IP, user id, vid or file data persists.
 // The UTC dir follows keyMs so the partial-day listing invariant holds.
 const day=new Date(keyMs).toISOString().slice(0,10).replaceAll('-','/');
 const objectKey='v1/events/'+day+'/'+keyMs+'_'+event.type+'_'+(event.type==='pageview'?'site':event.toolId)+'_v2_'+eid+'_'+vh;
 try{await (await storeFor(env,request)).set(objectKey,'1');return json({accepted:true,uv:vh!=='-'},202);}
 catch{return json({accepted:false},503);}
}
export function onRequestGet(){return json({error:'method not allowed'},405);}
