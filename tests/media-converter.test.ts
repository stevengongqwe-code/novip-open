import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMediaDuration,
  encodeWav,
  encodeMp3,
  sliceAudioSamples,
} from '../src/tools/media-converter-core.ts';

test('NOVIP 音视频转换核心引擎 · 时间格式化', () => {
  assert.equal(formatMediaDuration(0), '00:00.0');
  assert.equal(formatMediaDuration(65.4), '01:05.4');
  assert.equal(formatMediaDuration(3600), '60:00.0');
});

test('NOVIP 音视频转换核心引擎 · 真实生成标准 WAV 音频流', () => {
  const sampleRate = 44100;
  const numSamples = 44100; // 1秒时长
  const mono = new Float32Array(numSamples);
  // 生成 440Hz 标准正弦波
  for (let i = 0; i < numSamples; i++) {
    mono[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }

  const wavBytes = encodeWav([mono], sampleRate);
  assert.ok(wavBytes.length > 44, 'WAV 字节数应大于 44 字节头部');

  // 验证 RIFF / WAVE 标识
  const riff = String.fromCharCode(...wavBytes.slice(0, 4));
  const wave = String.fromCharCode(...wavBytes.slice(8, 12));
  assert.equal(riff, 'RIFF');
  assert.equal(wave, 'WAVE');
});

test('NOVIP 音视频转换核心引擎 · 真实编码标准 MP3 音频流', () => {
  const sampleRate = 44100;
  const numSamples = 44100; // 1秒
  const mono = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    mono[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }

  const mp3Bytes = encodeMp3([mono], sampleRate, 128);
  assert.ok(mp3Bytes.length > 500, `生成的 MP3 字节数应合理，实际: ${mp3Bytes.length}`);
  // MP3 帧同步字 0xFF
  assert.equal(mp3Bytes[0], 0xff);
});

test('NOVIP 音视频转换核心引擎 · 音频样本截取与边界收敛', () => {
  const sampleRate = 1000;
  const samples = new Float32Array(5000); // 5秒
  const sliced = sliceAudioSamples([samples], sampleRate, 1.0, 3.0);
  assert.equal(sliced[0].length, 2000, '截取 1.0s 到 3.0s 应恰好得到 2000 个采样点');

  // 超出边界保护
  const clamped = sliceAudioSamples([samples], sampleRate, -5, 10);
  assert.equal(clamped[0].length, 5000);
});
