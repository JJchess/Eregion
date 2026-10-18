import { useEffect, useRef } from 'react';
import type { MotionValue } from 'motion/react';
import * as THREE from 'three';
import type { QualityTier } from '../hooks/useQualityTier';
import styles from './cosmic-backdrop.module.css';

const GALAXY_DRAG_SURFACE_ID = 'landing-galaxy-drag-surface';
export type GalaxyRenderMode = 'intro' | 'interactive' | 'ambient' | 'continuum' | 'offscreen';

type Props = {
  quality: Exclude<QualityTier, 'static'>;
  mode: 'light' | 'dark';
  dissolve: MotionValue<number>;
  onReady: () => void;
  onError: () => void;
  onModeChange: (mode: GalaxyRenderMode) => void;
};

const PARTICLE_COUNT = 40_000;
const LOW_PARTICLE_COUNT = 16_000;
const HIGH_FEATURED_PARTICLE_COUNT = 720;
const LOW_FEATURED_PARTICLE_COUNT = 360;
const TAU = Math.PI * 2;
const BASE_ROTATION_X = -0.42;
const BASE_ROTATION_Z = -0.18;
const TERMINAL_ROTATION_X = -0.94;
const TERMINAL_ROTATION_Z = -0.1;

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aDrift;
  attribute vec3 aTarget;
  attribute vec4 aMeta;
  attribute vec4 aOptics;
  attribute vec2 aLife;
  uniform float uTime;
  uniform float uDissolve;
  uniform float uIntro;
  uniform float uPixelRatio;
  uniform float uMotionPhase;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  varying float vTone;
  varying float vTwinkle;
  varying float vAlpha;
  varying float vFlare;
  varying float vOptic;
  varying float vLuminosity;
  varying float vInteraction;

  float easeOutCubic(float value) {
    float inverse = 1.0 - value;
    return 1.0 - inverse * inverse * inverse;
  }

  vec2 bezier4(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
    float inverse = 1.0 - t;
    return inverse * inverse * inverse * a
      + 3.0 * inverse * inverse * t * b
      + 3.0 * inverse * t * t * c
      + t * t * t * d;
  }

  void main() {
    float intro = smoothstep(aLife.x * 0.72, min(1.0, aLife.x * 0.72 + 0.24), uIntro);
    float radius = length(position.xy);
    float differential = mix(0.072, 0.012, smoothstep(0.0, 4.5, radius));
    float motionAngle = uMotionPhase * differential;
    float motionCos = cos(motionAngle);
    float motionSin = sin(motionAngle);
    vec3 rotated = vec3(
      position.x * motionCos - position.y * motionSin,
      position.x * motionSin + position.y * motionCos,
      position.z
    );
    rotated.z += sin(aMeta.w * 6.28318 + uTime * 0.22) * (0.012 + aMeta.z * 0.018);
    vec4 mvPosition = modelViewMatrix * vec4(rotated, 1.0);
    vec4 sourceClip = projectionMatrix * mvPosition;
    sourceClip /= max(0.0001, sourceClip.w);

    float delay = aLife.x * 0.08;
    float release = clamp((uDissolve - 0.34 - delay) / max(0.08, 0.44 - delay), 0.0, 1.0);
    release = easeOutCubic(release);
    float settle = smoothstep(0.70, 1.0, uDissolve);
    vec2 sourceNdc = sourceClip.xy;
    vec2 pointerDelta = sourceNdc - uPointer;
    float pointerDistance = max(0.025, length(pointerDelta));
    float pointerField = exp(-pointerDistance * pointerDistance * 13.5)
      * uPointerStrength
      * (1.0 - smoothstep(0.0, 0.16, uDissolve));
    sourceNdc += (pointerDelta / pointerDistance)
      * pointerField
      * mix(0.006, 0.022, aOptics.w);
    vec2 targetNdc = aTarget.xy * vec2(1.08, 1.06);
    vec2 radialVector = sourceNdc - vec2(0.28, 0.0);
    float radialLength = max(0.001, length(radialVector));
    vec2 radial = radialVector / radialLength;
    vec2 tangent = vec2(-radial.y, radial.x);
    float curl = aDrift.z * 0.16 + (aMeta.w - 0.5) * 0.18;
    vec2 controlOne = sourceNdc
      + radial * (0.12 + min(radius, 4.5) * 0.034)
      + tangent * curl
      + vec2(0.0, 0.035);
    vec2 controlTwo = mix(sourceNdc, targetNdc, 0.62)
      + tangent * curl * 0.5
      + vec2(0.0, (1.0 - aLife.x) * 0.07);
    vec2 flightPosition = bezier4(sourceNdc, controlOne, controlTwo, targetNdc, release);
    gl_Position = vec4(flightPosition, mix(sourceClip.z, aTarget.z * 0.28, release), 1.0);

    float perspective = 8.4 / max(1.0, -mvPosition.z);
    float opticSize = pow(aOptics.z, 3.0);
    float size = mix(0.72, 2.25, aMeta.x * aMeta.x) + opticSize * 10.5 + aMeta.z * 3.4;
    float continuumSize = mix(0.52, 1.72, aMeta.x * aMeta.x) + opticSize * 3.6 + aMeta.z * 1.8;
    float burstPulse = sin(release * 3.14159265) * (0.24 + aMeta.z * 0.7);
    float pointSize = mix(size * perspective, continuumSize, settle)
      * (1.0 + burstPulse + pointerField * 0.28);
    gl_PointSize = min(28.0, pointSize * uPixelRatio * intro);
    vTone = aMeta.y;
    vFlare = aMeta.z;
    vOptic = aOptics.z;
    vLuminosity = aOptics.x;
    vInteraction = pointerField;
    float twinkleWave = 0.5 + 0.5 * sin(uTime * mix(0.7, 2.1, aOptics.y) + aMeta.w * 25.13);
    vTwinkle = mix(0.82, 0.58, smoothstep(0.35, 1.0, aOptics.z))
      + twinkleWave * mix(0.18, 0.42, smoothstep(0.35, 1.0, aOptics.z));
    float continuumAlpha = 0.1 + aLife.y * 0.58 + aMeta.z * 0.22;
    vAlpha = intro
      * mix(1.0, continuumAlpha, settle)
      * mix(0.42, 1.18, aOptics.x)
      * (1.0 + burstPulse * 0.42 + pointerField * 0.34);
  }
