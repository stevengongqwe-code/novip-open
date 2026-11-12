#!/usr/bin/env node
/**
 * browser-audit.mjs — NOVIP 真实 Chrome（headless + CDP）移动端验收脚本（Batch1 引入）。
 *
 * 用法：
 *   1) 启动 Chrome：
 *      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *        --headless=new --remote-debugging-port=9333 \
 *        --user-data-dir=/tmp/dsh-chrome-qa --no-first-run --disable-gpu about:blank &
 *   2) node scripts/browser-audit.mjs <baseUrl> <cases.json> <outDir> [width] [height]
 *      （CDP 端口默认 9333，可用环境变量 CDP_PORT 覆盖；file 步骤支持相对 cwd 的路径）
 *
 * cases.json 结构：
 *   [{
 *     "name": "text-stats",
 *     "path": "/tools/text",
 *     "settleMs": 1200,
 *     "steps": [
 *       {"eval": "document.querySelector('textarea').value='abc';document.querySelector('textarea').dispatchEvent(new Event('input',{bubbles:true}))"},
 *       {"file": {"selector": "input[type=file]", "files": ["/tmp/a.png", "/tmp/b.png"]}},
 *       {"clickText": "计算"},
 *       {"clickSelector": "select"},
 *       {"wait": 400}
 *     ],
 *     "assert": "(() => { const t=document.body.innerText; return {pass:t.includes('结果'), detail:t.slice(0,80)}; })()"
 *   }]
 *
 * 输出：<outDir>/report.json + <outDir>/<name>.png
 * 只做本地只读/交互验收，不向服务器提交数据（页面本身无网络请求）。
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [, , baseUrl = 'http://127.0.0.1:4173', casesPath, outDir = 'test-artifacts/browser-audit', widthArg, heightArg] = process.argv;
if (!casesPath || !existsSync(casesPath)) {
  console.error('usage: node qa-run.mjs <baseUrl> <cases.json> <outDir> [width] [height]');
  process.exit(2);
}
const width = Number(widthArg ?? 390);
const height = Number(heightArg ?? 844);
const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CDP_PORT = process.env.CDP_PORT || '9333';

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* Chrome 尚未就绪 */ }
    await sleep(500);
  }
  throw new Error(`无法连接 Chrome CDP ${CDP_PORT}`);
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 0;
let consoleErrors = [];
let pageErrors = [];
let failedRequests = [];

const wsOpen = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    pageErrors.push((msg.params.exceptionDetails?.exception?.description ?? 'unknown').slice(0, 300));
  }
  if (msg.method === 'Network.loadingFailed') {
    const { errorText, type } = msg.params;
    if (type !== 'Image') failedRequests.push(`${type}:${errorText}`);
  }
  if (msg.method === 'Network.responseReceived') {
    const { response } = msg.params;
    if (response.status >= 400 && response.status !== 404) failedRequests.push(`${response.status} ${response.url.slice(0, 120)}`);
    if (response.status === 404) failedRequests.push(`404 ${response.url.slice(0, 120)}`);
  }
};
await wsOpen;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('DOM.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Network.setCacheDisabled', { cacheDisabled: true });

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (res.exceptionDetails) {
    const d = res.exceptionDetails;
    throw new Error(d.exception?.description ?? d.text ?? 'evaluate failed');
  }
  return res.result?.value;
}

async function setFiles(selector, files) {
  const { root } = await send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) throw new Error('找不到文件输入框: ' + selector);
  const resolved = files.map((f) => (f.startsWith('/') ? f : join(process.cwd(), f)));
  await send('DOM.setFileInputFiles', { nodeId, files: resolved });
}

function collectMetrics() {
  return evaluate(`(() => {
    const vw = window.innerWidth;
    const doc = document.documentElement;
    const visible = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const overflows = [...document.querySelectorAll('body *')].filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.right > vw + 1 || r.left < -1)
      .slice(0, 8)
      .map(({ el, r }) => ({ tag: el.tagName, cls: String(el.className || '').slice(0, 50), left: Math.round(r.left), right: Math.round(r.right) }));
    const smallTargets = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')].filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 24 || r.width < 24)
      .slice(0, 8)
      .map(({ el, r }) => ({ tag: el.tagName, text: (el.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }));
    const resources = performance.getEntriesByType('resource');
    return {
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim() ?? '',
      scrollWidth: doc.scrollWidth,
      innerWidth: vw,
      horizontalOverflow: doc.scrollWidth > vw + 1,
      overflows,
      smallTargets,
      buttons: document.querySelectorAll('button').length,
      fileInputs: document.querySelectorAll('input[type=file]').length,
      canvases: document.querySelectorAll('canvas').length,
      totalTransferKB: Math.round(resources.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
      fetchCount: resources.filter((r) => r.initiatorType === 'fetch').length,
      readyState: document.readyState,
    };
  })()`);
}

