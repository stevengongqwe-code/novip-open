#!/usr/bin/env node
/**
 * audit-apple-craft.mjs
 * Headless Chrome CDP audit script for NOVIP Apple Craft Delight Experience.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join(process.cwd(), 'test-artifacts', 'audit-apple-craft');
mkdirSync(OUT_DIR, { recursive: true });

const CDP_PORT = Number(process.env.CDP_PORT || 9335);
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT || 4179);
const BASE_URL = `http://127.0.0.1:${PREVIEW_PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* wait */
    }
    await sleep(250);
  }
  throw new Error(`Service at ${url} failed to start.`);
}

async function main() {
  console.log(`Connecting to preview on ${BASE_URL} and Chrome on CDP port ${CDP_PORT}...`);
  await waitForHttp(`${BASE_URL}/`);
  await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/list`);

  let target = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await res.json();
      target = list.find((t) => t.type === 'page');
      if (target?.webSocketDebuggerUrl) break;
    } catch {}
    await sleep(300);
  }
  if (!target?.webSocketDebuggerUrl) throw new Error('No page target found');

  try {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let nextId = 0;
    const pending = new Map();

    const wsOpen = new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    };
    await wsOpen;

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      });
      if (res.exceptionDetails) {
        const d = res.exceptionDetails;
        throw new Error(d.exception?.description ?? d.text ?? 'evaluate failed');
      }
      return res.result?.value;
    }

    async function setViewport(width, height, mobile = true) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile,
      });
    }

    async function capture(name) {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const outPath = join(OUT_DIR, `${name}.png`);
      writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
      console.log(`Saved screenshot: ${name}.png`);
    }

    const auditResults = [];

    // --- CASE 1: 390x844 iPhone Pro Home Top ---
    await setViewport(390, 844, true);
    await send('Page.navigate', { url: `${BASE_URL}/` });
    await sleep(1500);

    const metrics390 = await evaluate(`(() => {
      const doc = document.documentElement;
      const vw = window.innerWidth;
      const island = document.querySelector('.ios-dynamic-island');
      const scenarios = document.querySelectorAll('.ios-scenario-pill');
      const forYouCards = document.querySelectorAll('.x-foryou-card');
      const springboardIcons = document.querySelectorAll('.ios-springboard-item');
      return {
        vw,
        scrollWidth: doc.scrollWidth,
        overflow: doc.scrollWidth > vw,
        hasIsland: Boolean(island),
        scenariosCount: scenarios.length,
        forYouCount: forYouCards.length,
        springboardCount: springboardIcons.length,
      };
    })()`);
    auditResults.push({ name: 'craft-390-home-top', metrics: metrics390 });
    await capture('craft-390-home-top');

    // --- CASE 2: 390x844 Click Dynamic Island (Expanded Sheet) ---
    await evaluate(`(() => {
      const btn = document.querySelector('.ios-dynamic-island--clickable');
      if (btn) btn.click();
    })()`);
    await sleep(500);
    const islandExpandedMetrics = await evaluate(`(() => {
      const card = document.querySelector('.ios-dynamic-island-expanded-card');
      return {
        cardVisible: Boolean(card),
        cardText: card ? card.innerText.slice(0, 100) : '',
      };
    })()`);
    auditResults.push({ name: 'craft-390-island-expanded', metrics: islandExpandedMetrics });
    await capture('craft-390-island-expanded');

    // Close expanded island
    await evaluate(`(() => {
      const closeBtn = document.querySelector('.ios-island-sheet-close') || document.querySelector('.ios-dynamic-island--clickable');
      if (closeBtn) closeBtn.click();
    })()`);
    await sleep(400);

    // --- CASE 3: 390x844 Click "考证报名" Scenario Pill ---
    await evaluate(`(() => {
      const pill = [...document.querySelectorAll('.ios-scenario-pill')].find(el => el.textContent.includes('考证报名'));
      if (pill) pill.click();
    })()`);
    await sleep(500);
    const scenarioMetrics = await evaluate(`(() => {
      const activePill = document.querySelector('.ios-scenario-pill.active');
      const displayedItems = document.querySelectorAll('.ios-springboard-item');
      return {
        activeText: activePill ? activePill.textContent : '',
        displayedCount: displayedItems.length,
      };
    })()`);
    auditResults.push({ name: 'craft-390-scenario-active', metrics: scenarioMetrics });
    await capture('craft-390-scenario-active');

    // --- CASE 3B: Grok Intent Solver in Spotlight ---
    await send('Page.navigate', { url: `${BASE_URL}/` });
    await sleep(1000);
    await evaluate(`(() => {
      const input = document.getElementById('novip-home-search');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, '老师发了课件PPT我想把里面的图拿出来');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await sleep(500);
    const grokMetrics = await evaluate(`(() => {
      const doc = document.documentElement;
      const vw = window.innerWidth;
      const grokCard = document.querySelector('.grok-intent-card');
      const title = document.querySelector('.grok-intent-tag')?.textContent || '';
      return {
        vw,
        scrollWidth: doc.scrollWidth,
        overflow: doc.scrollWidth > vw,
        hasGrokCard: Boolean(grokCard),
        grokTitle: title,
      };
    })()`);
    auditResults.push({ name: 'craft-390-grok-intent', metrics: grokMetrics });
    await capture('craft-390-grok-intent');

    // --- CASE 4: Subpage iOS Nav on /tools/ppt-extract ---
    await send('Page.navigate', { url: `${BASE_URL}/tools/ppt-extract` });
    await sleep(1500);
    const subpageMetrics = await evaluate(`(() => {
      const doc = document.documentElement;
      const vw = window.innerWidth;
      const nav = document.querySelector('.ios-subpage-nav');
      const backBtn = document.querySelector('.ios-subpage-back');
      const shareBtn = document.querySelector('.ios-subpage-action-btn');
      const rect = backBtn ? backBtn.getBoundingClientRect() : null;
      return {
        vw,
        scrollWidth: doc.scrollWidth,
        overflow: doc.scrollWidth > vw,
        hasNav: Boolean(nav),
        backBtnTarget: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
      };
    })()`);
    auditResults.push({ name: 'craft-390-subpage-ppt-extract', metrics: subpageMetrics });
    await capture('craft-390-subpage-ppt-extract');

    // --- CASE 5: Trigger Share / Toast Notification ---
    await evaluate(`(() => {
      const shareBtn = document.querySelector('.ios-subpage-action-btn');
      if (shareBtn) shareBtn.click();
    })()`);
    await sleep(300);
    const toastMetrics = await evaluate(`(() => {
      const hud = document.querySelector('.ios-hud-toast.visible');
      return {
        hudVisible: Boolean(hud),
        hudText: hud ? hud.textContent.trim() : '',
      };
    })()`);
    auditResults.push({ name: 'craft-390-toast-hud', metrics: toastMetrics });
    await capture('craft-390-toast-hud');

    // --- CASE 6: 375x667 iPhone SE / mini ---
    await setViewport(375, 667, true);
    await send('Page.navigate', { url: `${BASE_URL}/` });
    await sleep(1200);
    const metrics375 = await evaluate(`(() => {
      const doc = document.documentElement;
      return { vw: window.innerWidth, scrollWidth: doc.scrollWidth, overflow: doc.scrollWidth > window.innerWidth };
    })()`);
    auditResults.push({ name: 'craft-375-home-se', metrics: metrics375 });
    await capture('craft-375-home-se');

    // --- CASE 7: 430x932 iPhone Pro Max ---
    await setViewport(430, 932, true);
    await send('Page.navigate', { url: `${BASE_URL}/` });
    await sleep(1200);
    const metrics430 = await evaluate(`(() => {
      const doc = document.documentElement;
      return { vw: window.innerWidth, scrollWidth: doc.scrollWidth, overflow: doc.scrollWidth > window.innerWidth };
    })()`);
    auditResults.push({ name: 'craft-430-home-promax', metrics: metrics430 });
    await capture('craft-430-home-promax');

    // --- CASE 8: 768x1024 iPad ---
    await setViewport(768, 1024, true);
    await send('Page.navigate', { url: `${BASE_URL}/` });
    await sleep(1200);
    const metrics768 = await evaluate(`(() => {
      const doc = document.documentElement;
      return { vw: window.innerWidth, scrollWidth: doc.scrollWidth, overflow: doc.scrollWidth > window.innerWidth };
    })()`);
    auditResults.push({ name: 'craft-768-ipad', metrics: metrics768 });
    await capture('craft-768-ipad');

    // --- CASE 9: 1440x900 Desktop ---
    await setViewport(1440, 900, false);
    await send('Page.navigate', { url: `${BASE_URL}/` });
    await sleep(1200);
    const metrics1440 = await evaluate(`(() => {
      const doc = document.documentElement;
      return { vw: window.innerWidth, scrollWidth: doc.scrollWidth, overflow: doc.scrollWidth > window.innerWidth };
    })()`);
    auditResults.push({ name: 'craft-1440-desktop', metrics: metrics1440 });
    await capture('craft-1440-desktop');

    writeFileSync(join(OUT_DIR, 'apple-craft-metrics.json'), JSON.stringify(auditResults, null, 2));
    console.log('Audit completed successfully. Results written to', join(OUT_DIR, 'apple-craft-metrics.json'));

    ws.close();
  } catch (err) {
    console.error('Audit loop failed:', err);
    throw err;
  }
}

main().catch((err) => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
