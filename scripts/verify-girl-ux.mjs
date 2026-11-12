import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join(process.cwd(), 'test-artifacts', 'audit-ux-v3');
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
const DEBUG_PORT = 9260;
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-ux-girl-' + Date.now());

// Android WeChat UA
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

  // Set iPhone 16 Pro dimensions (390 x 844, dpr: 3, mobile: true)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true
  });

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

  // 1. Audit Home Page
  console.log('Auditing Home Page on Mobile...');
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4180/' });
  await wait(2200);

  const homeData = await cdp.eval(`(() => {
    const text = document.body.innerText;
    const hasScenarioCards = !!document.querySelector('.novip-scenario-cards');
    const cards = Array.from(document.querySelectorAll('.novip-scenario-card')).map(el => el.innerText.trim());
    const kbdEl = document.querySelector('.ios-spotlight-kbd-hint');
    const kbdVisible = kbdEl ? window.getComputedStyle(kbdEl).display !== 'none' : false;
    const hasJargonSandbox = text.includes('沙盒活跃');
    const hasJargonIsolation = text.includes('100% 内存隔离');
    const hasJargonNeural = text.includes('端侧神经架构');
    const hasFriendlySecurity = text.includes('安全绿标') || text.includes('100% 保护隐私');
    const searchInput = document.querySelector('.ios-spotlight-input');
    const placeholder = searchInput ? searchInput.getAttribute('placeholder') : '';
    const hasOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;

    return {
      hasScenarioCards,
      cardCount: cards.length,
      cards,
      kbdVisible,
      hasJargonSandbox,
      hasJargonIsolation,
      hasJargonNeural,
      hasFriendlySecurity,
      placeholder,
      hasOverflow
    };
  })()`);

  console.log('Home Page Check:', homeData);
  auditResults.checks.push({
    test: 'Home Page Mobile UX',
    passed: homeData.hasScenarioCards && homeData.cardCount >= 4 && !homeData.hasJargonSandbox && !homeData.hasJargonIsolation && !homeData.hasOverflow && !homeData.kbdVisible,
    data: homeData
  });

  await takeScreenshot('01-home-mobile-girl-ux');

  // 2. Audit ID Photo Tool (One Stop Blue 1-inch)
  console.log('Auditing ID Photo Tool (?spec=one&bg=blue&limit=100)...');
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4180/tools/id-photo?spec=one&bg=blue&limit=100' });
  await wait(2200);

  const idPhotoData = await cdp.eval(`(() => {
    const text = document.body.innerText;
    const pressedButtons = Array.from(document.querySelectorAll('button[aria-pressed="true"]')).map(b => b.innerText.trim());
    const hasOneInchPreset = pressedButtons.some(b => b.includes('一寸'));
    const hasBlueActive = pressedButtons.some(b => b.includes('天蓝底'));
    const hasSampleBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('示例照片'));
    const hasKbLimit100 = text.includes('100');
    const hasOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    const toolNav = document.querySelector('.tool-navigation');
    const toolNavVisible = toolNav ? window.getComputedStyle(toolNav).display !== 'none' : false;

    return {
      pressedButtons,
      hasOneInchPreset,
      hasBlueActive,
      hasSampleBtn,
      hasKbLimit100,
      hasOverflow,
      toolNavVisible
    };
  })()`);

  console.log('ID Photo Tool Check (initial):', idPhotoData);

  // Click sample photo
  await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('示例照片'));
    if (btn) btn.click();
  })()`);
  await wait(1200);

  const sampleLoadedData = await cdp.eval(`(() => {
    const hasCanvas = !!document.querySelector('.zj-photo__canvas');
    const text = document.body.innerText;
    const hasDownloadBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('下载') || b.innerText.includes('保存'));
    const hasCutoutBridge = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('去手动涂抹换底色'));
    return {
      hasCanvas,
      hasDownloadBtn,
      hasCutoutBridge,
      hasWechatTip: text.includes('微信长按') || text.includes('长按')
    };
  })()`);

  console.log('ID Photo Tool Sample Loaded:', sampleLoadedData);
  auditResults.checks.push({
    test: 'ID Photo One-Stop Blue Preset & Sample Flow',
    passed: idPhotoData.hasOneInchPreset && idPhotoData.hasBlueActive && sampleLoadedData.hasCanvas && !idPhotoData.toolNavVisible,
    data: { ...idPhotoData, ...sampleLoadedData }
  });

  await takeScreenshot('02-id-photo-blue-preset-mobile');

  // 3. Audit Background Cutout Tool
  console.log('Auditing Background Cutout Tool...');
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4180/tools/background' });
  await wait(2200);

  const bgInitialData = await cdp.eval(`(() => {
    const text = document.body.innerText;
    const sampleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('试用示例人像'));
    const toolNav = document.querySelector('.tool-navigation');
    const toolNavVisible = toolNav ? window.getComputedStyle(toolNav).display !== 'none' : false;
    return {
      hasSampleBtn: !!sampleBtn,
      toolNavVisible,
      textContainsGuide: text.includes('新手 3 步指南')
    };
  })()`);

  console.log('Background Tool Check (initial):', bgInitialData);

  // Click sample button to load canvas
  await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('试用示例人像'));
    if (btn) btn.click();
  })()`);
  await wait(1200);

  const bgLoadedData = await cdp.eval(`(() => {
    const text = document.body.innerText;
    const hasCanvas = !!document.querySelector('canvas');
    const handoverBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('一键去【做一寸/二寸报名照并锁100KB】'));
    return {
      hasCanvas,
      hasHandoverBtn: !!handoverBtn,
      handoverText: handoverBtn ? handoverBtn.innerText : ''
    };
  })()`);

  console.log('Background Tool Check (loaded):', bgLoadedData);
  auditResults.checks.push({
    test: 'Background Cutout Tool Handover Bridge & Sample Flow',
    passed: bgInitialData.hasSampleBtn && bgLoadedData.hasCanvas && bgLoadedData.hasHandoverBtn && !bgInitialData.toolNavVisible,
    data: { ...bgInitialData, ...bgLoadedData }
  });

  await takeScreenshot('03-background-cutout-handover-mobile');

  // 4. Audit AI Assistant
  console.log('Auditing AI Assistant Tool...');
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4180/tools/ai' });
  await wait(2200);

  const aiPresetData = await cdp.eval(`(() => {
    const chips = Array.from(document.querySelectorAll('.novip-ai-preset-chip')).map(c => c.innerText.trim());
    const hasBluePhotoChip = chips.some(c => c.includes('蓝底一寸') || c.includes('报名照'));
    const hasHandwriteChip = chips.some(c => c.includes('手写'));
    const toolNav = document.querySelector('.tool-navigation');
    const toolNavVisible = toolNav ? window.getComputedStyle(toolNav).display !== 'none' : false;
    return {
      chips,
      hasBluePhotoChip,
      hasHandwriteChip,
      toolNavVisible
    };
  })()`);

  console.log('AI Assistant Presets:', aiPresetData);

  // Click the blue photo preset
  await cdp.eval(`(() => {
    const chip = Array.from(document.querySelectorAll('.novip-ai-preset-chip')).find(c => c.innerText.includes('蓝底一寸'));
    if (chip) chip.click();
  })()`);

  await wait(2500);

  const aiResponseData = await cdp.eval(`(() => {
    const messages = Array.from(document.querySelectorAll('.novip-ai-message')).map(m => m.innerText.trim());
    const lastMsg = messages[messages.length - 1] || '';
    const toolCards = Array.from(document.querySelectorAll('.novip-ai-tool-card')).map(card => ({
      title: card.querySelector('strong')?.innerText || '',
      badge: card.querySelector('.novip-badge-pill')?.innerText || '',
      href: card.getAttribute('href') || ''
    }));
    const hasBluePhotoCard = toolCards.some(c => c.href.includes('id-photo') && c.href.includes('bg=blue'));
    return {
      lastMsgSnippet: lastMsg.substring(0, 150),
      toolCards,
      hasBluePhotoCard
    };
  })()`);

  console.log('AI Assistant Response Data:', aiResponseData);
  auditResults.checks.push({
    test: 'AI Assistant Blue 1-Inch Understanding & Actionable Card',
    passed: aiPresetData.hasBluePhotoChip && aiResponseData.hasBluePhotoCard,
    data: { ...aiPresetData, ...aiResponseData }
  });

  await takeScreenshot('04-ai-assistant-blue-id-card-mobile');

  // 5. Audit File Converter (Try-Sample button)
  console.log('Auditing File Converter (Try-Sample button)...');
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4180/tools/files' });
  await wait(1800);

  const converterData = await cdp.eval(`(() => {
    const sampleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('试用示例文件'));
    return {
      hasSampleBtn: !!sampleBtn
    };
  })()`);

  console.log('File Converter Sample Btn:', converterData);

  // Click sample button
  await cdp.eval(`(() => {
    const sampleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('试用示例文件'));
    if (sampleBtn) sampleBtn.click();
  })()`);
  await wait(1500);

  const converterLoadedData = await cdp.eval(`(() => {
    const files = Array.from(document.querySelectorAll('.file-item, .file-card, .file-name')).map(el => el.innerText.trim());
    const text = document.body.innerText;
    return {
      fileCount: files.length,
      sampleLoaded: text.includes('实验报告_物理实验1.pdf') || text.includes('实验报告')
    };
  })()`);

  console.log('File Converter Sample Loaded:', converterLoadedData);
  auditResults.checks.push({
    test: 'File Converter Try-Sample Generation',
    passed: converterData.hasSampleBtn && converterLoadedData.sampleLoaded,
    data: { ...converterData, ...converterLoadedData }
  });

  await takeScreenshot('05-file-converter-sample-loaded-mobile');

  // Save audit results json
  await writeFile(path.join(OUT_DIR, 'girl-ux-audit.json'), JSON.stringify(auditResults, null, 2));
  console.log('UX Audit completed successfully. All results saved.');

  ws.close();
  chromeProc.kill();
  previewProc.kill();
  process.exit(auditResults.checks.every(c => c.passed) ? 0 : 1);
} catch (err) {
  console.error('Audit failed with error:', err);
  chromeProc.kill();
  previewProc.kill();
  process.exit(1);
}
