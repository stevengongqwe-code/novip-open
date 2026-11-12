import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  detectLowEndAndroid,
  downgradeTier,
  evaluateImmersionCapability,
  FrameHealthMonitor,
  frameNormalizedLerpAlpha,
} from '../src/immersive/capability.ts';
import {
  NEBULA_FRAGMENT_SHADER,
  NEBULA_VERTEX_SHADER,
  PARTICLE_FRAGMENT_SHADER,
  PARTICLE_VERTEX_SHADER,
} from '../src/immersive/shaders.ts';
import {
  persistSoundEnabled,
  playAudioToggleOn,
  playHoverTick,
  playModeSwitch,
  playShockwaveChord,
  readStoredSoundEnabled,
} from '../src/immersive/soundEngine.ts';
import {
  emitImmersionTelemetry,
  subscribeImmersionTelemetry,
} from '../src/immersive/telemetryBus.ts';
import {
  canUseOffscreenWebGL,
  hasOffscreenWorker,
} from '../src/immersive/offscreenRenderer.ts';

describe('NOVIP 沉浸式视觉引擎与智能降级系统 (OPERATION IMMERSION)', () => {
  it('01. 桌面高配 WebGL2 环境识别为 high 档位并开启 3D 视差倾斜', () => {
    const profile = evaluateImmersionCapability({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      hardwareConcurrency: 8,
      deviceMemory: 16,
      prefersReducedMotion: false,
      webglSupported: true,
      webgl2Supported: true,
      devicePixelRatio: 2,
    });
    assert.equal(profile.tier, 'high');
    assert.equal(profile.enableCardTilt, true);
    assert.equal(profile.enableShaderNebula, true);
    assert.equal(profile.enablePointerFluid, true);
    assert.equal(profile.particleCount, 320);
    assert.equal(profile.targetFps, 60);
    assert.ok(profile.maxDpr <= 1.65);
  });

  it('02. 微信内置浏览器自动降级为 lite 轻量档位，防止微信 WebView 白屏与发热', () => {
    const wechatUa =
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 MicroMessenger/8.0.48.2580(0x28003036) WeChat/arm64 Weixin NetType/WIFI';
    const profile = evaluateImmersionCapability({
      userAgent: wechatUa,
      hardwareConcurrency: 8,
      deviceMemory: 8,
      prefersReducedMotion: false,
      webglSupported: true,
      webgl2Supported: true,
      devicePixelRatio: 3,
    });
    assert.equal(profile.isWeChat, true);
    assert.equal(profile.tier, 'lite');
    assert.equal(profile.reason, 'wechat-webview');
    assert.equal(profile.maxDpr, 1.0);
    assert.equal(profile.targetFps, 30);
    assert.equal(profile.enableCardTilt, false);
  });

  it('03. 低性能 Android（4核或4GB内存或旧版Android）自动降级为 lite 档位', () => {
    assert.equal(
      detectLowEndAndroid('Mozilla/5.0 (Linux; Android 9; Redmi 7)', 8, 8),
      true,
    );
    assert.equal(
      detectLowEndAndroid('Mozilla/5.0 (Linux; Android 13; Moto G)', 4, 8),
      true,
    );
    assert.equal(
      detectLowEndAndroid('Mozilla/5.0 (Linux; Android 14; Galaxy A)', 8, 4),
      true,
    );

    const profile = evaluateImmersionCapability({
      userAgent: 'Mozilla/5.0 (Linux; Android 12; LowEndPhone)',
      hardwareConcurrency: 4,
      deviceMemory: 3,
      prefersReducedMotion: false,
      webglSupported: true,
      webgl2Supported: true,
    });
    assert.equal(profile.isLowEndAndroid, true);
    assert.equal(profile.tier, 'lite');
    assert.equal(profile.reason, 'low-end-android');
  });

  it('04. WebGL 不可用环境自动降级为 minimal 安全档位（2D Canvas 兜底，零黑屏）', () => {
    const profile = evaluateImmersionCapability({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      prefersReducedMotion: false,
      webglSupported: false,
      webgl2Supported: false,
    });
    assert.equal(profile.tier, 'minimal');
    assert.equal(profile.reason, 'webgl-unavailable');
    assert.equal(profile.webglSupported, false);
    assert.equal(profile.enableShaderNebula, false);
    assert.equal(profile.enableCardTilt, false);
  });

  it('05. prefers-reduced-motion 开启时强制进入 minimal 静态零帧率模式', () => {
    const profile = evaluateImmersionCapability({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
      hardwareConcurrency: 12,
      deviceMemory: 32,
      prefersReducedMotion: true,
      webglSupported: true,
      webgl2Supported: true,
    });
    assert.equal(profile.tier, 'minimal');
    assert.equal(profile.reason, 'prefers-reduced-motion');
    assert.equal(profile.targetFps, 0);
    assert.equal(profile.particleCount, 0);
  });

  it('06. FrameHealthMonitor 在设备过热或连续掉帧时触发逐级降档，且忽略切后台长间隔', () => {
    const monitor = new FrameHealthMonitor({
      windowSize: 5,
      maxAvgFrameMs: 36,
      requiredSlowWindows: 2,
    });

    // 正常 60fps (16.6ms) 不触发降级
    for (let i = 0; i < 10; i++) {
      assert.equal(monitor.recordFrame(16.6), false);
    }

    // 切后台 2000ms 长间隔被忽略
    assert.equal(monitor.recordFrame(2000), false);

    // 第 1 个慢帧窗口 (5 帧 48ms ≈ 20fps) -> 尚未达到 2 个连续窗口
    for (let i = 0; i < 5; i++) {
      assert.equal(monitor.recordFrame(48), false);
    }

    // 第 2 个连续慢帧窗口 -> 第 5 帧触发自动降级
    for (let i = 0; i < 4; i++) {
      assert.equal(monitor.recordFrame(48), false);
    }
    assert.equal(monitor.recordFrame(48), true);

    // 验证逐级降级链条
    assert.equal(downgradeTier('high'), 'medium');
    assert.equal(downgradeTier('medium'), 'lite');
    assert.equal(downgradeTier('lite'), 'minimal');
    assert.equal(downgradeTier('minimal'), 'minimal');
  });

  it('07. 帧率归一化 Lerp 阻尼因子在不同刷新率下保持数学单调与有界', () => {
    const a120 = frameNormalizedLerpAlpha(0.08, 8.33);
    const a60 = frameNormalizedLerpAlpha(0.08, 16.67);
    const a30 = frameNormalizedLerpAlpha(0.08, 33.33);
    assert.ok(a120 > 0 && a120 < a60);
    assert.ok(a60 > a120 && a60 < a30);
    assert.ok(a30 < 1);
    assert.ok(Math.abs(a60 - 0.08) < 0.002);
  });

  it('08. GLSL 着色器源码具备完整 Uniform 定义且兼容 WebGL1/2（无未声明 fwidth 依赖）', () => {
    assert.ok(NEBULA_VERTEX_SHADER.includes('attribute vec2 aQuadPos'));
    assert.ok(NEBULA_FRAGMENT_SHADER.includes('uniform vec2 uPointer'));
    assert.ok(NEBULA_FRAGMENT_SHADER.includes('uniform float uPulseAge'));
    assert.ok(!NEBULA_FRAGMENT_SHADER.includes('fwidth('), '不应在无扩展声明下调用 fwidth');
    assert.ok(PARTICLE_VERTEX_SHADER.includes('gl_PointSize'));
    assert.ok(PARTICLE_FRAGMENT_SHADER.includes('gl_PointCoord'));
  });

  it('09. immersive.css 包含 workInOut 动效曲线、深空首屏样式与 prefers-reduced-motion 兜底', () => {
    const css = fs.readFileSync(path.resolve('src/immersive/immersive.css'), 'utf8');
    assert.match(css, /cubic-bezier\(0\.29,\s*0\.05,\s*0\.06,\s*0\.92\)/);
    assert.match(css, /\.novip-hero-evolution\.is-immersive-hero/);
    assert.match(css, /\.novip-immersion-canvas/);
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it('10. Phase 2: Web Audio 微音效合成器与遥测总线在无浏览器环境下安全降级零抛错', () => {
    assert.equal(readStoredSoundEnabled(), false);
    assert.doesNotThrow(() => {
      persistSoundEnabled(true);
      playAudioToggleOn();
      playHoverTick(true);
      playShockwaveChord(true);
      playModeSwitch(true, 'immersive');
      emitImmersionTelemetry({code: 'TEST.01', label: 'Unit test telemetry'});
      const unsub = subscribeImmersionTelemetry(() => {});
      unsub();
    });
  });

  it('11. Phase 2: immersive.css 包含 WCAG AA 高对比度规则、微音效按钮样式与移动端 Dock 防遮挡留白', () => {
    const css = fs.readFileSync(path.resolve('src/immersive/immersive.css'), 'utf8');
    assert.match(css, /\.novip-audio-wave-btn/);
    assert.match(css, /\.ios-dock-bar/);
    assert.match(css, /safe-area-inset-bottom/);
  });

  it('12. Phase 3: OffscreenCanvas + Web Worker 渲染器探测安全且 GLSL 包含 uTelemetryEnergy 实时联动 Uniform', () => {
    assert.equal(canUseOffscreenWebGL(null), false);
    assert.equal(hasOffscreenWorker(null), false);
    assert.ok(NEBULA_FRAGMENT_SHADER.includes('uniform float uTelemetryEnergy'));
    assert.ok(PARTICLE_VERTEX_SHADER.includes('uniform float uTelemetryEnergy'));
  });

  it('13. Phase 4: 全站级深空沉浸宿主 (GlobalImmersionShell) 与全视口 WebGL + 全站毛玻璃规则完备', () => {
    const css = fs.readFileSync(path.resolve('src/immersive/immersive.css'), 'utf8');
    const shell = fs.readFileSync(path.resolve('src/immersive/GlobalImmersionShell.tsx'), 'utf8');
    const main = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8');
    assert.match(css, /\.novip-immersion-stage-wrap\.is-global-stage/);
    assert.match(css, /html\[data-novip-visual-mode="immersive"\]/);
    assert.match(css, /\.novip-subpage-holo-strip/);
    assert.match(shell, /GlobalImmersionShell/);
    assert.match(main, /<GlobalImmersionShell\s+page=\{page\}\s*\/>/);
  });
});
