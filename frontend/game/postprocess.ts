import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

/**
 * Max Payne 3 São Paulo Floor 42 Cinematic Grade Shader.
 *
 * Implements the signature high-end corporate noir grade:
 * - Half-float HDR preserving extreme luminance contrast between golden sunbeam stripes and dark obsidian marble.
 * - ACES tonemapping with warm sunset highlights (gold/amber) and cold shadow split-toning (cyan/slate).
 * - Subtle anamorphic edge chromatic dispersion.
 * - Highlights-aware bloom integration with cinematic lens vignette and fine film grain.
 */
export const SaoPauloGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uIntensity: { value: 1.0 },
    uChromatic: { value: 0.0012 },
    uVignette: { value: 0.32 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uChromatic;
    uniform float uVignette;
    varying vec2 vUv;

    // High quality float hash for fine film grain
    float hash(vec2 p) {
      p = fract(p * vec2(234.34, 435.345));
      p += dot(p, p + 34.23);
      return fract(p.x * p.y);
    }

    // ACES Film tone curve approximation
    vec3 ACESFilm(vec3 x) {
      float a = 2.51;
      float b = 0.03;
      float c = 2.43;
      float d = 0.59;
      float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered, centered);

      // Subtle optical lens edge dispersion (chromatic aberration)
      vec2 caOffset = centered * r2 * uChromatic * 3.8 * uIntensity;
      float r = texture2D(tDiffuse, vUv + caOffset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - caOffset).b;
      vec3 col = vec3(r, g, b);

      // Luminance
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));

      // São Paulo Split-Toning:
      // Shadows: cool cyan-slate obsidian (#0d131f)
      // Highlights: warm golden sunset amber (#ffd285)
      vec3 shadowTint = vec3(0.88, 0.94, 1.06);
      vec3 highlightTint = vec3(1.10, 0.98, 0.88);
      vec3 graded = col * mix(shadowTint, highlightTint, smoothstep(0.06, 0.72, luma));

      // Tone curve compression
      graded = ACESFilm(graded * 1.08);

      // Rich contrast curve
      graded = pow(max(graded, 0.0), vec3(0.96));

      col = mix(col, graded, uIntensity);

      // Soft cinematic lens vignette
      float vig = 1.0 - smoothstep(0.16, 0.92, r2 * 1.35) * uVignette * uIntensity;
      col *= vig;

      // Fine procedural film grain
      float grain = (hash(vUv * 820.0 + fract(uTime) * 60.0) - 0.5) * 0.010 * uIntensity;
      col = max(col + grain, 0.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

export function createSynthwaveGradePass(): ShaderPass {
  return new ShaderPass(SaoPauloGradeShader)
}
