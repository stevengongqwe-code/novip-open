import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  applyDocumentThemeMode,
  evaluateImmersionCapability,
  loadSavedThemeMode,
  saveThemeMode,
  resolveEffectiveTier,
  type ImmersionTier,
  type VisualThemeMode,
} from './capability';
import {ImmersionStage} from './ImmersionStage';
import {
  persistSoundEnabled,
  playAudioToggleOn,
  playModeSwitch,
  playShockwaveChord,
  readStoredSoundEnabled,
} from './soundEngine';
import {emitImmersionTelemetry, subscribeImmersionTelemetry} from './telemetryBus';
import {useSpatialInteractions} from './useSpatialInteractions';
import {ClickSparkLayer} from '../motion/components/ClickSparkLayer';
import {DecryptedText} from '../motion/components/DecryptedText';
import {OfflineReadyBadge} from '../motion/components/OfflineReadyBadge';
import {LanguageSwitcher, useI18n} from '../i18n';

export interface GlobalImmersionShellProps {
  page: string;
}

/**
 * 全站级沉浸式视觉宿主 (Phase 4: Full-Site Deep-Space Immersion)
 * 挂载于应用根部 (Root)，为首页及全部 74 款工具子页面提供持久化的全视口 (100vw × 100vh)
 * WebGL 双通道体积星云与 3D 粒子场，以及跨路由不间断的空间交互与声学遥测。
 */
