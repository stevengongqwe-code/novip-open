import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join(process.cwd(), 'test-artifacts', 'audit-web-to-apk');
await mkdir(OUT_DIR, { recursive: true });

console.log('Starting Vite preview server on port 4174...');
const previewProc = spawn('npx', ['vite', 'preview', '--port', '4174', '--host', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: 'ignore'
});

const wait = (ms) => new Promise(r => setTimeout(r, ms));

let ready = false;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch('http://127.0.0.1:4174/');
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
  console.error('Failed to start preview server on port 4174');
  process.exit(1);
}
console.log('Preview server ready.');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9226;
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-apk-cdp-' + Date.now());

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

const viewports = [
  { name: 'iphone-se-375', width: 375, height: 667, dpr: 2 },
  { name: 'iphone-16pro-390', width: 390, height: 844, dpr: 3 },
  { name: 'iphone-16promax-430', width: 430, height: 932, dpr: 3 },
  { name: 'ipad-768', width: 768, height: 1024, dpr: 2 },
  { name: 'desktop-1440', width: 1440, height: 900, dpr: 1 }
];

const auditResults = [];

for (const vp of viewports) {
  console.log(`Auditing viewport: ${vp.name} (${vp.width}x${vp.height})...`);
  await send('Emulation.setDeviceMetricsOverride', {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: vp.dpr,
    mobile: vp.width < 1024
  });

  await send('Page.navigate', { url: 'http://127.0.0.1:4174/tools/web-to-apk' });
  await wait(1800);

  // Check horizontal overflow
  const overflowCheck = await evaluate(`
    (() => {
      const docW = document.documentElement.clientWidth;
      const docScrollW = document.documentElement.scrollWidth;
      const bodyScrollW = document.body.scrollWidth;
      const badElements = [];
      document.querySelectorAll('*').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.right > docW + 1.5) {
          badElements.push({
            tag: el.tagName,
            cls: (el.className || '').toString().slice(0, 50),
            right: rect.right,
            width: rect.width
          });
        }
      });
      return {
        docW,
        docScrollW,
        bodyScrollW,
        hasHorizontalOverflow: docScrollW > docW + 1 || bodyScrollW > docW + 1,
        badCount: badElements.length,
        badSample: badElements.slice(0, 3)
      };
    })()
  `);

  // Check UI key elements
  const uiCheck = await evaluate(`
    (() => {
      const hasTitle = !!document.querySelector('h1')?.textContent?.includes('网站一键生成安卓 APK');
      const presetButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.includes('清华网络学堂') || b.textContent?.includes('哔哩哔哩'));
      const urlInput = document.querySelector('input[placeholder="https://your-website.com"]');
      const hasPhoneMockup = Array.from(document.querySelectorAll('*')).some(el => el.textContent?.includes('Android 旗舰拟真预览'));
      const generateBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('一键生成并下载安卓 APK'));
      const hasAdvancedOptions = Array.from(document.querySelectorAll('*')).some(el => el.textContent?.includes('高级特性与 WebView 行为控制'));
      return {
        hasTitle,
        hasPresets: presetButtons.length >= 2,
        hasUrlInput: !!urlInput,
        hasPhoneMockup,
        hasGenerateBtn: !!generateBtn,
        hasAdvancedOptions
      };
    })()
  `);

  // Capture screenshot
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const imgPath = path.join(OUT_DIR, `${vp.name}.png`);
  await writeFile(imgPath, Buffer.from(screenshot.data, 'base64'));

  auditResults.push({
    viewport: vp.name,
    dimensions: `${vp.width}x${vp.height}`,
    overflow: overflowCheck,
    ui: uiCheck,
    screenshotPath: imgPath
  });
}

// Now test interaction on iPhone 16 Pro (390)
console.log('Testing interactive workflow (preset selection, live mockup update, export options)...');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true
});

await send('Page.navigate', { url: 'http://127.0.0.1:4174/tools/web-to-apk' });
await wait(1800);

// Click preset '哔哩哔哩'
const clickPreset = await evaluate(`
  (() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const bili = buttons.find(b => b.textContent?.includes('哔哩哔哩'));
    if (bili) {
      bili.click();
      return true;
    }
    return false;
  })()
`);

await wait(600);

const presetState = await evaluate(`
  (() => {
    const url = document.querySelector('input[placeholder="https://your-website.com"]')?.value;
    const inputs = Array.from(document.querySelectorAll('input'));
    const name = inputs.find(i => i.value?.includes('哔哩哔哩'))?.value;
    const previewMatched = Array.from(document.querySelectorAll('*')).some(el => el.textContent?.includes('哔哩哔哩动画'));
    return { url, name, previewMatched };
  })()
`);

const interactionScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
const interactionImgPath = path.join(OUT_DIR, 'interaction-bilibili-preset.png');
await writeFile(interactionImgPath, Buffer.from(interactionScreenshot.data, 'base64'));

// Write full audit JSON
const report = {
  timestamp: new Date().toISOString(),
  tool: 'web-to-apk',
  url: 'http://127.0.0.1:4174/tools/web-to-apk',
  viewportAudits: auditResults,
  interactionTest: {
    clickPreset,
    stateAfterPreset: presetState,
    screenshotPath: interactionImgPath
  }
};

await writeFile(path.join(OUT_DIR, 'audit-summary.json'), JSON.stringify(report, null, 2));

console.log('Audit completed successfully. Results written to', OUT_DIR);

// Teardown
ws.close();
chromeProc.kill();
previewProc.kill();
