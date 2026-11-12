import {isWeChat, isMobileDevice} from '../tools/wechat-core';

export type ImmersionTier = 'high' | 'medium' | 'lite' | 'minimal';
export type VisualThemeMode = 'immersive' | 'daylight' | 'minimal';

export interface DeviceCapabilityInput {
  userAgent?: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  prefersReducedMotion?: boolean;
  webglSupported?: boolean;
  webgl2Supported?: boolean;
  saveData?: boolean;
  screenWidth?: number;
  devicePixelRatio?: number;
}

export interface ImmersionCapabilityProfile {
  tier: ImmersionTier;
  reason: string;
  isWeChat: boolean;
  isMobile: boolean;
  isLowEndAndroid: boolean;
  prefersReducedMotion: boolean;
  webglSupported: boolean;
  webgl2Supported: boolean;
  maxDpr: number;
  particleCount: number;
  targetFps: number;
  enableShaderNebula: boolean;
  enableCardTilt: boolean;
  enablePointerFluid: boolean;
}

export const IMMERSION_THEME_STORAGE_KEY = 'novip-immersion-theme-v1';

/**
 * 识别低性能 Android 设备：
 * - Android 且 CPU 核心数 <= 4 或 内存 <= 4GB
 * - 或旧版 Android 5/6/7/8/9
 */
export function detectLowEndAndroid(
  userAgent = '',
  hardwareConcurrency = 8,
  deviceMemory = 8,
): boolean {
  if (!/Android/i.test(userAgent)) return false;
  const oldAndroidMatch = userAgent.match(/Android\s+(\d+)/i);
  if (oldAndroidMatch) {
    const major = parseInt(oldAndroidMatch[1], 10);
    if (Number.isFinite(major) && major <= 9) return true;
  }
  if (hardwareConcurrency > 0 && hardwareConcurrency <= 4) return true;
  if (deviceMemory > 0 && deviceMemory <= 4) return true;
  return false;
}

/**
 * 安全探测 WebGL / WebGL2 支持情况（在 JSDOM、无 GPU 或禁用 WebGL 环境下绝不抛错）
 */
export function probeWebGLSupport(): {webgl: boolean; webgl2: boolean; renderer: string} {
  if (
    typeof document === 'undefined' ||
    (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))
  ) {
    return {webgl: false, webgl2: false, renderer: 'none'};
  }
  try {
    const canvas = document.createElement('canvas');
    let webgl2 = false;
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
      }) as WebGL2RenderingContext | null;
      if (gl) webgl2 = true;
    } catch {
      gl = null;
    }
    if (!gl) {
      try {
        gl = (canvas.getContext('webgl', {
          alpha: false,
          antialias: false,
          failIfMajorPerformanceCaveat: false,
        }) ||
          canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      } catch {
        gl = null;
      }
    }
    if (!gl) {
      return {webgl: false, webgl2: false, renderer: 'unavailable'};
    }
    let renderer = 'webgl';
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'webgl');
      }
    } catch {
      /* ignore */
    }
    // SwiftShader / सॉफ्टवेयर光栅化器视为低性能，降级处理
    const isSoftwareRenderer = /SwiftShader|llvmpipe|Software/i.test(renderer);
    if (isSoftwareRenderer) {
      return {webgl: true, webgl2: false, renderer};
    }
    return {webgl: true, webgl2, renderer};
  } catch {
    return {webgl: false, webgl2: false, renderer: 'error'};
  }
}

/**
 * 综合评估当前设备的沉浸式渲染档位（参考 Active Theory Tests 分级策略并针对 NOVIP 校园场景调优）
 */
