#!/usr/bin/env node
/**
 * NOVIP 高清宣传截图脚本
 * 真正的 Chromium + Playwright，手机 DPR=3、电脑 DPR=2。
 * 仅访问公开网站，示例数据只在临时浏览器本地使用。
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NOVIP_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.NOVIP_CAPTURE_BASE_URL || 'https://novip.site';
const output = path.resolve(process.env.NOVIP_CAPTURE_OUTPUT || 'docs/screenshots');
const targets = [
  { name: 'home', url: '/', target: null },
  { name: 'pdf', url: '/tools/pdf-merge-split', target: /选择文件|上传|合并与拆分/ },
  { name: 'grades', url: '/tools/grades', target: /输入你的成绩与目标/ },
  { name: 'timetable', url: '/tools/timetable', target: /添加课程|课程名称|一周课表/ },
  { name: 'photo', url: '/tools/id-photo', target: /第二步：选底色与尺寸/ },
];
const devices = [
  { name: 'desktop', viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-sandbox'] });
const manifest = [];
let failures = 0;
try {
  for (const device of devices) {
    const context = await browser.newContext({
      ...device,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    for (const target of targets) {
      const page = await context.newPage();
      const label = device.name + '-' + target.name;
      try {
        const res = await page.goto(new URL(target.url, base).href, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        if (!res || res.status() >= 400) throw new Error('HTTP ' + (res?.status() ?? 'unknown'));
        await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForTimeout(1800);

        // 用站内示例数据展示工具成果，无需上传私人文件。
        if (target.name === 'timetable') {
          const demo = page.getByRole('button', { name: /载入示例课表|加载示例课表/ }).first();
          if (await demo.count() && await demo.isVisible()) {
            await demo.click({ timeout: 3500 }).catch(() => {});
            await page.waitForTimeout(500);
          }
        }
        if (target.name === 'photo') {
          const demo = page.getByRole('button', { name: /载入示例照片/ }).first();
          if (await demo.count() && await demo.isVisible()) {
            await demo.click({ timeout: 3500 }).catch(() => {});
            await page.waitForTimeout(700);
          }
        }
        if (target.name === 'pdf') {
          // Real in-repository test PDF: show an actual file in the native upload UI.
          const fixture = path.resolve('docs/qa-logs/batch1/fixtures/sample-3p.pdf');
          await page.locator('input[type=file]').first().setInputFiles(fixture).catch(() => {});
          await page.waitForTimeout(500);
        }
        if (target.target) {
          const matches = page.locator('h2,h3,h4,label,legend').filter({ hasText: target.target });
          if (await matches.count()) {
            const heading = matches.first();
            await heading.evaluate((el, offset) => {
              const absoluteTop = el.getBoundingClientRect().top + window.scrollY;
              window.scrollTo({ top: Math.max(0, absoluteTop - offset), behavior: 'instant' });
            }, device.name === 'mobile' ? 110 : 145);
          } else {
            await page.evaluate((mobile) => window.scrollTo(0, mobile ? 950 : 540), device.name === 'mobile');
          }
        } else {
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        await page.waitForTimeout(600);
        const fail = page.getByText('页面没能正常加载', { exact: false });
        if (await fail.count() && await fail.first().isVisible()) throw new Error('网站加载失败页面，拒绝截图');
        const filename = label + '.png';
        const file = path.join(output, filename);
        const png = await page.screenshot({ path: file, type: 'png', animations: 'disabled' });
        const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
        if (width < 1100 || height < 1900) throw new Error('非高清截图：' + width + 'x' + height);
        manifest.push({ label, url: page.url(), filename, width, height, bytes: png.length });
        console.log('OK', label, width + '×' + height, png.length);
      } catch (err) {
        failures++;
        console.error('FAIL', label, err?.message ?? err);
      } finally {
        await page.close();
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({
  capturedAt: new Date().toISOString(), base, screenshots: manifest, failures,
}, null, 2) + '\n');
if (manifest.length < 6 || failures > 3) {
  console.error('截图质量门禁未通过：成功', manifest.length, '失败', failures);
  process.exitCode = 1;
}
