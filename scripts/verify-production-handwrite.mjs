import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join(process.cwd(), 'test-artifacts', 'audit-production-handwrite');
await mkdir(OUT_DIR, { recursive: true });

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9246;
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-prod-handwrite-' + Date.now());

const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  `--user-data-dir=${USER_DATA_DIR}`,
  `--remote-debugging-port=${DEBUG_PORT}`,
  'about:blank'
], { stdio: 'ignore' });

const wait = (ms) => new Promise(r => setTimeout(r, ms));
await wait(1500);

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      if (res.ok) {
        const data = await res.json();
        const page = data.find(t => t.type === 'page') || data[0];
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await wait(300);
  }
  throw new Error('Chrome CDP connection timeout');
}

const wsUrl = await getWsUrl();
const ws = new WebSocket(wsUrl);

await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let msgId = 1;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(msg.error);
    else resolve(msg.result);
  }
};

function send(method, params = {}) {
  const id = msgId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('DOM.enable');

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error('Eval exception: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result?.value;
}

// 1. Mobile iPhone 16 Pro Viewport (390 x 844)
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true
});

const TARGET_URL = 'https://novip.site/tools/handwrite';
console.log(`Navigating to live production: ${TARGET_URL} ...`);
await send('Page.navigate', { url: TARGET_URL });

// Wait for fonts and canvas to render
let loaded = false;
for (let i = 0; i < 50; i++) {
  await wait(600);
  try {
    const status = await evaluate(`
      (() => {
        const select = document.getElementById('font-select');
        const canvas = document.querySelector('.page-holder canvas');
        return {
          optionsCount: select?.querySelectorAll('option').length || 0,
          canvasW: canvas?.width || 0,
          title: document.title
        };
      })()
    `);
    if (status.optionsCount >= 14 && status.canvasW > 0) {
      loaded = true;
      console.log(`Production Handwrite studio ready in ${(i + 1) * 0.6}s! Options: ${status.optionsCount}`);
      break;
    }
  } catch {}
}

if (!loaded) {
  console.warn('Production handwrite did not show >= 14 options or canvas within 30s. Checking current state:');
  const fallback = await evaluate(`({ title: document.title, html: document.body.innerHTML.slice(0, 300) })`);
  console.log(fallback);
  ws.close();
  chromeProc.kill();
  process.exit(1);
}

// Audit initial mobile view
const initialAudit = await evaluate(`
  (() => {
    const fontSelect = document.getElementById('font-select');
    const fonts = Array.from(fontSelect.querySelectorAll('option')).map(o => ({ value: o.value, text: o.text }));
    const paperSelect = document.getElementById('paper-more');
    const papers = Array.from(paperSelect.querySelectorAll('option')).map(o => ({ value: o.value, text: o.text }));
    const quickPapers = Array.from(document.querySelectorAll('.paper-option')).map(b => b.textContent?.trim());
    const inkCount = document.querySelectorAll('.ink').length;
    return {
      url: window.location.href,
      title: document.title,
      fontsCount: fonts.length,
      fonts,
      papersCount: papers.length,
      papers,
      quickPapers,
      inkCount,
      docW: document.documentElement.clientWidth,
      docScrollW: document.documentElement.scrollWidth,
      hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  })()
`);
console.log('Production Audit:', JSON.stringify(initialAudit, null, 2));

const mobileShot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '01-prod-mobile-college-notebook.png'), Buffer.from(mobileShot.data, 'base64'));

// 2. Switch paper to Cornell
console.log('Switching to Cornell paper...');
await evaluate(`
  (() => {
    const btns = Array.from(document.querySelectorAll('.paper-option'));
    const btn = btns.find(b => b.textContent?.includes('康奈尔'));
    if (btn) btn.click();
  })()
`);
await wait(1500);

const cornellShot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '02-prod-mobile-cornell.png'), Buffer.from(cornellShot.data, 'base64'));

// 3. Switch paper to Kraft Paper
console.log('Switching to Kraft paper...');
await evaluate(`
  (() => {
    const btns = Array.from(document.querySelectorAll('.paper-option'));
    const btn = btns.find(b => b.textContent?.includes('牛皮纸'));
    if (btn) btn.click();
  })()
`);
await wait(1500);

const kraftShot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '03-prod-mobile-kraft.png'), Buffer.from(kraftShot.data, 'base64'));

// 4. Switch to Zhi Mang Xing font & University Stationery paper
console.log('Switching to Zhi Mang Xing (志莽行书) & University Stationery...');
await evaluate(`
  (() => {
    const paperSelect = document.getElementById('paper-more');
    paperSelect.value = 'stationery';
    paperSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const fontSelect = document.getElementById('font-select');
    fontSelect.value = 'zhimang';
    fontSelect.dispatchEvent(new Event('change', { bubbles: true }));
  })()
`);
await wait(2500);

const stationeryShot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '04-prod-mobile-stationery-zhimang.png'), Buffer.from(stationeryShot.data, 'base64'));

// 5. Switch to Klee One & Blue-Black ink
console.log('Switching to Klee One & Blue-black ink...');
await evaluate(`
  (() => {
    const fontSelect = document.getElementById('font-select');
    fontSelect.value = 'klee';
    fontSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const paperSelect = document.getElementById('paper-more');
    paperSelect.value = 'college-notebook';
    paperSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const inks = Array.from(document.querySelectorAll('.ink'));
    if (inks.length > 1) inks[1].click();
  })()
`);
await wait(2500);

const kleeShot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '05-prod-mobile-klee-blueblack.png'), Buffer.from(kleeShot.data, 'base64'));

// 6. Desktop Audit
console.log('Capturing Desktop Viewport...');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 2,
  mobile: false
});
await wait(1500);

const desktopShot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '06-prod-desktop-handwrite.png'), Buffer.from(desktopShot.data, 'base64'));

await writeFile(path.join(OUT_DIR, 'production-audit-summary.json'), JSON.stringify(initialAudit, null, 2));

console.log('Production live visual verification complete! Saved to', OUT_DIR);

ws.close();
chromeProc.kill();
process.exit(0);
