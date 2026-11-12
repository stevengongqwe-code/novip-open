import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join(process.cwd(), 'test-artifacts', 'audit-v3-tools');
await mkdir(OUT_DIR, { recursive: true });

// Start preview server
console.log('Starting Vite preview server on port 4173...');
const previewProc = spawn('npx', ['vite', 'preview', '--port', '4173', '--host', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: 'ignore'
});

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Wait for preview server to be responsive
let ready = false;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch('http://127.0.0.1:4173/');
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
  console.error('Failed to start Vite preview server on port 4173');
  process.exit(1);
}
console.log('Vite preview server is ready.');

// Find Chrome
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9224;
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-v3-cdp-' + Date.now());

const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  `--user-data-dir=${USER_DATA_DIR}`,
  `--remote-debugging-port=${DEBUG_PORT}`,
  'about:blank'
], { stdio: 'ignore' });

await wait(1200);

// Connect via CDP WebSocket with polling
async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      if (res.ok) {
        const data = await res.json();
        const page = data.find(t => t.type === 'page') || data[0];
        if (page?.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch {
      // Chrome starting up
    }
    await wait(300);
  }
  throw new Error(`Chrome CDP not available on port ${DEBUG_PORT}`);
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

const TOOLS = [
  { id: 'ppt-generate', path: '/tools/ppt-generate', titleFrag: 'PPT' },
  { id: 'pdf-form', path: '/tools/pdf-form', titleFrag: 'PDF' },
  { id: 'image-compress', path: '/tools/image-compress', titleFrag: '压缩' },
  { id: 'flowchart', path: '/tools/flowchart', titleFrag: '流程图' },
  { id: 'media-converter', path: '/tools/media-converter', titleFrag: '音视频' },
];

const auditResults = [];

try {
  // First, verify each tool in iPhone 16 Pro (390) with full interactive simulation
  console.log('Testing interactive features on iPhone 16 Pro...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  // 1. Home Page Check
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
  await wait(800);
  const homeMetrics = await evaluate(`({
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: window.innerWidth,
    bentoCards: document.querySelectorAll('.ios-bento-card').length,
    hotChips: document.querySelectorAll('.ios-hot-chip').length,
    footerText: document.querySelector('.ios-home-footer')?.innerText?.slice(0, 50)
  })`);
  const homeShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT_DIR, 'home-390.png'), Buffer.from(homeShot.data, 'base64'));

  // 2. PPT Generator
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/tools/ppt-generate' });
  await wait(800);
  // Switch to Project report scenario
  await evaluate(`
    const btns = Array.from(document.querySelectorAll('button'));
    const projectBtn = btns.find(b => b.textContent && b.textContent.includes('课程大作业'));
    if (projectBtn) projectBtn.click();
  `);
  await wait(500);
  const pptMetrics = await evaluate(`({
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: window.innerWidth,
    slideThumbnails: document.querySelectorAll('.ppt-slide-thumb, [data-slide-index]').length,
    hasPreview: !!document.querySelector('.ppt-canvas-card'),
    activeScenario: document.querySelector('.scenario-chip-active, button[style*="background"]')?.textContent?.trim()
  })`);
  const pptShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT_DIR, 'tool-ppt-generate-390.png'), Buffer.from(pptShot.data, 'base64'));

  // 3. PDF Form Filler
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/tools/pdf-form' });
  await wait(800);
  // Click sample data button
  await evaluate(`
    const btns = Array.from(document.querySelectorAll('button'));
    const sampleBtn = btns.find(b => b.textContent && b.textContent.includes('示例数据'));
    if (sampleBtn) sampleBtn.click();
  `);
  await wait(500);
  const pdfMetrics = await evaluate(`({
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: window.innerWidth,
    hasSignaturePad: !!document.querySelector('canvas'),
    formInputs: document.querySelectorAll('input, textarea').length,
    hasDownloadBtn: Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('下载'))
  })`);
  const pdfShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT_DIR, 'tool-pdf-form-390.png'), Buffer.from(pdfShot.data, 'base64'));

  // 4. Image Compress
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/tools/image-compress' });
  await wait(800);
  // Click sample photo button
  await evaluate(`
    const btns = Array.from(document.querySelectorAll('button'));
    const samplePhotoBtn = btns.find(b => b.textContent && b.textContent.includes('示例'));
    if (samplePhotoBtn) samplePhotoBtn.click();
  `);
  await wait(1400); // allow canvas compression computation
  const compressMetrics = await evaluate(`({
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: window.innerWidth,
    hasComparisonSlider: !!document.querySelector('.squoosh-compare-container, input[type="range"]'),
    hasHudMetrics: document.body.innerText.includes('KB') || document.body.innerText.includes('压缩率')
  })`);
  const compressShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT_DIR, 'tool-image-compress-390.png'), Buffer.from(compressShot.data, 'base64'));

  // 5. Flowchart
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/tools/flowchart' });
  await wait(1200); // allow Mermaid to render SVG
  // Switch to TCP template
  await evaluate(`
    const btns = Array.from(document.querySelectorAll('button'));
    const tcpBtn = btns.find(b => b.textContent && b.textContent.includes('TCP'));
    if (tcpBtn) tcpBtn.click();
  `);
  await wait(1000);
  const flowchartMetrics = await evaluate(`({
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: window.innerWidth,
    hasSvg: !!document.querySelector('svg.mermaid-rendered-svg, svg[id^="mermaid-"]'),
    hasCodeEditor: !!document.querySelector('textarea'),
    hasExportBtns: Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('导出'))
  })`);
  const flowchartShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT_DIR, 'tool-flowchart-390.png'), Buffer.from(flowchartShot.data, 'base64'));

  // 6. Media Converter
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/tools/media-converter' });
  await wait(800);
  // Click sample media button
  await evaluate(`
    const btns = Array.from(document.querySelectorAll('button'));
    const sampleMediaBtn = btns.find(b => b.textContent && b.textContent.includes('示例'));
    if (sampleMediaBtn) sampleMediaBtn.click();
  `);
  await wait(1400);
  const mediaMetrics = await evaluate(`({
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: window.innerWidth,
    hasVideoPlayer: !!document.querySelector('video'),
    modeTabs: document.querySelectorAll('.media-mode-grid button, button').length,
    hasConvertBtn: Array.from(document.querySelectorAll('button')).some(b => b.textContent && (b.textContent.includes('提取') || b.textContent.includes('转换') || b.textContent.includes('裁剪')))
  })`);
  const mediaShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT_DIR, 'tool-media-converter-390.png'), Buffer.from(mediaShot.data, 'base64'));

  auditResults.push({
    toolTests: {
      home: homeMetrics,
      ppt: pptMetrics,
      pdf: pdfMetrics,
      compress: compressMetrics,
      flowchart: flowchartMetrics,
      media: mediaMetrics
    }
  });

  // Now audit horizontal overflow across all 5 viewports for all 5 tools + home
  console.log('Auditing horizontal overflow across all viewports...');
  const viewportMatrix = [];

  for (const vp of VIEWPORTS) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: vp.width <= 768
    });

    const pageResults = [];
    const targets = [{ id: 'home', path: '/' }, ...TOOLS];

    for (const target of targets) {
      await send('Page.navigate', { url: `http://127.0.0.1:4173${target.path}` });
      await wait(500);
      const metrics = await evaluate(`({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: window.innerWidth,
        scrollHeight: document.documentElement.scrollHeight,
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth
      })`);
      pageResults.push({
        id: target.id,
        path: target.path,
        metrics
      });
    }

    // Capture responsive screenshot for home and ppt
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(OUT_DIR, `responsive-${vp.name}.png`), Buffer.from(shot.data, 'base64'));

    viewportMatrix.push({
      viewport: vp.name,
      dimensions: `${vp.width}x${vp.height}`,
      pages: pageResults,
      allClean: pageResults.every(p => p.metrics.noHorizontalOverflow)
    });
  }

  auditResults.push({ viewportMatrix });
  await writeFile(path.join(OUT_DIR, 'v3-audit-report.json'), JSON.stringify(auditResults, null, 2));

  console.log('Audit completed successfully! Report written to:', path.join(OUT_DIR, 'v3-audit-report.json'));

} catch (err) {
  console.error('Audit failed:', err);
  process.exitCode = 1;
} finally {
  ws.close();
  chromeProc.kill();
  previewProc.kill();
}
