import React, {useState, useEffect} from 'react';
import {playHoverTick, readStoredSoundEnabled} from '../../immersive/soundEngine';

export const OfflineReadyBadge: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [showInfo, setShowInfo] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine !== false);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleClick = () => {
    playHoverTick(readStoredSoundEnabled());
    setShowInfo((prev) => !prev);
  };

  return (
    <div style={{position: 'relative', display: 'inline-flex', alignItems: 'center'}}>
      <button
        type="button"
        onClick={handleClick}
        className="novip-offline-ready-btn"
        aria-label="查看端侧离线安全说明"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 9999,
          background: isOnline ? 'rgba(52, 211, 153, 0.12)' : 'rgba(251, 191, 36, 0.15)',
          border: `1px solid ${isOnline ? 'rgba(52, 211, 153, 0.35)' : 'rgba(251, 191, 36, 0.4)'}`,
          color: isOnline ? '#059669' : '#d97706',
          fontSize: 11.5,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isOnline ? '#10b981' : '#f59e0b',
            boxShadow: `0 0 6px ${isOnline ? '#10b981' : '#f59e0b'}`,
          }}
        />
        <span>{isOnline ? '端侧运算池已就绪' : '离网运行中 · 纯本地'}</span>
      </button>

      {showInfo && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 260,
            padding: 12,
            borderRadius: 12,
            background: 'var(--novip-glass-bg, rgba(255, 255, 255, 0.95))',
            border: '1px solid var(--border, #cbd5e1)',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.18)',
            fontSize: 12,
            lineHeight: 1.6,
            color: 'var(--text, #1e293b)',
            zIndex: 1000,
            backdropFilter: 'blur(12px)',
          }}
        >
          <div style={{fontWeight: 700, marginBottom: 4, color: '#0071e3'}}>
            🛡️ 100% 浏览器本地运算承诺
          </div>
          <div>
            NOVIP 所有证件照、PDF处理、代码运行与表格计算均由当前浏览器 WebAssembly/Canvas 在本地端侧完成，断网离线也能正常处理，数据绝不上载第三方服务器。
          </div>
        </div>
      )}
    </div>
  );
};