export function evaluateImmersionCapability(
  input: DeviceCapabilityInput = {},
): ImmersionCapabilityProfile {
  const ua =
    input.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const cores =
    input.hardwareConcurrency ??
    (typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 8);
  const memory =
    input.deviceMemory ??
    (typeof navigator !== 'undefined' &&
    'deviceMemory' in navigator &&
    typeof (navigator as {deviceMemory?: number}).deviceMemory === 'number'
      ? (navigator as {deviceMemory: number}).deviceMemory
      : 8);
  const reducedMotion =
    input.prefersReducedMotion ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false);
  const saveData =
    input.saveData ??
    (typeof navigator !== 'undefined' &&
    'connection' in navigator &&
    Boolean((navigator as {connection?: {saveData?: boolean}}).connection?.saveData));
  const dpr =
    input.devicePixelRatio ??
    (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number'
      ? window.devicePixelRatio
      : 1);

  const wechat = isWeChat(ua);
  const mobile = isMobileDevice(ua);
  const lowEndAndroid = detectLowEndAndroid(ua, cores, memory);

  let webgl = input.webglSupported;
  let webgl2 = input.webgl2Supported;
  if (webgl === undefined || webgl2 === undefined) {
    const probed = probeWebGLSupport();
    if (webgl === undefined) webgl = probed.webgl;
    if (webgl2 === undefined) webgl2 = probed.webgl2;
  }

  // 1. prefers-reduced-motion 或开启省流模式 -> minimal 静态星幕档位
  if (reducedMotion) {
    return {
      tier: 'minimal',
      reason: 'prefers-reduced-motion',
      isWeChat: wechat,
      isMobile: mobile,
      isLowEndAndroid: lowEndAndroid,
      prefersReducedMotion: true,
      webglSupported: Boolean(webgl),
      webgl2Supported: Boolean(webgl2),
      maxDpr: 1,
      particleCount: 0,
      targetFps: 0,
      enableShaderNebula: false,
      enableCardTilt: false,
      enablePointerFluid: false,
    };
  }

  // 2. WebGL 不可用 -> minimal 轻量安全档位（2D Canvas 极简星点 + CSS 深空渐变）
  if (!webgl) {
    return {
      tier: 'minimal',
      reason: 'webgl-unavailable',
      isWeChat: wechat,
      isMobile: mobile,
      isLowEndAndroid: lowEndAndroid,
      prefersReducedMotion: false,
      webglSupported: false,
      webgl2Supported: false,
      maxDpr: 1,
      particleCount: 28,
      targetFps: 30,
      enableShaderNebula: false,
      enableCardTilt: false,
      enablePointerFluid: false,
    };
  }

  // 3. 低性能 Android 或 微信内置浏览器 或 省流模式 -> lite 轻量流畅档位（防止微信白屏/发热）
  if (lowEndAndroid || wechat || saveData) {
    return {
      tier: 'lite',
      reason: lowEndAndroid ? 'low-end-android' : wechat ? 'wechat-webview' : 'save-data',
      isWeChat: wechat,
      isMobile: mobile,
      isLowEndAndroid: lowEndAndroid,
      prefersReducedMotion: false,
      webglSupported: true,
      webgl2Supported: Boolean(webgl2),
      maxDpr: Math.min(dpr, 1.0),
      particleCount: 64,
      targetFps: 30,
      enableShaderNebula: true,
      enableCardTilt: false,
      enablePointerFluid: false,
    };
  }

  // 4. 移动端常规浏览器 或 桌面中低配 (核数 <= 4 或 内存 <= 4) -> medium 均衡档位
  if (mobile || cores <= 4 || memory <= 4 || !webgl2) {
    return {
      tier: 'medium',
      reason: mobile ? 'mobile-standard' : 'desktop-balanced',
      isWeChat: false,
      isMobile: mobile,
      isLowEndAndroid: false,
      prefersReducedMotion: false,
      webglSupported: true,
      webgl2Supported: Boolean(webgl2),
      maxDpr: Math.min(dpr, 1.25),
      particleCount: 160,
      targetFps: 60,
      enableShaderNebula: true,
      enableCardTilt: !mobile,
      enablePointerFluid: true,
    };
  }

  // 5. 桌面高配 WebGL2 环境 -> high 旗舰沉浸档位
  return {
    tier: 'high',
    reason: 'desktop-high-webgl2',
    isWeChat: false,
    isMobile: false,
    isLowEndAndroid: false,
    prefersReducedMotion: false,
    webglSupported: true,
    webgl2Supported: true,
    maxDpr: Math.min(dpr, 1.65),
    particleCount: 320,
    targetFps: 60,
    enableShaderNebula: true,
    enableCardTilt: true,
    enablePointerFluid: true,
  };
}

/**
 * 档位逐级降级辅助函数（用于设备过热或持续掉帧时平滑降档）
 */
export function downgradeTier(current: ImmersionTier): ImmersionTier {
  if (current === 'high') return 'medium';
  if (current === 'medium') return 'lite';
  return 'minimal';
}