`;

const NEBULA_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform sampler2D uNebulaMap;
  uniform vec3 uCloudDeep;
  uniform vec3 uCloudViolet;
  uniform vec3 uCloudCyan;
  uniform vec3 uCloudPearl;
  uniform float uOpacity;
  uniform float uIntro;
  uniform float uDissolve;
  uniform float uMotionPhase;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv - 0.5;
    float radius = length(p) * 2.0;
    float differential = mix(0.072, 0.012, smoothstep(0.0, 1.0, radius));
    float angle = -uMotionPhase * differential;
    float c = cos(angle);
    float s = sin(angle);
    vec2 sampleUv = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + 0.5;
    vec4 field = texture2D(uNebulaMap, sampleUv);
    float density = field.r;
    float temperature = field.g;
    float shadow = field.b;
    float core = field.a;
    float reveal = smoothstep(0.0, 0.72, uIntro);
    float release = smoothstep(0.34, 0.78, uDissolve);
    float dissolveField = clamp(shadow * 0.5 + temperature * 0.27 + density * 0.18 + 0.08, 0.0, 1.0);
    float survival = smoothstep(release - 0.07, release + 0.1, dissolveField);
    float dissolveEdge = (1.0 - smoothstep(0.0, 0.055, abs(dissolveField - release))) * release;
    float fade = 1.0 - smoothstep(0.76, 0.9, uDissolve);
    vec3 color = mix(uCloudDeep, uCloudViolet, smoothstep(0.04, 0.48, density));
    color = mix(color, uCloudCyan, smoothstep(0.5, 0.84, temperature) * 0.9);
    color = mix(color, uCloudPearl, core * 0.62);
    color += uCloudPearl * dissolveEdge * 0.46;
    color *= mix(0.9, 1.12, 1.0 - shadow);
    float alpha = pow(density, 0.82) * mix(0.72, 1.0, core) * reveal * mix(1.0, survival, release) * fade * uOpacity;
    if (alpha < 0.006) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const CORE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform vec3 uCoreWarm;
  uniform vec3 uCorePearl;
  uniform vec3 uCoreCyan;
  uniform float uOpacity;
  uniform float uIntro;
  uniform float uDissolve;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv - 0.5;
    float radius = length(p);
    float halo = exp(-radius * radius * 26.0);
    float hot = exp(-radius * radius * 920.0);
    float corona = exp(-abs(radius - 0.072) * 82.0);
    float needleX = exp(-abs(p.x) * 72.0) * exp(-abs(p.y) * 7.0);
    float needleY = exp(-abs(p.y) * 96.0) * exp(-abs(p.x) * 9.0);
    float diagonal = exp(-abs(p.x + p.y) * 84.0) * exp(-abs(p.x - p.y) * 10.0) * 0.24;
    float flare = (needleX + needleY) * 0.48 + diagonal * 1.25;
    float reveal = smoothstep(0.12, 0.66, uIntro);
    float charge = smoothstep(0.18, 0.34, uDissolve) * (1.0 - smoothstep(0.34, 0.52, uDissolve));
    float fade = 1.0 - smoothstep(0.38, 0.62, uDissolve);
    vec3 color = mix(uCoreWarm, uCorePearl, smoothstep(0.08, 0.72, hot));
    color = mix(color, uCoreCyan, max(corona * 0.5, halo * (1.0 - hot) * 0.18));
    float alpha = (halo * 0.32 + hot * (0.62 + charge * 0.48) + corona * 0.28 + flare) * reveal * fade * uOpacity;
    if (alpha < 0.006) discard;
    gl_FragColor = vec4(color + hot * 0.42, alpha);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform vec3 uViolet;
  uniform vec3 uLilac;
  uniform vec3 uPearl;
  uniform vec3 uSpark;
  uniform float uOpacity;
  uniform float uLightMode;
  varying float vTone;
  varying float vTwinkle;
  varying float vAlpha;
  varying float vFlare;
  varying float vOptic;
  varying float vLuminosity;
  varying float vInteraction;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float halo = exp(-d * d * mix(42.0, 7.0, vOptic));
    float core = exp(-d * d * mix(124.0, 74.0, vOptic));
    float cross = max(
      exp(-abs(p.x) * 82.0) * exp(-abs(p.y) * 9.0),
      exp(-abs(p.y) * 82.0) * exp(-abs(p.x) * 9.0)
    ) * vFlare * smoothstep(0.84, 1.0, vOptic);
    float pearl = exp(-abs(d - 0.14) * 46.0) * smoothstep(0.58, 0.9, vOptic) * 0.12;
    float alpha = (halo * mix(0.5, 0.82, vOptic) + core + pearl + cross * 0.52)
      * vAlpha
      * vTwinkle
      * uOpacity;
    vec3 color = vTone < 0.46
      ? mix(uViolet, uLilac, vTone / 0.46)
      : (vTone > 0.86
        ? mix(uPearl, uSpark, (vTone - 0.86) / 0.14)
        : mix(uLilac, uPearl, (vTone - 0.46) / 0.40));
    float lightLuminosity = max(
      smoothstep(0.32, 0.94, vLuminosity),
      smoothstep(0.44, 0.92, vOptic) * 0.82
    );
    color = mix(color, uPearl, uLightMode * lightLuminosity * 0.64);
    alpha *= mix(1.0, mix(0.46, 1.12, lightLuminosity), uLightMode);
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(
      color + core * mix(0.18, 0.46, vLuminosity) + cross * 0.2 + vInteraction * 0.1,
      alpha
    );
  }
`;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function gaussian(random: () => number) {
  return (random() + random() + random() + random() + random() + random() - 3) / 3;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return normalized * normalized * (3 - 2 * normalized);
}

