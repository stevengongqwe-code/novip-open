/**
 * NOVIP V17.1 · Webmaster-mode verification endpoint.
 *
 * POST /api/analytics/webmaster  {secret: string}
 *   -> 200 {ok:true, token}   when the secret matches NOVIP_WEBMASTER_SECRET
 *   -> 403 {ok:false}         when it does not
 *   -> 503 {ok:false, error}  when webmaster auth is not configured
 *
 * The secret itself is never stored client-side and never appears in frontend
 * source: the browser keeps only the derived daily token, and even that is
 * optional — enabling "webmaster mode" in the UI simply stops the browser
 * from sending analytics events at all. The token is a second layer: if an
 * event ever arrives carrying a valid token, collect.js drops it server-side.
 *
 * Tokens rotate with the Beijing day; a token from today or yesterday is
 * accepted by collect.js. Each browser / incognito window / device enables
 * webmaster mode separately.
 */
const HEX32_RE=/^[a-f0-9]{32}$/;
const json=(data,status)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function storeFor(env,request){if(env?.ANALYTICS_STORE)return env.ANALYTICS_STORE;const host=new URL(request.url).hostname;return (await import('@edgeone/pages-blob')).getStore(host==='novip.site'?'novip-v17-analytics-prod':'novip-v17-analytics-preview');}
function permitted(request){
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return false;
 return request.headers.get('sec-fetch-site')!=='cross-site';
}
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
export async function onRequestPost({request,env}){
 if(!permitted(request))return json({error:'forbidden'},403);
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'content-type'},415);
 const wmSecret=env?.NOVIP_WEBMASTER_SECRET||'';
 if(!wmSecret)return json({ok:false,error:'webmaster auth not configured'},503);
 let body;
 try{body=JSON.parse(await request.text());}
 catch{return json({ok:false,error:'invalid json'},400);}
 if(typeof body?.secret!=='string'||!body.secret||body.secret.length>256)return json({ok:false},403);
 if(!safeEqual(body.secret,wmSecret))return json({ok:false},403);
 const hmacSecret=env?.ANALYTICS_HMAC_SECRET||wmSecret;
 const token=(await hmacHex(hmacSecret,'novip-wm:'+dayStart(Date.now()))).slice(0,32);
 if(!HEX32_RE.test(token))return json({ok:false,error:'token failure'},500);
 // Touch the store so a misconfigured namespace surfaces here, not silently.
 try{await (await storeFor(env,request));}catch{return json({ok:false,error:'analytics storage unavailable'},503);}
 return json({ok:true,token},200);
}
export function onRequestGet(){return json({error:'method not allowed'},405);}