const results = [];
for (const c of cases) {
  consoleErrors = [];
  pageErrors = [];
  failedRequests = [];
  const url = baseUrl.replace(/\/$/, '') + (c.path ?? '/');
  let error = null;
  const actionLog = [];
  try {
    await send('Page.navigate', { url });
    await sleep(c.settleMs ?? 1500);
    for (const step of c.steps ?? []) {
      if (step.eval) { actionLog.push({ eval: step.eval.slice(0, 80), value: await evaluate(step.eval) }); }
      else if (step.wait) { await sleep(step.wait); actionLog.push({ wait: step.wait }); }
      else if (step.file) { await setFiles(step.file.selector, step.file.files); actionLog.push({ file: step.file.selector }); }
      else if (step.clickText) {
        const clicked = await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes(${JSON.stringify(step.clickText)})); if(!b) return false; b.click(); return true; })()`);
        actionLog.push({ clickText: step.clickText, clicked });
        if (!clicked) throw new Error('找不到按钮: ' + step.clickText);
        await sleep(step.afterMs ?? 400);
      } else if (step.clickSelector) {
        const clicked = await evaluate(`(() => { const b=document.querySelector(${JSON.stringify(step.clickSelector)}); if(!b) return false; b.click(); return true; })()`);
        actionLog.push({ clickSelector: step.clickSelector, clicked });
        if (!clicked) throw new Error('找不到元素: ' + step.clickSelector);
        await sleep(step.afterMs ?? 400);
      } else if (step.upload) {
        actionLog.push({ upload: step.upload });
        await evaluate(step.upload);
      }
    }
    await sleep(300);
    const metrics = await collectMetrics();
    let assertion = null;
    if (c.assert) {
      assertion = await evaluate(c.assert);
      if (assertion && typeof assertion === 'object' && 'pass' in assertion) {
        assertion = { pass: !!assertion.pass, detail: String(assertion.detail ?? '').slice(0, 500) };
      } else {
        assertion = { pass: !!assertion, detail: String(assertion).slice(0, 500) };
      }
    }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(outDir, c.name + '.png'), Buffer.from(shot.data, 'base64'));
    results.push({ name: c.name, url, metrics, actionLog, assertion, consoleErrors, pageErrors, failedRequests: [...new Set(failedRequests)] });
  } catch (e) {
    error = String(e?.message ?? e).slice(0, 500);
    results.push({ name: c.name, url, error, actionLog, consoleErrors, pageErrors, failedRequests: [...new Set(failedRequests)] });
  }
  const r = results[results.length - 1];
  console.log(JSON.stringify({
    name: r.name,
    ok: !r.error && (!r.assertion || r.assertion.pass) && (r.consoleErrors?.length ?? 0) === 0 && (r.pageErrors?.length ?? 0) === 0 && !r.metrics?.horizontalOverflow,
    error: r.error ?? null,
    assertion: r.assertion ?? null,
    overflow: r.metrics?.horizontalOverflow ?? null,
    consoleErrors: r.consoleErrors?.length ?? 0,
    pageErrors: r.pageErrors?.length ?? 0,
    failedRequests: r.failedRequests?.length ?? 0,
    h1: r.metrics?.h1 ?? null,
  }));
}

writeFileSync(join(outDir, 'report.json'), JSON.stringify({ baseUrl, viewport: `${width}x${height}@3`, auditedAt: new Date().toISOString(), results }, null, 2));
const bad = results.filter((r) => r.error || (r.assertion && !r.assertion.pass) || r.consoleErrors?.length || r.pageErrors?.length || r.metrics?.horizontalOverflow);
console.log(`\n[qa-run] ${results.length - bad.length}/${results.length} cases passed. report: ${join(outDir, 'report.json')}`);
if (bad.length) { console.log('[qa-run] failures:', bad.map((b) => b.name).join(', ')); process.exitCode = 1; }
ws.close();