function createNebulaTexture(size: number) {
  const noiseSize = 64;
  const random = seededRandom(0x6e656275);
  const noise = new Float32Array(noiseSize * noiseSize);
  for (let index = 0; index < noise.length; index += 1) noise[index] = random();

  const sampleNoise = (x: number, y: number) => {
    const wrappedX = ((x % noiseSize) + noiseSize) % noiseSize;
    const wrappedY = ((y % noiseSize) + noiseSize) % noiseSize;
    const x0 = Math.floor(wrappedX);
    const y0 = Math.floor(wrappedY);
    const x1 = (x0 + 1) % noiseSize;
    const y1 = (y0 + 1) % noiseSize;
    const tx = smoothstep(0, 1, wrappedX - x0);
    const ty = smoothstep(0, 1, wrappedY - y0);
    const top = noise[y0 * noiseSize + x0] * (1 - tx) + noise[y0 * noiseSize + x1] * tx;
    const bottom = noise[y1 * noiseSize + x0] * (1 - tx) + noise[y1 * noiseSize + x1] * tx;
    return top * (1 - ty) + bottom * ty;
  };

  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const ny = (y / (size - 1) - 0.5) * 2;
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1) - 0.5) * 2;
      const radius = Math.sqrt(nx * nx + ny * ny);
      const angle = Math.atan2(ny, nx);
      const n1 = sampleNoise(nx * 5.2 + 17, ny * 5.2 + 11);
      const n2 = sampleNoise(nx * 12.7 + 37, ny * 12.7 + 29);
      const n3 = sampleNoise(nx * 27.4 + 7, ny * 27.4 + 43);
      const turbulence = n1 * 0.56 + n2 * 0.29 + n3 * 0.15;
      const spiralPhase = angle - radius * 4.82 + (turbulence - 0.5) * 0.92;
      const armDistance = Math.abs(Math.sin(spiralPhase));
      const branchDistance = Math.abs(Math.sin(spiralPhase + 0.42));
      const width = 0.18 + radius * 0.17;
      const arm = Math.exp(-Math.pow(armDistance / width, 2));
      const branch = Math.exp(-Math.pow(branchDistance / (width * 0.62), 2)) * 0.32;
      const clumps = smoothstep(0.24, 0.8, n1 * 0.62 + n2 * 0.38);
      const feather = Math.max(0, arm + branch) * (0.18 + clumps * 1.08) * (0.5 + turbulence * 0.58);
      const disk = Math.exp(-radius * radius * 1.42) * (0.16 + turbulence * 0.24);
      const core = Math.exp(-radius * radius * 27);
      const edge = 1 - smoothstep(0.72, 1.03, radius);
      const dust = Math.max(0, (n2 - 0.48) * 1.9) * arm * (1 - core);
      const density = Math.min(1, Math.max(0, (feather * 0.82 + disk + core * 0.9) * edge - dust * 0.2));
      const temperature = Math.min(1, Math.max(0, n3 * 0.72 + arm * 0.24 - radius * 0.12));
      const offset = (y * size + x) * 4;
      data[offset] = Math.round(density * 255);
      data[offset + 1] = Math.round(temperature * 255);
      data[offset + 2] = Math.round(Math.min(1, dust) * 255);
      data[offset + 3] = Math.round(core * 255);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

type GalaxyBuffers = {
  positions: Float32Array;
  drifts: Int16Array;
  targets: Int16Array;
  meta: Uint8Array;
  optics: Uint8Array;
  life: Uint8Array;
};

