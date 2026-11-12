/**
 * NOVIP Immersion GLSL Shaders (WebGL 1/2 Universal GLSL 1.00)
 * Inspired by Active Theory's Hydra Engine (HomeColumnShader, NavBGShader & AntimatterPass),
 * independently authored for NOVIP's dark-space brand identity.
 * Phase 3: Includes uTelemetryEnergy uniform for real-time shader coupling with tool execution & card hover.
 */

export const NEBULA_VERTEX_SHADER = `
attribute vec2 aQuadPos;
varying vec2 vUv;

void main() {
  vUv = aQuadPos * 0.5 + 0.5;
  gl_Position = vec4(aQuadPos, 0.0, 1.0);
}
`;

export const NEBULA_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uPointer;
uniform float uPointerEnergy;
uniform float uTelemetryEnergy;
uniform vec2 uPulseOrigin;
uniform float uPulseAge;

// 2D Hash & Value Noise for FBM Volumetric Nebula
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amp * noise2D(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amp *= 0.5;
  }
  return value;
}

void main() {
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * aspect;
  vec2 ptr = (uPointer - 0.5) * aspect;

  // Pointer fluid displacement + telemetry energy boost
  vec2 toPtr = p - ptr;
  float distPtr = length(toPtr);
  float fluidPush = exp(-distPtr * 3.8) * (0.045 + uPointerEnergy * 0.06 + uTelemetryEnergy * 0.035);
  vec2 warpedP = p - normalize(toPtr + vec2(0.0001)) * fluidPush;

  // Interactive shockwave ring when user triggers pulse
  float ringGlow = 0.0;
  if (uPulseAge >= 0.0 && uPulseAge < 1.0) {
    vec2 pulseP = (uPulseOrigin - 0.5) * aspect;
    float dPulse = length(p - pulseP);
    float radius = uPulseAge * 1.35;
    float ring = exp(-pow((dPulse - radius) * 14.0, 2.0));
    ringGlow = ring * (1.0 - uPulseAge);
    warpedP += normalize(p - pulseP + vec2(0.0001)) * ringGlow * 0.035;
  }

  // Domain-warped volumetric FBM nebula (modulated by uTelemetryEnergy)
  float t = uTime * (0.14 + uTelemetryEnergy * 0.08);
  vec2 q = vec2(
    fbm(warpedP * 1.45 + vec2(0.0, t * 0.6)),
    fbm(warpedP * 1.45 + vec2(5.2, 1.3 - t * 0.5))
  );
  float n = fbm(warpedP * 1.8 + (1.8 + uTelemetryEnergy * 0.45) * q + vec2(t * 0.35, -t * 0.25));

  // Deep obsidian void base
  vec3 baseVoid = vec3(0.020, 0.028, 0.058);
  vec3 deepTeal = vec3(0.035, 0.145, 0.195);
  vec3 novipCrimson = vec3(0.92, 0.14, 0.24);
  vec3 holoCyan = vec3(0.45, 0.90, 0.99);
  vec3 electricViolet = vec3(0.56, 0.24, 0.96);

  // Spatial atmospheric lighting (left teal fog + top-center crimson/violet core)
  float leftAurora = smoothstep(0.9, -0.6, p.x) * smoothstep(-0.6, 0.5, p.y);
  float coreHalo = exp(-length(warpedP - vec2(0.0, 0.12)) * 2.1);
  float ptrHalo = exp(-distPtr * 3.2) * (0.28 + uPointerEnergy * 0.45 + uTelemetryEnergy * 0.25);

  vec3 col = baseVoid;
  col = mix(col, deepTeal, clamp(n * 0.65 + leftAurora * 0.38, 0.0, 1.0));
  col += electricViolet * pow(clamp(q.x * n * 1.45, 0.0, 1.0), 2.0) * (0.34 + uTelemetryEnergy * 0.18);
  col += novipCrimson * coreHalo * (0.22 + 0.18 * sin(uTime * 0.7) + uTelemetryEnergy * 0.14);
  col += mix(holoCyan, novipCrimson, 0.35) * ptrHalo * 0.32;
  col += mix(holoCyan, vec3(0.88, 1.0, 0.96), 0.5) * ringGlow * 0.55;

  // Subtle holographic architectural coordinate grid (extension-free for universal WebGL1/2 compatibility)
  vec2 gridUv = warpedP * 9.0;
  vec2 gridDist = abs(fract(gridUv - 0.5) - 0.5);
  float lineAlpha = smoothstep(0.038, 0.008, min(gridDist.x, gridDist.y));
  float gridMask = exp(-length(p) * 1.55) * (0.055 + uTelemetryEnergy * 0.05);
  col += holoCyan * lineAlpha * gridMask;

  // Vignette depth framing
  float vignette = smoothstep(1.42, 0.28, length(p));
  col *= mix(0.68, 1.0, vignette);

  gl_FragColor = vec4(col, 1.0);
}
`;

export const PARTICLE_VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec3 aMeta; // x: baseSize, y: colorSeed, z: phase

uniform float uTime;
uniform float uDpr;
uniform vec2 uAspect;
uniform vec2 uPointer;
uniform float uPointerEnergy;
uniform float uTelemetryEnergy;
uniform vec2 uPulseOrigin;
uniform float uPulseAge;

varying float vAlpha;
varying float vColorSeed;
varying float vHighlight;

void main() {
  float phase = aMeta.z;
  float t = uTime * (0.38 + uTelemetryEnergy * 0.14) + phase;

  // 3D orbital drift
  vec3 pos = aPosition;
  pos.x += sin(t * 1.1 + pos.z * 2.2) * (0.08 + uTelemetryEnergy * 0.025);
  pos.y += cos(t * 0.9 + pos.x * 2.0) * (0.08 + uTelemetryEnergy * 0.025);
  pos.z = mod(pos.z + uTime * (0.045 + uTelemetryEnergy * 0.03), 2.0) - 1.0; // [-1.0, 1.0] depth cycle

  // Pointer parallax & magnetic repulsion
  vec2 ptr = (uPointer - 0.5) * 2.0;
  pos.xy += ptr * (0.06 * (1.0 - pos.z * 0.5));

  vec2 diff = pos.xy - ptr;
  float dist = length(diff);
  float repel = exp(-dist * 3.4) * (0.08 + uPointerEnergy * 0.14 + uTelemetryEnergy * 0.06);
  pos.xy += normalize(diff + vec2(0.0001)) * repel;

  // Shockwave burst displacement
  float pulseBoost = 0.0;
  if (uPulseAge >= 0.0 && uPulseAge < 1.0) {
    vec2 pulseOriginNdc = (uPulseOrigin - 0.5) * 2.0;
    vec2 pDiff = pos.xy - pulseOriginNdc;
    float pDist = length(pDiff);
    float wave = exp(-pow((pDist - uPulseAge * 1.6) * 8.0, 2.0)) * (1.0 - uPulseAge);
    pos.xy += normalize(pDiff + vec2(0.0001)) * wave * 0.12;
    pulseBoost = wave;
  }

  // Perspective projection
  float depth = 1.65 - pos.z * 0.65;
  vec2 projected = pos.xy / max(0.45, depth);
  projected.x /= max(0.6, uAspect.x * 0.62);

  gl_Position = vec4(projected, 0.0, 1.0);

  float depthFade = smoothstep(2.3, 0.95, depth);
  float twinkle = 0.65 + 0.35 * sin(uTime * 2.4 + phase * 6.2831);
  vAlpha = depthFade * twinkle;
  vColorSeed = aMeta.y;
  vHighlight = clamp(repel * 3.5 + pulseBoost * 1.5 + uTelemetryEnergy * 0.45, 0.0, 1.0);

  gl_PointSize = clamp((aMeta.x * uDpr * (2.1 / depth)) * (1.0 + vHighlight * 0.65), 1.5, 22.0);
}
`;

export const PARTICLE_FRAGMENT_SHADER = `
precision mediump float;

varying float vAlpha;
varying float vColorSeed;
varying float vHighlight;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;

  // Soft bokeh falloff + crisp bright core
  float outerGlow = exp(-r * 3.2);
  float innerCore = smoothstep(0.32, 0.0, r);

  vec3 cyan = vec3(0.51, 0.93, 1.0);
  vec3 crimson = vec3(1.0, 0.24, 0.36);
  vec3 violet = vec3(0.78, 0.38, 1.0);
  vec3 mintWhite = vec3(0.90, 1.0, 0.97);

  vec3 tint = vColorSeed < 0.36
    ? cyan
    : (vColorSeed < 0.72 ? violet : crimson);
  tint = mix(tint, mintWhite, clamp(innerCore * 0.75 + vHighlight * 0.5, 0.0, 1.0));

  float alpha = (outerGlow * 0.72 + innerCore * 0.45) * vAlpha;
  gl_FragColor = vec4(tint * alpha, alpha);
}
`;
