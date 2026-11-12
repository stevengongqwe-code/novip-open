import React, { useState, useEffect, useRef } from 'react';
import { ToolPage, saveLocal, useJob } from './common';
import {
  auditWebsite,
  sanitizePackageId,
  buildSignedApk,
  generatePwaZip,
  generateTwaAssetLinks,
  generateAndroidStudioProject,
  generateHeadMetaHtml,
  type WebToApkConfig,
} from './web-to-apk-core';
import {
  Smartphone,
  Download,
  Globe,
  ShieldCheck,
  Sparkles,
  Palette,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Copy,
  Code2,
  FileCode,
  Layers,
  Settings2,
  Sliders,
  ExternalLink,
  ChevronRight,
  Info,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface PresetSite {
  label: string;
  url: string;
  name: string;
  packageId: string;
  themeColor: string;
  desc: string;
}

const PRESET_SITES: PresetSite[] = [
  {
    label: 'NOVIP 工具箱 (本站)',
    url: 'https://novip.site',
    name: 'NOVIP 大学生工具箱',
    packageId: 'site.novip.webapk',
    themeColor: '#0071E3',
    desc: '45款大学生免注册免付费开箱即用工具聚合',
  },
  {
    label: '清华网络学堂',
    url: 'https://learn.tsinghua.edu.cn',
    name: '清华网络学堂',
    packageId: 'cn.edu.tsinghua.learn',
    themeColor: '#800080',
    desc: '高校教务网络学堂与课件下载移动端封装示范',
  },
  {
    label: '哔哩哔哩 (移动版)',
    url: 'https://m.bilibili.com',
    name: '哔哩哔哩',
    packageId: 'com.bilibili.webapk',
    themeColor: '#FB7299',
    desc: '国内优质大学生课外网课与技术视频社区',
  },
  {
    label: 'GitHub 极简版',
    url: 'https://github.com',
    name: 'GitHub Mobile',
    packageId: 'com.github.webapk',
    themeColor: '#24292F',
    desc: '大学生期末开源大作业与代码项目管理平台',
  },
  {
    label: '高校通用正方教务系统',
    url: 'https://jwgl.university.edu.cn',
    name: '高校掌上教务',
    packageId: 'cn.edu.jwgl.app',
    themeColor: '#0077ED',
    desc: '期末查成绩、选课排课教务内网快速打包',
  },
];

const THEME_COLORS = [
  { name: 'Apple Action Blue', color: '#0071E3' },
  { name: 'Space Gray 极客黑', color: '#1D1D1F' },
  { name: 'Bilibili 樱花粉', color: '#FB7299' },
  { name: 'Tsinghua 紫荆紫', color: '#800080' },
  { name: 'Forest 清新绿', color: '#34C759' },
  { name: 'Sunset 活力橙', color: '#FF9500' },
];

export default function WebToApk() {
  const job = useJob();

  // 基础输入配置
  const [url, setUrl] = useState('https://novip.site');
  const [name, setName] = useState('NOVIP 大学生工具箱');
  const [packageId, setPackageId] = useState('site.novip.webapk');
  const [themeColor, setThemeColor] = useState('#0071E3');
  const [versionName, setVersionName] = useState('1.0.0');

  // 高级体验选项
  const [pullToRefresh, setPullToRefresh] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const [allowZoom, setAllowZoom] = useState(false);
  const [desktopMode, setDesktopMode] = useState(false);

  // 图标生成与上传
  const [iconPreset, setIconPreset] = useState<'tools' | 'academic' | 'media' | 'code' | 'reading'>('tools');
  const [customIconDataUrl, setCustomIconDataUrl] = useState<string>('');
  const iconCanvasRef = useRef<HTMLCanvasElement>(null);

  // 进度与成果物
  const [buildPhase, setBuildPhase] = useState<'idle' | 'reading' | 'injecting' | 'signing' | 'done'>('idle');
  const [buildPercent, setBuildPercent] = useState(0);
  const [lastApkBlob, setLastApkBlob] = useState<Blob | null>(null);

  // 实时安全审计
  const audit = auditWebsite(url);

  // 绘制预设 Canvas 矢量图标 (返回标准 512x512 PNG Data URL)
  const renderPresetIcon = (preset: string, bgColor: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // 背景圆角矩形
    const r = 110;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(512 - r, 0);
    ctx.quadraticCurveTo(512, 0, 512, r);
    ctx.lineTo(512, 512 - r);
    ctx.quadraticCurveTo(512, 512, 512 - r, 512);
    ctx.lineTo(r, 512);
    ctx.quadraticCurveTo(0, 512, 0, 512 - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();

    // 渐变填充
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, bgColor);
    grad.addColorStop(1, bgColor + 'CC');
    ctx.fillStyle = grad;
    ctx.fill();

    // 内发光与高光倒角
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 12;
    ctx.stroke();

    // 绘制中心图形符
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 220px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

    let symbol = '⚡️';
    if (preset === 'academic') symbol = '🎓';
    else if (preset === 'media') symbol = '🎬';
    else if (preset === 'code') symbol = '💻';
    else if (preset === 'reading') symbol = '📖';

    ctx.fillText(symbol, 256, 270);
    return canvas.toDataURL('image/png');
  };

  // 每次主题色或预设改变时更新生成的图标
  useEffect(() => {
    if (!customIconDataUrl) {
      const generated = renderPresetIcon(iconPreset, themeColor);
      if (iconCanvasRef.current) {
        const img = new Image();
        img.onload = () => {
          const ctx = iconCanvasRef.current?.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, 120, 120);
            ctx.drawImage(img, 0, 0, 120, 120);
          }
        };
        img.src = generated;
      }
    }
  }, [iconPreset, themeColor, customIconDataUrl]);

  // 处理自定义图标上传
  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      setCustomIconDataUrl(result);
      showToast('已载入自定义应用图标');
    };
    reader.readAsDataURL(file);
  };

  // 切换预设场景
  const handleApplyPreset = (p: PresetSite) => {
    setUrl(p.url);
    setName(p.name);
    setPackageId(p.packageId);
    setThemeColor(p.themeColor);
    setCustomIconDataUrl('');
    showToast(`已应用「${p.label}」预设配置`);
  };

  const showToast = (message: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novip:toast', { detail: { message } }));
    }
  };

  // 核心：纯端侧打包并生成签名 APK
  const handleBuildApk = async () => {
    job.run(
      async () => {
        setBuildPhase('reading');
        setBuildPercent(15);

        const currentIconBase64 = customIconDataUrl || renderPresetIcon(iconPreset, themeColor);

        const config: WebToApkConfig = {
          url: url.trim(),
          name: name.trim(),
          packageId: sanitizePackageId(packageId),
          versionName,
          versionCode: 1,
          themeColor,
          pullToRefresh,
          immersive,
          allowZoom,
          desktopMode,
          iconPngBase64: currentIconBase64,
        };

        setBuildPhase('injecting');
        setBuildPercent(40);

        setBuildPhase('signing');
        setBuildPercent(70);

        // 调用核心计算引擎
        const apkBlob = await buildSignedApk(config);

        setBuildPhase('done');
        setBuildPercent(100);
        setLastApkBlob(apkBlob);

        // 下载 APK 文件
        const slug = sanitizePackageId(packageId).replace(/\./g, '_');
        const filename = `${slug}_v${versionName}_release.apk`;
        saveLocal(apkBlob, filename);

        showToast(`🎉 成功生成已签名安卓 APK (${(apkBlob.size / 1024 / 1024).toFixed(2)} MB)`);
      },
      () => {
        setBuildPhase('idle');
      }
    );
  };

  // 导出 PWA 离线套件 ZIP
  const handleExportPwaZip = async () => {
    const currentIconBase64 = customIconDataUrl || renderPresetIcon(iconPreset, themeColor);
    const config: WebToApkConfig = {
      url: url.trim(),
      name: name.trim(),
      packageId: sanitizePackageId(packageId),
      themeColor,
      immersive,
      iconPngBase64: currentIconBase64,
    };

    const zipBlob = await generatePwaZip(config);
    const filename = `${config.name}_PWA_Offline_Bundle.zip`;
    saveLocal(zipBlob, filename);
    showToast('已导出符合 W3C 规范的 PWA 离线套件 ZIP');
  };

  // 导出 Android Studio 源码工程 ZIP
  const handleExportGradleProject = async () => {
    const config: WebToApkConfig = {
      url: url.trim(),
      name: name.trim(),
      packageId: sanitizePackageId(packageId),
      themeColor,
      pullToRefresh,
      allowZoom,
      versionName,
    };

    const zipBlob = await generateAndroidStudioProject(config);
    const filename = `${config.name}_AndroidStudio_Project.zip`;
    saveLocal(zipBlob, filename);
    showToast('已导出 Android Studio / Gradle 完整可编译源码工程');
  };

  // 导出 Google Play TWA 资产链接
  const handleExportTwaLinks = () => {
    const jsonStr = generateTwaAssetLinks(packageId);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    saveLocal(blob, 'assetlinks.json');
    showToast('已导出 Google Play TWA assetlinks.json 资产链接文件');
  };

  // 复制 Head Meta 标签
  const handleCopyMetaHtml = () => {
    const meta = generateHeadMetaHtml({
      url,
      name,
      packageId,
      themeColor,
    });
    navigator.clipboard.writeText(meta);
    showToast('已复制 HTML <head> 移动端适配代码到剪贴板');
  };

  return (
    <ToolPage
      id="web-to-apk"
      title="网站一键生成安卓 APK"
      description="基于 PWABuilder 与 Bubblewrap 工业级架构，将任何博客、教务系统、课表或 Web 工具打包为可直接安装的 Android APK，支持离线 PWA 与 Android Studio 源码导出。"
      job={job}
    >
      {/* 预设场景快捷填充 */}
      <section className="novip-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} color="#0071e3" />
          <span>选择大学生高频场景一键体验</span>
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
          {PRESET_SITES.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => handleApplyPreset(p)}
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: url === p.url ? '2px solid #0071e3' : '1px solid #e2e8f0',
                background: url === p.url ? 'rgba(0, 113, 227, 0.05)' : '#fff',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, color: url === p.url ? '#0071e3' : '#1d1d1f' }}>
                {p.label}
              </div>
              <div style={{ fontSize: 12, color: '#6e6e73', marginTop: 4, lineHeight: 1.4 }}>
                {p.desc}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 主工作区：左侧表单与选项，右侧 Android 旗舰机型拟真双视口预览 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 20, alignItems: 'start' }}>
        {/* 左侧：目标网站配置与应用品牌定制 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 卡片 1: 目标网站配置与安全检查 */}
          <section className="novip-card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, color: '#1d1d1f' }}>
              <Globe size={18} color="#0071e3" />
              <span>1. 目标网站网址与安全预检</span>
            </h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#424245', display: 'block', marginBottom: 6 }}>
                网站网址 (URL)
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  value={url}
                  placeholder="https://your-website.com"
                  onChange={e => {
                    const newUrl = e.target.value;
                    setUrl(newUrl);
                    const newAudit = auditWebsite(newUrl);
                    if (newAudit.isValid) {
                      setPackageId(newAudit.suggestedPackageId);
                      if (name === '我的Web应用' || name === 'NOVIP 大学生工具箱') {
                        setName(newAudit.suggestedName);
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    paddingRight: 90,
                    borderRadius: 10,
                    border: audit.isValid ? '1px solid #d2d2d7' : '1px solid #d70015',
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    right: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: audit.isHttps ? 'rgba(52, 199, 89, 0.12)' : 'rgba(255, 149, 0, 0.15)',
                    color: audit.isHttps ? '#248a3d' : '#b25000',
                  }}
                >
                  {audit.isHttps ? 'HTTPS 安全' : 'HTTP 明文'}
                </span>
              </div>
            </div>

            {/* 安全提示盒 */}
            {audit.warnings.length > 0 && (
              <div style={{ padding: 10, borderRadius: 8, background: '#fff9f0', border: '1px solid #ffe8cc', fontSize: 12, color: '#b25000', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                  <AlertTriangle size={14} />
                  <span>系统预检提示</span>
                </div>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {audit.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#6e6e73' }}>
              <span>PWA 移动端就绪指数：<strong style={{ color: '#0071e3' }}>{audit.pwaScore} / 100</strong></span>
              <button
                type="button"
                onClick={handleCopyMetaHtml}
                style={{ border: 0, background: 'transparent', color: '#0071e3', cursor: 'pointer', padding: 0 }}
              >
                复制 HTML 适配标签
              </button>
            </div>
          </section>

          {/* 卡片 2: 应用信息与视觉定制 */}
          <section className="novip-card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, color: '#1d1d1f' }}>
              <Palette size={18} color="#0071e3" />
              <span>2. 应用名称、包名与品牌色彩</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#424245', display: 'block', marginBottom: 4 }}>
                  应用名称 (在手机桌面上显示)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d2d2d7', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#424245', display: 'block', marginBottom: 4 }}>
                  Android Package ID
                </label>
                <input
                  type="text"
                  value={packageId}
                  onChange={e => setPackageId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d2d2d7', fontSize: 13, fontFamily: 'monospace' }}
                />
              </div>
            </div>

            {/* 主题配色 */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#424245', display: 'block', marginBottom: 6 }}>
                主题与状态栏颜色
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {THEME_COLORS.map(tc => (
                  <button
                    key={tc.color}
                    type="button"
                    onClick={() => setThemeColor(tc.color)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: tc.color,
                      border: themeColor === tc.color ? '3px solid #fff' : '2px solid transparent',
                      boxShadow: themeColor === tc.color ? `0 0 0 2px ${tc.color}` : 'none',
                      cursor: 'pointer',
                    }}
                    title={tc.name}
                  />
                ))}
                <input
                  type="color"
                  value={themeColor}
                  onChange={e => setThemeColor(e.target.value)}
                  style={{ width: 32, height: 28, border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}
                  title="自定义取色"
                />
                <span style={{ fontSize: 12, color: '#6e6e73', marginLeft: 4, fontFamily: 'monospace' }}>
                  {themeColor}
                </span>
              </div>
            </div>

            {/* 应用图标选择 */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#424245', display: 'block', marginBottom: 6 }}>
                应用启动图标 (Launcher Icon)
              </label>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* 实时图标 Canvas 预览 */}
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 18,
                    overflow: 'hidden',
                    background: '#f0f0f2',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {customIconDataUrl ? (
                    <img src={customIconDataUrl} alt="应用图标" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <canvas ref={iconCanvasRef} width={120} height={120} style={{ width: '100%', height: '100%' }} />
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      { id: 'tools', label: '⚡️ 工具' },
                      { id: 'academic', label: '🎓 学术' },
                      { id: 'media', label: '🎬 媒体' },
                      { id: 'code', label: '💻 开发' },
                      { id: 'reading', label: '📖 资讯' },
                    ].map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setIconPreset(item.id as any);
                          setCustomIconDataUrl('');
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 8,
                          border: iconPreset === item.id && !customIconDataUrl ? '1px solid #0071e3' : '1px solid #e2e8f0',
                          background: iconPreset === item.id && !customIconDataUrl ? 'rgba(0, 113, 227, 0.08)' : '#fff',
                          color: iconPreset === item.id && !customIconDataUrl ? '#0071e3' : '#424245',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <label
                    style={{
                      fontSize: 12,
                      color: '#0071e3',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      marginTop: 2,
                    }}
                  >
                    <span>或上传自定义 PNG 图标…</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleIconUpload} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* 卡片 3: 运行体验与高阶参数 */}
          <section className="novip-card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, color: '#1d1d1f' }}>
              <Sliders size={18} color="#0071e3" />
              <span>3. 运行交互与高级体验</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={pullToRefresh}
                  onChange={e => setPullToRefresh(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#0071e3' }}
                />
                <span>手势下拉刷新 (Pull to Refresh)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={immersive}
                  onChange={e => setImmersive(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#0071e3' }}
                />
                <span>全屏沉浸模式 (隐藏系统状态栏)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allowZoom}
                  onChange={e => setAllowZoom(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#0071e3' }}
                />
                <span>允许双指手势缩放网页</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={desktopMode}
                  onChange={e => setDesktopMode(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#0071e3' }}
                />
                <span>电脑桌面版 UA (访问 PC 版)</span>
              </label>
            </div>
          </section>
        </div>

        {/* 右侧：实时拟真 Android 旗舰机交互演示与操作看板 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Android 拟真外壳预览 */}
          <section
            className="novip-card"
            style={{
              padding: 20,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#6e6e73' }}>
                📱 Android 旗舰机运行效果拟真
              </span>
              <span style={{ fontSize: 11, color: '#0071e3', background: 'rgba(0, 113, 227, 0.08)', padding: '2px 8px', borderRadius: 6 }}>
                WebView Standalone
              </span>
            </div>

            {/* 手机外壳模型 */}
            <div
              style={{
                width: 290,
                height: 520,
                borderRadius: 36,
                border: '8px solid #1d1d1f',
                boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
                background: '#fff',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
              }}
            >
              {/* 顶部状态栏与微孔摄像头 */}
              <div
                style={{
                  height: 32,
                  background: themeColor,
                  color: '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0 16px',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <span>09:41</span>
                {/* 摄像头打孔 */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#000' }} />
                <span>5G · 100%</span>
              </div>

              {/* 应用标题栏 */}
              {!immersive && (
                <div
                  style={{
                    height: 40,
                    background: themeColor,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 14px',
                    fontSize: 13,
                    fontWeight: 700,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                  }}
                >
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {name}
                  </span>
                </div>
              )}

              {/* 网页模拟视口 */}
              <div
                style={{
                  flex: 1,
                  background: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                  textAlign: 'center',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: themeColor,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    marginBottom: 10,
                    boxShadow: '0 6px 16px rgba(0,0,0,0.1)',
                  }}
                >
                  {customIconDataUrl ? (
                    <img src={customIconDataUrl} alt="图标" style={{ width: '100%', height: '100%', borderRadius: 14, objectFit: 'cover' }} />
                  ) : (
                    '⚡️'
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f' }}>{name}</div>
                <div style={{ fontSize: 11, color: '#6e6e73', marginTop: 4, wordBreak: 'break-all' }}>
                  {url}
                </div>

                <div
                  style={{
                    marginTop: 18,
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: '#eef2ff',
                    color: '#3730a3',
                    fontSize: 11,
                  }}
                >
                  ✓ 硬件加速 WebView 已挂载
                </div>
              </div>

              {/* 底部全面屏手势横条 */}
              <div style={{ height: 18, background: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ width: 90, height: 4, borderRadius: 2, background: '#1d1d1f' }} />
              </div>
            </div>

            {/* 手机桌面图标展示 */}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 11,
                  overflow: 'hidden',
                  background: themeColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
                }}
              >
                {customIconDataUrl ? (
                  <img src={customIconDataUrl} alt="图标" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 20 }}>⚡️</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#424245' }}>
                <strong>桌面呈现：</strong>{name}
                <div style={{ fontSize: 11, color: '#86868b' }}>包名：{sanitizePackageId(packageId)}</div>
              </div>
            </div>
          </section>

          {/* 卡片 4: 核心生成操作与多格式导出 */}
          <section className="novip-card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Download size={18} color="#0071e3" />
              <span>4. 生成安装包与多端套件</span>
            </h3>

            {/* 主操作按钮：一键生成 APK */}
            <button
              type="button"
              onClick={handleBuildApk}
              disabled={job.busy || !audit.isValid}
              style={{
                width: '100%',
                padding: '14px 20px',
                borderRadius: 14,
                border: 0,
                background: job.busy ? '#a1a1aa' : '#0071e3',
                color: '#fff',
                fontSize: 16,
                fontWeight: 600,
                cursor: job.busy ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 6px 20px rgba(0, 113, 227, 0.3)',
                transition: 'all 0.15s ease',
              }}
            >
              <Smartphone size={18} />
              <span>{job.busy ? '正在端侧构建并签名 APK…' : '一键生成并下载安卓 APK (.apk)'}</span>
            </button>

            {/* 签名进度提示 */}
            {job.busy && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6e6e73', marginBottom: 4 }}>
                  <span>
                    {buildPhase === 'reading' && '正在解包基础模板…'}
                    {buildPhase === 'injecting' && '正在注入自定义配置与图标…'}
                    {buildPhase === 'signing' && '正在执行 Android 数字签名…'}
                    {buildPhase === 'done' && '签名完成，准备下载！'}
                  </span>
                  <span>{buildPercent}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: '#e2e8f0', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${buildPercent}%`,
                      background: '#0071e3',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )}

            {/* 辅助导出栏 */}
            <div style={{ marginTop: 14, borderTop: '1px solid #f0f0f2', paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6e6e73', marginBottom: 8 }}>
                更多全栈开发与分发格式：
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleExportPwaZip}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    color: '#1d1d1f',
                  }}
                >
                  <Globe size={14} color="#0071e3" />
                  <span>PWA 离线套件 (.zip)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportTwaLinks}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    color: '#1d1d1f',
                  }}
                >
                  <ShieldCheck size={14} color="#34C759" />
                  <span>Google TWA 声明</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportGradleProject}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    color: '#1d1d1f',
                  }}
                >
                  <Code2 size={14} color="#800080" />
                  <span>Android 源码工程 (.zip)</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* 新手安装与常见问答 */}
      <section className="novip-card" style={{ marginTop: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, color: '#1d1d1f' }}>
          <Info size={18} color="#0071e3" />
          <span>💡 手机安装指南与常见疑问解答</span>
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12, fontSize: 13, color: '#424245' }}>
          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <strong>1. 手机提示“未识别来源应用”？</strong>
            <p style={{ margin: '6px 0 0', color: '#6e6e73', fontSize: 12, lineHeight: 1.5 }}>
              本工具生成的 APK 已由纯端侧 X.509 数字证书签名。华为、小米、OPPO、vivo 等安卓手机在手动侧载（Sideload）时，点击「继续安装」或在系统设置中开启「允许来自此来源的应用」即可正常运行。
            </p>
          </div>

          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <strong>2. 网站更新后，APK 需要重新打包吗？</strong>
            <p style={{ margin: '6px 0 0', color: '#6e6e73', fontSize: 12, lineHeight: 1.5 }}>
              完全不需要！生成的 App 本质是高优化的原生 WebView 容器，打开时始终实时拉取网站最新内容。只有在修改 App 桌面图标或应用名称时，才需要重新生成新版本。
            </p>
          </div>

          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <strong>3. 会产生额外服务器费用或泄露隐私吗？</strong>
            <p style={{ margin: '6px 0 0', color: '#6e6e73', fontSize: 12, lineHeight: 1.5 }}>
              100% 浏览器本地运算！所有 ZIP 注入、配置替换与密码学签名均在您当前的设备内存中完成，NOVIP 服务器不存储任何您的网址、图标或用户信息，零费用、零数据上传。
            </p>
          </div>
        </div>
      </section>
    </ToolPage>
  );
}
