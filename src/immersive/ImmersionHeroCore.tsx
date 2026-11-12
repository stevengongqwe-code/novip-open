import {useState, useRef, useEffect} from 'react';
import type {
  ImmersionCapabilityProfile,
  ImmersionTier,
  VisualThemeMode,
} from './capability';
import {
  readStoredSoundEnabled,
  persistSoundEnabled,
  playAudioToggleOn,
  playShockwaveChord,
  playModeSwitch,
} from './soundEngine';
import {subscribeImmersionTelemetry} from './telemetryBus';
import {DecryptedText} from '../motion/components/DecryptedText';
import {LanguageSwitcher, useI18n} from '../i18n';
import {PUBLIC_TOOL_COUNT} from '../tools/registry';

export interface ImmersionHeroCoreProps {
  capability: ImmersionCapabilityProfile;
  activeTier: ImmersionTier;
  themeMode: VisualThemeMode;
  fps: number;
  onChangeThemeMode: (mode: VisualThemeMode) => void;
  onTriggerPulse: (originX?: number, originY?: number) => void;
}

const CORE_TELEMETRY_STATES = [
  'CORE.01 // 端侧 WebAssembly 零上传算力池已就绪',
  `CORE.02 // ${PUBLIC_TOOL_COUNT} 款文档·证件照·手写·课表工具 0 元解锁`,
  'CORE.03 // 二分图像压缩引擎 & PDF 内存管线待命',
  'CORE.04 // 隐私沙盒已激活 · 文件 100% 留存本机内存',
] as const;

const TIER_LABELS: Record<ImmersionTier, string> = {
  high: 'WEBGL2 · HIGH',
  medium: 'WEBGL · BALANCED',
  lite: 'SMART · LITE',
  minimal: 'SAFE · STATIC',
};

