/**
 * 二维码生成与解析（Factory Day 4，2026-10-30）。
 * 纯浏览器本地处理：内容不上传、不设账号、不设每日次数。
 * 生成委托 qrcode（MIT），解析委托 jsQR（Apache-2.0），均为动态 import，
 * 只在打开本工具页时加载。解出的链接只显示、不自动跳转（防钓鱼）。
 */
import { useRef, useState } from 'react';
import { copyLocal, saveLocal } from '../tool-common';
import { ToolPage } from './common';
import {
  buildQrPayload,
  classifyContent,
  isSafeHttpUrl,
  validateQrPayload,
  MAX_DECODE_BYTES,
  MAX_DECODE_DIMENSION,
  type QrContentKind,
  type QrErrorCorrection,
  type WifiPayloadInput,
} from './qr-core';

const KIND_LABELS: Record<QrContentKind, string> = {
  url: '链接 / 文本',
  text: '链接 / 文本',
  wifi: 'WiFi',
  email: '邮件',
  phone: '电话',
};

export default function QrTool() {
  const [tab, setTab] = useState<'generate' | 'decode'>('generate');
  const [kind, setKind] = useState<QrContentKind>('url');
  const [text, setText] = useState('https://novip.site');
  const [ssid, setSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [encryption, setEncryption] = useState<WifiPayloadInput['encryption']>('WPA');
  const [hidden, setHidden] = useState(false);
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [phone, setPhone] = useState('');
  const [level, setLevel] = useState<QrErrorCorrection>('M');
  const [size, setSize] = useState(512);
  const [dark, setDark] = useState('#000000');
  const [light, setLight] = useState('#ffffff');
  const [genError, setGenError] = useState('');
  const [genStatus, setGenStatus] = useState('');
  const [generated, setGenerated] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [decodeError, setDecodeError] = useState('');
  const [decodeStatus, setDecodeStatus] = useState('');
  const [decoded, setDecoded] = useState('');
  const [decoding, setDecoding] = useState(false);
  const [fileName, setFileName] = useState('');

  const currentPayload = (): string => {
    switch (kind) {
      case 'wifi':
        return buildQrPayload({ kind: 'wifi', wifi: { ssid, password: wifiPassword, encryption, hidden } });
      case 'email':
        return buildQrPayload({ kind: 'email', address: email, subject, body });
      case 'phone':
        return buildQrPayload({ kind: 'phone', number: phone });
      default:
        return buildQrPayload({ kind: 'text', text });
    }
  };

  const renderPreview = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setGenError('');
    setGenStatus('');
    try {
      const payload = currentPayload();
      validateQrPayload(payload, level);
      const QRCode = (await import('qrcode')).default;
      await QRCode.toCanvas(canvas, payload, {
        errorCorrectionLevel: level,
        width: size,
        margin: 2,
        color: { dark, light },
      });
      setGenerated(true);
      setGenStatus('已生成，请先用手机扫一扫核对内容再使用。');
    } catch (e) {
      setGenerated(false);
      setGenError(e instanceof Error ? e.message : '生成失败，请检查内容。');
    }
  };

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !generated) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        setGenError('PNG 导出失败，请重试。');
        return;
      }
      saveLocal(blob, `novip-qr-${kind}.png`);
      setGenStatus('PNG 已开始下载。');
    }, 'image/png');
  };

  const downloadSvg = async () => {
    setGenError('');
    try {
      const payload = currentPayload();
      validateQrPayload(payload, level);
      const QRCode = (await import('qrcode')).default;
      const svg = await QRCode.toString(payload, {
        type: 'svg',
        errorCorrectionLevel: level,
        margin: 2,
        color: { dark, light },
      });
      saveLocal(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `novip-qr-${kind}.svg`);
      setGenStatus('SVG 已开始下载（矢量图，放大打印不模糊）。');
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'SVG 导出失败，请重试。');
    }
  };

  const decodeFile = async (file: File) => {
    setDecodeError('');
    setDecodeStatus('');
    setDecoded('');
    setFileName(file.name);
    if (!file.type.startsWith('image/')) {
      setDecodeError('请选择图片文件（JPG/PNG/WebP 等）。');
      return;
    }
    if (file.size > MAX_DECODE_BYTES) {
      setDecodeError('图片超过 10MB，请先压缩或裁剪后再解析。');
      return;
    }
    setDecoding(true);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_DECODE_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('浏览器无法读取图片像素。');
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const imageData = ctx.getImageData(0, 0, width, height);
      const jsQR = (await import('jsqr')).default;
      const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      if (!result) {
        setDecodeError('没有识别到二维码：请换更清晰的图片，并留出二维码四周的空白边（静区）后再试。');
        return;
      }
      setDecoded(result.data);
      setDecodeStatus('已解析。内容只显示在下方，不会自动跳转。');
    } catch (e) {
      setDecodeError(e instanceof Error ? e.message : '解析失败，请换一张图片重试。');
    } finally {
      setDecoding(false);
    }
  };

  const copyDecoded = async () => {
    try {
      await copyLocal(decoded);
      setDecodeStatus('已复制解析结果。');
    } catch {
      setDecodeError('复制失败，请手动选择下方文字复制。');
    }
  };

  const decodedKind = decoded ? classifyContent(decoded) : null;
  const safeUrl = decoded ? isSafeHttpUrl(decoded) : false;

  return (
    <ToolPage
      id="qr"
      title="二维码生成与解析"
      description="把链接、文字、WiFi、邮件或电话做成二维码，或把图片里的二维码解析成文字；全部在浏览器本地完成，不上传、不登录、无水印。"
    >
      <div className="study-actions" role="tablist" aria-label="二维码功能">
        <button className="study-btn" aria-selected={tab === 'generate'} onClick={() => setTab('generate')}>生成二维码</button>
        <button className="study-btn alt" aria-selected={tab === 'decode'} onClick={() => setTab('decode')}>解析图片二维码</button>
      </div>

      {tab === 'generate' && (
        <section className="study-card">
          <h2>1 填写内容，生成二维码</h2>
          <label>内容类型
            <select aria-label="二维码内容类型" value={kind} onChange={(e) => { setKind(e.target.value as QrContentKind); setGenerated(false); setGenError(''); }}>
              <option value="url">链接 / 文本</option>
              <option value="wifi">WiFi（扫码连网）</option>
              <option value="email">邮件</option>
              <option value="phone">电话</option>
            </select>
          </label>
          {(kind === 'url' || kind === 'text') && (
            <label>链接或文字
              <input aria-label="二维码内容" value={text} maxLength={2000} spellCheck={false} placeholder="例如 https://novip.site 或一段文字" onChange={(e) => setText(e.target.value)} />
            </label>
          )}
          {kind === 'wifi' && (
            <>
              <label>WiFi 名称（SSID）<input aria-label="WiFi 名称" value={ssid} maxLength={32} onChange={(e) => setSsid(e.target.value)} placeholder="例如 GSAU-202" /></label>
              <label>加密方式
                <select aria-label="WiFi 加密方式" value={encryption} onChange={(e) => setEncryption(e.target.value as WifiPayloadInput['encryption'])}>
                  <option value="WPA">WPA/WPA2（最常见）</option>
                  <option value="WEP">WEP（老路由器）</option>
                  <option value="nopass">无密码</option>
                </select>
              </label>
              {encryption !== 'nopass' && (
                <label>WiFi 密码<input aria-label="WiFi 密码" type="password" value={wifiPassword} maxLength={64} onChange={(e) => setWifiPassword(e.target.value)} /></label>
              )}
              <label><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> 隐藏网络（不在 WiFi 列表里广播）</label>
            </>
          )}
          {kind === 'email' && (
            <>
              <label>邮箱地址<input aria-label="邮箱地址" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} placeholder="例如 name@example.edu.cn" /></label>
              <label>主题（可选）<input aria-label="邮件主题" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} /></label>
              <label>正文（可选）<input aria-label="邮件正文" value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} /></label>
            </>
          )}
          {kind === 'phone' && (
            <label>电话号码<input aria-label="电话号码" value={phone} maxLength={32} onChange={(e) => setPhone(e.target.value)} placeholder="例如 +86 13800000000" /></label>
          )}
          <details className="novip-advanced-details">
            <summary>⚙️ 高级设置：纠错级别 / 尺寸 / 颜色（默认够用，新手不用改）</summary>
            <div className="novip-advanced-body study-fields">
              <label>纠错级别
                <select aria-label="纠错级别" value={level} onChange={(e) => setLevel(e.target.value as QrErrorCorrection)}>
                  <option value="L">L · 容量最大</option>
                  <option value="M">M · 默认，均衡</option>
                  <option value="Q">Q · 更耐脏污</option>
                  <option value="H">H · 最耐遮挡，容量最小</option>
                </select>
              </label>
              <label>图片尺寸
                <select aria-label="图片尺寸" value={size} onChange={(e) => setSize(Number(e.target.value))}>
                  <option value={512}>512px · 聊天/屏幕够用</option>
                  <option value={1024}>1024px · 打印海报</option>
                </select>
              </label>
              <label>码颜色<input aria-label="二维码颜色" type="color" value={dark} onChange={(e) => setDark(e.target.value)} /></label>
              <label>背景颜色<input aria-label="二维码背景颜色" type="color" value={light} onChange={(e) => setLight(e.target.value)} /></label>
            </div>
          </details>
          <div className="study-actions">
            <button className="study-btn" onClick={() => void renderPreview()}>生成二维码</button>
            <button className="study-btn alt" disabled={!generated} onClick={downloadPng}>下载 PNG</button>
            <button className="study-btn alt" onClick={() => void downloadSvg()}>下载 SVG</button>
            <button className="study-btn alt" onClick={() => { setGenerated(false); setGenError(''); setGenStatus(''); }}>重置</button>
          </div>
          {genStatus && <p role="status" className="study-message">{genStatus}</p>}
          {genError && <div role="alert" className="study-error">{genError}</div>}
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <canvas ref={canvasRef} aria-label="生成的二维码预览" style={{ maxWidth: '100%', height: 'auto', display: generated ? 'inline-block' : 'none' }} />
            {!generated && <p className="study-note">点「生成二维码」后，预览会出现在这里；先用手机扫一扫核对内容再使用。</p>}
          </div>
          <p className="study-note">生成的码是静态码：内容直接写进图案里，不过期、不走服务器、不需要账号；一旦印出去就改不了，印之前务必扫码核对。暂不支持摄像头实时扫码与动态可编辑码。</p>
        </section>
      )}

      {tab === 'decode' && (
        <section className="study-card">
          <h2>2 上传图片，解析二维码</h2>
          <label>选择含二维码的图片
            <input aria-label="选择二维码图片" type="file" accept="image/*" disabled={decoding} onChange={(e) => { const f = e.target.files?.[0]; if (f) void decodeFile(f); }} />
          </label>
          <p className="study-note">图片只在当前浏览器里解码，不上传；单张 ≤10MB，超大图会自动缩小到 2000px 再解析。本轮未提供摄像头实时扫码，可用截图或照片上传解析。</p>
          {decoding && <p role="status" className="study-message">正在本机解析…</p>}
          {decodeStatus && <p role="status" className="study-message">{decodeStatus}</p>}
          {decodeError && <div role="alert" className="study-error">{decodeError}</div>}
          {decoded && (
            <div>
              <p>文件：{fileName} · 识别为：{decodedKind ? KIND_LABELS[decodedKind] : '文本'}</p>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{decoded}</pre>
              <div className="study-actions">
                <button className="study-btn" onClick={() => void copyDecoded()}>复制结果</button>
                {safeUrl && (
                  <a className="study-btn" href={decoded.trim()} target="_blank" rel="noopener noreferrer">打开链接（新标签页）</a>
                )}
              </div>
              {!safeUrl && <p className="study-note">解析结果不是 http/https 链接时不提供直接打开，只作纯文本展示；若是链接请先确认域名可信再手动打开。</p>}
            </div>
          )}
        </section>
      )}
    </ToolPage>
  );
}
