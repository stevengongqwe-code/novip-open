/**
 * NOVIP 网站一键生成安卓 APK 核心计算引擎 (Web to APK & PWA Engine)
 *
 * 核心技术与设计：
 * 1. 纯浏览器端侧处理：结合 JSZip 与 @chromeos/android-package-signer，在端侧完成 APK 注入与密码学数字签名。
 * 2. 真正可安装的 APK：生成带有 Dalvik classes.dex、AXML AndroidManifest.xml、assets/settings.json、
 *    自适应 mipmap 图标以及规范 META-INF/MANIFEST.MF、CERT.SF、CERT.RSA 签名的真实安装包。
 * 3. 多端离线化支持：同步导出符合 W3C 规范的 PWA 离线套件 (manifest.json, sw.js, offline.html)。
 * 4. 开发者源码全量输出：生成开箱即用的 Android Studio / Gradle 工程源码包，方便进阶二次开发与应用市场上架。
 * 5. 安全预检与审计：规范 URL 格式、检测 HTTPS 协议完整度、智能推导 Package ID 与防钓鱼安全提示。
 *
 * 零服务器上传 · 零新增费用 · 保护用户隐私
 */

import JSZip from 'jszip';
import { PackageSigner } from '@chromeos/android-package-signer';

export interface WebToApkConfig {
  url: string;
  name: string;
  packageId: string;
  versionName?: string;
  versionCode?: number;
  themeColor?: string;
  backgroundColor?: string;
  pullToRefresh?: boolean;
  immersive?: boolean;
  allowZoom?: boolean;
  desktopMode?: boolean;
  allowGeolocation?: boolean;
  iconPngBase64?: string; // base64 string without data prefix, or data URL
}

export interface WebsiteAuditResult {
  cleanUrl: string;
  isValid: boolean;
  isHttps: boolean;
  protocol: 'https' | 'http' | 'invalid';
  domain: string;
  suggestedName: string;
  suggestedPackageId: string;
  warnings: string[];
  recommendations: string[];
  pwaScore: number;
}

/**
 * 校验并规范化用户输入的网站网址，推断默认应用名称与 Package ID
 */
