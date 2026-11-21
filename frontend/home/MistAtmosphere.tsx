import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import './MistAtmosphere.css'

// The standby optics from 92b3a8b. Frame them through the canvas viewport.
const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 vUv;
void main() {
  vUv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUv;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_bpm;
uniform float u_intensity;
uniform float u_reveal;
uniform float u_surge;
uniform float u_spin;

const float PI = 3.14159265359;

mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
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
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = m * p * 2.03 + vec2(17.1, 31.7);
    a *= 0.5;
  }
  return v;
}

// Curated luxury iridescent spectrum: ruby rose -> warm gold -> pearl emerald -> electric ice cyan -> cobalt -> amethyst
vec3 luxurySpectrum(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(1.00, 0.16, 0.48);
  vec3 c1 = vec3(1.00, 0.66, 0.22);
  vec3 c2 = vec3(0.24, 0.98, 0.78);
  vec3 c3 = vec3(0.10, 0.86, 1.00);
  vec3 c4 = vec3(0.36, 0.48, 1.00);
  vec3 c5 = vec3(0.82, 0.28, 1.00);

  float x = t * 5.0;
  if (x < 1.0) return mix(c0, c1, smoothstep(0.0, 1.0, x));
  if (x < 2.0) return mix(c1, c2, smoothstep(0.0, 1.0, x - 1.0));
  if (x < 3.0) return mix(c2, c3, smoothstep(0.0, 1.0, x - 2.0));
  if (x < 4.0) return mix(c3, c4, smoothstep(0.0, 1.0, x - 3.0));
  return mix(c4, c5, smoothstep(0.0, 1.0, x - 4.0));
}

