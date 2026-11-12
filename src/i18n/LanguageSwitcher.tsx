import React, { useCallback, useRef } from 'react';
import { useI18n } from './I18nContext';
import type { Language } from './types';
import { playHoverTick, readStoredSoundEnabled } from '../immersive/soundEngine';

export interface LanguageSwitcherProps {
  className?: string;
  compact?: boolean;
}

export function LanguageSwitcher({ className = '', compact = false }: LanguageSwitcherProps) {
  const { lang, setLang } = useI18n();
  const groupRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (nextLang: Language) => {
      if (nextLang === lang) return;
      playHoverTick(readStoredSoundEnabled());
      setLang(nextLang);
    },
    [lang, setLang],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, targetLang: Language) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      handleSelect('en-US');
      const enBtn = groupRef.current?.querySelector<HTMLButtonElement>('[data-lang="en-US"]');
      enBtn?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      handleSelect('zh-CN');
      const zhBtn = groupRef.current?.querySelector<HTMLButtonElement>('[data-lang="zh-CN"]');
      zhBtn?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(targetLang);
    }
  };

  return (
    <div
      ref={groupRef}
      className={`novip-lang-switcher ${compact ? 'is-compact' : ''} ${className}`}
      role="radiogroup"
      aria-label="语言切换 / Language Switcher"
    >
      <button
        type="button"
        role="radio"
        data-lang="zh-CN"
        aria-checked={lang === 'zh-CN'}
        className={`novip-lang-segment ${lang === 'zh-CN' ? 'active' : ''}`}
        onClick={() => handleSelect('zh-CN')}
        onKeyDown={(e) => handleKeyDown(e, 'zh-CN')}
        aria-label="切换至简体中文"
        title="简体中文"
      >
        <span>中文</span>
      </button>

      <span className="novip-lang-divider" aria-hidden="true" />

      <button
        type="button"
        role="radio"
        data-lang="en-US"
        aria-checked={lang === 'en-US'}
        className={`novip-lang-segment ${lang === 'en-US' ? 'active' : ''}`}
        onClick={() => handleSelect('en-US')}
        onKeyDown={(e) => handleKeyDown(e, 'en-US')}
        aria-label="Switch to English"
        title="English"
      >
        <span>EN</span>
      </button>
    </div>
  );
}
