/**
 * NOVIP OffscreenCanvas + Web Worker Dual-Pass WebGL Renderer (Phase 3 Optimization)
 * Isolates the 60FPS WebGL nebula & 3D particle loop onto a dedicated background thread
 * so heavy main-thread client-side tasks (PDF merge, OCR, image compression) never drop frames.
 * Includes automatic StrictMode-safe WeakMap reuse and seamless fallback to main-thread WebGL/2D.
 */

import {
  NEBULA_FRAGMENT_SHADER,
  NEBULA_VERTEX_SHADER,
  PARTICLE_FRAGMENT_SHADER,
  PARTICLE_VERTEX_SHADER,
} from './shaders';

export interface OffscreenStageConfig {
  particleCount: number;
  targetFps: number;
  dpr: number;
  width: number;
  height: number;
}

export interface OffscreenWorkerController {
  resize: (width: number, height: number, dpr: number) => void;
  pointer: (x: number, y: number, energy: number) => void;
  pulse: (originX: number, originY: number) => void;
  telemetryEnergy: (boost: number) => void;
  setPaused: (paused: boolean) => void;
  updateConfig: (config: Partial<OffscreenStageConfig>) => void;
  setCallbacks: (cb: {
    onFpsSample?: (fps: number) => void;
    onSlowWindow?: (avgMs: number) => void;
  }) => void;
}

const canvasWorkerRegistry = new WeakMap<HTMLCanvasElement, OffscreenWorkerController>();
let cachedOffscreenSupport: boolean | null = null;

export function hasOffscreenWorker(canvas: HTMLCanvasElement | null | undefined): boolean {
  return Boolean(canvas && canvasWorkerRegistry.has(canvas));
}

/**
 * Probes whether the current browser environment supports OffscreenCanvas + WebGL + Blob Worker.
 */
export function canUseOffscreenWebGL(canvas?: HTMLCanvasElement | null): boolean {
  if (typeof window === 'undefined') return false;
  if (
    canvas &&
    typeof (canvas as HTMLCanvasElement & {transferControlToOffscreen?: unknown})
      .transferControlToOffscreen !== 'function'
  ) {
    return false;
  }
  if (cachedOffscreenSupport !== null) return cachedOffscreenSupport;
  try {
    if (
      typeof OffscreenCanvas === 'undefined' ||
      typeof Worker === 'undefined' ||
      typeof Blob === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      cachedOffscreenSupport = false;
      return false;
    }
    const probe = new OffscreenCanvas(4, 4);
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    cachedOffscreenSupport = Boolean(gl);
    return cachedOffscreenSupport;
  } catch {
    cachedOffscreenSupport = false;
    return false;
  }
}