// 2D Equilateral Triangle SDF (always preserves iconic jewel-like prism silhouette)
float sdEquilateralTriangle(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

vec3 acesFilm(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 uv = (vUv - 0.5) * vec2(aspect, 1.0);
  float t = u_time;

  float narrow = smoothstep(1.15, 0.72, aspect);
  // Floating prism anchored cleanly in right-center golden focal zone
  vec2 bob = vec2(sin(t * 0.65) * 0.012, sin(t * 1.05) * 0.022);
  vec2 prismPos = mix(vec2(0.22 * aspect, -0.01), vec2(0.06, 0.07), narrow) + bob + u_pointer * vec2(0.032, -0.024);
  float prismScale = mix(0.245, 0.185, narrow) * (0.86 + 0.14 * u_reveal);

  // Subtle rhythmic luxury breath synced to music tempo + GSAP hover surge
  float beatPhase = t * (u_bpm / 60.0) * PI;
  float pulse = 0.92 + 0.08 * sin(beatPhase) + u_surge * 0.45;

  // 1. Deep Obsidian Sapphire Night Sky with slowly drifting ambient aurora mist
  vec3 col = mix(vec3(0.012, 0.018, 0.042), vec3(0.022, 0.034, 0.072), smoothstep(0.6, -0.55, uv.y));
  vec2 driftA = vec2(sin(t * 0.42) * 0.10, cos(t * 0.34) * 0.07);
  vec2 driftB = vec2(cos(t * 0.36) * 0.12, sin(t * 0.48) * 0.08);
  col += vec3(0.03, 0.14, 0.28) * exp(-length((uv - prismPos + driftA) * vec2(0.8, 1.15)) * 2.2) * (0.85 + u_surge * 0.35);
  col += vec3(0.20, 0.05, 0.28) * exp(-length(uv - prismPos - vec2(0.32, 0.08) + driftB) * 2.0) * (0.58 + u_surge * 0.35);

  vec2 p2 = uv - prismPos;

  // Gentle 3D-like faceted tilt (keeps the iconic crystal triangle razor-sharp, never turning sideways)
  float tilt = sin(t * 0.55) * 0.055 + u_pointer.x * 0.06 + u_spin * 0.08;
  vec2 pt = rot2(tilt) * p2;
  // Back-depth offset creates true 3D crystal thickness / chamfered rear edge
  vec2 depthOff = vec2(0.042 + sin(t * 0.72) * 0.014 + u_pointer.x * 0.024, 0.022 + cos(t * 0.62) * 0.010 - u_pointer.y * 0.016) * (prismScale / 0.245);

  float dFront = sdEquilateralTriangle(pt, prismScale);
  float dBack  = sdEquilateralTriangle(pt - depthOff, prismScale * 0.96);

  // Entry point on left slope & exit point on right slope
  vec2 entryPt = rot2(-tilt) * vec2(-prismScale * 0.48, -prismScale * 0.06);
  vec2 exitPt  = rot2(-tilt) * vec2( prismScale * 0.48, -prismScale * 0.03);

  // 2. Orbiting Liquid Iridescent Halo Ring sweeping gracefully around the crystal
  vec2 ringP = rot2(0.28 + sin(t * 0.45) * 0.07) * p2;
  ringP.y *= 2.95;
  float rRing = length(ringP);
  float ringAngle = atan(ringP.y, ringP.x);
  float ringOrbit = 0.5 + 0.5 * sin(ringAngle * 2.0 - t * 2.4);
  float ringDist = abs(rRing - prismScale * 1.48);
  vec3 ringCol = luxurySpectrum(fract(ringAngle / (2.0 * PI) + t * 0.16));
  col += ringCol * exp(-ringDist * 88.0) * (0.20 + 0.72 * ringOrbit) * u_reveal * (0.85 + u_surge * 0.55);

  // 3. Focused Pearlescent Incident Laser Beam with fast traveling light packets
  vec2 beamStart = vec2(-0.98 * aspect, -0.22);
  float dBeam = sdSegment(p2, beamStart, entryPt);
  float beamProg = smoothstep(-0.80 * aspect, entryPt.x, p2.x);
  float revealClip = smoothstep(beamProg - 0.10, beamProg + 0.02, u_reveal * 1.18);
  float beamWave = (fbm(vec2(p2.x * 4.5 - t * 1.45, p2.y * 9.0)) - 0.5) * 0.014 * (1.0 - beamProg * 0.65);
  float dBW = abs(dBeam + beamWave);

  float packet1 = exp(-pow(fract(beamProg * 1.25 - t * 0.78) - 0.5, 2.0) * 32.0);
  float packet2 = exp(-pow(fract(beamProg * 2.10 - t * 1.22 + 0.35) - 0.5, 2.0) * 44.0);
  float incCore = exp(-dBW * 135.0) * (0.30 + 0.70 * beamProg) * (1.0 + packet1 * 1.15 + packet2 * 0.65);
  float incGlow = exp(-dBW * 20.0) * (0.14 + 0.56 * beamProg) * (1.0 + packet1 * 0.65);
  float incMist = exp(-dBW * 5.8) * (0.05 + 0.22 * beamProg);

  vec3 incColor = mix(vec3(0.45, 0.88, 1.0), vec3(0.98, 0.99, 1.0), clamp(incCore, 0.0, 1.0));
  float leftFade = smoothstep(-0.66 * aspect, -0.06 * aspect, uv.x);
  col += incColor * (incCore * 1.35 + incGlow * 0.48 + incMist * 0.20) * mix(0.32, 1.0, leftFade) * revealClip * pulse;

  // 4. Flowing Liquid Volumetric Spectral Dispersion Fan (流光溢彩)
  vec2 dExit = p2 - exitPt;
  float rExit = length(dExit);
  float fanReveal = smoothstep(rExit * 0.82, rExit * 0.82 + 0.22, u_reveal * 1.38);
  float fanMask = smoothstep(-0.03, 0.08, dExit.x) * fanReveal;

  if (fanMask > 0.001) {
    float baseAngle = atan(dExit.y, max(dExit.x, 0.001));
    // Alive silk-aurora curvature sweeping smoothly outward
    float silkCurve = sin(rExit * 3.9 - t * 1.65) * 0.095 * smoothstep(0.0, 0.45, rExit)
                    + cos(rExit * 2.2 - t * 1.05) * 0.048 * rExit
                    + u_pointer.y * 0.16 * rExit;
    float adjAngle = baseAngle - silkCurve;

    float halfSpread = 0.14 + smoothstep(0.0, 0.88, rExit) * 0.44;
    float specCoord = (adjAngle / max(halfSpread, 0.001)) * 0.5 + 0.5;
    float inFan = smoothstep(-0.16, 0.10, specCoord) * smoothstep(1.16, 0.90, specCoord);

    // Multi-octave fluid silk domain warp flowing rapidly outward
    vec2 flowUv = vec2(rExit * 2.7 - t * 1.15, specCoord * 4.6);
    float warp = fbm(flowUv + vec2(0.0, t * 0.42));
    float silkField = fbm(flowUv * vec2(1.5, 2.5) + vec2(warp * 1.5 - t * 0.72, warp * 1.2));
    float filaments = pow(0.5 + 0.5 * sin((specCoord * 18.0 + warp * 4.5 - t * 1.85) * PI * 0.5), 3.4);
    float causticRipples = pow(clamp(silkField, 0.0, 1.0), 1.75);

    // Dual traveling luminous light waves racing through the rainbow silk
    float waveA = exp(-pow(fract(rExit * 0.78 - t * 0.68) - 0.5, 2.0) * 20.0);
    float waveB = exp(-pow(fract(rExit * 1.35 - t * 1.08 + specCoord * 0.3) - 0.5, 2.0) * 30.0);
    float surgeWave = 1.0 + waveA * 0.65 + waveB * 0.42 + u_surge * 0.62;

    float waveT = clamp(specCoord + (warp - 0.5) * 0.24 + sin(t * 0.75 - rExit * 2.0) * 0.06, 0.0, 1.0);
    vec3 specCol = luxurySpectrum(waveT);
    vec3 specShift = luxurySpectrum(clamp(waveT + 0.14, 0.0, 1.0));
    vec3 richSpec = mix(specCol, specShift, silkField * 0.6);

    float distFade = exp(-rExit * 0.72) * (0.50 + 0.50 * smoothstep(0.0, 0.10, rExit));
    float velvetBody = inFan * (0.38 + 0.62 * causticRipples) * distFade;
    float silkThreads = inFan * filaments * (0.45 + 0.55 * silkField) * exp(-rExit * 0.44);
    float auroraCore = exp(-pow((specCoord - 0.5) * 2.4, 2.0)) * inFan * exp(-rExit * 0.52);

    col += richSpec * velvetBody * 1.30 * fanMask * surgeWave * pulse;
    col += mix(richSpec, vec3(0.98, 0.99, 1.0), 0.52) * silkThreads * 0.96 * fanMask * surgeWave;
    col += (richSpec * 0.62 + vec3(0.25, 0.72, 1.0) * 0.26) * auroraCore * 0.50 * fanMask;
  }

  // 5. Crystal-Clear Obsidian Triangular Glass Prism (Dark transparent interior + razor-sharp iridescent edges)
  float outerHalo = exp(-max(dFront, 0.0) * 32.0);
  col += luxurySpectrum(fract(0.55 + pt.y * 1.6 + t * 0.18)) * outerHalo * (0.36 + u_surge * 0.28) * u_reveal * pulse;

  // Rear 3D chamfered crystal facet edge (gives true jewel depth)
  float backEdge = exp(-abs(dBack) * 145.0) * smoothstep(-0.02, 0.005, dFront);
  col += mix(vec3(0.45, 0.85, 1.0), vec3(0.85, 0.48, 1.0), 0.5 + 0.5 * sin(pt.y * 7.0 + t * 1.2)) * backEdge * 0.62 * u_reveal;

  // Connecting 3D crystal corner bevel ridges (top, bottom-left, bottom-right vertices)
  vec2 vTop = vec2(0.0, prismScale * 1.1547);
  vec2 vBL  = vec2(-prismScale, -prismScale * 0.57735);
  vec2 vBR  = vec2( prismScale, -prismScale * 0.57735);
  float ridgeA = exp(-sdSegment(pt, vTop, vTop * 0.96 + depthOff) * 165.0);
  float ridgeB = exp(-sdSegment(pt, vBL,  vBL  * 0.96 + depthOff) * 165.0);
  float ridgeC = exp(-sdSegment(pt, vBR,  vBR  * 0.96 + depthOff) * 165.0);
  col += vec3(0.75, 0.94, 1.0) * (ridgeA + ridgeB + ridgeC) * 0.55 * u_reveal;

  if (dFront < 0.0) {
    // Transparent dark obsidian sapphire glass interior (never opaque grey!)
    float innerDepth = clamp(-dFront / (prismScale * 0.55), 0.0, 1.0);
    float fresnelRim = pow(1.0 - innerDepth, 3.2);

    // Internal refracted rainbow dispersion fan visibly bending from entry to exit inside the glass!
    vec2 pIn = p2 - entryPt;
    vec2 beamAxis = normalize(exitPt - entryPt);
    vec2 beamPerp = vec2(-beamAxis.y, beamAxis.x);
    float along = dot(pIn, beamAxis) / max(length(exitPt - entryPt), 0.001);
    float across = dot(pIn, beamPerp);
    float spreadIn = mix(0.016, 0.088, clamp(along, 0.0, 1.0));
    float internalBand = exp(-pow(across / spreadIn, 2.0)) * smoothstep(-0.08, 0.12, along) * smoothstep(1.12, 0.88, along);
    float internalWave = 0.8 + 0.4 * sin(along * 16.0 - t * 4.2);
    float specInT = clamp((across / (spreadIn * 1.6)) * 0.5 + 0.5, 0.0, 1.0);
    vec3 internalDisp = mix(vec3(0.85, 0.96, 1.0), luxurySpectrum(specInT), smoothstep(0.15, 0.85, along));

    // Subtle internal crystal caustic shimmer
    float caustic = fbm(pt * 14.0 + vec2(t * 0.9, -t * 0.65));
    // Sweeping specular gleam racing diagonally across the glass surface
    float sweepPos = fract(t * 0.28) * 1.8 - 0.9;
    float sheenSweep = exp(-pow((pt.x * 0.8 + pt.y * 0.6 - sweepPos) * 11.0, 2.0)) * 0.42;

    // Preserve dark luxury translucency over background
    vec3 glassTint = mix(vec3(0.02, 0.06, 0.14), vec3(0.06, 0.15, 0.28), caustic * 0.75);
    vec3 glass = col * 0.52 + glassTint * 0.58;
    // Add luminous internal refraction beam
    glass += internalDisp * internalBand * internalWave * 1.35 * u_reveal * pulse;
    // Add iridescent Fresnel inner rim
    vec3 rimCol = luxurySpectrum(fract(0.58 + pt.y * 1.8 + pt.x * 1.2 + t * 0.22));
    glass += rimCol * fresnelRim * (0.72 + u_surge * 0.45);
    // Add diagonal crystal sheen sweep
    glass += vec3(0.85, 0.96, 1.0) * sheenSweep * (0.35 + fresnelRim * 0.85);
    // Internal facet fold line (gives jewel-cut 3D prism geometry)
    float facetFold = exp(-sdSegment(pt, vTop, vec2(0.02 * prismScale, -0.08 * prismScale)) * 130.0)
                    + exp(-sdSegment(pt, vBL,  vec2(0.02 * prismScale, -0.08 * prismScale)) * 130.0)
                    + exp(-sdSegment(pt, vBR,  vec2(0.02 * prismScale, -0.08 * prismScale)) * 130.0);
    glass += vec3(0.70, 0.94, 1.0) * facetFold * 0.28;

    col = glass;
  }

  // Razor-sharp liquid-silver & iridescent front prism bevel outline with traveling edge glint
  float frontEdge = exp(-abs(dFront) * 170.0);
  float edgeAngle = atan(pt.y, pt.x);
  float edgeGlint = pow(0.5 + 0.5 * sin(edgeAngle * 3.0 - t * 2.8), 5.0);
  vec3 edgeColor = mix(vec3(0.68, 0.94, 1.0), luxurySpectrum(fract(edgeAngle / (2.0 * PI) + t * 0.2)), 0.55);
  col += (edgeColor * 0.95 + vec3(1.0) * edgeGlint * 1.35) * frontEdge * u_reveal * pulse;

  // 6. Entry & Exit Focal Caustic Blooms + Sweeping Anamorphic Flare
  float dEntryGlow = length(p2 - entryPt);
  float dExitGlow  = length(p2 - exitPt);
  col += vec3(0.75, 0.96, 1.0) * exp(-dEntryGlow * 24.0) * 0.92 * u_reveal * pulse;
  col += vec3(1.0, 0.88, 0.97) * exp(-dExitGlow * 18.0) * 0.78 * u_reveal * pulse;
  float flareWidth = 3.0 - u_surge * 1.3;
  float anamorphic = exp(-abs(p2.y - exitPt.y) * 90.0) * exp(-abs(p2.x - exitPt.x) * max(flareWidth, 1.2));
  col += mix(vec3(0.55, 0.94, 1.0), vec3(1.0, 0.45, 0.86), smoothstep(-0.18, 0.32, p2.x)) * anamorphic * (0.58 + u_surge * 0.58) * u_reveal;

  // 7. Rising Spectrum-Lit Luminous Bokeh Dust (strictly positive brightness, zero dark specks)
  for (int layer = 0; layer < 2; layer++) {
    float scaleG = layer == 0 ? 9.5 : 16.5;
    vec2 drift = vec2(-t * (layer == 0 ? 0.16 : 0.25), -t * (layer == 0 ? 0.09 : 0.15));
    vec2 gUv = (uv + drift) * scaleG;
    vec2 id = floor(gUv);
    vec2 f = fract(gUv) - 0.5;
    float rnd = hash21(id + float(layer) * 41.3);
    if (rnd > 0.68) {
      vec2 offset = (vec2(hash21(id + 7.1), hash21(id + 19.3)) - 0.5) * 0.62;
      float dMote = length(f - offset);
      float twinkle = 0.35 + 0.65 * (0.5 + 0.5 * sin(t * (2.2 + rnd * 3.6) + rnd * 30.0));
      float size = layer == 0 ? 0.048 : 0.032;
      float mote = smoothstep(size, 0.0, dMote) * twinkle;
      float localSpec = clamp((uv.y - prismPos.y) * 1.15 + 0.5, 0.0, 1.0);
      vec3 moteCol = mix(vec3(0.75, 0.94, 1.0), luxurySpectrum(localSpec), smoothstep(-0.08, 0.38, p2.x));
      col += moteCol * mote * (layer == 0 ? 0.72 : 0.48) * u_reveal;
    }
  }

  // 8. Left-Side Typography Safe Zone + Cinematic Vignette + Subtle Film Grain
  float vignette = smoothstep(1.45, 0.24, length(uv * vec2(0.72, 0.95)));
  col *= mix(0.66, 1.0, vignette);
  float safeVeil = smoothstep(0.02 * aspect, -0.46 * aspect, uv.x);
  col = mix(col, col * 0.50 + vec3(0.010, 0.018, 0.038), safeVeil * 0.66);

  col *= u_intensity;
  col = acesFilm(col * 1.14);

  float grain = (hash21(gl_FragCoord.xy + fract(t) * 100.0) - 0.5) * 0.012;
  col = max(col + grain, 0.0);

  gl_FragColor = vec4(col, 1.0);
}
`

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs)
    if (fs) gl.deleteShader(fs)
    return null
  }
  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    return null
  }
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

/** Fallback 2D renderer if WebGL is unavailable (e.g. headless/software environments). */
function drawFallback2D(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
  driftX: number,
  driftY: number,
  intensity: number
) {
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.translate(driftX, driftY)
  ctx.globalCompositeOperation = 'screen'

  const px = width * 0.7
  const py = height * (0.49 + Math.sin(elapsed * 0.9) * 0.02)
  const size = Math.min(width * 0.16, height * 0.24, 190)

  const bands: Array<[number, string, number]> = [
    [-0.22, 'rgba(255, 56, 130, 0.36)', 0.14],
    [-0.11, 'rgba(255, 174, 72, 0.34)', 0.13],
    [0.0, 'rgba(72, 245, 198, 0.38)', 0.14],
    [0.11, 'rgba(42, 224, 255, 0.40)', 0.14],
    [0.22, 'rgba(186, 88, 255, 0.36)', 0.15],
  ]
  for (const [offset, color, spread] of bands) {
    const grad = ctx.createLinearGradient(px, py, width * 1.05, py + offset * height)
    grad.addColorStop(0, 'rgba(255, 255, 255, 0)')
    grad.addColorStop(0.18, color)
    grad.addColorStop(0.75, color)
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(px + size * 0.12, py)
    ctx.lineTo(width * 1.1, py + (offset - spread) * height)
    ctx.lineTo(width * 1.1, py + (offset + spread) * height)
    ctx.closePath()
    ctx.fill()
  }

  ctx.beginPath()
  ctx.moveTo(px, py - size)
  ctx.lineTo(px - size * 0.78, py + size * 0.56)
  ctx.lineTo(px + size * 0.84, py + size * 0.4)
  ctx.closePath()
  const glass = ctx.createLinearGradient(px - size, py - size, px + size, py + size)
  glass.addColorStop(0, `rgba(180, 236, 255, ${0.24 * intensity})`)
  glass.addColorStop(0.5, `rgba(110, 180, 255, ${0.14 * intensity})`)
  glass.addColorStop(1, `rgba(210, 140, 255, ${0.22 * intensity})`)
  ctx.fillStyle = glass
  ctx.fill()
  ctx.lineWidth = 1.6
  ctx.strokeStyle = 'rgba(220, 248, 255, 0.72)'
  ctx.stroke()

  ctx.restore()
}

/** GSAP-choreographed WebGL optical crystal prism & liquid spectrum atmosphere. */
export function MistAtmosphere({ energyBoost }: { energyBoost: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const hover = useRef({ amount: 0 })

  useEffect(() => {
    const tween = gsap.to(hover.current, {
      amount: energyBoost ? 1 : 0,
      duration: energyBoost ? 0.55 : 0.85,
      ease: energyBoost ? 'expo.out' : 'power3.out',
    })
    return () => { tween.kill() }
  }, [energyBoost])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let canvas = document.createElement('canvas')

    let width = 1
    let height = 1
    let frame = 0
    let previous = 0
    let elapsed = 1.5
    let pointerX = 0
    let pointerY = 0
    let driftX = 0
    let driftY = 0

    // GSAP entrance & periodic iridescent caustic surge timeline
    const rig = { reveal: motion.matches ? 1 : 0, surge: 0 }
    const entranceTween = gsap.to(rig, { reveal: 1, duration: 1.35, ease: 'expo.out', paused: true })
    const pulseTimeline = gsap.timeline({ repeat: -1, delay: 1.6, repeatDelay: 2.2, paused: true })
      .to(rig, { surge: 0.58, duration: 0.55, ease: 'sine.inOut' })
      .to(rig, { surge: 0, duration: 1.25, ease: 'power2.out' })

    let gl: WebGLRenderingContext | null = null
    let program: WebGLProgram | null = null
    let buffer: WebGLBuffer | null = null
    let ctx2d: CanvasRenderingContext2D | null = null
    let uRes: WebGLUniformLocation | null = null
    let uTime: WebGLUniformLocation | null = null
    let uPointer: WebGLUniformLocation | null = null
    let uBpm: WebGLUniformLocation | null = null
    let uIntensity: WebGLUniformLocation | null = null
    let uReveal: WebGLUniformLocation | null = null
    let uSurge: WebGLUniformLocation | null = null
    let uSpin: WebGLUniformLocation | null = null

    try {
      gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      })
      if (gl) {
        program = createProgram(gl)
        if (program) {
          gl.useProgram(program)
          buffer = gl.createBuffer()
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
          const posLoc = gl.getAttribLocation(program, 'a_pos')
          if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc)
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
          }
          uRes = gl.getUniformLocation(program, 'u_res')
          uTime = gl.getUniformLocation(program, 'u_time')
          uPointer = gl.getUniformLocation(program, 'u_pointer')
          uBpm = gl.getUniformLocation(program, 'u_bpm')
          uIntensity = gl.getUniformLocation(program, 'u_intensity')
          uReveal = gl.getUniformLocation(program, 'u_reveal')
          uSurge = gl.getUniformLocation(program, 'u_surge')
          uSpin = gl.getUniformLocation(program, 'u_spin')
        } else {
          gl.getExtension('WEBGL_lose_context')?.loseContext()
          gl = null
        }
      }
    } catch {
      gl = null
    }

    if (!gl) {
      canvas = document.createElement('canvas')
      ctx2d = canvas.getContext('2d', { alpha: true })
    } else {
      canvas.className = 'mist-optics'
    }
    host.append(canvas)

    const draw = () => {
      driftX += (pointerX - driftX) * 0.08
      driftY += (pointerY - driftY) * 0.08
      const intensity = 1.06
      const boost = motion.matches ? 0 : hover.current.amount

      if (gl && program) {
        gl.viewport(0, 0, canvas.width, canvas.height)
        if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height)
        if (uTime) gl.uniform1f(uTime, elapsed)
        if (uPointer) gl.uniform2f(uPointer, driftX, driftY)
        if (uBpm) gl.uniform1f(uBpm, 125)
        if (uIntensity) gl.uniform1f(uIntensity, intensity)
        if (uReveal) gl.uniform1f(uReveal, rig.reveal)
        if (uSurge) gl.uniform1f(uSurge, Math.max(rig.surge, boost * 0.82))
        if (uSpin) gl.uniform1f(uSpin, boost * 0.9)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      } else if (ctx2d) {
        drawFallback2D(ctx2d, width, height, elapsed, driftX * 16, driftY * 10, intensity)
      }
    }

    const tick = (now: number) => {
      const dt = previous ? (now - previous) / 1000 : 0.016
      previous = now
      elapsed += dt
      draw()
      frame = requestAnimationFrame(tick)
    }

    const sync = () => {
      cancelAnimationFrame(frame)
      previous = 0
      const active = !document.hidden && !motion.matches
      host.dataset.active = String(active)
      if (active) {
        entranceTween.resume()
        pulseTimeline.resume()
        frame = requestAnimationFrame(tick)
      } else {
        entranceTween.pause()
        pulseTimeline.pause()
        if (motion.matches) {
          rig.reveal = 1
          rig.surge = 0
          draw()
        }
      }
    }

    const resize = () => {
      const bounds = host.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      const maxDpr = gl ? 1.5 : 1.25
      const ratio = Math.min(window.devicePixelRatio || 1, maxDpr)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio))
      if (ctx2d) ctx2d.setTransform(ratio, 0, 0, ratio, 0, 0)
      draw()
    }

    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const bounds = host.getBoundingClientRect()
      pointerX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / width - 0.5) * 2))
      pointerY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / height - 0.5) * 2))
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    document.addEventListener('visibilitychange', sync)
    motion.addEventListener('change', sync)
    window.addEventListener('pointermove', pointer, { passive: true })

    resize()
    sync()

    return () => {
      entranceTween.kill()
      pulseTimeline.kill()
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
      window.removeEventListener('pointermove', pointer)
      if (gl) {
        if (buffer) gl.deleteBuffer(buffer)
        if (program) gl.deleteProgram(program)
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
      canvas.remove()
    }
  }, [])

  return (
    <div ref={hostRef} className="mist-atmosphere" aria-hidden="true">
      <div className="mist-volume mist-volume-cool" />
      <div className="mist-volume mist-volume-warm" />
      <div className="mist-edge" />
    </div>
  )
}