/**
 * 解析当前主题模式下的实际渲染档位：
 * - 当模式为 'minimal'（极简省电）时固定为 'minimal'（0 FPS 纯静态省电）
 * - 当模式为 'immersive' 或 'daylight' 时：
 *   若设备支持 WebGL，即便系统级开启了低电量/省电模式 (prefersReducedMotion: true)，
 *   也以 'lite' 流畅轻量档位运行 WebGL 体积星云与粒子场（30 FPS + 3.6s 静止自动休眠），
 *   确保安卓端与微信端在用户选择“沉浸深空”时完整展现星空视觉，绝不静默白屏或黑屏。
 */
export function resolveEffectiveTier(
  mode: VisualThemeMode,
  capability: ImmersionCapabilityProfile,
): ImmersionTier {
  if (mode === 'minimal') return 'minimal';
  if (capability.tier === 'minimal' && capability.webglSupported) {
    return 'lite';
  }
  return capability.tier;
}

/**
 * 帧率归一化阻尼插值因子（复刻 Active Theory Math.framerateNormalizeLerpAlpha）
 * 保证在 30Hz / 60Hz / 120Hz ProMotion 屏幕下具备完全一致的物理阻尼手感
 */
export function frameNormalizedLerpAlpha(lerpSpeed: number, deltaMs: number): number {
  const clampedDt = Math.max(1, Math.min(100, deltaMs));
  const normalizedFrames = clampedDt / 16.6667;
  return 1 - Math.pow(1 - Math.max(0.001, Math.min(0.999, lerpSpeed)), normalizedFrames);
}

/**
 * 实时帧率健康监控器：
 * 当检测到连续多个采样窗口平均帧耗时超过阈值（如设备发热或后台负载导致 < 28 FPS）时，
 * 自动触发降级回调，避免页面卡顿或操作延迟。
 */
export class FrameHealthMonitor {
  private sampleCount = 0;
  private accumulatedMs = 0;
  private consecutiveSlowWindows = 0;
  private readonly windowSize: number;
  private readonly maxAvgFrameMs: number;
  private readonly requiredSlowWindows: number;

  constructor(options?: {
    windowSize?: number;
    maxAvgFrameMs?: number;
    requiredSlowWindows?: number;
  }) {
    this.windowSize = options?.windowSize ?? 24;
    this.maxAvgFrameMs = options?.maxAvgFrameMs ?? 36; // ~27.7 FPS
    this.requiredSlowWindows = options?.requiredSlowWindows ?? 2;
  }

  /**
   * 记录单帧时间间隔（毫秒）。若触发降级条件则返回 true。
   */
  recordFrame(deltaMs: number): boolean {
    // 忽略切后台导致的超大间隔（> 250ms 由 visibilitychange 处理，不计入连续掉帧）
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 250) {
      return false;
    }
    this.sampleCount++;
    this.accumulatedMs += deltaMs;

    if (this.sampleCount >= this.windowSize) {
      const avg = this.accumulatedMs / this.sampleCount;
      this.sampleCount = 0;
      this.accumulatedMs = 0;

      if (avg > this.maxAvgFrameMs) {
        this.consecutiveSlowWindows++;
        if (this.consecutiveSlowWindows >= this.requiredSlowWindows) {
          this.consecutiveSlowWindows = 0;
          return true;
        }
      } else {
        this.consecutiveSlowWindows = 0;
      }
    }
    return false;
  }

  reset(): void {
    this.sampleCount = 0;
    this.accumulatedMs = 0;
    this.consecutiveSlowWindows = 0;
  }
}

export function applyDocumentThemeMode(mode: VisualThemeMode): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.setAttribute('data-novip-visual-mode', mode);
}

export function loadSavedThemeMode(): VisualThemeMode {
  if (typeof window === 'undefined') return 'immersive';
  try {
    const saved = window.localStorage.getItem(IMMERSION_THEME_STORAGE_KEY);
    if (saved === 'immersive' || saved === 'daylight' || saved === 'minimal') {
      applyDocumentThemeMode(saved);
      return saved;
    }
  } catch {
    /* ignore storage error in restricted webview */
  }
  applyDocumentThemeMode('immersive');
  return 'immersive';
}

export function saveThemeMode(mode: VisualThemeMode): void {
  applyDocumentThemeMode(mode);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(IMMERSION_THEME_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  try {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novip:visual-mode-change', {detail: {mode}}));
    }
  } catch {
    /* ignore */
  }
}