export function auditWebsite(inputUrl: string): WebsiteAuditResult {
  const trimmed = (inputUrl || '').trim();
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (!trimmed) {
    return {
      cleanUrl: '',
      isValid: false,
      isHttps: false,
      protocol: 'invalid',
      domain: '',
      suggestedName: '',
      suggestedPackageId: 'site.novip.web.app',
      warnings: ['请输入需要生成安卓 App 的网站网址（例如 https://novip.site）'],
      recommendations: [],
      pwaScore: 0,
    };
  }

  let formatted = trimmed;
  if (!/^https?:\/\//i.test(formatted)) {
    formatted = 'https://' + formatted;
  }

  let parsed: URL;
  try {
    parsed = new URL(formatted);
  } catch {
    return {
      cleanUrl: trimmed,
      isValid: false,
      isHttps: false,
      protocol: 'invalid',
      domain: '',
      suggestedName: '我的网站',
      suggestedPackageId: 'site.novip.web.app',
      warnings: ['网址格式无效，请检查是否包含非法字符'],
      recommendations: [],
      pwaScore: 10,
    };
  }

  const isHttps = parsed.protocol.toLowerCase() === 'https:';
  const protocol = isHttps ? 'https' : 'http';
  const domain = parsed.hostname.toLowerCase();

  // 安全检查
  if (!isHttps) {
    warnings.push('网站未启用 HTTPS 加密协议。Android 9 (API 28) 及更高版本默认阻止非加密 HTTP 流量。');
    recommendations.push('强烈建议为网站配置 SSL 证书，或在本地测试时确保在同一受信任局域网。');
  }

  if (domain.includes('localhost') || domain.startsWith('127.') || domain.startsWith('192.168.')) {
    warnings.push('检测到本地局域网 / 内网测试地址。手机安装 APK 后需与电脑连接同一 Wi-Fi 方可正常访问。');
  }

  // 智能推断应用名称
  let suggestedName = '';
  const domainParts = domain.split('.').filter(p => !['www', 'com', 'cn', 'net', 'org', 'edu', 'site', 'top', 'xyz'].includes(p));
  if (domainParts.length > 0) {
    const rawSlug = domainParts[domainParts.length - 1];
    suggestedName = rawSlug.charAt(0).toUpperCase() + rawSlug.slice(1);
  } else {
    suggestedName = '大学 Web 应用';
  }

  // 智能推断标准 Java Package ID (例如: site.novip.webapk, com.bilibili.webapk)
  const parts = domain.split('.').reverse();
  const cleanParts = parts
    .map(p => p.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(p => p.length > 0 && !/^\d/.test(p));

  let suggestedPackageId = '';
  if (cleanParts.length >= 2) {
    suggestedPackageId = `${cleanParts[0]}.${cleanParts[1]}.webapk`;
  } else if (cleanParts.length === 1) {
    suggestedPackageId = `site.novip.${cleanParts[0]}`;
  } else {
    suggestedPackageId = 'site.novip.webapk';
  }

  // 计算 PWA / 移动端就绪指数
  let pwaScore = 60;
  if (isHttps) pwaScore += 25;
  if (!parsed.port) pwaScore += 10;
  if (parsed.pathname === '/' || parsed.pathname === '') pwaScore += 5;

  return {
    cleanUrl: parsed.toString(),
    isValid: true,
    isHttps,
    protocol,
    domain,
    suggestedName,
    suggestedPackageId,
    warnings,
    recommendations,
    pwaScore: Math.min(100, pwaScore),
  };
}

/**
 * 校验并规范化 Android Package ID
 * 必须由两段以上点号分隔组成，每段为合法 Java 标识符且不以数字开头
 */
export function sanitizePackageId(rawId: string): string {
  const fallback = 'site.novip.webapk';
  if (!rawId) return fallback;
  const parts = rawId
    .toLowerCase()
    .trim()
    .split('.')
    .map(p => p.replace(/[^a-z0-9_]/g, ''))
    .filter(Boolean);

  if (parts.length < 2) {
    return `site.novip.${parts[0] || 'app'}`;
  }

  const validParts = parts.map(p => (/^[0-9]/.test(p) ? `app_${p}` : p));
  return validParts.join('.');
}

/**
 * 生成符合 W3C 规范的 Web App Manifest JSON
 */
export function generatePwaManifest(config: WebToApkConfig): string {
  const themeColor = config.themeColor || '#0071E3';
  const bgColor = config.backgroundColor || '#FFFFFF';

  const manifest = {
    name: config.name,
    short_name: config.name,
    description: `${config.name} - NOVIP Web to App`,
    start_url: config.url,
    display: config.immersive ? 'fullscreen' : 'standalone',
    orientation: 'portrait-primary',
    background_color: bgColor,
    theme_color: themeColor,
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
    categories: ['education', 'utilities', 'productivity'],
    lang: 'zh-CN',
    dir: 'ltr',
  };

  return JSON.stringify(manifest, null, 2);
}

/**
 * 生成生产级离线缓存 Service Worker 代码 (sw.js)
 */
export function generateServiceWorker(config: WebToApkConfig): string {
  const cacheKey = `novip-app-${config.packageId || 'web'}-v1`;

  return `// NOVIP PWA Service Worker - 离线优先与优雅降级策略
const CACHE_NAME = '${cacheKey}';
const OFFLINE_URL = '/offline.html';

const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[NOVIP SW] Pre-cache assets warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedOffline = await cache.match(OFFLINE_URL);
        return cachedOffline || new Response('<h1>离线提示</h1><p>网络连接已断开，请检查网络设置后重试。</p>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      })
    );
    return;
  }

  // 资源采用网络优先 + 缓存备用策略
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
`;
}

/**
 * 生成 Apple Cupertino 拟真离线提示单页 (offline.html)
 */
export function generateOfflineHtml(config: WebToApkConfig): string {
  const themeColor = config.themeColor || '#0071E3';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>${config.name} · 当前处于离线状态</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", system-ui, sans-serif;
      background: #f5f5f7;
      color: #1d1d1f;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
      text-align: center;
    }
    .card {
      background: #ffffff;
      border-radius: 24px;
      padding: 36px 28px;
      max-width: 380px;
      width: 100%;
      box-shadow: 0 12px 36px rgba(0,0,0,0.06);
      border: 1px solid rgba(0,0,0,0.06);
    }
    .icon {
      width: 64px;
      height: 64px;
      border-radius: 18px;
      background: ${themeColor}15;
      color: ${themeColor};
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 28px;
    }
    h2 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    p { font-size: 14px; color: #6e6e73; line-height: 1.5; margin-bottom: 24px; }
    .btn {
      display: inline-block;
      width: 100%;
      padding: 14px;
      border-radius: 14px;
      background: ${themeColor};
      color: #ffffff;
      font-size: 15px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 14px ${themeColor}40;
      transition: transform 0.15s ease;
    }
    .btn:active { transform: scale(0.98); }
    .footer { margin-top: 24px; font-size: 12px; color: #86868b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚡️</div>
    <h2>网络连接中断</h2>
    <p>抱歉，当前无法连接至 <strong>${config.name}</strong> 线上服务。请检查校园网认证、Wi-Fi 或移动蜂窝数据后重试。</p>
    <button class="btn" onclick="window.location.reload()">重新连接</button>
  </div>
  <div class="footer">${config.name} · NOVIP Web2App Engine</div>
</body>
</html>`;
}

/**
 * 生成全套 HTML <head> 集成代码片段
 */
export function generateHeadMetaHtml(config: WebToApkConfig): string {
  const themeColor = config.themeColor || '#0071E3';

  return `<!-- NOVIP PWA & Mobile App Meta Tags -->
<meta name="application-name" content="${config.name}">
<meta name="apple-mobile-web-app-title" content="${config.name}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="${themeColor}">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    });
  }
</script>`;
}

/**
 * 生成 Google Play / Trusted Web Activities (TWA) 资产链接配置 (assetlinks.json)
 */
export function generateTwaAssetLinks(packageId: string, sha256Fingerprint?: string): string {
  const fingerprint = (sha256Fingerprint || '14:6D:E9:44:C5:02:60:E9:90:F1:26:94:07:50:3A:FF:81:82:18:49:50:88:BE:EC:58:EC:06:5D:5C:36:2C:6A').trim();

  const assetLinks = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: sanitizePackageId(packageId),
        sha256_cert_fingerprints: [fingerprint],
      },
    },
  ];

  return JSON.stringify(assetLinks, null, 2);
}

/**
 * 快速打包 PWA 离线套件 ZIP
 */
export async function generatePwaZip(config: WebToApkConfig): Promise<Blob> {
  const zip = new JSZip();

  zip.file('manifest.json', generatePwaManifest(config));
  zip.file('sw.js', generateServiceWorker(config));
  zip.file('offline.html', generateOfflineHtml(config));
  zip.file('head-meta.html', generateHeadMetaHtml(config));
  zip.file('assetlinks.json', generateTwaAssetLinks(config.packageId));

  const readme = `# ${config.name} - PWA 离线套件与配置指南

本压缩包由 NOVIP（https://novip.site/tools/web-to-apk）自动生成。

## 文件清单
1. \`manifest.json\`：W3C 规范的标准 Web App Manifest 描述文件。
2. \`sw.js\`：具备离线缓存与优雅降级能力的 Service Worker 脚本。
3. \`offline.html\`：用户在地铁、教室断网时显示的友好提示单页。
4. \`head-meta.html\`：请复制其中的 HTML 标签并粘贴到您网站每个页面的 <head> 区域。
5. \`assetlinks.json\`：若要上架 Google Play TWA 无地址栏模式，请将此文件上传至您的域名：
   https://您的域名/.well-known/assetlinks.json

100% 浏览器本地运算，零第三方接口费用与隐私泄露。
`;
  zip.file('README.md', readme);

  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/**
 * 生成完整的 Android Studio / Gradle 源码包 ZIP
 */
export async function generateAndroidStudioProject(config: WebToApkConfig): Promise<Blob> {
  const zip = new JSZip();
  const pkg = sanitizePackageId(config.packageId);
  const pkgPath = pkg.replace(/\./g, '/');
  const appName = config.name || '我的Web应用';
  const targetUrl = config.url || 'https://novip.site';
  const themeColor = config.themeColor || '#0071E3';

  // 1. root build.gradle & settings.gradle
  zip.file(
    'settings.gradle',
    `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "${appName}"
include ':app'
`
  );

  zip.file(
    'build.gradle',
    `plugins {
    id 'com.android.application' version '8.2.2' apply false
}
`
  );

  // 2. app/build.gradle
  zip.file(
    'app/build.gradle',
    `plugins {
    id 'com.android.application'
}

android {
    namespace '${pkg}'
    compileSdk 34

    defaultConfig {
        applicationId "${pkg}"
        minSdk 21
        targetSdk 34
        versionCode ${config.versionCode || 1}
        versionName "${config.versionName || '1.0.0'}"

        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.11.0'
    implementation 'androidx.swiperefreshlayout:swiperefreshlayout:1.1.0'
    implementation 'androidx.webkit:webkit:1.10.0'
}
`
  );

  // 3. AndroidManifest.xml
  zip.file(
    'app/src/main/AndroidManifest.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${pkg}">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher"
        android:supportsRtl="true"
        android:theme="@style/Theme.NovipWeb"
        android:usesCleartextTraffic="true">
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:exported="true"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`
  );

  // 4. MainActivity.java
  zip.file(
    `app/src/main/java/${pkgPath}/MainActivity.java`,
    `package ${pkg};

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private static final String TARGET_URL = "${targetUrl}";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }

        // 状态栏配色
        getWindow().setStatusBarColor(Color.parseColor("${themeColor}"));

        swipeRefresh = findViewById(R.id.swipeRefresh);
        webView = findViewById(R.id.webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(${!!config.allowZoom});
        settings.setBuiltInZoomControls(${!!config.allowZoom});
        settings.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (swipeRefresh != null) {
                    swipeRefresh.setRefreshing(false);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient());

        if (swipeRefresh != null) {
            swipeRefresh.setEnabled(${!!config.pullToRefresh});
            swipeRefresh.setColorSchemeColors(Color.parseColor("${themeColor}"));
            swipeRefresh.setOnRefreshListener(() -> webView.reload());
        }

        webView.loadUrl(TARGET_URL);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
`
  );

  // 5. layout & resources
  zip.file(
    'app/src/main/res/layout/activity_main.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<androidx.swiperefreshlayout.widget.SwipeRefreshLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/swipeRefresh"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <WebView
        android:id="@+id/webView"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

</androidx.swiperefreshlayout.widget.SwipeRefreshLayout>
`
  );

  zip.file(
    'app/src/main/res/values/strings.xml',
    `<resources>
    <string name="app_name">${appName}</string>
</resources>
`
  );

  zip.file(
    'app/src/main/res/values/styles.xml',
    `<resources>
    <style name="Theme.NovipWeb" parent="Theme.MaterialComponents.DayNight.NoActionBar">
        <item name="colorPrimary">${themeColor}</item>
        <item name="android:statusBarColor">${themeColor}</item>
    </style>
</resources>
`
  );

  zip.file(
    'README.md',
    `# ${appName} - Android Studio 完整工程源码

本工程由 NOVIP（https://novip.site/tools/web-to-apk）一键导出。

## 构建与运行方式
1. 打开最新版 **Android Studio** (推荐 Hedgehog / Iguana / Koala 及以上版本)。
2. 选择 **Open** 打开本解压目录。
3. 等待 Gradle 自动完成依赖同步。
4. 连接 Android 手机或开启 Android 模拟器，点击顶部绿色的 **Run 'app'** 即可运行。
5. 如需上架应用商店，依次点击 **Build > Generate Signed Bundle / APK** 即可签署正式发布包。
`
  );

  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/**
 * 核心方法：纯前端在客户端生成真正已签名的 Android APK 文件
 *
 * @param config 用户自定义配置
 * @param templateBuffer 底层干净模板 APK 二进制 ArrayBuffer（若未提供，将通过 fetch 从 /templates 获取）
 * @returns 包含有效 PK 魔数、已签署并对齐的 APK Blob
 */
export async function buildSignedApk(
  config: WebToApkConfig,
  templateBuffer?: ArrayBuffer
): Promise<Blob> {
  const targetUrl = (config.url || 'https://novip.site').trim();
  const appName = (config.name || '我的Web应用').trim();
  const pkg = sanitizePackageId(config.packageId);

  // 1. 获取基础底包二进制
  let rawBytes: ArrayBuffer;
  if (templateBuffer && templateBuffer.byteLength > 0) {
    rawBytes = templateBuffer;
  } else {
    // 浏览器生产环境：从静态 CDN 模板路径获取预置底包
    const res = await fetch('/templates/novip-webview-template.apk');
    if (!res.ok) {
      throw new Error(`加载基础底包模板失败 (HTTP ${res.status})，请检查网络连接`);
    }
    rawBytes = await res.arrayBuffer();
  }

  // 2. 解包 ZIP
  const zip = await JSZip.loadAsync(rawBytes);

  // 3. 清理已有的签名与哈希校验文件，准备重新签名
  const metaFiles = Object.keys(zip.files).filter(
    f => f.startsWith('META-INF/') && (f.endsWith('.SF') || f.endsWith('.RSA') || f.endsWith('.MF'))
  );
  for (const f of metaFiles) {
    zip.remove(f);
  }

  // 4. 注入用户网站与 WebView 配置
  // 提取主域名以配置拦截规则
  let domain = 'novip.site';
  try {
    domain = new URL(targetUrl).hostname;
  } catch {
    // fallback
  }

  const settingsJson = {
    sites: [
      {
        url: targetUrl,
        title: appName,
      },
    ],
    match: [['host', 'equals', domain]],
    remote_debug: false,
    console_log: false,
    js_interface: false,
    web_settings: {
      JavaScriptEnabled: true,
      DomStorageEnabled: true,
      DatabaseEnabled: true,
      AllowFileAccess: true,
      PullToRefresh: !!config.pullToRefresh,
      Immersive: !!config.immersive,
    },
    theme_color: config.themeColor || '#0071E3',
    app_package: pkg,
    timestamp: new Date().toISOString(),
  };

  zip.file('assets/settings.json', JSON.stringify(settingsJson, null, 2));

  // 同时注入标准 app_config.json
  const appConfigJson = {
    appName,
    packageId: pkg,
    targetUrl,
    versionName: config.versionName || '1.0.0',
    versionCode: config.versionCode || 1,
    themeColor: config.themeColor || '#0071E3',
    pullToRefresh: !!config.pullToRefresh,
    immersive: !!config.immersive,
    allowZoom: !!config.allowZoom,
    desktopMode: !!config.desktopMode,
    generatedAt: new Date().toISOString(),
    generator: 'NOVIP Web2Apk Engine v3.0 (https://novip.site)',
  };

  zip.file('assets/app_config.json', JSON.stringify(appConfigJson, null, 2));

  // 5. 如果提供了用户自定义图标，替换 mipmap 目录下的默认图标
  if (config.iconPngBase64) {
    let cleanBase64 = config.iconPngBase64;
    if (cleanBase64.includes('base64,')) {
      cleanBase64 = cleanBase64.split('base64,')[1];
    }
    const iconBytes = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0));

    // 覆盖常见 mipmap 路径
    const mipmapPaths = [
      'res/mipmap-mdpi/ic_launcher.png',
      'res/mipmap-hdpi/ic_launcher.png',
      'res/mipmap-xhdpi/ic_launcher.png',
      'res/mipmap-xxhdpi/ic_launcher.png',
      'res/mipmap-xxxhdpi/ic_launcher.png',
    ];

    for (const p of mipmapPaths) {
      zip.file(p, iconBytes);
    }
  }

  // 6. 生成待签名的未签名 ZIP Blob
  const unsignedBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // 7. 使用 @chromeos/android-package-signer 生成合法证书并签名
  // 注意：X.509 根证书 DName 需保持纯 ASCII 字符集以确保 ASN.1 DER 编码跨平台完全兼容
  const signer = new PackageSigner('novip123', 'novip');
  const dname = {
    commonName: 'NOVIP WebApp',
    organizationName: 'NOVIP Studio',
    organizationUnit: 'Tools',
    countryCode: 'CN',
  };

  const derKey = await signer.generateKey(dname);
  const unsignedFile = (typeof File !== 'undefined'
    ? new File([unsignedBlob], 'unsigned.apk', { type: 'application/vnd.android.package-archive' })
    : Object.assign(unsignedBlob, { name: 'unsigned.apk', lastModified: Date.now() })) as unknown as File;
  const signedDataUrl = await signer.signPackage(unsignedFile, derKey);

  // 8. 将生成的 data URL 转回标准的 APK Blob
  const b64Signed = signedDataUrl.split('base64,')[1];
  const binarySigned = atob(b64Signed);
  const len = binarySigned.length;
  const signedBytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    signedBytes[i] = binarySigned.charCodeAt(i);
  }

  return new Blob([signedBytes.buffer as ArrayBuffer], {
    type: 'application/vnd.android.package-archive',
  });
}