export function GlobalImmersionShell({page}: GlobalImmersionShellProps) {
  const capability = useMemo(() => evaluateImmersionCapability(), []);
  const [themeMode, setThemeMode] = useState<VisualThemeMode>(() => loadSavedThemeMode());
  const [activeTier, setActiveTier] = useState<ImmersionTier>(() =>
    resolveEffectiveTier(loadSavedThemeMode(), capability),
  );
  const { t } = useI18n();
  const [pulseCount, setPulseCount] = useState(0);
  const [liveFps, setLiveFps] = useState<number>(capability.targetFps || 60);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => readStoredSoundEnabled());
  const [telemetryText, setTelemetryText] = useState<string>(
    'LOCAL.WEBGL // 全站校园工具纯本机内存隔离运行',
  );

  // 全局挂载卡片 3D 光影跟随与滚动渐显（移动端触摸光影同步响应）
  useSpatialInteractions({
    enableCardTilt: themeMode !== 'minimal',
    prefersReducedMotion: capability.prefersReducedMotion,
  });

  useEffect(() => {
    applyDocumentThemeMode(themeMode);
  }, [themeMode]);

  // 监听来自首页或任意子页面的主题切换事件
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleModeEvent = (e: Event) => {
      const mode = (e as CustomEvent<{mode?: VisualThemeMode}>).detail?.mode;
      if (mode === 'immersive' || mode === 'daylight' || mode === 'minimal') {
        setThemeMode(mode);
        setActiveTier(resolveEffectiveTier(mode, capability));
      }
    };
    window.addEventListener('novip:visual-mode-change', handleModeEvent);
    return () => window.removeEventListener('novip:visual-mode-change', handleModeEvent);
  }, [capability]);

  // 监听全站实时遥测事件
  useEffect(() => {
    return subscribeImmersionTelemetry((payload) => {
      setTelemetryText(`${payload.code} · ${payload.label}`);
    });
  }, []);

  // 路由切换时激发一次轻量级空间跃迁能量
  useEffect(() => {
    if (themeMode !== 'immersive') return;
    emitImmersionTelemetry({
      code: page === 'home' ? 'STAGE.HOME' : `TOOL.${page.toUpperCase().slice(0, 12)}`,
      label:
        page === 'home'
          ? '全站深空粒子场已就绪 · 零上传端侧引擎'
          : `当前工作台：${page} · 纯本机内存运算`,
      energyBoost: 0.45,
    });
  }, [page, themeMode]);

  const handleAutoDowngrade = useCallback((nextTier: ImmersionTier) => {
    setActiveTier(nextTier);
  }, []);

  const handleFpsSample = useCallback((fps: number) => {
    setLiveFps(fps);
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('novip:immersion-fps', {detail: {fps}}));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleChangeMode = (mode: VisualThemeMode) => {
    playModeSwitch(soundEnabled, mode);
    setThemeMode(mode);
    saveThemeMode(mode);
    setActiveTier(resolveEffectiveTier(mode, capability));
  };

  const handleSubpagePulse = () => {
    setPulseCount((c) => c + 1);
    playShockwaveChord(soundEnabled);
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('novip:immersion-pulse', {detail: {x: 0.5, y: 0.32}}),
      );
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    persistSoundEnabled(next);
    if (next) {
      playAudioToggleOn();
    }
  };

  return (
    <div className="novip-global-immersion-shell" data-visual-mode={themeMode}>
      <ClickSparkLayer enabled={themeMode !== 'minimal'} />
      <ImmersionStage
        capability={capability}
        activeTier={activeTier}
        themeMode={themeMode}
        pulseCount={pulseCount}
        globalViewport={true}
        onAutoDowngrade={handleAutoDowngrade}
        onFpsSample={handleFpsSample}
      />

      {page !== 'home' && (
        <div className="novip-subpage-holo-strip" role="region" aria-label="子页面全息视觉控制台">
          <div className="novip-subpage-holo-inner">
            <div className="novip-subpage-holo-left">
              <button
                type="button"
                className="novip-subpage-orb-mini"
                onClick={handleSubpagePulse}
                title="触发全视口 3D 粒子引力波脉冲"
              >
                <span>NV</span>
              </button>
              <span className="novip-subpage-telemetry-text">
                <DecryptedText text={telemetryText} />
              </span>
              <span className="novip-telemetry-tier">
                {capability.webgl2Supported ? 'WEBGL2' : capability.webglSupported ? 'WEBGL1' : '2D'} ·{' '}
                {themeMode === 'immersive' ? `${liveFps}FPS` : 'STATIC'} · {activeTier.toUpperCase()}
              </span>
            </div>

            <div className="novip-subpage-holo-right">
              <OfflineReadyBadge />
              <button
                type="button"
                className="novip-holo-mode-btn"
                onClick={() => window.dispatchEvent(new CustomEvent('novip:open-command-palette'))}
                title={t('common.nav.openCommandPalette')}
              >
                {t('common.nav.openCommandPalette')}
              </button>
              <button
                type="button"
                className={`novip-audio-wave-btn${soundEnabled ? ' is-sound-on' : ''}`}
                onClick={handleToggleSound}
                aria-pressed={soundEnabled}
                title={soundEnabled ? t('common.shell.sfxTitleOn') : t('common.shell.sfxTitleOff')}
              >
                <span className="novip-audio-wave-label">
                  {soundEnabled ? t('common.shell.sfxOn') : t('common.shell.sfxMute')}
                </span>
              </button>

              <LanguageSwitcher compact />

              <div className="novip-holo-controls" role="group" aria-label="视觉模式切换">
                <button
                  type="button"
                  className={`novip-holo-mode-btn${themeMode === 'immersive' ? ' active' : ''}`}
                  aria-pressed={themeMode === 'immersive'}
                  onClick={() => handleChangeMode('immersive')}
                >
                  {t('common.shell.immersive')}
                </button>
                <button
                  type="button"
                  className={`novip-holo-mode-btn${themeMode === 'daylight' ? ' active' : ''}`}
                  aria-pressed={themeMode === 'daylight'}
                  onClick={() => handleChangeMode('daylight')}
                >
                  {t('common.shell.daylight')}
                </button>
                <button
                  type="button"
                  className={`novip-holo-mode-btn${themeMode === 'minimal' ? ' active' : ''}`}
                  aria-pressed={themeMode === 'minimal'}
                  onClick={() => handleChangeMode('minimal')}
                >
                  {t('common.shell.minimal')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
