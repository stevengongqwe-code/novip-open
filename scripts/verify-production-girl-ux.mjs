import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join(process.cwd(), 'test-artifacts', 'audit-production-ux-v3');
await mkdir(OUT_DIR, { recursive: true });

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9272;
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-prod-ux-' + Date.now());

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

const wait = (ms) => new Promise(r => setTimeout(r, ms));
await wait(1500);

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
  throw new Error('Chrome CDP connection timeout');
}

const auditResults = {
  timestamp: new Date().toISOString(),
  target: 'https://novip.site',
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

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result ? res.result.value : undefined;
  };

  await send('Page.enable');
  await send('DOM.enable');
  await send('Runtime.enable');

  // iPhone 16 Pro Viewport (390 x 844, dpr 3)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true
  });

  async function takeScreenshot(name) {
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      quality: 90
    });
    const filePath = path.join(OUT_DIR, `${name}.png`);
    await writeFile(filePath, Buffer.from(data, 'base64'));
    auditResults.screenshots.push({ name, path: filePath });
    console.log(`Saved screenshot: ${name}.png`);
  }

  // 1. Audit Live Home Page
  console.log('Navigating to Live Production Home: https://novip.site/ ...');
  await send('Page.navigate', { url: 'https://novip.site/' });
  await wait(3000);

  const homeData = await evaluate(`(() => {
    const text = document.body.innerText;
    const hasScenarioCards = !!document.querySelector('.novip-scenario-cards');
    const cards = Array.from(document.querySelectorAll('.novip-scenario-card')).map(el => el.innerText.trim());
    const kbdEl = document.querySelector('.ios-spotlight-kbd-hint');
    const kbdVisible = kbdEl ? window.getComputedStyle(kbdEl).display !== 'none' : false;
    const hasJargonSandbox = text.includes('沙盒活跃');
    const hasJargonIsolation = text.includes('100% 内存隔离');
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
      hasFriendlySecurity,
      placeholder,
      hasOverflow
    };
  })()`);

  console.log('Live Home Page Audit:', homeData);
  auditResults.checks.push({
    test: 'Production Home Page Mobile UX',
    passed: homeData.hasScenarioCards && homeData.cardCount >= 4 && !homeData.hasJargonSandbox && !homeData.kbdVisible,
    data: homeData
  });
  await takeScreenshot('01-prod-home-mobile-girl-ux');

  // 2. Audit Live ID Photo Tool (?spec=one&bg=blue&limit=100)
  console.log('Navigating to Live ID Photo Tool: https://novip.site/tools/id-photo?spec=one&bg=blue&limit=100 ...');
  await send('Page.navigate', { url: 'https://novip.site/tools/id-photo?spec=one&bg=blue&limit=100' });
  await wait(3000);

  const idPhotoInitial = await evaluate(`(() => {
    const text = document.body.innerText;
    const pressedButtons = Array.from(document.querySelectorAll('button[aria-pressed="true"]')).map(b => b.innerText.trim());
    const hasOneInchPreset = pressedButtons.some(b => b.includes('一寸'));
    const hasBlueActive = pressedButtons.some(b => b.includes('天蓝底'));
    const hasSampleBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('示例照片'));
    const toolNav = document.querySelector('.tool-navigation');
    const toolNavVisible = toolNav ? window.getComputedStyle(toolNav).display !== 'none' : false;
    return {
      pressedButtons,
      hasOneInchPreset,
      hasBlueActive,
      hasSampleBtn,
      toolNavVisible
    };
  })()`);

  console.log('Live ID Photo Tool (initial):', idPhotoInitial);

  // Click sample photo
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('示例照片'));
    if (btn) btn.click();
  })()`);
  await wait(1500);

  const idPhotoLoaded = await evaluate(`(() => {
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

  console.log('Live ID Photo Tool (sample loaded):', idPhotoLoaded);
  auditResults.checks.push({
    test: 'Production ID Photo Tool One-Stop Blue Workflow',
    passed: idPhotoInitial.hasOneInchPreset && idPhotoInitial.hasBlueActive && idPhotoLoaded.hasCanvas && !idPhotoInitial.toolNavVisible,
    data: { ...idPhotoInitial, ...idPhotoLoaded }
  });
  await takeScreenshot('02-prod-id-photo-blue-preset');

  // 3. Audit Live Background Cutout Tool
  console.log('Navigating to Live Background Tool: https://novip.site/tools/background ...');
  await send('Page.navigate', { url: 'https://novip.site/tools/background' });
  await wait(3000);

  const bgInitial = await evaluate(`(() => {
    const text = document.body.innerText;
    const sampleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('试用示例人像'));
    const toolNav = document.querySelector('.tool-navigation');
    const toolNavVisible = toolNav ? window.getComputedStyle(toolNav).display !== 'none' : false;
    return {
      hasSampleBtn: !!sampleBtn,
      toolNavVisible,
      hasGuide: text.includes('新手 3 步指南')
    };
  })()`);

  console.log('Live Background Tool (initial):', bgInitial);

  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('试用示例人像'));
    if (btn) btn.click();
  })()`);
  await wait(1500);

  const bgLoaded = await evaluate(`(() => {
    const hasCanvas = !!document.querySelector('canvas');
    const handoverBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('一键去【做一寸/二寸报名照并锁100KB】'));
    return {
      hasCanvas,
      hasHandoverBtn: !!handoverBtn
    };
  })()`);

  console.log('Live Background Tool (loaded):', bgLoaded);
  auditResults.checks.push({
    test: 'Production Background Cutout Handover Bridge',
    passed: bgInitial.hasSampleBtn && bgLoaded.hasCanvas && bgLoaded.hasHandoverBtn,
    data: { ...bgInitial, ...bgLoaded }
  });
  await takeScreenshot('03-prod-background-handover');

  // 4. Audit Live AI Assistant
  console.log('Navigating to Live AI Assistant: https://novip.site/tools/ai ...');
  await send('Page.navigate', { url: 'https://novip.site/tools/ai' });
  await wait(3000);

  const aiPresets = await evaluate(`(() => {
    const chips = Array.from(document.querySelectorAll('.novip-ai-preset-chip')).map(c => c.innerText.trim());
    return {
      chips,
      hasBluePhotoChip: chips.some(c => c.includes('蓝底一寸'))
    };
  })()`);

  console.log('Live AI Assistant Presets:', aiPresets);

  // Click blue photo preset
  await evaluate(`(() => {
    const chip = Array.from(document.querySelectorAll('.novip-ai-preset-chip')).find(c => c.innerText.includes('蓝底一寸'));
    if (chip) chip.click();
  })()`);
  await wait(3000);

  const aiResponse = await evaluate(`(() => {
    const toolCards = Array.from(document.querySelectorAll('.novip-ai-tool-card')).map(card => ({
      title: card.querySelector('strong')?.innerText || '',
      badge: card.querySelector('.novip-badge-pill')?.innerText || '',
      href: card.getAttribute('href') || ''
    }));
    const hasBluePhotoCard = toolCards.some(c => c.href.includes('id-photo') && c.href.includes('bg=blue'));
    return {
      toolCards,
      hasBluePhotoCard
    };
  })()`);

  console.log('Live AI Assistant Response:', aiResponse);
  auditResults.checks.push({
    test: 'Production AI Assistant Blue 1-Inch Intent & Card',
    passed: aiPresets.hasBluePhotoChip && aiResponse.hasBluePhotoCard,
    data: { ...aiPresets, ...aiResponse }
  });
  await takeScreenshot('04-prod-ai-assistant-blue-id-card');

  // 5. Audit Live File Converter
  console.log('Navigating to Live File Converter: https://novip.site/tools/files ...');
  await send('Page.navigate', { url: 'https://novip.site/tools/files' });
  await wait(3000);

  const converterInitial = await evaluate(`(() => {
    const sampleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('试用示例文件'));
    return { hasSampleBtn: !!sampleBtn };
  })()`);

  await evaluate(`(() => {
    const sampleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('试用示例文件'));
    if (sampleBtn) sampleBtn.click();
  })()`);
  await wait(2000);

  const converterLoaded = await evaluate(`(() => {
    const text = document.body.innerText;
    return {
      sampleLoaded: text.includes('实验报告_物理实验1.pdf') || text.includes('实验报告')
    };
  })()`);

  console.log('Live File Converter:', converterLoaded);
  auditResults.checks.push({
    test: 'Production File Converter Sample Flow',
    passed: converterInitial.hasSampleBtn && converterLoaded.sampleLoaded,
    data: { ...converterInitial, ...converterLoaded }
  });
  await takeScreenshot('05-prod-files-converter-sample');

  // Write audit summary
  await writeFile(path.join(OUT_DIR, 'production-girl-ux-summary.json'), JSON.stringify(auditResults, null, 2));
  console.log('Production UX Audit finished successfully!');

  ws.close();
  chromeProc.kill();
  process.exit(auditResults.checks.every(c => c.passed) ? 0 : 1);
} catch (err) {
  console.error('Production audit failed:', err);
  chromeProc.kill();
  process.exit(1);
}
