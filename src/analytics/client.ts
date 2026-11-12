/**
 * NOVIP V17.1 · Privacy-first, best-effort telemetry. File names, document
 * contents and user identifiers are never placed in event payloads. Failure
 * must not alter the tool workflow.
 *
 * Visitor identity: a random UUID generated once per browser
 * (crypto.getRandomValues) and kept in localStorage. The raw id is sent to
 * our own server only; the server converts it to an irreversible HMAC mark
 * and never persists the raw id, IP, User-Agent or fingerprint. DNT/GPC is
 * respected (no events at all). If storage is refused, no id is sent — the
 * pageview still counts toward PV but never inflates UV.
 *
 * Webmaster mode: when enabled, this browser sends NOTHING. The flag lives
 * in localStorage, so each browser / incognito window / device is separate.
 */
import {emitImmersionTelemetry} from '../immersive/telemetryBus';
export type AnalyticsEvent='pageview'|'tool_open'|'tool_start'|'tool_success'|'tool_error';
const ENDPOINT='/api/analytics/collect';
const WEBMASTER_ENDPOINT='/api/analytics/webmaster';
const VID_KEY='novip_vid_v1';
const WM_KEY='novip_wm_v1';
const WM_TOKEN_KEY='novip_wm_token_v1';
let lastView='';
let lastViewAt=0;

function randomId(): string{
 try{
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const b=new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
 }catch{
  return 'r'+Math.random().toString(36).slice(2)+Date.now().toString(36);
 }
}

/** First-party anonymous visitor id, or null when storage is unavailable. */
export function getVisitorId(): string|null{
 try{
  let v=localStorage.getItem(VID_KEY);
  if(!v){v=randomId();localStorage.setItem(VID_KEY,v);}
  return v;
 }catch{
  // Storage refused (private mode etc.): keep it honest — no id, no UV.
  return null;
 }
}

export function isWebmasterMode(): boolean{
 try{return localStorage.getItem(WM_KEY)==='1';}
 catch{return false;}
}

function webmasterToken(): string|null{
 try{return localStorage.getItem(WM_TOKEN_KEY);}
 catch{return null;}
}

export function disableWebmasterMode(): void{
 try{localStorage.removeItem(WM_KEY);localStorage.removeItem(WM_TOKEN_KEY);}
 catch{/* ignore */}
}

/**
 * Verify the webmaster secret with the server and enable webmaster mode.
 * The secret is never stored; only the derived daily token is kept.
 */
export async function enableWebmasterMode(secret: string): Promise<{ok:boolean;error?:string}>{
 try{
  const res=await fetch(WEBMASTER_ENDPOINT,{method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({secret}),credentials:'omit',mode:'same-origin'});
  const data=await res.json().catch(()=>null) as {ok?:boolean;token?:string;error?:string}|null;
  if(res.ok&&data&&data.ok&&typeof data.token==='string'){
   try{
    localStorage.setItem(WM_KEY,'1');
    localStorage.setItem(WM_TOKEN_KEY,data.token);
   }catch{/* flag not persisted; still report ok */}
   return {ok:true};
  }
  if(res.status===503)return {ok:false,error:'服务端尚未配置站长验证（环境变量缺失）'};
  return {ok:false,error:'密钥不正确'};
 }catch{
  return {ok:false,error:'网络异常，请稍后重试'};
 }
}

function shouldTrack(): boolean{
 if(isWebmasterMode())return false;
 try{
  if(navigator.doNotTrack==='1')return false;
  if((navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl)return false;
 }catch{/* ignore */}
 return true;
}

export function trackAnalytics(type:AnalyticsEvent,toolId?:string):void {
 try {
  if(!shouldTrack())return;
  const path=location.pathname==='/'&&location.hash?'/#'+location.hash.replace(/^#/,''):location.pathname;
  if(type==='pageview'){
   const now=Date.now();
   if(path===lastView&&now-lastViewAt<3000)return; // React StrictMode double effect.
   lastView=path;lastViewAt=now;
  }
  const vid=getVisitorId();
  // eid is always fresh per event; ts pins the event time so a browser-level
  // replay of the identical body overwrites the same server object (idempotent).
  // Distinct events must never share (eid, ts), otherwise PV is undercounted.
  const payload:{type:AnalyticsEvent;toolId?:string;path:string;vid?:string;eid:string;ts:number;wmt?:string}={
   type,toolId,path,
   eid:randomId().replaceAll('-',''),
   ts:Date.now(),
  };
  // No vid when storage is refused: the pageview still counts toward PV,
  // but it never contributes to UV (honest "unidentifiable" handling).
  if(vid)payload.vid=vid;
  const wmt=webmasterToken();
  if(wmt)payload.wmt=wmt;
  void fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(payload),keepalive:true,credentials:'omit',mode:'same-origin'})
   .catch(()=>{/* Analytics never blocks users. */});
 }catch{/* Ignore browsers with restricted APIs. */}
}

/**
 * Tool task lifecycle events for /stats. The server (edge-functions collect /
 * public) has always accepted tool_start / tool_success / tool_error, but no
 * tool ever emitted them, so the public success/failure figures could only
 * come from stale or test traffic. Tools report their real task boundary:
 * start when a user-initiated task begins, success only after the result is
 * actually produced, error when the task fails. Never call success for a
 * mere click or render.
 */
export function trackToolStart(toolId:string):void {
 trackAnalytics('tool_start',toolId);
 emitImmersionTelemetry({code:'TASK.START',label:`本地算力正在处理 [${toolId}] 任务`,energyBoost:0.45});
}
export function trackToolSuccess(toolId:string):void {
 trackAnalytics('tool_success',toolId);
 emitImmersionTelemetry({code:'TASK.DONE',label:`本地处理已完成 [${toolId}] · 零上传导出`,energyBoost:0.75});
}
export function trackToolError(toolId:string):void {trackAnalytics('tool_error',toolId);}
