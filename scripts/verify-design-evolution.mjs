import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join(process.cwd(), 'test-artifacts', 'audit-design-evolution');
await mkdir(OUT_DIR, { recursive: true });

console.log('Starting Vite preview server on port 4185...');
const previewProc = spawn('npx', ['vite', 'preview', '--port', '4185', '--host', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: 'ignore'
});

const wait = (ms) => new Promise(r => setTimeout(r, ms));

let ready = false;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch('http://127.0.0.1:4185/');
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
  console.error('Failed to start preview server on port 4185');
  process.exit(1);
}
console.log('Preview server ready on 4185.');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9265;
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-design-evolution-' + Date.now());

const WECHAT_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 MicroMessenger/8.0.48.2580(0x28003036) Process/toolsmp WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64';

const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  `--user-data-dir=${USER_DATA_DIR}`,
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-agent=${WECHAT_UA}`,
  'about:blank'
], { stdio: 'ignore' });

await wait(1200);

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const listRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      if (listRes.ok) {
        const data = await listRes.json();
        const page = data.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension') && !t.url.startsWith('chrome:'));
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await wait(300);
  }
  throw new Error('Could not find WebSocket URL for Chrome page');
}

const auditResults = {
  timestamp: new Date().toISOString(),
  viewports: [],
  checks: [],
  screenshots: []
};

try {
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

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = msgId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const cdp = {
    send,
    eval: async (expression) => {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      return res.result ? res.result.value : undefined;
    }
  };

  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Runtime.enable');

  async function takeScreenshot(name) {
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      quality: 90
    });
    const filePath = path.join(OUT_DIR, `${name}.png`);
    await writeFile(filePath, Buffer.from(data, 'base64'));
    auditResults.screenshots.push({ name, path: filePath });
    console.log(`Saved screenshot: ${name}.png`);
  }

  // Define the 6 viewports required by the evolution audit
  const VIEWPORTS = [
    { name: '360-android', width: 360, height: 740, mobile: true, dpr: 3 },
    { name: '390-iphone', width: 390, height: 844, mobile: true, dpr: 3 },
    { name: '430-promax', width: 430, height: 932, mobile: true, dpr: 3 },
    { name: '768-tablet', width: 768, height: 1024, mobile: false, dpr: 2 },
    { name: '1024-laptop', width: 1024, height: 768, mobile: false, dpr: 2 },
    { name: '1440-desktop', width: 1440, height: 900, mobile: false, dpr: 2 }
  ];

  for (const vp of VIEWPORTS) {
    console.log(`\nTesting viewport: ${vp.name} (${vp.width}x${vp.height})...`);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.dpr,
      mobile: vp.mobile
    });

    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4185/' });
    await wait(1000);

    // Measure document overflow
    const layout = await cdp.eval(`(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const bodyWidth = document.body.scrollWidth;
      const hasOverflow = scrollWidth > clientWidth;

      const hero = !!document.querySelector('.novip-hero-evolution');
      const tactileBtns = document.querySelectorAll('.novip-btn-tactile').length;
      const showcaseTabs = document.querySelectorAll('.novip-showcase-tab').length;
      const flagshipCards = document.querySelectorAll('.novip-flagship-card').length;
      const highfreqCards = document.querySelectorAll('.novip-highfreq-card').length;
      const spotlight = !!document.querySelector('.ios-spotlight-box');

      // Dock padding check on mobile
      const mainEl = document.querySelector('.tool-main') || document.body;
      const computedPaddingBottom = parseFloat(window.getComputedStyle(mainEl).paddingBottom || '0');

      return {
        clientWidth,
        scrollWidth,
        bodyWidth,
        hasOverflow,
        hero,
        tactileBtns,
        showcaseTabs,
        flagshipCards,
        highfreqCards,
        spotlight,
        computedPaddingBottom
      };
    })()`);

    console.log(`  Layout check: clientWidth=${layout.clientWidth}, scrollWidth=${layout.scrollWidth}, hasOverflow=${layout.hasOverflow}`);
    console.log(`  Components: Hero=${layout.hero}, TactileBtns=${layout.tactileBtns}, ShowcaseTabs=${layout.showcaseTabs}, Flagships=${layout.flagshipCards}, HighFreq=${layout.highfreqCards}`);
    console.log(`  Bottom clearance padding: ${layout.computedPaddingBottom}px`);

    auditResults.viewports.push({
      viewport: vp.name,
      dimensions: `${vp.width}x${vp.height}`,
      metrics: layout,
      pass: !layout.hasOverflow && layout.hero && layout.flagshipCards === 4 && layout.highfreqCards === 12
    });

    await takeScreenshot(`0${auditResults.viewports.length}-home-${vp.name}`);
  }

  // Interactive Showcase Tab switching test (on 390-iphone)
  console.log('\nTesting Interactive Showcase Tab Switching...');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true
  });
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4185/' });
  await wait(800);

  // Click tab 3 (照片压到100KB)
  await cdp.eval(`(() => {
    const tabs = document.querySelectorAll('.novip-showcase-tab');
    if (tabs[3]) tabs[3].click();
  })()`);
  await wait(400);

  const tab3Status = await cdp.eval(`(() => {
    const text = document.querySelector('.novip-showcase-box')?.textContent || '';
    return {
      hasTarget96kb: text.includes('96 KB') || text.includes('100KB'),
      hasActionBtn: !!document.querySelector('.novip-showcase-info a')
    };
  })()`);
  console.log('  Tab 3 showcase interactive state:', tab3Status);
  await takeScreenshot('07-showcase-tab-switch');

  // Audit Subpage: Image Compress first fold
  console.log('\nTesting /tools/image-compress first fold upload...');
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4185/tools/image-compress' });
  await wait(800);

  const compressFold = await cdp.eval(`(() => {
    const sampleBtn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('载入示例'));
    const uploadInput = document.querySelector('input[type="file"]');
    const presets = document.querySelectorAll('.compress-options-grid button').length;
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = document.documentElement.clientWidth;
    return {
      hasSampleBtn: !!sampleBtn,
      hasUploadInput: !!uploadInput,
      presets,
      hasOverflow: scrollWidth > clientWidth
    };
  })()`);
  console.log('  ImageCompress first-fold state:', compressFold);
  await takeScreenshot('08-image-compress-firstfold');

  // Click sample button in ImageCompress to verify Squoosh view
  await cdp.eval(`(() => {
    const sampleBtn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('载入示例'));
    if (sampleBtn) sampleBtn.click();
  })()`);
  await wait(600);
  await takeScreenshot('09-image-compress-sample-loaded');

  // Audit Subpage: PPT Extract first fold
  console.log('\nTesting /tools/ppt-extract first fold...');
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4185/tools/ppt-extract' });
  await wait(800);

  const pptFold = await cdp.eval(`(() => {
    const sampleBtn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('载入示例'));
    const fileInput = document.querySelector('input[type="file"]');
    return {
      hasSampleBtn: !!sampleBtn,
      hasFileInput: !!fileInput
    };
  })()`);
  console.log('  PptExtract first-fold state:', pptFold);

  // Click sample in PPT extract
  await cdp.eval(`(() => {
    const sampleBtn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('载入示例'));
    if (sampleBtn) sampleBtn.click();
  })()`);
  await wait(600);
  await takeScreenshot('10-ppt-extract-sample-loaded');

  // Save full audit report json
  await writeFile(path.join(OUT_DIR, 'design-evolution-audit.json'), JSON.stringify(auditResults, null, 2));
  console.log('\nAudit completed successfully! Saved results to design-evolution-audit.json');

} catch (err) {
  console.error('Audit failed with error:', err);
  process.exitCode = 1;
} finally {
  try { chromeProc.kill(); } catch {}
  try { previewProc.kill(); } catch {}
}
