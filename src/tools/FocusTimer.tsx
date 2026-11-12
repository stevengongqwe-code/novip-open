import React, {useEffect, useRef, useState, useMemo} from 'react';
import {ToolPage} from './common';
import {
  FOCUS_PRESETS,
  AMBIENT_PRESETS,
  EndelSynthesizer,
  formatSeconds,
  calculateProgress,
  type FocusMode,
  type AmbientSoundType,
} from './focus-core';
import {playHoverTick, readStoredSoundEnabled} from '../immersive/soundEngine';
import './focus.css';

const TOOL_ID = 'focus';

export default function FocusTimer() {
  const [mode, setMode] = useState<FocusMode>('pomodoro');
  const [totalSec, setTotalSec] = useState(25 * 60);
  const [remainingSec, setRemainingSec] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSound, setActiveSound] = useState<AmbientSoundType | null>(null);
  const [volume, setVolume] = useState(0.5);

  const synthRef = useRef<EndelSynthesizer | null>(null);

  useEffect(() => {
    synthRef.current = new EndelSynthesizer();
    return () => {
      synthRef.current?.stop();
    };
  }, []);

  // Timer loop
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isRunning && remainingSec > 0) {
      timer = setInterval(() => {
        setRemainingSec((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            playHoverTick(readStoredSoundEnabled());
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRunning, remainingSec]);

  const handleSelectMode = (presetId: FocusMode) => {
    const preset = FOCUS_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setMode(presetId);
    const secs = preset.durationMinutes * 60;
    setTotalSec(secs);
    setRemainingSec(secs);
    setIsRunning(false);
    playHoverTick(readStoredSoundEnabled());
  };

  const handleTogglePlay = () => {
    playHoverTick(readStoredSoundEnabled());
    setIsRunning((prev) => !prev);
  };

  const handleReset = () => {
    playHoverTick(readStoredSoundEnabled());
    setIsRunning(false);
    setRemainingSec(totalSec);
  };

  const handleToggleSound = (soundType: AmbientSoundType) => {
    if (!synthRef.current) return;
    playHoverTick(readStoredSoundEnabled());
    if (activeSound === soundType) {
      synthRef.current.stop();
      setActiveSound(null);
    } else {
      synthRef.current.start(soundType);
      synthRef.current.setVolume(volume);
      setActiveSound(soundType);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    synthRef.current?.setVolume(val);
  };

  const progress = useMemo(
    () => calculateProgress(remainingSec, totalSec),
    [remainingSec, totalSec],
  );

  const circumference = 2 * Math.PI * 105;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <ToolPage
      id={TOOL_ID}
      title="沉浸自习番茄钟与白噪音"
      description="专为大学生自习刷题、背单词、写论文设计的沉浸番茄钟，内置纯端侧合成白噪音，零音频下载，完全离线运行。"
    >
      <div className="focus-container">
        {/* Preset selectors */}
        <div className="focus-presets" role="tablist">
          {FOCUS_PRESETS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={mode === p.id}
              className={`focus-preset-btn ${mode === p.id ? 'active' : ''}`}
              onClick={() => handleSelectMode(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Circular Dial */}
        <div className="focus-dial-wrap">
          <svg className="focus-svg-dial" viewBox="0 0 240 240" aria-hidden="true">
            <defs>
              <linearGradient id="focusGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0071e3" />
                <stop offset="100%" stopColor="#81ecfe" />
              </linearGradient>
            </defs>
            <circle
              className="focus-circle-bg"
              cx="120"
              cy="120"
              r="105"
              fill="none"
              strokeWidth="8"
            />
            <circle
              className="focus-circle-progress"
              cx="120"
              cy="120"
              r="105"
              fill="none"
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>

          <div className="focus-dial-inner">
            <div className="focus-time-display" aria-label={`剩余时间 ${formatSeconds(remainingSec)}`}>
              {formatSeconds(remainingSec)}
            </div>
            <span className="focus-mode-label">
              {isRunning ? '专注进行中 ✦' : remainingSec === 0 ? '专注已完成 ✓' : '待开始'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="focus-actions">
          <button
            type="button"
            className="focus-action-btn primary"
            onClick={handleTogglePlay}
          >
            {isRunning ? '暂停计时' : remainingSec === 0 ? '再来一组' : '开始专注'}
          </button>
          <button
            type="button"
            className="focus-action-btn secondary"
            onClick={handleReset}
          >
            重置
          </button>
        </div>

        {/* Ambient Web Audio Section */}
        <section className="focus-ambient-section" aria-label="纯端侧背景白噪音">
          <div className="focus-ambient-header">
            <span>🎧 纯端侧环境音效（零外置音频 · 离线合成）</span>
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
              <span style={{fontSize: 11, color: '#64748b'}}>音量:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={handleVolumeChange}
                aria-label="白噪音音量"
                style={{width: 70}}
              />
            </div>
          </div>

          <div className="focus-ambient-grid">
            {AMBIENT_PRESETS.map((snd) => {
              const isActive = activeSound === snd.id;
              return (
                <button
                  key={snd.id}
                  type="button"
                  className={`focus-ambient-card ${isActive ? 'active' : ''}`}
                  onClick={() => handleToggleSound(snd.id)}
                  aria-pressed={isActive}
                >
                  <span style={{fontSize: 20}}>{snd.emoji}</span>
                  <div>
                    <div style={{fontSize: 12.5, fontWeight: 600}}>{snd.name}</div>
                    <div style={{fontSize: 10.5, opacity: 0.7}}>{snd.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </ToolPage>
  );
}
