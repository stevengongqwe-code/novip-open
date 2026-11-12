import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import os from 'node:os';

const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join(process.cwd(), 'test-artifacts', 'audit-novip-ai');
await mkdir(OUT_DIR, { recursive: true });

// Find Chrome
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9223;
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-ai-cdp-' + Date.now());

const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  `--user-data-dir=${USER_DATA_DIR}`,
  `--remote-debugging-port=${DEBUG_PORT}`,
  'about:blank'
], { stdio: 'ignore' });

const wait = (ms) => new Promise(r => setTimeout(r, ms));
await wait(1200);

// Connect via CDP WebSocket
async function getWsUrl() {
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const data = await res.json();
  const page = data.find(t => t.type === 'page') || data[0];
  return page.webSocketDebuggerUrl;
}

const wsUrl = await getWsUrl();
const ws = new WebSocket(wsUrl);

let msgId = 1;
const pending = new Map();

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(data.error);
    else resolve(data.result);
  }
};

function send(method, params = {}) {
  const id = msgId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await new Promise(r => ws.onopen = r);

// Enable domains
await send('Page.enable');
await send('Runtime.enable');
await send('DOM.enable');

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return res.result?.value;
}

const VIEWPORTS = [
  { name: 'iphone-se-375', width: 375, height: 667 },
  { name: 'iphone-16pro-390', width: 390, height: 844 },
  { name: 'iphone-16promax-430', width: 430, height: 932 },
  { name: 'ipad-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

const results = [];

for (const vp of VIEWPORTS) {
  console.log(`Auditing viewport: ${vp.name} (${vp.width}x${vp.height})...`);
  await send('Emulation.setDeviceMetricsOverride', {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: 2,
    mobile: vp.width <= 768
  });

  // 1. Audit Home Page
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
  await wait(800);

  const homeMetrics = await evaluate(`({
    url: window.location.href,
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: window.innerWidth,
    hasAiHomeEntry: !!document.querySelector('.home-ai-entry'),
    aiEntryText: document.querySelector('.home-ai-entry')?.innerText?.trim(),
    hasSpotlight: !!document.querySelector('.ios-spotlight-box')
  })`);

  console.log('Home metrics:', homeMetrics);

  const homeShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT_DIR, `${vp.name}-home.png`), Buffer.from(homeShot.data, 'base64'));

  // 2. Click AI Entry or Navigate to /tools/ai
  await evaluate(`document.querySelector('.home-ai-entry')?.click()`);
  await wait(600);

  const aiPageMetrics = await evaluate(`({
    url: window.location.href,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: window.innerWidth,
    hasAiContainer: !!document.querySelector('.novip-ai-container'),
    presetsCount: document.querySelectorAll('.novip-ai-preset-chip').length,
    hasComposer: !!document.querySelector('.novip-ai-composer-form')
  })`);

  console.log('AI page metrics:', aiPageMetrics);

  // 3. Test Clicking Preset Chip (Photo 480x640)
  await evaluate(`document.querySelectorAll('.novip-ai-preset-chip')[0]?.click()`);
  // wait for typewriter stream
  await wait(1400);

  const chatMetrics = await evaluate(`({
    messagesCount: document.querySelectorAll('.novip-ai-message-row').length,
    lastAssistantText: document.querySelector('.novip-ai-message-row.assistant .novip-ai-text-content')?.innerText?.trim(),
    recommendedToolsCount: document.querySelectorAll('.novip-ai-tool-card').length,
    hasCopyBtn: !!document.querySelector('.novip-ai-copy-btn')
  })`);

  console.log('Chat after preset click:', chatMetrics);

  const aiChatShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT_DIR, `${vp.name}-ai-chat.png`), Buffer.from(aiChatShot.data, 'base64'));

  results.push({
    viewport: vp.name,
    home: homeMetrics,
    aiPage: aiPageMetrics,
    chat: chatMetrics,
    passOverflow: homeMetrics.scrollWidth <= homeMetrics.clientWidth && aiPageMetrics.scrollWidth <= aiPageMetrics.clientWidth
  });
}

await writeFile(path.join(OUT_DIR, 'ai-verification-results.json'), JSON.stringify(results, null, 2));

console.log('All viewports audited successfully!');
ws.close();
chromeProc.kill();
