import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join(process.cwd(), 'test-artifacts', 'audit-gemini-assistant');
await mkdir(OUT_DIR, { recursive: true });

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9227;
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-gemini-cdp-' + Date.now());

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
  throw new Error('Could not get Chrome WebSocket URL');
}

const wsUrl = await getWsUrl();
const ws = new WebSocket(wsUrl);

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
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

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 892,
    deviceScaleFactor: 2,
    mobile: true
  });

  console.log('Navigating to http://localhost:4176/tools/ai ...');
  await send('Page.navigate', { url: 'http://localhost:4176/tools/ai' });
  await wait(2500);

  // 1. 验证首屏与页面标题
  const initialAudit = await send('Runtime.evaluate', {
    expression: `(() => {
      const title = document.querySelector('h1')?.textContent || '';
      const badge = document.querySelector('.novip-ai-badge-text')?.textContent || '';
      const settingsBtn = !!document.querySelector('.novip-ai-settings-btn');
      const presets = Array.from(document.querySelectorAll('.novip-ai-preset-chip')).map(b => b.textContent?.trim());
      return { title, badge, settingsBtn, presetsCount: presets.length };
    })()`,
    returnByValue: true
  });

  console.log('Initial Assistant State:', initialAudit.result.value);

  // 2. 点击打开设置弹窗
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('.novip-ai-settings-btn')?.click();
    })()`
  });
  await wait(800);

  // 截图：设置弹窗
  const modalScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT_DIR, '01-gemini-settings-modal.png'), Buffer.from(modalScreenshot.data, 'base64'));
  console.log('Saved 01-gemini-settings-modal.png');

  // 验证弹窗各 Tab
  const modalAudit = await send('Runtime.evaluate', {
    expression: `(() => {
      const modal = document.querySelector('.novip-ai-modal-card');
      const title = modal?.querySelector('.novip-ai-modal-title')?.textContent || '';
      const tabs = Array.from(document.querySelectorAll('.novip-ai-tab-btn')).map(t => t.textContent?.trim());
      const hasAiStudioLink = !!document.querySelector('a[href*="aistudio.google.com"]');
      const hasTestBtn = !!document.querySelector('.novip-ai-test-btn');
      return { isOpen: !!modal, title, tabs, hasAiStudioLink, hasTestBtn };
    })()`,
    returnByValue: true
  });

  console.log('Modal Audit:', modalAudit.result.value);

  // 3. 关闭弹窗
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('.novip-ai-modal-close-btn')?.click();
    })()`
  });
  await wait(600);

  // 4. 点击提问预设卡片：蓝底一寸照片
  console.log('Clicking preset prompt: 蓝底一寸报名照...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const firstPreset = document.querySelectorAll('.novip-ai-preset-chip')[0];
      firstPreset?.click();
    })()`
  });
  await wait(2000);

  // 截图：对话回复流
  const chatScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT_DIR, '02-gemini-chat-flow.png'), Buffer.from(chatScreenshot.data, 'base64'));
  console.log('Saved 02-gemini-chat-flow.png');

  // 验证消息流内容
  const chatAudit = await send('Runtime.evaluate', {
    expression: `(() => {
      const messages = document.querySelectorAll('.novip-ai-message-row');
      const assistantMsg = document.querySelector('.novip-ai-message-row.assistant');
      const toolCards = Array.from(document.querySelectorAll('.novip-ai-tool-card')).map(c => c.textContent?.trim());
      const hasDraftCard = !!document.querySelector('.novip-ai-draft-card');
      const hasCopyBtn = !!document.querySelector('.novip-ai-copy-btn');
      return {
        messageCount: messages.length,
        hasAssistantReply: !!assistantMsg,
        toolCardsCount: toolCards.length,
        toolCards,
        hasDraftCard,
        hasCopyBtn
      };
    })()`,
    returnByValue: true
  });

  console.log('Chat Audit Result:', chatAudit.result.value);

  const report = {
    timestamp: new Date().toISOString(),
    initialAudit: initialAudit.result.value,
    modalAudit: modalAudit.result.value,
    chatAudit: chatAudit.result.value,
    pass:
      initialAudit.result.value.title.includes('NOVIP 助手') &&
      initialAudit.result.value.badge.includes('Gemini') &&
      modalAudit.result.value.isOpen &&
      modalAudit.result.value.hasAiStudioLink &&
      chatAudit.result.value.toolCardsCount > 0
  };

  await writeFile(path.join(OUT_DIR, 'gemini-assistant-audit.json'), JSON.stringify(report, null, 2));
  console.log('Saved gemini-assistant-audit.json. Verification result:', report.pass ? 'PASS' : 'FAIL');

  if (!report.pass) {
    process.exit(1);
  }
} finally {
  ws.close();
  chromeProc.kill();
}
