import {useEffect, useRef} from 'react';
import {
  downgradeTier,
  FrameHealthMonitor,
  frameNormalizedLerpAlpha,
  type ImmersionCapabilityProfile,
  type ImmersionTier,
  type VisualThemeMode,
} from './capability';
import {
  getOrMountOffscreenWorker,
  hasOffscreenWorker,
} from './offscreenRenderer';
import {
  NEBULA_FRAGMENT_SHADER,
  NEBULA_VERTEX_SHADER,
  PARTICLE_FRAGMENT_SHADER,
  PARTICLE_VERTEX_SHADER,
} from './shaders';
import {subscribeImmersionTelemetry} from './telemetryBus';

export interface ImmersionStageProps {
  capability: ImmersionCapabilityProfile;
  activeTier: ImmersionTier;
  themeMode: VisualThemeMode;
  pulseCount: number;
  globalViewport?: boolean;
  onAutoDowngrade?: (nextTier: ImmersionTier, reason: string) => void;
  onFpsSample?: (fps: number) => void;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * 确定性伪随机数生成器，保证首屏粒子分布稳定美观
 */
function createSeededRandom(seed = 20261108) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function ImmersionStage({
  capability,
  activeTier,
  themeMode,
  pulseCount,
  globalViewport = false,
  onAutoDowngrade,
  onFpsSample,
}: ImmersionStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pulseStateRef = useRef<{originX: number; originY: number; triggeredAt: number}>({
    originX: 0.5,
    originY: 0.42,
    triggeredAt: -10,
  });

  // 当外部点击徽章或按钮触发脉冲时，在中心激发引力波
  useEffect(() => {
    if (pulseCount > 0) {
      pulseStateRef.current = {
        originX: 0.5,
        originY: 0.38,
        triggeredAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      };
      const canvas = canvasRef.current;
      if (canvas && hasOffscreenWorker(canvas)) {
        const ctrl = getOrMountOffscreenWorker(
          canvas,
          {particleCount: 160, targetFps: 60, dpr: 1, width: 1024, height: 560},
          {},
        );
        ctrl?.pulse(0.5, 0.38);
      }
    }
  }, [pulseCount]);

  useEffect(() => {
    if (themeMode !== 'immersive') return;
    const canvas = canvasRef.current;
    if (
      !canvas ||
      typeof window === 'undefined' ||
      (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))
    ) {
      return;
    }

    const particleBudget =
      activeTier === 'high'
        ? capability.particleCount
        : activeTier === 'medium'
          ? Math.min(capability.particleCount, 160)
          : activeTier === 'lite'
            ? Math.min(capability.particleCount, 64)
            : 24;

    const maxDpr =
      activeTier === 'high' ? capability.maxDpr : activeTier === 'medium' ? 1.25 : 1.0;

    const targetFps =
      activeTier === 'minimal' || capability.prefersReducedMotion
        ? 0
        : activeTier === 'lite'
          ? 30
          : 60;

    const count = Math.max(16, particleBudget);

    const computeCanvasMetrics = () => {
      const rect = canvas.getBoundingClientRect();
      const rawW = Math.max(300, Math.round(rect.width || window.innerWidth || 1024));
      const rawH = Math.max(240, Math.round(rect.height || 560));
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      return {
        width: Math.round(rawW * dpr),
        height: Math.round(rawH * dpr),
        dpr,
      };
    };

    const initialMetrics = computeCanvasMetrics();
    if (!hasOffscreenWorker(canvas)) {
      if (canvas.width !== initialMetrics.width || canvas.height !== initialMetrics.height) {
        canvas.width = initialMetrics.width;
        canvas.height = initialMetrics.height;
      }
    }

    const healthMonitor = new FrameHealthMonitor({
      windowSize: 24,
      maxAvgFrameMs: 38,
      requiredSlowWindows: 2,
    });

    // Phase 3: 优先尝试 OffscreenCanvas + Web Worker 独立线程渲染管线（桌面高/中配 WebGL 环境）
    const shouldTryWorker =
      hasOffscreenWorker(canvas) ||
      (activeTier !== 'minimal' &&
        capability.webglSupported &&
        !capability.isWeChat &&
        !capability.isLowEndAndroid);

    const workerCtrl = shouldTryWorker
      ? getOrMountOffscreenWorker(
          canvas,
          {
            particleCount: count,
            targetFps,
            dpr: initialMetrics.dpr,
            width: initialMetrics.width,
            height: initialMetrics.height,
          },
          {
            onFpsSample: (fps) => onFpsSample?.(fps),
            onSlowWindow: (avgMs) => {
              if (activeTier !== 'minimal' && healthMonitor.recordFrame(avgMs)) {
                const next = downgradeTier(activeTier);
                if (next !== activeTier) {
                  onAutoDowngrade?.(next, 'sustained-frame-drop');
                }
              }
            },
          },
        )
      : null;

    if (workerCtrl) {
      canvas.setAttribute('data-render-pipeline', 'offscreen-worker');
      let lastX = 0.5;
      let lastY = 0.4;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const wakeUpWorker = () => {
        if (!document.hidden) {
          workerCtrl.setPaused(false);
        }
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          workerCtrl.setPaused(true);
        }, 3600);
      };
      wakeUpWorker();

      const onPointerMove = (clientX: number, clientY: number) => {
        wakeUpWorker();
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, 1.0 - (clientY - rect.top) / rect.height));
        const dist = Math.hypot(nx - lastX, ny - lastY);
        lastX = nx;
        lastY = ny;
        workerCtrl.pointer(nx, ny, dist * 2.8);
      };

      const handleMouseMove = (e: MouseEvent) => onPointerMove(e.clientX, e.clientY);
      const handleTouchStart = (e: TouchEvent) => {
        wakeUpWorker();
        if (e.touches.length > 0) {
          onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      };
      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length > 0) {
          onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      };
      const handleCustomPulse = (e: Event) => {
        wakeUpWorker();
        const detail = (e as CustomEvent<{x?: number; y?: number}>).detail;
        workerCtrl.pulse(detail?.x ?? lastX, detail?.y ?? lastY);
      };
      let lastScrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
      const handleScroll = () => {
        wakeUpWorker();
        const sy = window.scrollY || 0;
        const dy = Math.abs(sy - lastScrollY);
        lastScrollY = sy;
        const scrollWave = Math.sin(sy * 0.0018) * 0.14;
        const ny = Math.max(0.08, Math.min(0.92, lastY + scrollWave));
        workerCtrl.pointer(lastX, ny, Math.min(0.65, dy * 0.008));
      };
      const handleResize = () => {
        wakeUpWorker();
        const m = computeCanvasMetrics();
        workerCtrl.resize(m.width, m.height, m.dpr);
      };
      const handleVisibilityChange = () => {
        if (document.hidden) {
          if (idleTimer) clearTimeout(idleTimer);
          workerCtrl.setPaused(true);
        } else {
          wakeUpWorker();
        }
      };

      const unsubTelemetry = subscribeImmersionTelemetry((payload) => {
        wakeUpWorker();
        workerCtrl.telemetryEnergy(payload.energyBoost ?? 0.35);
      });

      let observer: IntersectionObserver | null = null;
      if (!globalViewport && typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            if (!entry) return;
            if (!entry.isIntersecting || Boolean(document.hidden)) {
              workerCtrl.setPaused(true);
            } else {
              wakeUpWorker();
            }
          },
          {threshold: 0.02},
        );
        observer.observe(canvas);
      }

      window.addEventListener('mousemove', handleMouseMove, {passive: true});
      window.addEventListener('touchstart', handleTouchStart, {passive: true});
      window.addEventListener('touchmove', handleTouchMove, {passive: true});
      window.addEventListener('scroll', handleScroll, {passive: true});
      window.addEventListener('novip:immersion-pulse', handleCustomPulse);
      window.addEventListener('resize', handleResize, {passive: true});
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        if (idleTimer) clearTimeout(idleTimer);
        unsubTelemetry();
        observer?.disconnect();
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('novip:immersion-pulse', handleCustomPulse);
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    // 主线程渲染管线（WebGL 或 2D Canvas 兜底）
    let rafId = 0;
    let isVisibleInViewport = true;
    let isPageHidden = typeof document !== 'undefined' ? Boolean(document.hidden) : false;
    let isIdlePaused = false;
    let mainIdleTimer: ReturnType<typeof setTimeout> | null = null;
    let contextLost = false;
    let telemetryEnergy = 0;

    // 指针状态（采用 Active Theory 连续帧率归一化阻尼插值）
    const pointer = {
      targetX: 0.5,
      targetY: 0.4,
      currentX: 0.5,
      currentY: 0.4,
      energy: 0,
    };

    let wakeUpMainLoop = () => {};

    const onPointerMove = (clientX: number, clientY: number) => {
      wakeUpMainLoop();
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, 1.0 - (clientY - rect.top) / rect.height));
      const dx = nx - pointer.targetX;
      const dy = ny - pointer.targetY;
      const dist = Math.hypot(dx, dy);
      pointer.targetX = nx;
      pointer.targetY = ny;
      pointer.energy = Math.min(1.0, pointer.energy + dist * 2.8);
    };

    const handleMouseMove = (e: MouseEvent) => {
      onPointerMove(e.clientX, e.clientY);
    };

    const handleTouchStart = (e: TouchEvent) => {
      wakeUpMainLoop();
      if (e.touches.length > 0) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleCustomPulse = (e: Event) => {
      wakeUpMainLoop();
      const detail = (e as CustomEvent<{x?: number; y?: number}>).detail;
      pulseStateRef.current = {
        originX: detail?.x ?? pointer.currentX,
        originY: detail?.y ?? pointer.currentY,
        triggeredAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      };
      pointer.energy = 1.0;
      telemetryEnergy = 1.0;
    };

    const unsubTelemetry = subscribeImmersionTelemetry((payload) => {
      wakeUpMainLoop();
      telemetryEnergy = Math.min(1.0, Math.max(telemetryEnergy, payload.energyBoost ?? 0.35));
    });

    let lastScrollMainY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
    const handleScrollMain = () => {
      wakeUpMainLoop();
      const sy = window.scrollY || 0;
      const dy = Math.abs(sy - lastScrollMainY);
      lastScrollMainY = sy;
      pointer.targetY = Math.max(0.08, Math.min(0.92, 0.45 + Math.sin(sy * 0.0018) * 0.16));
      pointer.energy = Math.min(1.0, pointer.energy + Math.min(0.45, dy * 0.006));
    };

    window.addEventListener('mousemove', handleMouseMove, {passive: true});
    window.addEventListener('touchstart', handleTouchStart, {passive: true});
    window.addEventListener('touchmove', handleTouchMove, {passive: true});
    window.addEventListener('scroll', handleScrollMain, {passive: true});
    window.addEventListener('novip:immersion-pulse', handleCustomPulse);

    // 尝试初始化 WebGL 渲染管线；若环境不支持或处于 minimal 档位则无缝启用 2D Canvas 管线
    let gl: WebGLRenderingContext | null = null;
    if (activeTier !== 'minimal' && capability.webglSupported) {
      try {
        gl = (canvas.getContext('webgl2', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: false,
        }) ||
          canvas.getContext('webgl', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
          })) as WebGLRenderingContext | null;
      } catch {
        gl = null;
      }
    }

    let nebulaProgram: WebGLProgram | null = null;
    let particleProgram: WebGLProgram | null = null;
    let quadBuffer: WebGLBuffer | null = null;
    let particleBuffer: WebGLBuffer | null = null;

    if (gl) {
      nebulaProgram = createProgram(gl, NEBULA_VERTEX_SHADER, NEBULA_FRAGMENT_SHADER);
      particleProgram = createProgram(gl, PARTICLE_VERTEX_SHADER, PARTICLE_FRAGMENT_SHADER);
      if (!nebulaProgram || !particleProgram) {
        gl = null;
      }
    }

    canvas.setAttribute('data-render-pipeline', gl ? 'main-webgl' : 'canvas-2d');

    // 预分配粒子缓冲（Zero-GC：6 floats per particle: x, y, z, size, colorSeed, phase）
    const rand = createSeededRandom(20261108);
    const particleData = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const base = i * 6;
      particleData[base + 0] = (rand() * 2 - 1) * 1.45; // x
      particleData[base + 1] = (rand() * 2 - 1) * 1.15; // y
      particleData[base + 2] = rand() * 2 - 1; // z [-1, 1]
      particleData[base + 3] = 2.4 + rand() * 5.2; // baseSize
      particleData[base + 4] = rand(); // colorSeed
      particleData[base + 5] = rand() * 6.28318; // phase
    }

    let nebulaLocs: {
      aQuadPos: number;
      uResolution: WebGLUniformLocation | null;
      uTime: WebGLUniformLocation | null;
      uPointer: WebGLUniformLocation | null;
      uPointerEnergy: WebGLUniformLocation | null;
      uTelemetryEnergy: WebGLUniformLocation | null;
      uPulseOrigin: WebGLUniformLocation | null;
      uPulseAge: WebGLUniformLocation | null;
    } | null = null;

    let particleLocs: {
      aPosition: number;
      aMeta: number;
      uTime: WebGLUniformLocation | null;
      uDpr: WebGLUniformLocation | null;
      uAspect: WebGLUniformLocation | null;
      uPointer: WebGLUniformLocation | null;
      uPointerEnergy: WebGLUniformLocation | null;
      uTelemetryEnergy: WebGLUniformLocation | null;
      uPulseOrigin: WebGLUniformLocation | null;
      uPulseAge: WebGLUniformLocation | null;
    } | null = null;

    if (gl && nebulaProgram && particleProgram) {
      quadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );

      particleBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.STATIC_DRAW);

      nebulaLocs = {
        aQuadPos: gl.getAttribLocation(nebulaProgram, 'aQuadPos'),
        uResolution: gl.getUniformLocation(nebulaProgram, 'uResolution'),
        uTime: gl.getUniformLocation(nebulaProgram, 'uTime'),
        uPointer: gl.getUniformLocation(nebulaProgram, 'uPointer'),
        uPointerEnergy: gl.getUniformLocation(nebulaProgram, 'uPointerEnergy'),
        uTelemetryEnergy: gl.getUniformLocation(nebulaProgram, 'uTelemetryEnergy'),
        uPulseOrigin: gl.getUniformLocation(nebulaProgram, 'uPulseOrigin'),
        uPulseAge: gl.getUniformLocation(nebulaProgram, 'uPulseAge'),
      };

      particleLocs = {
        aPosition: gl.getAttribLocation(particleProgram, 'aPosition'),
        aMeta: gl.getAttribLocation(particleProgram, 'aMeta'),
        uTime: gl.getUniformLocation(particleProgram, 'uTime'),
        uDpr: gl.getUniformLocation(particleProgram, 'uDpr'),
        uAspect: gl.getUniformLocation(particleProgram, 'uAspect'),
        uPointer: gl.getUniformLocation(particleProgram, 'uPointer'),
        uPointerEnergy: gl.getUniformLocation(particleProgram, 'uPointerEnergy'),
        uTelemetryEnergy: gl.getUniformLocation(particleProgram, 'uTelemetryEnergy'),
        uPulseOrigin: gl.getUniformLocation(particleProgram, 'uPulseOrigin'),
        uPulseAge: gl.getUniformLocation(particleProgram, 'uPulseAge'),
      };
    }

    // 尺寸同步
    let currentDpr = initialMetrics.dpr;
    const syncSize = () => {
      const m = computeCanvasMetrics();
      currentDpr = m.dpr;
      if (canvas.width !== m.width || canvas.height !== m.height) {
        canvas.width = m.width;
        canvas.height = m.height;
      }
    };

    const handleResize = () => syncSize();
    window.addEventListener('resize', handleResize, {passive: true});

    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let lastFrameTime = startTime;
    let fpsAccumulator = 0;
    let fpsFrameCount = 0;

    // 2D Canvas 降级渲染（当 WebGL 不可用或处于 minimal 档位时保证零黑屏、高质感深空表现）
    const renderCanvas2DFallback = (nowMs: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const bgGrad = ctx.createRadialGradient(
        w * pointer.currentX,
        h * (1 - pointer.currentY),
        w * 0.05,
        w * 0.5,
        h * 0.5,
        Math.max(w, h) * 0.85,
      );
      bgGrad.addColorStop(0, '#131d38');
      bgGrad.addColorStop(0.45, '#090e1d');
      bgGrad.addColorStop(1, '#04060d');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      const t = (nowMs - startTime) * 0.0004;
      for (let i = 0; i < count; i++) {
        const base = i * 6;
        const px =
          ((particleData[base] * 0.5 + 0.5 + Math.sin(t + particleData[base + 5]) * 0.03 + 1) % 1) *
          w;
        const py =
          ((particleData[base + 1] * 0.5 + 0.5 + Math.cos(t + particleData[base + 5]) * 0.03 + 1) %
            1) *
          h;
        const r = Math.max(1.2, particleData[base + 3] * 0.42);
        const seed = particleData[base + 4];
        ctx.fillStyle =
          seed < 0.35
            ? 'rgba(129, 236, 254, 0.65)'
            : seed < 0.7
              ? 'rgba(198, 77, 255, 0.58)'
              : 'rgba(255, 42, 75, 0.62)';
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const renderWebGLFrame = (nowMs: number, deltaMs: number) => {
      if (!gl || !nebulaProgram || !particleProgram || !nebulaLocs || !particleLocs || contextLost) {
        renderCanvas2DFallback(nowMs);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;
      gl.viewport(0, 0, w, h);

      const lerpAlpha = frameNormalizedLerpAlpha(0.085, deltaMs);
      pointer.currentX += (pointer.targetX - pointer.currentX) * lerpAlpha;
      pointer.currentY += (pointer.targetY - pointer.currentY) * lerpAlpha;
      pointer.energy *= Math.pow(0.92, deltaMs / 16.67);
      telemetryEnergy *= Math.pow(0.96, deltaMs / 16.67);

      const elapsedSec = (nowMs - startTime) * 0.001;
      const pulseAgeSec = (nowMs - pulseStateRef.current.triggeredAt) * 0.00085;
      const activePulseAge = pulseAgeSec >= 0 && pulseAgeSec <= 1.0 ? pulseAgeSec : -1.0;

      // Pass 1: Volumetric Nebula Background
      gl.disable(gl.BLEND);
      gl.useProgram(nebulaProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(nebulaLocs.aQuadPos);
      gl.vertexAttribPointer(nebulaLocs.aQuadPos, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(nebulaLocs.uResolution, w, h);
      gl.uniform1f(nebulaLocs.uTime, elapsedSec);
      gl.uniform2f(nebulaLocs.uPointer, pointer.currentX, pointer.currentY);
      gl.uniform1f(nebulaLocs.uPointerEnergy, pointer.energy);
      gl.uniform1f(nebulaLocs.uTelemetryEnergy, telemetryEnergy);
      gl.uniform2f(
        nebulaLocs.uPulseOrigin,
        pulseStateRef.current.originX,
        pulseStateRef.current.originY,
      );
      gl.uniform1f(nebulaLocs.uPulseAge, activePulseAge);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Pass 2: 3D Depth Particle Field (Additive Blending)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(particleProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);

      const stride = 6 * 4;
      gl.enableVertexAttribArray(particleLocs.aPosition);
      gl.vertexAttribPointer(particleLocs.aPosition, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(particleLocs.aMeta);
      gl.vertexAttribPointer(particleLocs.aMeta, 3, gl.FLOAT, false, stride, 3 * 4);

      gl.uniform1f(particleLocs.uTime, elapsedSec);
      gl.uniform1f(particleLocs.uDpr, currentDpr);
      gl.uniform2f(particleLocs.uAspect, w / Math.max(1, h), 1.0);
      gl.uniform2f(particleLocs.uPointer, pointer.currentX, pointer.currentY);
      gl.uniform1f(particleLocs.uPointerEnergy, pointer.energy);
      gl.uniform1f(particleLocs.uTelemetryEnergy, telemetryEnergy);
      gl.uniform2f(
        particleLocs.uPulseOrigin,
        pulseStateRef.current.originX,
        pulseStateRef.current.originY,
      );
      gl.uniform1f(particleLocs.uPulseAge, activePulseAge);

      gl.drawArrays(gl.POINTS, 0, count);
    };

    const minFrameInterval = targetFps > 0 ? 1000 / (targetFps + 2) : 0;

    const tick = (nowMs: number) => {
      if (isPageHidden || !isVisibleInViewport || isIdlePaused) {
        rafId = 0;
        return;
      }
      const deltaMs = nowMs - lastFrameTime;
      if (minFrameInterval > 0 && deltaMs < minFrameInterval) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      lastFrameTime = nowMs;

      renderWebGLFrame(nowMs, deltaMs);

      if (deltaMs > 0 && deltaMs < 250) {
        fpsAccumulator += deltaMs;
        fpsFrameCount++;
        if (fpsFrameCount >= 20) {
          const currentFps = Math.min(60, Math.round((1000 * fpsFrameCount) / fpsAccumulator));
          fpsAccumulator = 0;
          fpsFrameCount = 0;
          onFpsSample?.(currentFps);
        }
      }

      if (activeTier !== 'minimal' && healthMonitor.recordFrame(deltaMs)) {
        const next = downgradeTier(activeTier);
        if (next !== activeTier) {
          onAutoDowngrade?.(next, 'sustained-frame-drop');
          return;
        }
      }

      if (targetFps > 0 && !isIdlePaused) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const startLoop = () => {
      if (rafId !== 0 || isPageHidden || !isVisibleInViewport) return;
      lastFrameTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (targetFps === 0) {
        // 静态渲染单帧（prefers-reduced-motion 或 minimal 档位）
        renderWebGLFrame(lastFrameTime, 16.67);
      } else {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    wakeUpMainLoop = () => {
      isIdlePaused = false;
      startLoop();
      if (mainIdleTimer) clearTimeout(mainIdleTimer);
      if (targetFps > 0) {
        mainIdleTimer = setTimeout(() => {
          isIdlePaused = true;
          stopLoop();
        }, 3600);
      }
    };

    const handleVisibilityChange = () => {
      isPageHidden = Boolean(document.hidden);
      if (isPageHidden) {
        stopLoop();
      } else {
        healthMonitor.reset();
        startLoop();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let observer: IntersectionObserver | null = null;
    if (!globalViewport && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          isVisibleInViewport = entry.isIntersecting;
          if (isVisibleInViewport) {
            startLoop();
          } else {
            stopLoop();
          }
        },
        {threshold: 0.02},
      );
      observer.observe(canvas);
    }

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      stopLoop();
    };
    const handleContextRestored = () => {
      contextLost = false;
      startLoop();
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    wakeUpMainLoop();

    return () => {
      if (mainIdleTimer) clearTimeout(mainIdleTimer);
      stopLoop();
      unsubTelemetry();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('scroll', handleScrollMain);
      window.removeEventListener('novip:immersion-pulse', handleCustomPulse);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      observer?.disconnect();
      if (gl) {
        if (quadBuffer) gl.deleteBuffer(quadBuffer);
        if (particleBuffer) gl.deleteBuffer(particleBuffer);
        if (nebulaProgram) gl.deleteProgram(nebulaProgram);
        if (particleProgram) gl.deleteProgram(particleProgram);
      }
    };
  }, [capability, activeTier, themeMode, globalViewport, onAutoDowngrade, onFpsSample]);

  if (themeMode !== 'immersive') {
    return null;
  }

  return (
    <div
      className={`novip-immersion-stage-wrap${globalViewport ? ' is-global-stage' : ''}`}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="novip-immersion-canvas"
        data-tier={activeTier}
        data-webgl={capability.webglSupported ? 'true' : 'false'}
      />
      <div className="novip-immersion-vignette" />
    </div>
  );
}
