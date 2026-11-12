/**
 * FocusTimer Core — 纯端侧 Web Audio 白噪音合成与番茄钟时间算法
 * 零外部音频文件加载，完全离线运行
 */

export type FocusMode = 'pomodoro' | 'shortBreak' | 'longBreak' | 'deepWork';

export interface FocusPreset {
  id: FocusMode;
  label: string;
  durationMinutes: number;
  description: string;
}

export const FOCUS_PRESETS: FocusPreset[] = [
  {id: 'pomodoro', label: '标准番茄 (25m)', durationMinutes: 25, description: '经典专注工作块'},
  {id: 'deepWork', label: '深度专注 (50m)', durationMinutes: 50, description: '论文与刷题冲刺'},
  {id: 'shortBreak', label: '小憩 (5m)', durationMinutes: 5, description: '喝口水、眺望远方'},
  {id: 'longBreak', label: '大休 (15m)', durationMinutes: 15, description: '活动拉伸、放松大脑'},
];

export type AmbientSoundType = 'rain' | 'fire' | 'stream' | 'pink';

export interface AmbientPreset {
  id: AmbientSoundType;
  name: string;
  emoji: string;
  description: string;
}

export const AMBIENT_PRESETS: AmbientPreset[] = [
  {id: 'rain', name: '深海微雨', emoji: '🌧️', description: '低通滤波白噪音，模拟雨落窗台'},
  {id: 'fire', name: '夏夜篝火', emoji: '🪵', description: '随机带通微爆脉冲，温暖治愈'},
  {id: 'stream', name: '山涧微风', emoji: '🍃', description: '平缓中频声波，清爽解压'},
  {id: 'pink', name: '专注粉红噪', emoji: '🎧', description: '能量均衡全频噪音，隔绝外界杂音'},
];

export function formatSeconds(totalSec: number): string {
  const m = Math.floor(Math.max(0, totalSec) / 60);
  const s = Math.floor(Math.max(0, totalSec) % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function calculateProgress(remainingSec: number, totalSec: number): number {
  if (totalSec <= 0) return 0;
  const ratio = (totalSec - remainingSec) / totalSec;
  return Math.min(1, Math.max(0, ratio));
}

/**
 * Web Audio 端侧合成环境音播放器
 */
export class EndelSynthesizer {
  private ctx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private currentType: AmbientSoundType = 'rain';
  private volume = 0.5;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public start(type: AmbientSoundType = 'rain') {
    this.initContext();
    if (!this.ctx) return;
    this.stop();
    this.currentType = type;

    const sampleRate = this.ctx.sampleRate;
    const duration = 2.0; // 2秒无缝循环缓冲
    const bufferSize = sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'pink') {
        // Paul Kellet's Pink Noise algorithm
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else if (type === 'fire') {
        // 篝火：带微爆杂音
        const crackle = Math.random() < 0.0015 ? (Math.random() * 2 - 1) * 0.8 : 0;
        data[i] = (white * 0.15 + crackle) * 0.5;
      } else if (type === 'stream') {
        // 微风溪流：中频波动
        data[i] = white * 0.25;
      } else {
        // 雨声：柔和粉白噪
        data[i] = white * 0.2;
      }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    if (type === 'rain') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    } else if (type === 'stream') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
      filter.Q.setValueAtTime(0.7, this.ctx.currentTime);
    } else if (type === 'fire') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, this.ctx.currentTime);
    } else {
      filter.type = 'allpass';
    }

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    source.start();
    this.currentSource = source;
    this.gainNode = gain;
    this.isPlaying = true;
  }

  public stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {}
      this.currentSource = null;
    }
    this.isPlaying = false;
  }

  public toggle(type: AmbientSoundType = 'rain'): boolean {
    if (this.isPlaying && this.currentType === type) {
      this.stop();
      return false;
    }
    this.start(type);
    return true;
  }

  public getStatus() {
    return {isPlaying: this.isPlaying, currentType: this.currentType, volume: this.volume};
  }
}
