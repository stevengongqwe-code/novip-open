import React, {useState, useEffect, useMemo} from 'react';
import {ToolPage, copyLocal} from './common';
import {
  EXAM_PRESETS,
  calculateCountdown,
  type ExamPreset,
} from './exam-countdown-core';
import {playHoverTick, readStoredSoundEnabled} from '../immersive/soundEngine';
import './exam-countdown.css';

const TOOL_ID = 'countdown';

export default function ExamCountdown() {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('postgrad-2027');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customDate, setCustomDate] = useState<string>('');
  const [slogan, setSlogan] = useState<string>(EXAM_PRESETS[0].defaultSlogan);
  const [now, setNow] = useState<Date>(new Date());
  const [copied, setCopied] = useState<boolean>(false);

  // Live second updater
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activePreset = useMemo(
    () => EXAM_PRESETS.find((p) => p.id === selectedPresetId),
    [selectedPresetId],
  );

  const targetDate = useMemo(() => {
    if (selectedPresetId === 'custom' && customDate) {
      return new Date(customDate);
    }
    return activePreset ? new Date(activePreset.targetDateStr) : new Date();
  }, [selectedPresetId, customDate, activePreset]);

  const time = useMemo(() => calculateCountdown(targetDate, now), [targetDate, now]);

  const displayTitle = selectedPresetId === 'custom' ? (customTitle || '我的目标大考') : (activePreset?.name || '目标考试');

  const handleSelectPreset = (p: ExamPreset) => {
    playHoverTick(readStoredSoundEnabled());
    setSelectedPresetId(p.id);
    setSlogan(p.defaultSlogan);
  };

  const handleCopyText = async () => {
    playHoverTick(readStoredSoundEnabled());
    const text = `⏳【距离 ${displayTitle} 仅剩 ${time.days} 天 ${time.hours} 小时 ${time.minutes} 分！】
“${slogan}”
坚持住，岸上花开！
（无水印倒计时打卡助手 NOVIP：https://novip.site/tools/countdown）`;
    await copyLocal(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  };

  return (
    <ToolPage
      id={TOOL_ID}
      title="四六级 / 考研目标倒计时微挂件"
      description="大考倒计时实时精确到秒，内置四六级、考研初试、教资与期末周预设，一键生成无水印励志打卡文案与自律卡片。"
    >
      <div className="countdown-container">
        {/* Preset chips */}
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 20}}>
          {EXAM_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`button secondary ${selectedPresetId === p.id ? 'active' : ''}`}
              style={{
                borderRadius: 9999,
                fontSize: 13,
                padding: '6px 14px',
                borderColor: selectedPresetId === p.id ? '#0071e3' : undefined,
                background: selectedPresetId === p.id ? 'rgba(0,113,227,0.1)' : undefined,
                fontWeight: selectedPresetId === p.id ? 700 : 500,
              }}
              onClick={() => handleSelectPreset(p)}
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            className={`button secondary ${selectedPresetId === 'custom' ? 'active' : ''}`}
            style={{borderRadius: 9999, fontSize: 13, padding: '6px 14px'}}
            onClick={() => {
              playHoverTick(readStoredSoundEnabled());
              setSelectedPresetId('custom');
            }}
          >
            + 自定义考试
          </button>
        </div>

        {/* Custom fields */}
        {selectedPresetId === 'custom' && (
          <div style={{display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap'}}>
            <input
              type="text"
              placeholder="考试名称 (如：法考客观题)"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              style={{flex: 1, minWidth: 160, padding: 10, borderRadius: 10, border: '1px solid #cbd5e1'}}
            />
            <input
              type="datetime-local"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              style={{flex: 1, minWidth: 200, padding: 10, borderRadius: 10, border: '1px solid #cbd5e1'}}
            />
          </div>
        )}

        {/* Hero Countdown Card */}
        <div className="countdown-hero-card" role="region" aria-label="倒计时主卡片">
          <div style={{fontSize: 14, fontWeight: 700, color: '#0071e3', letterSpacing: 1}}>
            COUNTDOWN · 终点见
          </div>
          <h2 style={{fontSize: 26, fontWeight: 800, margin: '8px 0 16px 0'}}>
            {displayTitle}
          </h2>

          <div className="countdown-digits-row">
            <div className="countdown-box">
              <div className="countdown-number">{time.days}</div>
              <div className="countdown-unit">DAYS 天</div>
            </div>
            <div className="countdown-box">
              <div className="countdown-number">{String(time.hours).padStart(2, '0')}</div>
              <div className="countdown-unit">HOURS 时</div>
            </div>
            <div className="countdown-box">
              <div className="countdown-number">{String(time.minutes).padStart(2, '0')}</div>
              <div className="countdown-unit">MINS 分</div>
            </div>
            <div className="countdown-box">
              <div className="countdown-number">{String(time.seconds).padStart(2, '0')}</div>
              <div className="countdown-unit">SECS 秒</div>
            </div>
          </div>

          <p className="countdown-slogan">“{slogan}”</p>
        </div>

        {/* Actions */}
        <div style={{display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16}}>
          <button
            type="button"
            className="button primary"
            onClick={handleCopyText}
            style={{padding: '10px 24px', fontSize: 14}}
          >
            {copied ? '已复制朋友圈打卡文案 ✓' : '复制打卡文案'}
          </button>
        </div>
      </div>
    </ToolPage>
  );
}
