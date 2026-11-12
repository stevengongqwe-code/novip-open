/**
 * media-converter-core.ts
 * NOVIP 音视频格式转换、音频提取与 GIF 制作核心引擎
 * 结合 Web Audio 标准、LameJS (MP3) 与 Gifenc (GIF)，纯端侧离线无 CSS 依赖
 */

import lamejs from '@breezystack/lamejs';

export type AudioTargetFormat = 'mp3' | 'wav';
export type Mp3Bitrate = 64 | 128 | 192 | 320;

export interface AudioExportOptions {
  format: AudioTargetFormat;
  bitrate?: Mp3Bitrate; // 仅 mp3 适用
  startTime?: number;   // 秒
  endTime?: number;     // 秒
}

export interface GifExportOptions {
  fps: number;          // 5, 10, 15
  width: number;        // 320, 480, 640
  maxDuration?: number; // 最大截取秒数 (默认 15s)
}

export function formatMediaDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  const mStr = String(mins).padStart(2, '0');
  const sStr = String(secs).padStart(2, '0');
  return `${mStr}:${sStr}.${ms}`;
}

/**
 * 生成符合 RIFF 标准规范的 16-bit PCM WAV 二进制字节
 */
export function encodeWav(
  channelData: Float32Array[],
  sampleRate: number
): Uint8Array {
  const numChannels = channelData.length;
  if (numChannels === 0) throw new Error('音频声道数据为空。');
  const length = channelData[0].length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF 块描述
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt 子块
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);          // fmt 块大小 16
  view.setUint16(20, 1, true);           // PCM 格式 = 1
  view.setUint16(22, numChannels, true); // 声道数
  view.setUint32(24, sampleRate, true);  // 采样率
  view.setUint32(28, byteRate, true);    // 字节率
  view.setUint16(32, blockAlign, true);  // 块对齐
  view.setUint16(34, 16, true);          // 每个采样点 16 位

  // data 子块
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // 交错写入采样点，Float32 归一化值 (-1.0 ~ 1.0) 转 16 位有符号整型
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channelData[ch][i]));
      const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, val, true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * 基于 LameJS 将 Float32 音频数据编码为标准 MP3 二进制流
 */
export function encodeMp3(
  channelData: Float32Array[],
  sampleRate: number,
  bitrate: Mp3Bitrate = 128
): Uint8Array {
  const numChannels = Math.min(2, channelData.length);
  if (numChannels === 0) throw new Error('音频声道数据为空。');

  const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, bitrate);
  const sampleCount = channelData[0].length;
  const chunkSize = 1152; // LAME 标准每帧采样数
  const mp3DataChunks: Uint8Array[] = [];

  // 将 Float32 转为 Int16
  const left = new Int16Array(sampleCount);
  const right = numChannels > 1 ? new Int16Array(sampleCount) : left;

  for (let i = 0; i < sampleCount; i++) {
    const s1 = Math.max(-1, Math.min(1, channelData[0][i]));
    left[i] = s1 < 0 ? s1 * 0x8000 : s1 * 0x7FFF;
    if (numChannels > 1) {
      const s2 = Math.max(-1, Math.min(1, channelData[1][i]));
      right[i] = s2 < 0 ? s2 * 0x8000 : s2 * 0x7FFF;
    }
  }

  // 分块编码
  for (let i = 0; i < sampleCount; i += chunkSize) {
    const leftChunk = left.subarray(i, i + chunkSize);
    const rightChunk = numChannels > 1 ? right.subarray(i, i + chunkSize) : leftChunk;
    const mp3buf = numChannels === 1
      ? mp3encoder.encodeBuffer(leftChunk)
      : mp3encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3DataChunks.push(new Uint8Array(mp3buf));
    }
  }

  // 刷新尾部缓冲
  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3DataChunks.push(new Uint8Array(mp3buf));
  }

  // 组装总字节
  const totalLength = mp3DataChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of mp3DataChunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * 截取音频样本区间
 */
export function sliceAudioSamples(
  channelData: Float32Array[],
  sampleRate: number,
  startTime: number,
  endTime: number
): Float32Array[] {
  const totalDuration = channelData[0].length / sampleRate;
  const start = Math.max(0, Math.min(totalDuration, startTime));
  const end = Math.max(start, Math.min(totalDuration, endTime));

  const startIdx = Math.floor(start * sampleRate);
  const endIdx = Math.floor(end * sampleRate);

  return channelData.map(channel => channel.slice(startIdx, endIdx));
}