function createGalaxyBuffers(count: number, featuredCount: number): GalaxyBuffers {
  const random = seededRandom(0xc05a2026);
  const targetRandom = seededRandom(0x73746172);
  const positions = new Float32Array(count * 3);
  const drifts = new Int16Array(count * 3);
  const targets = new Int16Array(count * 3);
  const meta = new Uint8Array(count * 4);
  const optics = new Uint8Array(count * 4);
  const life = new Uint8Array(count * 2);

  for (let index = 0; index < count; index += 1) {
    const isHighlight = index < featuredCount;
    const sample = isHighlight ? 0.08 + random() * 0.68 : random();
    let radius = 0;
    let angle = 0;
    let height = 0;
    let scale = 0;
    let tone = 0;
    let flare = 0;

    if (sample < 0.62) {
      radius = 0.22 + Math.pow(random(), 0.62) * 3.62;
      const mainArm = index % 2;
      const branch = random() > 0.7 ? (random() > 0.5 ? 0.42 : -0.36) : 0;
      angle = mainArm * Math.PI + radius * 1.46 + branch + gaussian(random) * (0.25 + radius * 0.11);
      height = gaussian(random) * (0.075 + radius * 0.024);
      scale = isHighlight ? 0.26 + Math.pow(random(), 2.8) * 0.68 : 0.12 + Math.pow(random(), 3.8) * 0.4;
      tone = 0.18 + random() * 0.7;
      flare = isHighlight ? 0.72 + random() * 0.28 : random() > 0.995 ? 0.5 + random() * 0.5 : 0;
    } else if (sample < 0.82) {
      radius = Math.pow(random(), 2.35) * 1.18;
      angle = random() * TAU + radius * 1.1;
      height = gaussian(random) * (0.12 - radius * 0.035);
      scale = isHighlight ? 0.38 + Math.pow(random(), 2.2) * 0.6 : 0.12 + Math.pow(random(), 3.6) * 0.55;
      tone = 0.48 + random() * 0.48;
      flare = isHighlight ? 0.78 + random() * 0.22 : random() > 0.989 ? 0.45 + random() * 0.55 : 0;
    } else if (sample < 0.96) {
      radius = 0.52 + Math.pow(random(), 0.72) * 3.15;
      angle = random() * TAU;
      height = gaussian(random) * 0.045;
      scale = 0.08 + Math.pow(random(), 4.6) * 0.34;
      tone = 0.08 + random() * 0.58;
      flare = isHighlight ? 0.64 + random() * 0.3 : 0;
    } else {
      radius = 2.2 + Math.pow(random(), 0.7) * 2.25;
      angle = random() * TAU;
      height = gaussian(random) * 0.22;
      scale = 0.08 + Math.pow(random(), 4.1) * 0.4;
      tone = 0.38 + random() * 0.62;
      flare = isHighlight ? 0.7 + random() * 0.3 : random() > 0.992 ? 0.65 : 0;
    }

    const eccentricity = 0.76 + Math.min(radius, 4) * 0.018;
    const p = index * 3;
    positions[p] = Math.cos(angle) * radius;
    positions[p + 1] = Math.sin(angle) * radius * eccentricity;
    positions[p + 2] = height;
    const driftAngle = angle + gaussian(random) * 0.38;
    const driftStrength = 0.35 + random() * 0.65;
    drifts[p] = Math.round(Math.cos(driftAngle) * driftStrength * 32767);
    drifts[p + 1] = Math.round(Math.sin(driftAngle) * driftStrength * 0.76 * 32767);
    drifts[p + 2] = Math.round(gaussian(random) * 0.42 * 32767);
    targets[p] = Math.round((targetRandom() * 2 - 1) * 32767);
    targets[p + 1] = Math.round((targetRandom() * 2 - 1) * 32767);
    targets[p + 2] = Math.round((targetRandom() * 2 - 1) * 32767);
    const m = index * 4;
    meta[m] = Math.round(Math.min(1, scale) * 255);
    meta[m + 1] = Math.round(Math.min(1, tone) * 255);
    meta[m + 2] = Math.round(Math.min(1, flare) * 255);
    meta[m + 3] = Math.floor(random() * 256);
    const opticSample = isHighlight ? 0.94 + random() * 0.06 : random();
    let luminosity = 0;
    let twinkleRate = 0;
    let opticClass = 0;
    if (opticSample < 0.8) {
      luminosity = 0.08 + Math.pow(random(), 1.8) * 0.38;
      twinkleRate = 0.06 + random() * 0.32;
      opticClass = 0.02 + random() * 0.16;
    } else if (opticSample < 0.96) {
      luminosity = 0.34 + random() * 0.34;
      twinkleRate = 0.22 + random() * 0.48;
      opticClass = 0.25 + random() * 0.3;
    } else if (opticSample < 0.995) {
      luminosity = 0.62 + random() * 0.3;
      twinkleRate = 0.45 + random() * 0.42;
      opticClass = 0.62 + random() * 0.2;
    } else {
      luminosity = 0.88 + random() * 0.12;
      twinkleRate = 0.68 + random() * 0.32;
      opticClass = 0.9 + random() * 0.1;
      flare = Math.max(flare, 0.82 + random() * 0.18);
      meta[m + 2] = Math.round(Math.min(1, flare) * 255);
    }
    optics[m] = Math.round(luminosity * 255);
    optics[m + 1] = Math.round(twinkleRate * 255);
    optics[m + 2] = Math.round(opticClass * 255);
    optics[m + 3] = Math.floor(random() * 256);
    const l = index * 2;
    life[l] = Math.round(Math.min(1, radius / 4.45 + random() * 0.12) * 255);
    life[l + 1] = random() > 0.88 ? 255 : Math.floor(random() * 42);
  }
  return { positions, drifts, targets, meta, optics, life };
}

