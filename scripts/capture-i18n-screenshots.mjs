import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const OUT_DIR = path.join(process.cwd(), 'test-artifacts', 'i18n-screenshots');
await mkdir(OUT_DIR, { recursive: true });

const PORT = 4192;
console.log(`[i18n-capture] Starting Vite preview server on http://127.0.0.1:${PORT} ...`);
const previewProc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: 'ignore',
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let serverReady = false;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    if (res.ok) {
      serverReady = true;
      break;
    }
  } catch {
    await wait(300);
  }
}

if (!serverReady) {
  previewProc.kill();
  console.error('[i18n-capture] Failed to start preview server');
  process.exit(1);
}

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function withChromeInstance(extraFlags, fn) {
  const debugPort = 9400 + Math.floor(Math.random() * 400);
  const userDataDir = path.join(os.tmpdir(), `chrome-novip-i18n-${Date.now()}-${debugPort}`);
  const proc = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      '--no-sandbox',
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${debugPort}`,
      ...extraFlags,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  await wait(1500);

  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    try {
      const listRes = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (listRes.ok) {
        const list = await listRes.json();
        const page = list.find(
          (t) =>
            t.type === 'page' &&
            !t.url.startsWith('chrome-extension') &&
            !t.url.startsWith('chrome:'),
        );
        if (page?.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      }
    } catch {}
    await wait(300);
  }

  if (!wsUrl) {
    proc.kill();
    throw new Error('Failed to connect to Chrome CDP WebSocket');
  }

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

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evalJs = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result ? res.result.value : undefined;
  };

  const saveScreenshot = async (filename) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const fullPath = path.join(OUT_DIR, filename);
    await writeFile(fullPath, Buffer.from(data, 'base64'));
    console.log(`Saved screenshot: ${fullPath}`);
    return fullPath;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  try {
    await fn({ send, evalJs, saveScreenshot });
  } finally {
    ws.close();
    proc.kill();
  }
}

try {
  // 1. Desktop captures (1440x900)
  await withChromeInstance(['--window-size=1440,900'], async ({ send, evalJs, saveScreenshot }) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });

    console.log('Navigating to Desktop Home (zh-CN)...');
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await wait(2000);

    await saveScreenshot('desktop-home-zh.png');

    // Benchmark toggle to EN
    console.log('Switching to EN-US...');
    const switchStart = await evalJs(`(() => {
      const t0 = performance.now();
      const btn = document.querySelector('.novip-lang-segment:nth-child(3)');
      if (btn) btn.click();
      return performance.now() - t0;
    })()`);
    await wait(600);

    console.log(`Desktop switch latency: ${switchStart?.toFixed(2)}ms`);
    await saveScreenshot('desktop-home-en.png');

    // Navigate to a tool (grades) to verify state preservation
    console.log('Testing tool state retention during language toggle...');
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/tools/grades` });
    await wait(1500);

    // Fill some values in Grades
    await evalJs(`(() => {
      const inputs = document.querySelectorAll('input[type="number"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter && inputs.length >= 2) {
        setter.call(inputs[0], "80");
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        setter.call(inputs[1], "40");
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await wait(500);
    await saveScreenshot('tool-grades-en.png');

    // Toggle back to ZH and verify inputs remain 80 and 40!
    await evalJs(`(() => {
      const btn = document.querySelector('.novip-lang-segment:nth-child(1)');
      if (btn) btn.click();
    })()`);
    await wait(600);

    const valuesRetained = await evalJs(`(() => {
      const inputs = document.querySelectorAll('input[type="number"]');
      return inputs.length >= 2 && inputs[0].value === "80" && inputs[1].value === "40";
    })()`);
    console.log(`Tool form values 100% retained after language switch: ${valuesRetained}`);
    await saveScreenshot('tool-grades-zh.png');
  });

  // 2. Mobile captures (390x844 iPhone 14/15)
  await withChromeInstance(['--window-size=390,844'], async ({ send, evalJs, saveScreenshot }) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      screenOrientation: { angle: 0, type: 'portraitPrimary' },
    });

    console.log('Navigating to Mobile Home (zh-CN)...');
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await wait(2000);

    await saveScreenshot('mobile-home-zh.png');

    console.log('Switching to EN on Mobile...');
    await evalJs(`(() => {
      const btn = document.querySelector('.novip-lang-segment:nth-child(3)');
      if (btn) btn.click();
    })()`);
    await wait(600);

    await saveScreenshot('mobile-home-en.png');
  });

  console.log('[i18n-capture] All screenshots captured successfully in test-artifacts/i18n-screenshots!');
} finally {
  previewProc.kill();
}
