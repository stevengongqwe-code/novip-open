/**
 * 二维码生成与解析 · 纯函数核心（Factory Day 4，2026-10-30）。
 * 本模块不碰 DOM、不联网：payload 构造、分类、安全判定均可单测。
 * 编解码本身委托 qrcode（MIT）与 jsQR（Apache-2.0），组件层动态 import。
 */

export type QrContentKind = 'url' | 'text' | 'wifi' | 'email' | 'phone';

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

/** QR 字节模式容量参考（版本 40，toolio 公开口径；实现以编码库实际抛错为准）。 */
export const QR_BYTE_CAPACITY: Record<QrErrorCorrection, number> = {
  L: 2953,
  M: 2331,
  Q: 1663,
  H: 1273,
};

export const MAX_DECODE_BYTES = 10 * 1024 * 1024;
export const MAX_DECODE_DIMENSION = 2000;

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function escapeWifiField(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/:/g, '\\:').replace(/"/g, '\\"');
}

export interface WifiPayloadInput {
  ssid: string;
  password: string;
  encryption: 'WPA' | 'WEP' | 'nopass';
  hidden?: boolean;
}

export function buildWifiPayload(input: WifiPayloadInput): string {
  const ssid = input.ssid.trim();
  if (!ssid) throw new Error('WiFi 名称不能为空。');
  const parts = [`T:${input.encryption}`, `S:${escapeWifiField(ssid)}`];
  if (input.encryption !== 'nopass') parts.push(`P:${escapeWifiField(input.password)}`);
  if (input.hidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};`;
}

export function buildEmailPayload(address: string, subject = '', body = ''): string {
  const to = address.trim();
  if (!to) throw new Error('邮箱地址不能为空。');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('邮箱地址格式不正确。');
  const params = new URLSearchParams();
  if (subject.trim()) params.set('subject', subject.trim());
  if (body.trim()) params.set('body', body.trim());
  const query = params.toString();
  return `mailto:${to}${query ? `?${query}` : ''}`;
}

export function buildPhonePayload(number: string): string {
  const tel = number.trim();
  if (!tel) throw new Error('电话号码不能为空。');
  if (!/^[+0-9][0-9\s-]*$/.test(tel)) throw new Error('电话号码只能含数字、空格、横线与开头的 +。');
  return `tel:${tel.replace(/[\s-]/g, '')}`;
}

export type QrPayloadInput =
  | { kind: 'url' | 'text'; text: string }
  | { kind: 'wifi'; wifi: WifiPayloadInput }
  | { kind: 'email'; address: string; subject?: string; body?: string }
  | { kind: 'phone'; number: string };

export function buildQrPayload(input: QrPayloadInput): string {
  switch (input.kind) {
    case 'url':
    case 'text': {
      const text = input.text.trim();
      if (!text) throw new Error('内容不能为空。');
      return text;
    }
    case 'wifi':
      return buildWifiPayload(input.wifi);
    case 'email':
      return buildEmailPayload(input.address, input.subject, input.body);
    case 'phone':
      return buildPhonePayload(input.number);
  }
}

export function validateQrPayload(payload: string, level: QrErrorCorrection): void {
  if (!payload.trim()) throw new Error('内容不能为空。');
  const bytes = byteLength(payload);
  if (bytes > QR_BYTE_CAPACITY[level]) {
    throw new Error(`内容过长：${bytes} 字节，${level} 级纠错上限 ${QR_BYTE_CAPACITY[level]} 字节；请缩短内容或降低纠错级别。`);
  }
}

export function classifyContent(content: string): QrContentKind {
  const text = content.trim();
  if (/^WIFI:/i.test(text)) return 'wifi';
  if (/^mailto:/i.test(text)) return 'email';
  if (/^tel:/i.test(text)) return 'phone';
  if (/^https?:\/\//i.test(text)) return 'url';
  return 'text';
}

/** 只有 http/https 才允许“一键打开”；其余一律只作纯文本展示，防钓鱼跳转。 */
export function isSafeHttpUrl(content: string): boolean {
  try {
    const url = new URL(content.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function qrDownloadName(kind: QrContentKind, ext: 'png' | 'svg'): string {
  return `novip-qr-${kind}.${ext}`;
}

/** 供测试与组件共用的“模块矩阵 → 像素”合成：每模块放大 scale 像素，外加 4 模块静区。 */
export function modulesToImageData(
  modules: { size: number; get: (row: number, col: number) => boolean },
  scale = 8,
): { data: Uint8ClampedArray; width: number; height: number } {
  const quiet = 4;
  const total = modules.size + quiet * 2;
  const width = total * scale;
  const height = total * scale;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const col = Math.floor(x / scale) - quiet;
      const row = Math.floor(y / scale) - quiet;
      const dark = row >= 0 && col >= 0 && row < modules.size && col < modules.size && modules.get(row, col);
      const i = (y * width + x) * 4;
      const v = dark ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}
