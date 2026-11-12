import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join(process.cwd(), 'test-artifacts', 'audit-novip-ai-v2');
await mkdir(OUT_DIR, { recursive: true });

console.log('Starting Vite preview server on port 4176...');
const previewProc = spawn('npx', ['vite', 'preview', '--port', '4176', '--host', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: 'ignore'
});

const wait = (ms) => new Promise(r => setTimeout(r, ms));

let ready = false;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch('http://127.0.0.1:4176/');
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
  console.error('Failed to start preview server on port 4176');
  process.exit(1);
}
console.log('Preview server ready.');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9228;
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-wechat-cdp-' + Date.now());

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

console.log('Setting Android WeChat emulation (390x844, dpr 3)...');
await send('Network.setUserAgentOverride', { userAgent: WECHAT_UA });
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true
});

// Step 1: Navigate to AI tool
console.log('Step 1: Navigating to http://127.0.0.1:4176/tools/ai ...');
await send('Page.navigate', { url: 'http://127.0.0.1:4176/tools/ai' });
await wait(1800);

// Check initial render
const initAudit = await evaluate(`
  (() => {
    const docW = document.documentElement.clientWidth;
    const docScrollW = document.documentElement.scrollWidth;
    const bodyScrollW = document.body.scrollWidth;
    const hasWeChatHint = !!document.querySelector('.novip-ai-wechat-hint');
    const title = document.querySelector('h1')?.textContent;
    const presetsCount = document.querySelectorAll('.novip-ai-preset-chip').length;
    return {
      docW,
      docScrollW,
      bodyScrollW,
      hasOverflow: docScrollW > docW + 1 || bodyScrollW > docW + 1,
      hasWeChatHint,
      title,
      presetsCount
    };
  })()
`);
console.log('Initial WeChat Audit:', initAudit);

const initScreenshot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '01-wechat-initial.png'), Buffer.from(initScreenshot.data, 'base64'));

// Step 2: Test sending question via preset chip (e.g. 辅导员请假)
console.log('Step 2: Clicking preset chip (辅导员请假文案)...');
await evaluate(`
  (() => {
    const chips = Array.from(document.querySelectorAll('.novip-ai-preset-chip'));
    const leaveChip = chips.find(c => c.textContent?.includes('辅导员请假')) || chips[1];
    if (leaveChip) {
      leaveChip.click();
      return true;
    }
    return false;
  })()
`);

await wait(1200);

// Check AI response elements
const responseAudit = await evaluate(`
  (() => {
    const docW = document.documentElement.clientWidth;
    const docScrollW = document.documentElement.scrollWidth;
    const messages = document.querySelectorAll('.novip-ai-message-row');
    const lastMsg = messages[messages.length - 1];
    const draftCard = lastMsg?.querySelector('.novip-ai-draft-card');
    const draftTitle = draftCard?.querySelector('.novip-ai-draft-title')?.textContent;
    const draftBody = draftCard?.querySelector('.novip-ai-draft-body')?.textContent;
    const toolsCount = lastMsg?.querySelectorAll('.novip-ai-tool-card').length;
    const followUpsCount = lastMsg?.querySelectorAll('.novip-ai-followup-pill').length;
    const hasCopyBtn = !!draftCard?.querySelector('.novip-ai-draft-copy-btn');
    return {
      docW,
      docScrollW,
      hasOverflow: docScrollW > docW + 1,
      messagesCount: messages.length,
      hasDraftCard: !!draftCard,
      draftTitle,
      draftSnippet: draftBody?.slice(0, 100),
      toolsCount,
      followUpsCount,
      hasCopyBtn
    };
  })()
`);
console.log('Response Audit:', responseAudit);

const responseScreenshot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '02-wechat-ai-response.png'), Buffer.from(responseScreenshot.data, 'base64'));

// Step 3: Test Multi-Turn Conversation (Clicking Follow-Up Pill or Typing)
console.log('Step 3: Clicking quick follow-up pill (multi-turn conversation)...');
const clickFollowUp = await evaluate(`
  (() => {
    const pills = document.querySelectorAll('.novip-ai-followup-pill');
    if (pills.length > 0) {
      const text = pills[0].textContent;
      pills[0].click();
      return text;
    }
    return null;
  })()
`);
console.log('Clicked Follow-Up Pill:', clickFollowUp);

await wait(1200);

const multiTurnAudit = await evaluate(`
  (() => {
    const messages = document.querySelectorAll('.novip-ai-message-row');
    const lastUser = messages[messages.length - 2]?.querySelector('.novip-ai-bubble')?.textContent;
    const lastAsst = messages[messages.length - 1]?.querySelector('.novip-ai-bubble')?.textContent;
    return {
      totalMessages: messages.length,
      lastUserSnippet: lastUser?.slice(0, 50),
      lastAsstSnippet: lastAsst?.slice(0, 100)
    };
  })()
`);
console.log('Multi-Turn Audit:', multiTurnAudit);

const multiTurnScreenshot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '03-wechat-multiturn.png'), Buffer.from(multiTurnScreenshot.data, 'base64'));

// Step 4: Test Tool Jump (Clicking "立即打开" on leave-helper card)
console.log('Step 4: Testing Tool Jump to leave-helper...');
const jumpResult = await evaluate(`
  (() => {
    const toolCards = document.querySelectorAll('.novip-ai-tool-card');
    const leaveHelperCard = Array.from(toolCards).find(c => c.getAttribute('href')?.includes('leave-helper'));
    if (leaveHelperCard) {
      leaveHelperCard.click();
      return true;
    }
    return false;
  })()
`);

await wait(1200);

const afterJumpAudit = await evaluate(`
  (() => {
    const currentUrl = window.location.href;
    const title = document.querySelector('h1')?.textContent;
    const docW = document.documentElement.clientWidth;
    const docScrollW = document.documentElement.scrollWidth;
    return {
      currentUrl,
      title,
      hasOverflow: docScrollW > docW + 1
    };
  })()
`);
console.log('After Jump Audit:', afterJumpAudit);

const jumpScreenshot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT_DIR, '04-wechat-tool-jumped.png'), Buffer.from(jumpScreenshot.data, 'base64'));

// Write full audit summary
const summary = {
  timestamp: new Date().toISOString(),
  environment: 'Android WeChat (MicroMessenger 8.0.48 / Android 14 / Pixel 7)',
  viewport: '390x844 @3x',
  initialAudit: initAudit,
  responseAudit: responseAudit,
  multiTurnAudit: {
    clickedPill: clickFollowUp,
    result: multiTurnAudit
  },
  toolJumpAudit: {
    jumpTriggered: jumpResult,
    afterJump: afterJumpAudit
  }
};

await writeFile(path.join(OUT_DIR, 'wechat-audit-summary.json'), JSON.stringify(summary, null, 2));

console.log('WeChat verification completed successfully! Report in', OUT_DIR);

ws.close();
chromeProc.kill();
previewProc.kill();
