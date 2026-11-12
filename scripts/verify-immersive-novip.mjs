import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const OUT_DIR =
  process.env.IMMERSIVE_AUDIT_OUT ||
  path.join(process.cwd(), 'test-artifacts', 'audit-immersive-novip');
await mkdir(OUT_DIR, { recursive: true });

const PORT = 4189;
console.log(`[verify-immersive] Starting Vite preview server on http://127.0.0.1:${PORT} ...`);
const previewProc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: 'ignore',
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let serverReady = false;
for (let i = 0; i < 35; i++) {
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
  console.error('[verify-immersive] Failed to start preview server');
  process.exit(1);
}

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function withChromeInstance(extraFlags, fn) {
  const debugPort = 9300 + Math.floor(Math.random() * 400);
  const userDataDir = path.join(os.tmpdir(), `chrome-novip-imm-${Date.now()}-${debugPort}`);
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
  const consoleErrors = [];
  const pageExceptions = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      pageExceptions.push(msg.params?.exceptionDetails?.text || 'exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      const text = (msg.params.args || []).map((a) => a.value || a.description || '').join(' ');
      consoleErrors.push(text);
    }
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
    return fullPath;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Performance.enable');

  try {
    return await fn({ send, evalJs, saveScreenshot, consoleErrors, pageExceptions });
  } finally {
    ws.close();
    proc.kill();
  }
}

const summary = {
  timestamp: new Date().toISOString(),
  desktopWebGL: null,
  mobileWeChat: null,
  navigationAndBack: null,
  webglDisabledFallback: null,
  slowNetworkResilience: null,
  performanceMetrics: null,
  screenshots: [],
};

