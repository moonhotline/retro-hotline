import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

/**
 * GTA 6 Vice City x Hotline Miami x Luxury Synthwave cinema grade pass.
 * Unifies in-game frames with the standby optical prism's tonal curve:
 * warm coral-gold highlights, deep oceanic shadows, micro edge chromatic dispersion,
 * subtle vignette, and fine anti-banding film grain.
 */
export const SynthwaveGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uIntensity: { value: 1.0 },
    uChromatic: { value: 0.0012 },
    uVignette: { value: 0.34 },
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

    float hash(vec2 p) {
      p = fract(p * vec2(234.34, 435.345));
      p += dot(p, p + 34.23);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered, centered);

      // Subtle optical edge dispersion matching the standby crystal prism
      vec2 caOffset = centered * r2 * uChromatic * 4.0 * uIntensity;
      float r = texture2D(tDiffuse, vUv + caOffset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - caOffset).b;
      vec3 col = vec3(r, g, b);

      // Split-tone Vice City sunset grade: cool oceanic midnight shadows, warm rose-gold highlights
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(0.92, 0.98, 1.08);
      vec3 highlightTint = vec3(1.06, 0.97, 1.02);
      vec3 graded = col * mix(shadowTint, highlightTint, smoothstep(0.08, 0.75, luma));

      // Gentle saturation & midtone clarity lift so scenes read vivid and luminous, never muddy
      vec3 gray = vec3(luma);
      graded = mix(gray, graded, 1.12);
      graded = pow(max(graded, 0.0), vec3(0.96));

      col = mix(col, graded, uIntensity);

      // Soft cinematic lens vignette
      float vig = 1.0 - smoothstep(0.18, 0.95, r2 * 1.45) * uVignette * uIntensity;
      col *= vig;

      // Subtle film grain to prevent dark gradient banding
      float grain = (hash(vUv * 820.0 + fract(uTime) * 60.0) - 0.5) * 0.012 * uIntensity;
      col = max(col + grain, 0.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

export function createSynthwaveGradePass(): ShaderPass {
  return new ShaderPass(SynthwaveGradeShader)
}
