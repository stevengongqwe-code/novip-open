/**
 * Boot recovery P0 regression tests. No fake network retry promises.
 * Run with: node --import tsx --test tests/boot-guards.test.ts
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {isChunkLoadError,nextReloadDecision} from '../src/boot-guards.ts';

const dir=dirname(fileURLToPath(import.meta.url));
const read=(path:string)=>readFileSync(resolve(dir,'..',path),'utf8');

test('classifies module fetch errors without misclassifying normal failures',()=>{
  assert.equal(isChunkLoadError(new Error('Failed to fetch dynamically imported module')),true);
  assert.equal(isChunkLoadError(new Error('Loading chunk 7 failed.')),true);
  assert.equal(isChunkLoadError('importing a module script failed'),true);
  assert.equal(isChunkLoadError(new Error('字体格式不支持')),false);
  assert.equal(isChunkLoadError(new TypeError('Cannot read properties of undefined')),false);
});
test('the first two user reloads are allowed; the third within 5 minutes is blocked',()=>{
  const a=nextReloadDecision(null,1_000_000);
  const b=nextReloadDecision(a.history,1_010_000);
  const c=nextReloadDecision(b.history,1_020_000);
  assert.equal(a.allow,true); assert.equal(b.allow,true); assert.equal(c.allow,false);
});
test('reload budget resets after 5 minutes or a clock rollback',()=>{
  const first=nextReloadDecision(null,1_000_000);
  const expired=nextReloadDecision(first.history,1_301_000);
  const rollback=nextReloadDecision(first.history,999_000);
  assert.deepEqual(expired.history,{count:1,first:1_301_000});
  assert.deepEqual(rollback.history,{count:1,first:999_000});
});

/** Execute the production ES5 watchdog without React, module support or a browser. */
function watchdog(){
  const html=read('index.html');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,'inline ES5 watchdog exists');
  const root={innerHTML:'ORIGINAL ROOT CONTENT'};
  const overlay={style:{display:'none'}};
  const note={textContent:'正在加载工具，请稍候…'};
  const limit={style:{display:'none'}};
  const elems:Record<string,unknown>={
    root,
    'novip-boot-recovery':overlay,
    'novip-boot-note':note,
    'novip-boot-reload-limit':limit,
  };
  const map=new Map<string,string>();
  const timers=new Map<number,()=>void>();
  const events=new Map<string,(event?:unknown)=>void>();
  let reloadCount=0;
  const win:{
    __NOVIP_BOOTED?:boolean;
    __NOVIP_BOOT_FALLBACK?:()=>void;
    __NOVIP_BOOT_SUCCESS?:()=>void;
    __NOVIP_GUARDED_RELOAD?:()=>boolean;
    addEventListener:(name:string,fn:(event?:unknown)=>void)=>void;
    setTimeout:(fn:()=>void,ms:number)=>void;
    sessionStorage:{getItem:(key:string)=>string|null;setItem:(key:string,val:string)=>void};
    location:{reload:()=>void};
  }={
    addEventListener(name,fn){events.set(name,fn);},
    setTimeout(fn,ms){timers.set(ms,fn);},
    sessionStorage:{
      getItem(key){return map.get(key)??null;},
      setItem(key,val){map.set(key,val);},
    },
    location:{reload(){reloadCount++;}},
  };
  runInNewContext(script,{window:win,document:{getElementById:(id:string)=>elems[id]??null},JSON,Date,isFinite});
  return {html,win,root,overlay,note,limit,timers,events,get reloadCount(){return reloadCount;}};
}

test('20-second watchdog shows recovery without clobbering React root',()=>{
  const x=watchdog();
  x.timers.get(9000)?.();
  assert.match(x.note.textContent,/较长/);
  x.timers.get(20000)?.();
  assert.equal(x.overlay.style.display,'block');
  assert.equal(x.root.innerHTML,'ORIGINAL ROOT CONTENT');
  assert.match(x.html,/id="novip-boot-recovery"/);
  assert.doesNotMatch(x.html,/root\.innerHTML\s*=/);
});

test('page-ready signal hides a previously visible recovery panel',()=>{
  const x=watchdog();
  x.win.__NOVIP_BOOT_FALLBACK?.();
  assert.equal(x.overlay.style.display,'block');
  x.win.__NOVIP_BOOT_SUCCESS?.();
  assert.equal(x.overlay.style.display,'none');
  assert.equal(x.win.__NOVIP_BOOTED,true);
  x.timers.get(20000)?.();
  assert.equal(x.overlay.style.display,'none');
});

test('module script load failures or Vite preload errors show fallback before timeout',()=>{
  const x=watchdog();
  x.events.get('error')?.({target:{tagName:'SCRIPT'}});
  x.timers.get(800)?.();
  assert.equal(x.overlay.style.display,'block');
  const y=watchdog();
  y.events.get('vite:preloadError')?.();
  assert.equal(y.overlay.style.display,'block');
});

test('both recovery entry points share ES5 session reload circuit breaker',()=>{
  const x=watchdog();
  assert.equal(x.win.__NOVIP_GUARDED_RELOAD?.(),true);
  assert.equal(x.win.__NOVIP_GUARDED_RELOAD?.(),true);
  assert.equal(x.reloadCount,2);
  assert.equal(x.win.__NOVIP_GUARDED_RELOAD?.(),false);
  assert.equal(x.reloadCount,2);
  assert.equal(x.limit.style.display,'block');
});

test('React signals boot only inside the Suspense page content and uses native lazy',()=>{
  const main=read('src/main.tsx');
  assert.match(main,/\{content\(id\)\}<ReadyWhenPageMounted\/><\/Suspense>/);
  assert.match(main,/function ReadyWhenPageMounted\(\)\{useEffect\(\(\)=>\{signalBooted\(\);\},\[\]\);return null;\}/);
  assert.doesNotMatch(main,/lazyWithRetry|withChunkRetry/);
  assert.doesNotMatch(main,/function Root\(\)\{[^}]*useEffect\(\(\)=>\{signalBooted/);
});

test('static health page remains independent from React and JS',()=>{
  const html=read('public/healthz.html');
  assert.doesNotMatch(html,/<script/i);
  assert.match(html,/服务正常/);
});