try {
  // 1-3 & 5: Desktop WebGL + Mobile WeChat + Navigation/Back + Slow Network
  await withChromeInstance(
    ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=metal'],
    async ({ send, evalJs, saveScreenshot, consoleErrors, pageExceptions }) => {
      // A. Desktop Viewport (1440x900@2x)
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 2,
        mobile: false,
      });

      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      await wait(1800);

      // Dispatch pointer move across hero stage & cards
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 720, y: 320 });
      await wait(300);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 520, y: 380 });
      await wait(400);

      const desktopState = await evalJs(`(async () => {
        const hero = document.querySelector('.novip-hero-evolution');
        const canvas = document.querySelector('.novip-immersion-canvas');
        const holoBar = document.querySelector('.novip-holo-bar');
        const orbBtn = document.querySelector('.novip-holo-orb-btn');
        const readout = document.querySelector('.novip-holo-readout-text');
        const beforeText = readout ? readout.textContent : '';
        if (orbBtn) orbBtn.click();
        await new Promise(r => setTimeout(r, 120));
        const afterText = readout ? readout.textContent : '';
        const stageWrap = document.querySelector('.novip-immersion-stage-wrap');
        const showcaseBox = document.querySelector('.novip-showcase-box');
        const flagshipCard = document.querySelector('.novip-flagship-card');
        const blurSplit = document.querySelector('.novip-blur-split-root');
        const metricsBar = document.querySelector('.novip-hero-metrics-bar');
        const sparkCanvas = document.querySelector('.novip-click-spark-canvas');
        const dynamicIsland = document.querySelector('.ios-dynamic-island');
        if (dynamicIsland) dynamicIsland.click();
        await new Promise(r => setTimeout(r, 150));
        const hasAdaptiveDialog = Boolean(document.querySelector('.novip-adaptive-dialog'));
        const closeBtn = document.querySelector('.novip-adaptive-close');
        if (closeBtn) closeBtn.click();
        await new Promise(r => setTimeout(r, 120));
        return {
          booted: window.__NOVIP_BOOTED === true,
          recoveryHidden: getComputedStyle(document.getElementById('novip-boot-recovery')).display === 'none',
          visualModeAttr: document.documentElement.getAttribute('data-novip-visual-mode'),
          bodyBg: getComputedStyle(document.body).backgroundColor,
          isGlobalStage: stageWrap ? stageWrap.classList.contains('is-global-stage') : false,
          stagePosition: stageWrap ? getComputedStyle(stageWrap).position : null,
          showcaseBg: showcaseBox ? getComputedStyle(showcaseBox).backgroundColor : null,
          flagshipBg: flagshipCard ? getComputedStyle(flagshipCard).backgroundImage : null,
          isImmersiveHero: hero ? hero.classList.contains('is-immersive-hero') : false,
          hasCanvas: Boolean(canvas),
          canvasWidth: canvas ? canvas.width : 0,
          canvasHeight: canvas ? canvas.height : 0,
          canvasTier: canvas ? canvas.getAttribute('data-tier') : null,
          canvasWebgl: canvas ? canvas.getAttribute('data-webgl') : null,
          hasHoloBar: Boolean(holoBar),
          hasBlurSplit: Boolean(blurSplit),
          hasMetricsBar: Boolean(metricsBar),
          hasSparkCanvas: Boolean(sparkCanvas),
          hasAdaptiveDialog,
          beforeText,
          afterText,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
        };
      })()`);

      assert.equal(desktopState.booted, true, 'Desktop boot guard must signal booted');
      assert.equal(desktopState.recoveryHidden, true, 'Recovery overlay must be hidden');
      assert.equal(desktopState.visualModeAttr, 'immersive', 'Root html must be in immersive visual mode');
      assert.equal(desktopState.bodyBg, 'rgb(4, 7, 17)', 'Body background must be deep space #040711');
      assert.equal(desktopState.isGlobalStage, true, 'WebGL stage must be full-viewport global stage');
      assert.equal(desktopState.stagePosition, 'fixed', 'Global WebGL stage must be position: fixed');
      assert.equal(desktopState.isImmersiveHero, true, 'Hero must be in immersive mode by default');
      assert.equal(desktopState.hasCanvas, true, 'Immersion canvas must exist');
      assert.ok(desktopState.canvasWidth > 0 && desktopState.canvasHeight > 0, 'Canvas must have non-zero size');
      assert.equal(desktopState.hasBlurSplit, true, 'Hero must render BlurSplitText headline');
      assert.equal(desktopState.hasMetricsBar, true, 'Hero must render CountUpMetric bar');
      assert.equal(desktopState.hasSparkCanvas, true, 'Global shell must render ClickSparkLayer canvas');
      assert.equal(desktopState.hasAdaptiveDialog, true, 'Clicking Dynamic Island must open AdaptiveDialog');
      assert.notEqual(desktopState.beforeText, desktopState.afterText, 'Clicking 3D orb must cycle telemetry state');
      assert.equal(desktopState.horizontalOverflow, false, 'Desktop must have zero horizontal overflow');

      summary.desktopWebGL = desktopState;
      summary.screenshots.push(await saveScreenshot('01-desktop-immersive-home.png'));

      // Scroll down to mid-page (Flagship + Springboard + 60-Tool List) to verify full-page immersion
      await evalJs(`window.scrollTo({ top: 1180, behavior: 'instant' })`);
      await wait(450);
      summary.screenshots.push(await saveScreenshot('01b-desktop-immersive-scrolled.png'));
      await evalJs(`window.scrollTo({ top: 0, behavior: 'instant' })`);
      await wait(300);

      // Test switching to Daylight mode and back to Immersive mode
      await evalJs(`(() => {
        const btns = Array.from(document.querySelectorAll('.novip-holo-mode-btn'));
        const daylightBtn = btns.find(b => b.textContent.includes('纯净日光'));
        if (daylightBtn) daylightBtn.click();
      })()`);
      await wait(400);
      summary.screenshots.push(await saveScreenshot('02-desktop-daylight-mode.png'));

      await evalJs(`(() => {
        const btns = Array.from(document.querySelectorAll('.novip-holo-mode-btn'));
        const immBtn = btns.find(b => b.textContent.includes('沉浸深空'));
        if (immBtn) immBtn.click();
      })()`);
      await wait(400);

      // Collect performance metrics on desktop home
      const perf = await send('Performance.getMetrics');
      summary.performanceMetrics = Object.fromEntries(
        perf.metrics.map((m) => [m.name, m.value]),
      );

      // B. Page Navigation & History Back Test
      await evalJs(`(() => {
        const link = document.querySelector('a[href="/tools/id-photo"]');
        if (link) link.click();
      })()`);
      await wait(800);
      const onSubpage = await evalJs(`({
        path: location.pathname,
        hasRouteStage: Boolean(document.querySelector('.novip-route-stage')),
        hasSubpageNav: Boolean(document.querySelector('.ios-subpage-nav')),
        hasQuickNavBtn: Boolean(document.querySelector('.novip-nav-quick-btn')),
        hasGlobalCanvasOnSubpage: Boolean(document.querySelector('.novip-immersion-canvas')),
        hasSubpageHoloStrip: Boolean(document.querySelector('.novip-subpage-holo-strip')),
        bodyBgOnSubpage: getComputedStyle(document.body).backgroundColor,
        h1: document.querySelector('h1')?.textContent || ''
      })`);
      assert.equal(onSubpage.path, '/tools/id-photo');
      assert.equal(onSubpage.hasRouteStage, true);
      assert.equal(onSubpage.hasQuickNavBtn, true, 'Subpage must display quick tool switcher button');
      assert.equal(onSubpage.hasGlobalCanvasOnSubpage, true, 'Subpage must retain full-viewport WebGL canvas');
      assert.equal(onSubpage.hasSubpageHoloStrip, true, 'Subpage must display holographic control strip');
      assert.equal(onSubpage.bodyBgOnSubpage, 'rgb(4, 7, 17)', 'Subpage body must be deep space #040711');
      summary.screenshots.push(await saveScreenshot('03-desktop-subpage-idphoto.png'));

      await evalJs(`history.back()`);
      await wait(600);
      const backHome = await evalJs(`({
        path: location.pathname,
        hasImmersiveHero: Boolean(document.querySelector('.novip-hero-evolution.is-immersive-hero'))
      })`);
      assert.equal(backHome.path, '/');
      assert.equal(backHome.hasImmersiveHero, true);
      summary.navigationAndBack = { onSubpage, backHome };

      // C. Mobile Viewport + WeChat Built-In Browser Simulation (390x844@2x)
      const wechatUa =
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 MicroMessenger/8.0.48.2580(0x28003036) Process/toolsmp WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64';
      await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await send('Emulation.setUserAgentOverride', { userAgent: wechatUa });
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?wechat=1` });
      await wait(1600);

      const mobileWeChatState = await evalJs(`(() => {
        const canvas = document.querySelector('.novip-immersion-canvas');
        const tierBadge = document.querySelector('.novip-telemetry-tier');
        return {
          booted: window.__NOVIP_BOOTED === true,
          recoveryHidden: getComputedStyle(document.getElementById('novip-boot-recovery')).display === 'none',
          canvasTier: canvas ? canvas.getAttribute('data-tier') : null,
          tierBadgeText: tierBadge ? tierBadge.textContent : '',
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
        };
      })()`);

      assert.equal(mobileWeChatState.booted, true, 'Mobile WeChat must boot cleanly without white screen');
      assert.equal(mobileWeChatState.recoveryHidden, true, 'Mobile WeChat recovery panel must remain hidden');
      assert.equal(mobileWeChatState.canvasTier, 'lite', 'WeChat must automatically degrade to lite tier');
      assert.equal(mobileWeChatState.horizontalOverflow, false, 'Mobile WeChat must have zero horizontal overflow');

      summary.mobileWeChat = mobileWeChatState;
      summary.screenshots.push(await saveScreenshot('04-mobile-wechat-immersive.png'));

      // D. Slow Network Simulation Test (Throttled latency 120ms, throughput 450KB/s)
      await send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 120,
        downloadThroughput: 450 * 1024,
        uploadThroughput: 200 * 1024,
      });
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/tools/files` });
      let slowNetState = { booted: false, recoveryHidden: false, path: '' };
      for (let attempt = 0; attempt < 25; attempt++) {
        await wait(350);
        slowNetState = await evalJs(`({
          booted: window.__NOVIP_BOOTED === true,
          recoveryHidden: getComputedStyle(document.getElementById('novip-boot-recovery')).display === 'none',
          path: location.pathname
        })`);
        if (slowNetState.booted) break;
      }
      assert.equal(slowNetState.booted, true, 'Slow network must still boot cleanly');
      assert.equal(slowNetState.recoveryHidden, true);
      summary.slowNetworkResilience = slowNetState;

      assert.equal(pageExceptions.length, 0, `Unexpected page exceptions: ${pageExceptions.join('; ')}`);
    },
  );

  // 4: WebGL Unsupported Environment Test (--disable-webgl --disable-gpu)
  await withChromeInstance(
    ['--disable-gpu', '--disable-webgl', '--disable-3d-apis'],
    async ({ send, evalJs, saveScreenshot, pageExceptions }) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      await wait(1600);

      const noWebglState = await evalJs(`(() => {
        const canvas = document.querySelector('.novip-immersion-canvas');
        const tierBadge = document.querySelector('.novip-telemetry-tier');
        return {
          booted: window.__NOVIP_BOOTED === true,
          recoveryHidden: getComputedStyle(document.getElementById('novip-boot-recovery')).display === 'none',
          canvasTier: canvas ? canvas.getAttribute('data-tier') : null,
          canvasWebgl: canvas ? canvas.getAttribute('data-webgl') : null,
          tierBadgeText: tierBadge ? tierBadge.textContent : '',
          titleText: document.querySelector('.novip-hero-title')?.textContent || ''
        };
      })()`);

      assert.equal(noWebglState.booted, true, 'WebGL-disabled browser must boot cleanly');
      assert.equal(noWebglState.recoveryHidden, true);
      assert.equal(noWebglState.canvasTier, 'minimal', 'WebGL-disabled environment must use minimal safe tier');
      assert.equal(pageExceptions.length, 0, 'WebGL-disabled environment must throw zero exceptions');

      summary.webglDisabledFallback = noWebglState;
      summary.screenshots.push(await saveScreenshot('05-webgl-disabled-fallback.png'));
    },
  );

  const reportPath = path.join(OUT_DIR, 'immersive-audit-report.json');
  await writeFile(reportPath, JSON.stringify(summary, null, 2));
  console.log('[verify-immersive] ALL 5 BROWSER SUITES PASSED! Report saved to:', reportPath);
} finally {
  previewProc.kill();
}
