import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

import {
  auditWebsite,
  sanitizePackageId,
  generatePwaManifest,
  generateServiceWorker,
  generateOfflineHtml,
  generateHeadMetaHtml,
  generateTwaAssetLinks,
  generatePwaZip,
  generateAndroidStudioProject,
  buildSignedApk,
  type WebToApkConfig,
} from '../src/tools/web-to-apk-core';

describe('NOVIP 网站一键生成安卓 APK · 核心引擎', () => {
  it('01. auditWebsite 智能识别网址、协议、域名并推断 Package ID', () => {
    // 1. 标准 HTTPS 网址
    const r1 = auditWebsite('https://novip.site/tools/timetable');
    assert.strictEqual(r1.isValid, true);
    assert.strictEqual(r1.isHttps, true);
    assert.strictEqual(r1.domain, 'novip.site');
    assert.strictEqual(r1.protocol, 'https');
    assert.strictEqual(r1.suggestedName, 'Novip');
    assert.strictEqual(r1.suggestedPackageId, 'site.novip.webapk');
    assert.strictEqual(r1.warnings.length, 0);

    // 2. 裸域名自动补全 https://
    const r2 = auditWebsite('bilibili.com');
    assert.strictEqual(r2.isValid, true);
    assert.strictEqual(r2.isHttps, true);
    assert.strictEqual(r2.cleanUrl, 'https://bilibili.com/');
    assert.strictEqual(r2.suggestedPackageId, 'com.bilibili.webapk');

    // 3. 非加密 HTTP 报警
    const r3 = auditWebsite('http://campus-portal.edu.cn');
    assert.strictEqual(r3.isValid, true);
    assert.strictEqual(r3.isHttps, false);
    assert.ok(r3.warnings.some(w => w.includes('HTTPS')));

    // 4. 空网址提示
    const r4 = auditWebsite('');
    assert.strictEqual(r4.isValid, false);
    assert.ok(r4.warnings.length > 0);
  });

  it('02. sanitizePackageId 规范化 Android 包名并修复非法字符', () => {
    assert.strictEqual(sanitizePackageId('site.novip.webapk'), 'site.novip.webapk');
    assert.strictEqual(sanitizePackageId('COM.BILI_BILI.APP!'), 'com.bili_bili.app');
    // 单段自动补齐两段
    assert.strictEqual(sanitizePackageId('myportal'), 'site.novip.myportal');
    // 数字开头段自动修复
    assert.strictEqual(sanitizePackageId('com.123campus.app'), 'com.app_123campus.app');
  });

  it('03. 生成标准 PWA 配置套件与 TWA 资产链接', async () => {
    const config: WebToApkConfig = {
      url: 'https://novip.site',
      name: 'NOVIP 大学生工具箱',
      packageId: 'site.novip.toolbox',
      themeColor: '#0071E3',
      immersive: true,
    };

    const manifestStr = generatePwaManifest(config);
    const manifest = JSON.parse(manifestStr);
    assert.strictEqual(manifest.name, 'NOVIP 大学生工具箱');
    assert.strictEqual(manifest.start_url, 'https://novip.site');
    assert.strictEqual(manifest.theme_color, '#0071E3');
    assert.strictEqual(manifest.display, 'fullscreen');

    const swCode = generateServiceWorker(config);
    assert.ok(swCode.includes('CACHE_NAME'));
    assert.ok(swCode.includes('STATIC_ASSETS'));

    const offlineHtml = generateOfflineHtml(config);
    assert.ok(offlineHtml.includes('离线状态'));
    assert.ok(offlineHtml.includes('NOVIP 大学生工具箱'));

    const metaHtml = generateHeadMetaHtml(config);
    assert.ok(metaHtml.includes('name="theme-color" content="#0071E3"'));

    const assetLinks = JSON.parse(generateTwaAssetLinks('site.novip.toolbox'));
    assert.strictEqual(assetLinks[0].target.package_name, 'site.novip.toolbox');

    // 生成 PWA 压缩包并校验
    const pwaZipBlob = await generatePwaZip(config);
    const pwaZipBuf = Buffer.from(await pwaZipBlob.arrayBuffer());
    // PK 压缩包魔数
    assert.strictEqual(pwaZipBuf[0], 0x50);
    assert.strictEqual(pwaZipBuf[1], 0x4b);

    const zip = await JSZip.loadAsync(pwaZipBuf);
    assert.ok(zip.file('manifest.json'));
    assert.ok(zip.file('sw.js'));
    assert.ok(zip.file('offline.html'));
  });

  it('04. 生成开箱即用的 Android Studio / Gradle 完整工程', async () => {
    const config: WebToApkConfig = {
      url: 'https://thu.edu.cn',
      name: '清华网络学堂',
      packageId: 'edu.thu.learning',
      themeColor: '#800080',
      pullToRefresh: true,
      allowZoom: true,
    };

    const projectBlob = await generateAndroidStudioProject(config);
    const projectBuf = Buffer.from(await projectBlob.arrayBuffer());
    assert.strictEqual(projectBuf[0], 0x50);
    assert.strictEqual(projectBuf[1], 0x4b);

    const zip = await JSZip.loadAsync(projectBuf);
    assert.ok(zip.file('settings.gradle'));
    assert.ok(zip.file('app/build.gradle'));
    assert.ok(zip.file('app/src/main/AndroidManifest.xml'));
    assert.ok(zip.file('app/src/main/java/edu/thu/learning/MainActivity.java'));

    const mainActivity = await zip.file('app/src/main/java/edu/thu/learning/MainActivity.java')?.async('string');
    assert.ok(mainActivity?.includes('TARGET_URL = "https://thu.edu.cn"'));
    assert.ok(mainActivity?.includes('edu.thu.learning'));
  });

  it('05. buildSignedApk 纯端侧注入并完成有效 Android 数字签名', async () => {
    const templatePath = path.resolve('public/templates/novip-webview-template.apk');
    assert.ok(fs.existsSync(templatePath), '底包模板文件必须存在于 public/templates/');

    const templateBuf = fs.readFileSync(templatePath);

    const config: WebToApkConfig = {
      url: 'https://novip.site/tools/timetable',
      name: '我的大学课表',
      packageId: 'site.novip.timetable.app',
      themeColor: '#0071E3',
      pullToRefresh: true,
      immersive: true,
    };

    const apkBlob = await buildSignedApk(config, templateBuf.buffer);
    assert.strictEqual(apkBlob.type, 'application/vnd.android.package-archive');

    const apkBytes = Buffer.from(await apkBlob.arrayBuffer());
    // 校验 ZIP / APK PK 魔数
    assert.strictEqual(apkBytes[0], 0x50);
    assert.strictEqual(apkBytes[1], 0x4b);

    // 重新解包校验签名与配置注入
    const signedZip = await JSZip.loadAsync(apkBytes);
    assert.ok(signedZip.file('classes.dex'), '必须包含 classes.dex');
    assert.ok(signedZip.file('AndroidManifest.xml'), '必须包含 AndroidManifest.xml');
    assert.ok(signedZip.file('META-INF/MANIFEST.MF'), '必须包含数字签名 MANIFEST.MF');
    assert.ok(signedZip.file('META-INF/NOVIP.SF'), '必须包含数字签名 NOVIP.SF');
    assert.ok(signedZip.file('META-INF/NOVIP.RSA'), '必须包含自签名公钥证书 NOVIP.RSA');

    // 校验用户定制配置是否成功注入
    const settingsStr = await signedZip.file('assets/settings.json')?.async('string');
    assert.ok(settingsStr, 'assets/settings.json 必须存在');
    const settings = JSON.parse(settingsStr!);
    assert.strictEqual(settings.sites[0].url, 'https://novip.site/tools/timetable');
    assert.strictEqual(settings.sites[0].title, '我的大学课表');

    const appConfigStr = await signedZip.file('assets/app_config.json')?.async('string');
    assert.ok(appConfigStr, 'assets/app_config.json 必须存在');
    const appConfig = JSON.parse(appConfigStr!);
    assert.strictEqual(appConfig.appName, '我的大学课表');
    assert.strictEqual(appConfig.packageId, 'site.novip.timetable.app');
  });
});
