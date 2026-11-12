import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join(process.cwd(), 'test-artifacts', 'audit-production-live');
await mkdir(OUT_DIR, { recursive: true });

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9238;
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-live-cdp-' + Date.now());

const WECHAT_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 MicroMessenger/8.0.48.2580(0x28003036) Process/toolsmp WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64';

console.log('Launching headless Chrome for live production verification...');
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

await send('Network.setUserAgentOverride', { userAgent: WECHAT_UA });
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true
});

console.log('Navigating to live production: https://novip.site/tools/ai ...');
await send('Page.navigate', { url: 'https://novip.site/tools/ai' });

// Wait for React app to mount and render AI presets
console.log('Waiting for React hydration on live site...');
let mounted = false;
for (let i = 0; i < 40; i++) {
  await wait(500);
  const check = await evaluate(`
    (() => {
      const chips = document.querySelectorAll('.novip-ai-preset-chip');
      const messages = document.querySelectorAll('.novip-ai-message-row');
      return { chipsCount: chips.length, messagesCount: messages.length, hasInput: !!document.querySelector('.novip-ai-input') };
    })()
  `);
  if (check && (check.chipsCount > 0 || check.hasInput)) {
    mounted = true;
    console.log(`Mounted after ${(i + 1) * 0.5}s! Chips: ${check.chipsCount}`);
    break;
  }
}

if (!mounted) {
  throw new Error('Failed to mount AI Assistant on live production site within 20s');
}

// 1. Initial State Audit
const liveInitial = await evaluate(`
  (() => {
    const chips = Array.from(document.querySelectorAll('.novip-ai-preset-chip')).map(c => c.textContent?.trim());
    return {
      url: window.location.href,
      title: document.title,
      heading: document.querySelector('h1')?.textContent?.trim(),
      badgeText: document.querySelector('.novip-ai-badge-text')?.textContent?.trim(),
      hasWeChatHint: !!document.querySelector('.novip-ai-wechat-hint'),
      weChatHintText: document.querySelector('.novip-ai-wechat-hint')?.textContent?.trim(),
      presetsCount: chips.length,
      presets: chips,
      docW: document.documentElement.clientWidth,
      docScrollW: document.documentElement.scrollWidth,
      hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  })()
`);
console.log('Live Production Initial State:', liveInitial);

const liveInitScreenshot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '01-live-production-initial.png'), Buffer.from(liveInitScreenshot.data, 'base64'));

// 2. Click Preset: "平时分反推期末"
console.log('Step 2: Clicking preset "📈 平时分反推期末"...');
await evaluate(`
  (() => {
    const chips = Array.from(document.querySelectorAll('.novip-ai-preset-chip'));
    const gpaChip = chips.find(c => c.textContent?.includes('平时分反推')) || chips[2];
    if (gpaChip) gpaChip.click();
  })()
`);

await wait(1800);

const liveResponseAudit = await evaluate(`
  (() => {
    const messages = document.querySelectorAll('.novip-ai-message-row');
    const lastMsg = messages[messages.length - 1];
    const calcBox = lastMsg?.querySelector('.novip-ai-calc-box');
    const calcFormula = calcBox?.querySelector('.novip-ai-calc-formula')?.textContent?.trim();
    const calcContent = calcBox?.querySelector('.novip-ai-calc-content')?.textContent?.trim();
    const toolCards = Array.from(lastMsg?.querySelectorAll('.novip-ai-tool-card') || []).map(t => ({
      title: t.querySelector('.novip-ai-tool-title')?.textContent?.trim(),
      desc: t.querySelector('.novip-ai-tool-desc')?.textContent?.trim(),
      href: t.getAttribute('href')
    }));
    const followUps = Array.from(lastMsg?.querySelectorAll('.novip-ai-followup-pill') || []).map(p => p.textContent?.trim());
    const draftCard = lastMsg?.querySelector('.novip-ai-draft-card');
    
    return {
      messagesCount: messages.length,
      hasCalcBox: !!calcBox,
      calcFormula,
      calcContent,
      toolsCount: toolCards.length,
      toolCards,
      hasDraftCard: !!draftCard,
      followUps,
      docW: document.documentElement.clientWidth,
      docScrollW: document.documentElement.scrollWidth,
      hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  })()
`);
console.log('Live Response Audit:', liveResponseAudit);

const liveResponseScreenshot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '02-live-production-response.png'), Buffer.from(liveResponseScreenshot.data, 'base64'));

// 3. Multi-turn Follow-up: Click follow-up pill
console.log('Step 3: Triggering follow-up pill...');
const followUpTriggered = await evaluate(`
  (() => {
    const pills = document.querySelectorAll('.novip-ai-followup-pill');
    if (pills.length > 0) {
      const text = pills[0].textContent?.trim();
      pills[0].click();
      return { triggered: true, text };
    }
    return { triggered: false };
  })()
`);
console.log('Follow-up pill action:', followUpTriggered);

await wait(1800);

const liveMultiTurnAudit = await evaluate(`
  (() => {
    const messages = document.querySelectorAll('.novip-ai-message-row');
    return {
      messagesCount: messages.length,
      lastUserMsg: messages[messages.length - 2]?.textContent?.slice(0, 80),
      lastAiMsg: messages[messages.length - 1]?.textContent?.slice(0, 150)
    };
  })()
`);
console.log('Live Multi-turn Audit:', liveMultiTurnAudit);

const liveMultiTurnScreenshot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '03-live-production-multiturn.png'), Buffer.from(liveMultiTurnScreenshot.data, 'base64'));

// 4. Click Tool Transition (e.g. click tool card to navigate to /tools/grades)
console.log('Step 4: Clicking recommended tool card to navigate...');
const liveJump = await evaluate(`
  (() => {
    const toolCards = document.querySelectorAll('.novip-ai-tool-card');
    const gradesCard = Array.from(toolCards).find(c => c.getAttribute('href')?.includes('grades')) || toolCards[0];
    if (gradesCard) {
      const href = gradesCard.getAttribute('href');
      gradesCard.click();
      return { success: true, href };
    }
    return { success: false };
  })()
`);
console.log('Live Jump triggered:', liveJump);

await wait(2200);

const liveAfterJump = await evaluate(`
  (() => {
    return {
      currentUrl: window.location.href,
      title: document.title,
      heading: document.querySelector('h1')?.textContent?.trim(),
      docW: document.documentElement.clientWidth,
      docScrollW: document.documentElement.scrollWidth,
      hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  })()
`);
console.log('Live After Jump Audit:', liveAfterJump);

const liveJumpScreenshot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '04-live-production-tool-jumped.png'), Buffer.from(liveJumpScreenshot.data, 'base64'));

// Save full verification results
const liveReport = {
  timestamp: new Date().toISOString(),
  target: 'https://novip.site/tools/ai',
  liveInitial,
  liveResponseAudit,
  followUpTriggered,
  liveMultiTurnAudit,
  liveToolJump: {
    triggered: liveJump,
    afterState: liveAfterJump
  }
};

await writeFile(path.join(OUT_DIR, 'live-production-audit.json'), JSON.stringify(liveReport, null, 2));

console.log('Live production verification complete! Results in', OUT_DIR);

ws.close();
chromeProc.kill();