export function ImmersionHeroCore({
  capability,
  activeTier,
  themeMode,
  fps,
  onChangeThemeMode,
  onTriggerPulse,
}: ImmersionHeroCoreProps) {
  const { t } = useI18n();
  const [coreIndex, setCoreIndex] = useState(0);
  const [waveBoost, setWaveBoost] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    readStoredSoundEnabled()
  );
  const [liveTelemetry, setLiveTelemetry] = useState<string | null>(null);
  const orbRef = useRef<HTMLButtonElement | null>(null);
  const [tilt, setTilt] = useState<{rx: number; ry: number; gx: number; gy: number}>({
    rx: 0,
    ry: 0,
    gx: 50,
    gy: 50,
  });

  useEffect(() => {
    let resetTimer: number | null = null;
    const unsubscribe = subscribeImmersionTelemetry((payload) => {
      setLiveTelemetry(`${payload.code} // ${payload.label}`);
      setWaveBoost(true);
      if (payload.energyBoost && payload.energyBoost > 0.3) {
        onTriggerPulse(0.5, 0.52);
      }
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        setWaveBoost(false);
        setLiveTelemetry(null);
      }, 2400);
    });
    return () => {
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      unsubscribe();
    };
  }, [onTriggerPulse]);

  const updateOrbTiltFromCoords = (clientX: number, clientY: number) => {
    if (activeTier === 'minimal') return;
    const el = orbRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    setTilt({
      rx: Math.max(-25, Math.min(25, (0.5 - ny) * 22)),
      ry: Math.max(-25, Math.min(25, (nx - 0.5) * 22)),
      gx: Math.round(Math.max(0, Math.min(100, nx * 100))),
      gy: Math.round(Math.max(0, Math.min(100, ny * 100))),
    });
  };

  const handleOrbPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    updateOrbTiltFromCoords(e.clientX, e.clientY);
  };

  const handleOrbTouchMove = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (e.touches && e.touches[0]) {
      updateOrbTiltFromCoords(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleOrbPointerLeave = () => {
    setTilt({rx: 0, ry: 0, gx: 50, gy: 50});
  };

  const handleOrbClick = () => {
    setLiveTelemetry(null);
    setCoreIndex((prev) => (prev + 1) % CORE_TELEMETRY_STATES.length);
    setWaveBoost(true);
    playShockwaveChord(soundEnabled);
    onTriggerPulse(0.5, 0.42);
    window.setTimeout(() => setWaveBoost(false), 900);
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    persistSoundEnabled(next);
    if (next) {
      playAudioToggleOn();
      setWaveBoost(true);
      window.setTimeout(() => setWaveBoost(false), 600);
    }
  };

  const handleModeSwitch = (mode: VisualThemeMode) => {
    playModeSwitch(soundEnabled, mode);
    onChangeThemeMode(mode);
  };

  return (
    <div className="novip-immersion-hud" aria-label="NOVIP 沉浸式视觉控制台">
      {/* 1. Active Theory 风格全息流光胶囊栏 (NavBGShader + NavAudioShader 致敬) */}
      <div className="novip-holo-bar">
        <div className="novip-holo-telemetry">
          <button
            type="button"
            className={`novip-audio-wave-btn${soundEnabled ? ' is-sound-on' : ''}${waveBoost ? ' boost' : ''}`}
            onClick={handleToggleSound}
            aria-pressed={soundEnabled}
            data-sound-enabled={soundEnabled ? 'true' : 'false'}
            title={
              soundEnabled
                ? 'Web Audio 极客微音效已开启（点击静音）'
                : '点击开启 Web Audio 空间微音效反馈（零外部音频文件）'
            }
          >
            <span className={`novip-sine-wave${waveBoost ? ' boost' : ''}`} aria-hidden="true">
              <svg width="28" height="14" viewBox="0 0 28 14" fill="none">
                <path
                  className="novip-wave-path w1"
                  d="M1 7 C 5 2, 9 12, 14 7 C 19 2, 23 12, 27 7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  className="novip-wave-path w2"
                  d="M1 7 C 5 11, 9 3, 14 7 C 19 11, 23 3, 27 7"
                  stroke="#81ecfe"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  opacity="0.78"
                />
                <path
                  className="novip-wave-path w3"
                  d="M1 7 C 6 4, 10 10, 14 7 C 18 4, 22 10, 27 7"
                  stroke="#c64dff"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  opacity="0.7"
                />
              </svg>
            </span>
            <span className="novip-audio-wave-label">
              {soundEnabled ? 'SFX·ON' : 'SFX·MUTE'}
            </span>
          </button>
          <span className="novip-telemetry-code">SYS.NOVIP // {PUBLIC_TOOL_COUNT}_MODULES</span>
          <span className="novip-telemetry-tier" title={`渲染档位原因: ${capability.reason}`}>
            {TIER_LABELS[activeTier]}
            {themeMode === 'immersive' && activeTier !== 'minimal' ? ` · ${fps}FPS` : ''}
          </span>
        </div>

        <div className="novip-holo-controls" role="group" aria-label="视觉模式与语言设置">
          <LanguageSwitcher compact />
          <button
            type="button"
            className={`novip-holo-mode-btn${themeMode === 'immersive' ? ' active' : ''}`}
            onClick={() => handleModeSwitch('immersive')}
            aria-pressed={themeMode === 'immersive'}
          >
            {t('common.shell.immersive')}
          </button>
          <button
            type="button"
            className={`novip-holo-mode-btn${themeMode === 'daylight' ? ' active' : ''}`}
            onClick={() => handleModeSwitch('daylight')}
            aria-pressed={themeMode === 'daylight'}
          >
            {t('common.shell.daylight')}
          </button>
          <button
            type="button"
            className={`novip-holo-mode-btn${themeMode === 'minimal' ? ' active' : ''}`}
            onClick={() => handleModeSwitch('minimal')}
            aria-pressed={themeMode === 'minimal'}
          >
            {t('common.shell.minimal')}
          </button>
        </div>
      </div>

      {/* 2. 3D 交互式全息能量星环核心 (点击激发全屏粒子引力波，全模式均展现) */}
      <div className={`novip-holo-core-row mode-${themeMode}`}>
        <button
          ref={orbRef}
          type="button"
          className={`novip-holo-orb-btn${waveBoost ? ' pulsing' : ''}`}
          onPointerMove={handleOrbPointerMove}
          onPointerLeave={handleOrbPointerLeave}
          onTouchStart={handleOrbTouchMove}
          onTouchMove={handleOrbTouchMove}
          onTouchEnd={handleOrbPointerLeave}
          onClick={handleOrbClick}
          style={{
            transform: `perspective(600px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)`,
            ['--orb-gx' as string]: `${tilt.gx}%`,
            ['--orb-gy' as string]: `${tilt.gy}%`,
          }}
          title="点击释放粒子引力波并切换算力核心遥测状态"
          aria-label="释放粒子引力波并切换算力核心状态"
        >
          <span className="novip-holo-ring outer" aria-hidden="true" />
          <span className="novip-holo-ring middle" aria-hidden="true" />
          <span className="novip-holo-ring inner" aria-hidden="true" />
          <span className="novip-holo-monogram" aria-hidden="true">
            <strong>N</strong>
            <small>0·VIP</small>
          </span>
        </button>

        <div className="novip-holo-readout" onClick={handleOrbClick} role="status">
          <span className="novip-holo-readout-tag">ACTIVE ENGINE TELEMETRY · 点击星环触发引力波</span>
          <span className="novip-holo-readout-text">
            <DecryptedText text={liveTelemetry ?? CORE_TELEMETRY_STATES[coreIndex]} />
          </span>
        </div>
      </div>
    </div>
  );
}