function createGeometry(buffers: GalaxyBuffers, count: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions.subarray(0, count * 3), 3));
  geometry.setAttribute('aDrift', new THREE.Int16BufferAttribute(buffers.drifts.subarray(0, count * 3), 3, true));
  geometry.setAttribute('aTarget', new THREE.Int16BufferAttribute(buffers.targets.subarray(0, count * 3), 3, true));
  geometry.setAttribute('aMeta', new THREE.Uint8BufferAttribute(buffers.meta.subarray(0, count * 4), 4, true));
  geometry.setAttribute('aOptics', new THREE.Uint8BufferAttribute(buffers.optics.subarray(0, count * 4), 4, true));
  geometry.setAttribute('aLife', new THREE.Uint8BufferAttribute(buffers.life.subarray(0, count * 2), 2, true));
  geometry.computeBoundingSphere();
  return geometry;
}

const PALETTES = {
  light: ['#8068e8', '#a99bef', '#fffdfc', '#b4dff8'],
  dark: ['#7445ee', '#b79dfb', '#fff7ff', '#63e7f5'],
} as const;

const NEBULA_PALETTES = {
  light: {
    cloud: ['#ddd9f3', '#eeeaf8', '#dbeef9', '#fffdfc'],
    core: ['#fff1de', '#fffdfc', '#b4dff8'],
    cloudOpacity: 0.17,
    coreOpacity: 1,
  },
  dark: {
    cloud: ['#32106f', '#8b42ff', '#26d7e9', '#fff6ff'],
    core: ['#b56cff', '#ffffff', '#72f5ff'],
    cloudOpacity: 0.96,
    coreOpacity: 0.72,
  },
} as const;