function buildWorkerSource(): string {
  const nvs = JSON.stringify(NEBULA_VERTEX_SHADER);
  const nfs = JSON.stringify(NEBULA_FRAGMENT_SHADER);
  const pvs = JSON.stringify(PARTICLE_VERTEX_SHADER);
  const pfs = JSON.stringify(PARTICLE_FRAGMENT_SHADER);

  return `
const NEBULA_VS = ${nvs};
const NEBULA_FS = ${nfs};
const PARTICLE_VS = ${pvs};
const PARTICLE_FS = ${pfs};

let canvas = null;
let gl = null;
let nebulaProg = null;
let particleProg = null;
let quadBuf = null;
let particleBuf = null;
let nebulaLocs = null;
let particleLocs = null;

let config = {
  particleCount: 160,
  targetFps: 60,
  dpr: 1,
  width: 1024,
  height: 560,
};

let paused = false;
let timerId = 0;
let startTime = performance.now();
let lastFrameTime = startTime;
let fpsAcc = 0;
let fpsFrames = 0;

const pointer = {
  targetX: 0.5,
  targetY: 0.4,
  currentX: 0.5,
  currentY: 0.4,
  energy: 0,
};
let telemetryEnergy = 0;
const pulse = {
  originX: 0.5,
  originY: 0.42,
  triggeredAt: -10000,
};

function compileShader(glCtx, type, src) {
  const s = glCtx.createShader(type);
  if (!s) return null;
  glCtx.shaderSource(s, src);
  glCtx.compileShader(s);
  if (!glCtx.getShaderParameter(s, glCtx.COMPILE_STATUS)) {
    glCtx.deleteShader(s);
    return null;
  }
  return s;
}

function createProgram(glCtx, vsSrc, fsSrc) {
  const vs = compileShader(glCtx, glCtx.VERTEX_SHADER, vsSrc);
  const fs = compileShader(glCtx, glCtx.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const p = glCtx.createProgram();
  if (!p) return null;
  glCtx.attachShader(p, vs);
  glCtx.attachShader(p, fs);
  glCtx.linkProgram(p);
  glCtx.deleteShader(vs);
  glCtx.deleteShader(fs);
  if (!glCtx.getProgramParameter(p, glCtx.LINK_STATUS)) {
    glCtx.deleteProgram(p);
    return null;
  }
  return p;
}

function rebuildParticles(count) {
  if (!gl) return;
  let s = 20261108 >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const n = Math.max(16, count);
  const data = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const b = i * 6;
    data[b + 0] = (rand() * 2 - 1) * 1.45;
    data[b + 1] = (rand() * 2 - 1) * 1.15;
    data[b + 2] = rand() * 2 - 1;
    data[b + 3] = 2.4 + rand() * 5.2;
    data[b + 4] = rand();
    data[b + 5] = rand() * 6.28318;
  }
  if (!particleBuf) particleBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
}

function initWebGL() {
  if (!canvas) return false;
  gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false }) ||
       canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) return false;

  nebulaProg = createProgram(gl, NEBULA_VS, NEBULA_FS);
  particleProg = createProgram(gl, PARTICLE_VS, PARTICLE_FS);
  if (!nebulaProg || !particleProg) return false;

  quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  rebuildParticles(config.particleCount);

  nebulaLocs = {
    aQuadPos: gl.getAttribLocation(nebulaProg, 'aQuadPos'),
    uResolution: gl.getUniformLocation(nebulaProg, 'uResolution'),
    uTime: gl.getUniformLocation(nebulaProg, 'uTime'),
    uPointer: gl.getUniformLocation(nebulaProg, 'uPointer'),
    uPointerEnergy: gl.getUniformLocation(nebulaProg, 'uPointerEnergy'),
    uTelemetryEnergy: gl.getUniformLocation(nebulaProg, 'uTelemetryEnergy'),
    uPulseOrigin: gl.getUniformLocation(nebulaProg, 'uPulseOrigin'),
    uPulseAge: gl.getUniformLocation(nebulaProg, 'uPulseAge'),
  };

  particleLocs = {
    aPosition: gl.getAttribLocation(particleProg, 'aPosition'),
    aMeta: gl.getAttribLocation(particleProg, 'aMeta'),
    uTime: gl.getUniformLocation(particleProg, 'uTime'),
    uDpr: gl.getUniformLocation(particleProg, 'uDpr'),
    uAspect: gl.getUniformLocation(particleProg, 'uAspect'),
    uPointer: gl.getUniformLocation(particleProg, 'uPointer'),
    uPointerEnergy: gl.getUniformLocation(particleProg, 'uPointerEnergy'),
    uTelemetryEnergy: gl.getUniformLocation(particleProg, 'uTelemetryEnergy'),
    uPulseOrigin: gl.getUniformLocation(particleProg, 'uPulseOrigin'),
    uPulseAge: gl.getUniformLocation(particleProg, 'uPulseAge'),
  };
  return true;
}

function renderFrame(nowMs, deltaMs) {
  if (!gl || !nebulaProg || !particleProg) return;
  const w = canvas.width;
  const h = canvas.height;
  gl.viewport(0, 0, w, h);

  const clampedDt = Math.max(1, Math.min(100, deltaMs));
  const lerpAlpha = 1 - Math.pow(1 - 0.085, clampedDt / 16.6667);
  pointer.currentX += (pointer.targetX - pointer.currentX) * lerpAlpha;
  pointer.currentY += (pointer.targetY - pointer.currentY) * lerpAlpha;
  pointer.energy *= Math.pow(0.92, clampedDt / 16.67);
  telemetryEnergy *= Math.pow(0.96, clampedDt / 16.67);

  const elapsedSec = (nowMs - startTime) * 0.001;
  const pulseAgeSec = (nowMs - pulse.triggeredAt) * 0.00085;
  const activePulseAge = pulseAgeSec >= 0 && pulseAgeSec <= 1.0 ? pulseAgeSec : -1.0;

  gl.disable(gl.BLEND);
  gl.useProgram(nebulaProg);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(nebulaLocs.aQuadPos);
  gl.vertexAttribPointer(nebulaLocs.aQuadPos, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(nebulaLocs.uResolution, w, h);
  gl.uniform1f(nebulaLocs.uTime, elapsedSec);
  gl.uniform2f(nebulaLocs.uPointer, pointer.currentX, pointer.currentY);
  gl.uniform1f(nebulaLocs.uPointerEnergy, pointer.energy);
  gl.uniform1f(nebulaLocs.uTelemetryEnergy, telemetryEnergy);
  gl.uniform2f(nebulaLocs.uPulseOrigin, pulse.originX, pulse.originY);
  gl.uniform1f(nebulaLocs.uPulseAge, activePulseAge);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(particleProg);
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuf);
  const stride = 6 * 4;
  gl.enableVertexAttribArray(particleLocs.aPosition);
  gl.vertexAttribPointer(particleLocs.aPosition, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(particleLocs.aMeta);
  gl.vertexAttribPointer(particleLocs.aMeta, 3, gl.FLOAT, false, stride, 3 * 4);
  gl.uniform1f(particleLocs.uTime, elapsedSec);
  gl.uniform1f(particleLocs.uDpr, config.dpr);
  gl.uniform2f(particleLocs.uAspect, w / Math.max(1, h), 1.0);
  gl.uniform2f(particleLocs.uPointer, pointer.currentX, pointer.currentY);
  gl.uniform1f(particleLocs.uPointerEnergy, pointer.energy);
  gl.uniform1f(particleLocs.uTelemetryEnergy, telemetryEnergy);
  gl.uniform2f(particleLocs.uPulseOrigin, pulse.originX, pulse.originY);
  gl.uniform1f(particleLocs.uPulseAge, activePulseAge);
  gl.drawArrays(gl.POINTS, 0, Math.max(16, config.particleCount));
}

const scheduleNext = typeof self.requestAnimationFrame === 'function'
  ? (cb) => self.requestAnimationFrame(cb)
  : (cb) => self.setTimeout(() => cb(performance.now()), 16);

const cancelNext = typeof self.cancelAnimationFrame === 'function'
  ? (id) => self.cancelAnimationFrame(id)
  : (id) => self.clearTimeout(id);

function loop(nowMs) {
  if (paused) {
    timerId = 0;
    return;
  }
  const minInterval = config.targetFps > 0 ? 1000 / (config.targetFps + 2) : 0;
  const deltaMs = nowMs - lastFrameTime;
  if (minInterval > 0 && deltaMs < minInterval) {
    timerId = scheduleNext(loop);
    return;
  }
  lastFrameTime = nowMs;
  renderFrame(nowMs, deltaMs);

  if (deltaMs > 0 && deltaMs < 250) {
    fpsAcc += deltaMs;
    fpsFrames++;
    if (fpsFrames >= 20) {
      const avgMs = fpsAcc / fpsFrames;
      const fps = Math.min(60, Math.round(1000 / avgMs));
      fpsAcc = 0;
      fpsFrames = 0;
      self.postMessage({ type: 'telemetry', fps, avgMs });
    }
  }

  if (config.targetFps > 0) {
    timerId = scheduleNext(loop);
  }
}

function startLoop() {
  if (timerId !== 0 || paused) return;
  lastFrameTime = performance.now();
  if (config.targetFps === 0) {
    renderFrame(lastFrameTime, 16.67);
  } else {
    timerId = scheduleNext(loop);
  }
}

function stopLoop() {
  if (timerId !== 0) {
    cancelNext(timerId);
    timerId = 0;
  }
}

self.onmessage = (e) => {
  const msg = e.data;
  if (!msg) return;
  if (msg.type === 'init') {
    canvas = msg.canvas;
    Object.assign(config, msg.config);
    canvas.width = config.width;
    canvas.height = config.height;
    if (initWebGL()) {
      startLoop();
    }
  } else if (msg.type === 'resize') {
    config.width = msg.width;
    config.height = msg.height;
    config.dpr = msg.dpr;
    if (canvas) {
      canvas.width = msg.width;
      canvas.height = msg.height;
    }
  } else if (msg.type === 'pointer') {
    pointer.targetX = msg.x;
    pointer.targetY = msg.y;
    pointer.energy = Math.min(1.0, pointer.energy + msg.energy);
  } else if (msg.type === 'pulse') {
    pulse.originX = msg.originX;
    pulse.originY = msg.originY;
    pulse.triggeredAt = performance.now();
    pointer.energy = 1.0;
    telemetryEnergy = 1.0;
  } else if (msg.type === 'energy') {
    telemetryEnergy = Math.min(1.0, Math.max(telemetryEnergy, msg.boost || 0.45));
  } else if (msg.type === 'paused') {
    paused = Boolean(msg.paused);
    if (paused) stopLoop();
    else startLoop();
  } else if (msg.type === 'config') {
    const prevCount = config.particleCount;
    Object.assign(config, msg.config);
    if (config.particleCount !== prevCount) {
      rebuildParticles(config.particleCount);
    }
    if (!paused && timerId === 0) startLoop();
  }
};
`;
}

