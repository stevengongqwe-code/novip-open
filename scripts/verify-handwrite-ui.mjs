import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join(process.cwd(), 'test-artifacts', 'audit-handwrite-v2');
await mkdir(OUT_DIR, { recursive: true });

console.log('Starting Vite preview server on port 4180...');
const previewProc = spawn('npx', ['vite', 'preview', '--port', '4180', '--host', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: 'ignore'
});

const wait = (ms) => new Promise(r => setTimeout(r, ms));

let ready = false;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch('http://127.0.0.1:4180/');
    if (res.ok) {
      ready = true;
      break;
    }
  } catch {
    await wait(300);
  }
}

if (!ready) {
  previewProc.kill();
  console.error('Failed to start preview server on port 4180');
  process.exit(1);
}
console.log('Preview server ready.');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9245;
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-handwrite-' + Date.now());

const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  `--user-data-dir=${USER_DATA_DIR}`,
  `--remote-debugging-port=${DEBUG_PORT}`,
  'about:blank'
], { stdio: 'ignore' });

await wait(1200);

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

console.log('Navigating to http://127.0.0.1:4180/tools/handwrite ...');
await send('Page.navigate', { url: 'http://127.0.0.1:4180/tools/handwrite' });

// Wait for fonts and canvas to render
let loaded = false;
for (let i = 0; i < 40; i++) {
  await wait(500);
  const status = await evaluate(`
    (() => {
      const select = document.getElementById('font-select');
      const canvas = document.querySelector('.page-holder canvas');
      return {
        optionsCount: select?.querySelectorAll('option').length || 0,
        canvasW: canvas?.width || 0,
        hasError: !!document.querySelector('.message.error')
      };
    })()
  `);
  if (status.optionsCount >= 14 && status.canvasW > 0) {
    loaded = true;
    console.log(`Handwrite studio ready in ${(i + 1) * 0.5}s! Options: ${status.optionsCount}`);
    break;
  }
}

if (!loaded) {
  throw new Error('Handwrite studio failed to load within 20s');
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
console.log('Handwrite Studio Audit:', {
  fontsCount: initialAudit.fontsCount,
  papersCount: initialAudit.papersCount,
  quickPapers: initialAudit.quickPapers,
  inkCount: initialAudit.inkCount,
  hasOverflow: initialAudit.hasOverflow
});

const mobileShot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '01-mobile-college-notebook.png'), Buffer.from(mobileShot.data, 'base64'));

// 2. Test Paper Switching: Cornell Notes (康奈尔笔记纸)
console.log('Switching paper to cornell (康奈尔笔记)...');
await evaluate(`
  (() => {
    const btns = Array.from(document.querySelectorAll('.paper-option'));
    const cornellBtn = btns.find(b => b.textContent?.includes('康奈尔'));
    if (cornellBtn) cornellBtn.click();
  })()
`);
await wait(1200);

const cornellShot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '02-mobile-cornell-notes.png'), Buffer.from(cornellShot.data, 'base64'));

// 3. Test Paper Switching: Vintage Kraft Paper (复古牛皮纸)
console.log('Switching paper to kraft (复古牛皮纸)...');
await evaluate(`
  (() => {
    const btns = Array.from(document.querySelectorAll('.paper-option'));
    const kraftBtn = btns.find(b => b.textContent?.includes('牛皮纸'));
    if (kraftBtn) kraftBtn.click();
  })()
`);
await wait(1200);

const kraftShot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '03-mobile-kraft-paper.png'), Buffer.from(kraftShot.data, 'base64'));

// 4. Test Paper Switching: University Letterhead (高校信笺) & Zhi Mang Xing (志莽行书)
console.log('Switching paper to stationery (高校信笺) and font to zhimang (志莽行书)...');
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
await wait(2000);

const stationeryShot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '04-mobile-stationery-zhimang.png'), Buffer.from(stationeryShot.data, 'base64'));

// 5. Test Klee One (克利清秀硬笔) & Blue-black ink
console.log('Switching font to klee (克利手写) and ink to blue-black...');
await evaluate(`
  (() => {
    const fontSelect = document.getElementById('font-select');
    fontSelect.value = 'klee';
    fontSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const paperSelect = document.getElementById('paper-more');
    paperSelect.value = 'college-notebook';
    paperSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const inks = Array.from(document.querySelectorAll('.ink'));
    if (inks.length > 1) inks[1].click(); // 蓝黑
  })()
`);
await wait(2000);

const kleeShot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '05-mobile-klee-blueblack.png'), Buffer.from(kleeShot.data, 'base64'));

// 6. Desktop 1440x900 Viewport Audit
console.log('Switching to Desktop Viewport (1440x900)...');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 2,
  mobile: false
});
await wait(1200);

const desktopShot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '06-desktop-handwrite-studio.png'), Buffer.from(desktopShot.data, 'base64'));

// Save audit summary
await writeFile(path.join(OUT_DIR, 'handwrite-audit-summary.json'), JSON.stringify(initialAudit, null, 2));

console.log('All visual verification captures completed! Saved to', OUT_DIR);

ws.close();
chromeProc.kill();
previewProc.kill();
process.exit(0);