export function CosmicGalaxyCanvas({ quality, mode, dissolve, onReady, onError, onModeChange }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<{ setMode: (mode: 'light' | 'dark') => void } | null>(null);

  useEffect(() => controllerRef.current?.setMode(mode), [mode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let raf = 0;
    let ambientTimer = 0;
    let disposed = false;
    let intersecting = true;
    let pageVisible = document.visibilityState === 'visible';
    let firstFrame = true;
    let dissolveValue = Math.min(1, Math.max(0, dissolve.get()));
    const posterFrame = new URLSearchParams(window.location.search).has('heroPoster');
    const skipIntro = posterFrame || dissolveValue >= 0.999;
    let currentMode: GalaxyRenderMode = skipIntro ? 'continuum' : 'intro';
    let currentIntroPhase = 'pending';
    let fullUntil = performance.now() + (skipIntro ? 0 : 2800);
    let introStarted = 0;
    let lastRender = 0;
    let rotationX = BASE_ROTATION_X;
    let rotationZ = BASE_ROTATION_Z;
    let targetX = rotationX;
    let targetZ = rotationZ;
    let velocityX = 0;
    let velocityZ = 0;
    let dragging = false;
    let dragX = 0;
    let dragY = 0;
    let paletteMix = 1;
    let targetPaletteMode = mode;
    let motionPhase = 0;
    let galaxyOffsetX = 0;
    let pointerX = 0;
    let pointerY = 0;
    let targetPointerX = 0;
    let targetPointerY = 0;
    let pointerStrength = 0;
    let targetPointerStrength = 0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 30);
    camera.position.set(0, 0, 8.1);
    const galaxy = new THREE.Group();
    galaxy.rotation.set(rotationX, -0.06, rotationZ);
    galaxy.scale.setScalar(1.03);
    scene.add(galaxy);

    const particleCount = quality === 'high' ? PARTICLE_COUNT : LOW_PARTICLE_COUNT;
    const featuredCount = quality === 'high' ? HIGH_FEATURED_PARTICLE_COUNT : LOW_FEATURED_PARTICLE_COUNT;
    const buffers = createGalaxyBuffers(particleCount, featuredCount);
    const geometry = createGeometry(buffers, particleCount);
    const nebulaTexture = createNebulaTexture(quality === 'high' ? 512 : 384);
    const nebulaGeometry = new THREE.PlaneGeometry(9.45, 9.45);
    const coreGeometry = new THREE.PlaneGeometry(2.2, 2.2);
    const initialPalette = PALETTES[mode];
    const initialNebulaPalette = NEBULA_PALETTES[mode];
    const uniforms = {
      uTime: { value: 0 }, uDissolve: { value: dissolveValue }, uIntro: { value: skipIntro ? 1 : 0 },
      uPixelRatio: { value: 1 }, uOpacity: { value: 1 }, uMotionPhase: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) }, uPointerStrength: { value: 0 },
      uViolet: { value: new THREE.Color(initialPalette[0]) }, uLilac: { value: new THREE.Color(initialPalette[1]) },
      uPearl: { value: new THREE.Color(initialPalette[2]) }, uSpark: { value: new THREE.Color(initialPalette[3]) },
      uLightMode: { value: mode === 'light' ? 1 : 0 },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER, uniforms, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const nebulaMaterial = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERTEX_SHADER,
      fragmentShader: NEBULA_FRAGMENT_SHADER,
      uniforms: {
        uNebulaMap: { value: nebulaTexture },
        uCloudDeep: { value: new THREE.Color(initialNebulaPalette.cloud[0]) },
        uCloudViolet: { value: new THREE.Color(initialNebulaPalette.cloud[1]) },
        uCloudCyan: { value: new THREE.Color(initialNebulaPalette.cloud[2]) },
        uCloudPearl: { value: new THREE.Color(initialNebulaPalette.cloud[3]) },
        uOpacity: { value: initialNebulaPalette.cloudOpacity },
        uIntro: { value: skipIntro ? 1 : 0 },
        uDissolve: { value: dissolveValue },
        uMotionPhase: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const coreMaterial = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERTEX_SHADER,
      fragmentShader: CORE_FRAGMENT_SHADER,
      uniforms: {
        uCoreWarm: { value: new THREE.Color(initialNebulaPalette.core[0]) },
        uCorePearl: { value: new THREE.Color(initialNebulaPalette.core[1]) },
        uCoreCyan: { value: new THREE.Color(initialNebulaPalette.core[2]) },
        uOpacity: { value: initialNebulaPalette.coreOpacity },
        uIntro: { value: skipIntro ? 1 : 0 },
        uDissolve: { value: dissolveValue },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial);
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    nebula.position.z = -0.13;
    core.position.z = 0.08;
    nebula.renderOrder = 0;
    core.renderOrder = 1;
    const particles = new THREE.Points(geometry, material);
    particles.renderOrder = 2;
    galaxy.add(nebula, core, particles);

    const setRenderMode = (next: GalaxyRenderMode) => {
      if (currentMode !== next) { currentMode = next; onModeChange(next); }
    };
    const setIntroPhase = (next: 'seed' | 'forming' | 'complete') => {
      if (currentIntroPhase === next) return;
      currentIntroPhase = next;
      mount.dataset.introPhase = next;
    };
    const isRenderable = () => !disposed && intersecting && pageVisible && renderer !== null;
    const cancelWork = () => {
      if (raf) cancelAnimationFrame(raf);
      if (ambientTimer) window.clearTimeout(ambientTimer);
      raf = 0;
      ambientTimer = 0;
    };
    const schedule = (cadence: 'active' | 'ambient' = 'active') => {
      if (!isRenderable() || raf) return;
      if (cadence === 'ambient') {
        if (ambientTimer) return;
        // The timeout hands work back to RAF, so remove roughly one display-frame
        // from the delay instead of accidentally running ambient at 15/10fps.
        const frameInterval = quality === 'high' ? 1000 / 20 : 1000 / 12;
        const delay = Math.max(16, frameInterval - 16);
        ambientTimer = window.setTimeout(() => {
          ambientTimer = 0;
          if (isRenderable() && !raf) raf = requestAnimationFrame(render);
        }, delay);
        return;
      }
      if (ambientTimer) window.clearTimeout(ambientTimer);
      ambientTimer = 0;
      raf = requestAnimationFrame(render);
    };
    const wake = (duration = 220) => {
      if (!isRenderable()) return;
      fullUntil = Math.max(fullUntil, performance.now() + duration);
      setRenderMode(introStarted && material.uniforms.uIntro.value < 1 ? 'intro' : 'interactive');
      schedule('active');
    };
    const targetColors = PALETTES[mode].map((color) => new THREE.Color(color));
    const targetCloudColors = NEBULA_PALETTES[mode].cloud.map((color) => new THREE.Color(color));
    const targetCoreColors = NEBULA_PALETTES[mode].core.map((color) => new THREE.Color(color));
    const syncPalette = (step: number) => {
      if (paletteMix >= 0.999) return;
      paletteMix = Math.min(1, paletteMix + step);
      material.uniforms.uViolet.value.lerp(targetColors[0], step * 1.8);
      material.uniforms.uLilac.value.lerp(targetColors[1], step * 1.8);
      material.uniforms.uPearl.value.lerp(targetColors[2], step * 1.8);
      material.uniforms.uSpark.value.lerp(targetColors[3], step * 1.8);
      nebulaMaterial.uniforms.uCloudDeep.value.lerp(targetCloudColors[0], step * 1.8);
      nebulaMaterial.uniforms.uCloudViolet.value.lerp(targetCloudColors[1], step * 1.8);
      nebulaMaterial.uniforms.uCloudCyan.value.lerp(targetCloudColors[2], step * 1.8);
      nebulaMaterial.uniforms.uCloudPearl.value.lerp(targetCloudColors[3], step * 1.8);
      coreMaterial.uniforms.uCoreWarm.value.lerp(targetCoreColors[0], step * 1.8);
      coreMaterial.uniforms.uCorePearl.value.lerp(targetCoreColors[1], step * 1.8);
      coreMaterial.uniforms.uCoreCyan.value.lerp(targetCoreColors[2], step * 1.8);
      material.uniforms.uLightMode.value +=
        ((targetPaletteMode === 'light' ? 1 : 0) - material.uniforms.uLightMode.value) * step * 1.8;
      const nebulaPalette = NEBULA_PALETTES[targetPaletteMode];
      nebulaMaterial.uniforms.uOpacity.value +=
        (nebulaPalette.cloudOpacity - nebulaMaterial.uniforms.uOpacity.value) * step * 1.8;
      coreMaterial.uniforms.uOpacity.value +=
        (nebulaPalette.coreOpacity - coreMaterial.uniforms.uOpacity.value) * step * 1.8;
    };

    function render(now: number) {
      raf = 0;
      if (!isRenderable() || !renderer) return;
      // Render and reveal the seed frame first. The formation clock starts only after
      // the canvas opacity handoff, so the user sees the whole live build-up rather
      // than a completed poster followed by a partially elapsed animation.
      if (!introStarted && !skipIntro) introStarted = now + 240;
      const intro = skipIntro
        ? 1
        : Math.min(1, Math.max(0, (now - introStarted) / 2200));
      setIntroPhase(skipIntro || intro >= 1 ? 'complete' : intro <= 0 ? 'seed' : 'forming');
      const moving = now < fullUntil || intro < 1 || Math.abs(velocityX) + Math.abs(velocityZ) > 0.00012 ||
        Math.abs(rotationX - BASE_ROTATION_X) + Math.abs(rotationZ - BASE_ROTATION_Z) > 0.002 ||
        Math.abs(pointerX - targetPointerX) + Math.abs(pointerY - targetPointerY) > 0.001 ||
        Math.abs(pointerStrength - targetPointerStrength) > 0.004 ||
        paletteMix < 0.999;
      const full = posterFrame || dragging || moving;
      if (quality === 'low' && full && now - lastRender < 1000 / 30) { schedule('active'); return; }
      const delta = Math.min(100, Math.max(8, now - (lastRender || now - 16)));
      lastRender = now;
      setRenderMode(
        dissolveValue >= 0.999
          ? 'continuum'
          : full
          ? (intro < 1 ? 'intro' : 'interactive')
          : dissolveValue <= 0.01
            ? 'ambient'
            : 'continuum',
      );
      const settling = !posterFrame && !dragging && now > fullUntil - 620;
      if (settling) {
        targetX += (BASE_ROTATION_X - targetX) * Math.min(1, delta * 0.014);
        targetZ += (BASE_ROTATION_Z - targetZ) * Math.min(1, delta * 0.014);
      }
      if (!posterFrame && dissolveValue < 0.999) motionPhase += delta * (full ? 0.00108 : 0.00092);
      targetX += velocityX * delta; targetZ += velocityZ * delta;
      velocityX *= Math.pow(0.91, delta / 16.67); velocityZ *= Math.pow(0.91, delta / 16.67);
      rotationX += (targetX - rotationX) * Math.min(1, delta * 0.008);
      rotationZ += (targetZ - rotationZ) * Math.min(1, delta * 0.008);
      const pointerEase = 1 - Math.exp(-delta * (full ? 0.014 : 0.009));
      pointerX += (targetPointerX - pointerX) * pointerEase;
      pointerY += (targetPointerY - pointerY) * pointerEase;
      pointerStrength += (targetPointerStrength - pointerStrength) * pointerEase;
      const orient = smoothstep(0, 0.34, dissolveValue);
      const pointerGate = 1 - smoothstep(0, 0.16, dissolveValue);
      const livePointerStrength = pointerStrength * pointerGate;
      galaxy.rotation.x = THREE.MathUtils.lerp(
        rotationX + pointerY * 0.032 * livePointerStrength,
        TERMINAL_ROTATION_X,
        orient,
      );
      galaxy.rotation.z = THREE.MathUtils.lerp(
        rotationZ + pointerX * 0.044 * livePointerStrength,
        TERMINAL_ROTATION_Z,
        orient,
      );
      galaxy.position.x = galaxyOffsetX + pointerX * 0.045 * livePointerStrength;
      galaxy.position.y = -pointerY * 0.035 * livePointerStrength;
      const charge = smoothstep(0.18, 0.34, dissolveValue) * (1 - smoothstep(0.34, 0.52, dissolveValue));
      const time = now * 0.001;
      const coreBreath = 1 + Math.sin(time * 0.9) * 0.014 * pointerGate;
      core.scale.setScalar((1 - charge * 0.16) * coreBreath);
      nebula.scale.setScalar(1 + Math.sin(time * 0.55 + 1.2) * 0.008 * pointerGate);
      nebula.visible = dissolveValue < 0.995;
      core.visible = dissolveValue < 0.995;
      material.uniforms.uTime.value = time; material.uniforms.uDissolve.value = dissolveValue; material.uniforms.uIntro.value = intro;
      material.uniforms.uMotionPhase.value = motionPhase;
      material.uniforms.uPointer.value.set(pointerX, pointerY);
      material.uniforms.uPointerStrength.value = livePointerStrength;
      nebulaMaterial.uniforms.uIntro.value = intro;
      nebulaMaterial.uniforms.uDissolve.value = dissolveValue;
      nebulaMaterial.uniforms.uMotionPhase.value = motionPhase;
      coreMaterial.uniforms.uIntro.value = intro;
      coreMaterial.uniforms.uDissolve.value = dissolveValue;
      syncPalette(Math.min(0.12, delta * 0.004));
      renderer.render(scene, camera);
      if (firstFrame) { firstFrame = false; onReady(); }
      if (!posterFrame && full) schedule('active');
      else if (!posterFrame && dissolveValue <= 0.01) schedule('ambient');
    }

    const handleContextLost = (event: Event) => { event.preventDefault(); cancelWork(); if (!disposed) onError(); };
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'high-performance', premultipliedAlpha: false, preserveDrawingBuffer: posterFrame });
      renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.className = styles.canvas; renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false); mount.appendChild(renderer.domElement);
    } catch (error) {
      console.warn('[landing] galaxy renderer failed; using poster.', error); onError(); return;
    }

    const resize = () => {
      if (!renderer) return;
      const width = Math.max(1, mount.clientWidth); const height = Math.max(1, mount.clientHeight);
      const desiredRatio = quality === 'high' ? Math.min(window.devicePixelRatio, 1.25) : 1;
      const maxWidth = quality === 'high' ? 1440 : 960; const maxHeight = quality === 'high' ? 900 : 600;
      const ratio = Math.max(0.5, Math.min(desiredRatio, maxWidth / width, maxHeight / height));
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
      const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.position.z;
      galaxyOffsetX = viewHeight * camera.aspect * 0.14;
      material.uniforms.uPixelRatio.value = ratio; wake(260);
    };
    const handleDissolve = (value: number) => {
      dissolveValue = Math.min(1, Math.max(0, value));
      const locked = dissolveValue > 0.01;
      dragSurface?.toggleAttribute('data-transition-locked', locked);
      if (locked) {
        targetPointerX = 0;
        targetPointerY = 0;
        targetPointerStrength = 0;
      }
      if (locked && dragging) {
        dragging = false;
        dragSurface?.removeAttribute('data-dragging');
      }
      wake(dissolveValue >= 0.999 ? 90 : 180);
    };
    const dragSurface = document.getElementById(GALAXY_DRAG_SURFACE_ID);
    const updatePointerTarget = (event: PointerEvent) => {
      const bounds = mount.getBoundingClientRect();
      targetPointerX = THREE.MathUtils.clamp(((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1, -1, 1);
      targetPointerY = THREE.MathUtils.clamp(1 - ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2, -1, 1);
      targetPointerStrength = 1;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (dissolveValue > 0.01) return;
      updatePointerTarget(event);
      dragging = true; dragX = event.clientX; dragY = event.clientY; velocityX = 0; velocityZ = 0;
      dragSurface?.setPointerCapture(event.pointerId); dragSurface?.setAttribute('data-dragging', 'true'); wake(1000);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (dissolveValue > 0.01) return;
      updatePointerTarget(event);
      if (!dragging) {
        wake(260); return;
      }
      const dx = event.clientX - dragX; const dy = event.clientY - dragY; dragX = event.clientX; dragY = event.clientY;
      targetZ += dx * 0.0032; targetX += dy * 0.0022; velocityZ = dx * 0.00016; velocityX = dy * 0.00012; wake(1000);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (!dragging) return; dragging = false;
      if (dragSurface?.hasPointerCapture(event.pointerId)) dragSurface.releasePointerCapture(event.pointerId);
      dragSurface?.removeAttribute('data-dragging'); wake(1400);
    };
    const handlePointerLeave = () => {
      if (dragging) return;
      targetPointerX = 0;
      targetPointerY = 0;
      targetPointerStrength = 0;
      wake(900);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (dissolveValue > 0.01) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { targetZ += direction * 0.18; velocityZ = direction * 0.0008; }
      else { targetX += direction * 0.12; velocityX = direction * 0.0006; }
      wake(900);
    };
    const handleVisibility = () => {
      pageVisible = document.visibilityState === 'visible';
      if (!pageVisible) { cancelWork(); setRenderMode('offscreen'); } else if (intersecting) wake(260);
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      if (!intersecting) { cancelWork(); setRenderMode('offscreen'); }
      else if (pageVisible) wake(300);
    });
    resizeObserver.observe(mount); intersectionObserver.observe(mount); resize();
    const unsubscribeDissolve = dissolve.on('change', handleDissolve);
    dragSurface?.addEventListener('pointerdown', handlePointerDown); dragSurface?.addEventListener('pointermove', handlePointerMove);
    dragSurface?.addEventListener('pointerup', handlePointerUp); dragSurface?.addEventListener('pointercancel', handlePointerUp);
    dragSurface?.addEventListener('pointerleave', handlePointerLeave);
    dragSurface?.addEventListener('keydown', handleKeyDown); document.addEventListener('visibilitychange', handleVisibility);
    controllerRef.current = { setMode: (nextMode) => {
      targetPaletteMode = nextMode; paletteMix = 0;
      const palette = PALETTES[nextMode];
      for (let index = 0; index < 4; index += 1) targetColors[index].set(palette[index]);
      const nebulaPalette = NEBULA_PALETTES[nextMode];
      for (let index = 0; index < 4; index += 1) targetCloudColors[index].set(nebulaPalette.cloud[index]);
      for (let index = 0; index < 3; index += 1) targetCoreColors[index].set(nebulaPalette.core[index]);
      wake(520);
    } };
    onModeChange(skipIntro ? 'continuum' : 'intro'); schedule();

    return () => {
      disposed = true; controllerRef.current = null; cancelWork(); unsubscribeDissolve(); resizeObserver.disconnect(); intersectionObserver.disconnect();
      dragSurface?.removeEventListener('pointerdown', handlePointerDown); dragSurface?.removeEventListener('pointermove', handlePointerMove);
      dragSurface?.removeEventListener('pointerup', handlePointerUp); dragSurface?.removeEventListener('pointercancel', handlePointerUp);
      dragSurface?.removeEventListener('pointerleave', handlePointerLeave);
      dragSurface?.removeEventListener('keydown', handleKeyDown); document.removeEventListener('visibilitychange', handleVisibility);
      renderer?.domElement.removeEventListener('webglcontextlost', handleContextLost);
      geometry.dispose(); nebulaGeometry.dispose(); coreGeometry.dispose(); nebulaTexture.dispose();
      material.dispose(); nebulaMaterial.dispose(); coreMaterial.dispose();
      renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); renderer = null;
    };
  }, [dissolve, onError, onModeChange, onReady, quality]);

  return (
    <div
      ref={mountRef}
      className={styles.canvasMount}
      data-galaxy-canvas
      data-intro-phase="pending"
      data-particle-count={quality === 'high' ? PARTICLE_COUNT : LOW_PARTICLE_COUNT}
    />
  );
}