export function getOrMountOffscreenWorker(
  canvas: HTMLCanvasElement,
  initialConfig: OffscreenStageConfig,
  callbacks: {
    onFpsSample?: (fps: number) => void;
    onSlowWindow?: (avgMs: number) => void;
  },
): OffscreenWorkerController | null {
  const existing = canvasWorkerRegistry.get(canvas);
  if (existing) {
    existing.setCallbacks(callbacks);
    existing.updateConfig(initialConfig);
    return existing;
  }

  if (!canUseOffscreenWebGL(canvas)) {
    return null;
  }

  try {
    const offscreen = canvas.transferControlToOffscreen();
    const blob = new Blob([buildWorkerSource()], {type: 'application/javascript'});
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl);
    URL.revokeObjectURL(blobUrl);

    let currentCallbacks = callbacks;
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as {type?: string; fps?: number; avgMs?: number};
      if (data?.type === 'telemetry') {
        if (typeof data.fps === 'number') {
          currentCallbacks.onFpsSample?.(data.fps);
        }
        if (typeof data.avgMs === 'number') {
          currentCallbacks.onSlowWindow?.(data.avgMs);
        }
      }
    };

    worker.postMessage(
      {
        type: 'init',
        canvas: offscreen,
        config: initialConfig,
      },
      [offscreen],
    );

    const controller: OffscreenWorkerController = {
      resize(width, height, dpr) {
        worker.postMessage({type: 'resize', width, height, dpr});
      },
      pointer(x, y, energy) {
        worker.postMessage({type: 'pointer', x, y, energy});
      },
      pulse(originX, originY) {
        worker.postMessage({type: 'pulse', originX, originY});
      },
      telemetryEnergy(boost) {
        worker.postMessage({type: 'energy', boost});
      },
      setPaused(paused) {
        worker.postMessage({type: 'paused', paused});
      },
      updateConfig(cfg) {
        worker.postMessage({type: 'config', config: cfg});
      },
      setCallbacks(cb) {
        currentCallbacks = cb;
      },
    };

    canvasWorkerRegistry.set(canvas, controller);
    return controller;
  } catch {
    return null;
  }
}
