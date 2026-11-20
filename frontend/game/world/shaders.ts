import * as THREE from 'three'

/**
 * GTA 6 Vice City x Hotline Miami wet reflective neon boulevard shader.
 * Smooth specular sunset bounce + side-billboard color reflections + animated curb guidance.
 */
export function makeWetBoulevardMaterial(
  primaryHex = 0x28e8ff,
  secondaryHex = 0xff2e88
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPrimary: { value: new THREE.Color(primaryHex) },
      uSecondary: { value: new THREE.Color(secondaryHex) },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uPrimary;
      uniform vec3 uSecondary;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vec3 col = vec3(0.028, 0.036, 0.062);
        // Subtle asphalt micro-shimmer
        float micro = sin(vWorld.x * 14.0 + vWorld.z * 8.0) * cos(vWorld.z * 11.0 - vWorld.x * 5.0) * 0.004;
        col += micro;

        // Clean Vice City lane markings
        float center = smoothstep(0.14, 0.05, abs(abs(vWorld.x) - 0.24));
        col = mix(col, vec3(0.95, 0.72, 0.42), center * 0.52);

        float dash = smoothstep(0.10, 0.04, abs(abs(vWorld.x) - 4.6)) * step(0.55, fract(vWorld.z * 0.055));
        col = mix(col, vec3(0.62, 0.86, 1.0), dash * 0.36);

        // Wet mirror reflections of lateral neon signage & sky
        float puddle = smoothstep(0.1, 0.88, sin(vWorld.x * 0.35 + vWorld.z * 0.05) * cos(vWorld.z * 0.04 - vWorld.x * 0.25));
        float sideGlow = smoothstep(4.0, 14.0, abs(vWorld.x));
        float wave = 0.55 + 0.45 * sin(vWorld.z * 0.06 - uTime * 2.1);
        vec3 bounce = mix(uPrimary, uSecondary, 0.5 + 0.5 * sin(vWorld.z * 0.025 + uTime * 0.4));
        col += bounce * (sideGlow * 0.28 + puddle * wave * 0.16);

        // Flowing forward guidance pulse down center lanes
        float pulse = exp(-abs(fract(vWorld.z * 0.008 - uTime * 0.24) - 0.5) * 24.0);
        col += uPrimary * pulse * 0.09;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
}

/**
 * Times Square dynamic curved holographic megawall shader.
 * Renders vivid animated Hotline Miami / Vice City geometric posters, scanlines & wave bars.
 */
export function makeTimesSquareScreenMaterial(seedOffset = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seedOffset },
    },
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uSeed;
      varying vec2 vUv;

      vec3 palette(float t) {
        vec3 a = vec3(1.00, 0.18, 0.52); // Vice magenta
        vec3 b = vec3(1.00, 0.66, 0.24); // Sunset gold
        vec3 c = vec3(0.14, 0.88, 1.00); // Miami cyan
        vec3 d = vec3(0.62, 0.28, 1.00); // Neon violet
        float x = fract(t) * 4.0;
        if (x < 1.0) return mix(a, b, x);
        if (x < 2.0) return mix(b, c, x - 1.0);
        if (x < 3.0) return mix(c, d, x - 2.0);
        return mix(d, a, x - 3.0);
      }

      void main() {
        vec2 uv = vUv;
        float t = uTime * 0.55 + uSeed * 1.7;

        // Multi-panel video billboard division
        vec2 grid = floor(vec2(uv.x * 3.0, uv.y * 2.0));
        vec2 f = fract(vec2(uv.x * 3.0, uv.y * 2.0));
        float border = smoothstep(0.02, 0.05, f.x) * smoothstep(0.02, 0.05, 1.0 - f.x)
                     * smoothstep(0.02, 0.05, f.y) * smoothstep(0.02, 0.05, 1.0 - f.y);

        float panelId = grid.x + grid.y * 3.0 + uSeed;
        vec3 colA = palette(panelId * 0.23 + t * 0.08);
        vec3 colB = palette(panelId * 0.23 + 0.42 + t * 0.08);

        // Animated synthwave graphic motifs inside each LED screen panel
        float wave = 0.5 + 0.5 * sin(f.x * 10.0 - t * 3.0 + sin(f.y * 6.0 + panelId));
        float sun = smoothstep(0.32, 0.27, length(f - vec2(0.5, 0.55)));
        float bars = smoothstep(0.45, 0.55, sin(f.y * 38.0 - t * 4.0));
        vec3 content = mix(colA * 0.35, colB, wave * 0.72);
        content += mix(colB, vec3(1.0, 0.94, 0.85), 0.4) * sun * (0.4 + 0.6 * bars);

        // Crisp LED pixel scanline sheen
        float scan = 0.88 + 0.12 * sin(uv.y * 240.0);
        vec3 finalCol = content * border * scan * 1.15;
        gl_FragColor = vec4(finalCol, 1.0);
      }
    `,
  })
}

/**
 * Las Vegas 110m Sphere Exosphere Shader.
 * Cycles smoothly across iridescent optical-prism aurora, Vice City sunset pulses & cyber wave rings.
 */
export function makeVegasSphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCombo: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vPos = normalize(position);
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uCombo;
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec2 vUv;

      vec3 spectrum(float t) {
        vec3 c0 = vec3(1.00, 0.16, 0.48);
        vec3 c1 = vec3(1.00, 0.68, 0.22);
        vec3 c2 = vec3(0.22, 0.98, 0.78);
        vec3 c3 = vec3(0.12, 0.86, 1.00);
        vec3 c4 = vec3(0.76, 0.30, 1.00);
        float x = fract(t) * 5.0;
        if (x < 1.0) return mix(c0, c1, x);
        if (x < 2.0) return mix(c1, c2, x - 1.0);
        if (x < 3.0) return mix(c2, c3, x - 2.0);
        if (x < 4.0) return mix(c3, c4, x - 3.0);
        return mix(c4, c0, x - 4.0);
      }

      void main() {
        float t = uTime * (0.42 + uCombo * 0.22);
        float lat = vPos.y;
        float lon = atan(vPos.z, vPos.x);

        // Flowing iridescent aurora ribbons wrapping the 110m sphere
        float swirl = sin(lon * 3.0 - t * 1.4 + sin(lat * 5.0 + t)) * 0.5 + 0.5;
        float bands = sin(lat * 14.0 - t * 2.2 + swirl * 3.0) * 0.5 + 0.5;
        float eqPulse = exp(-abs(lat - sin(lon * 2.0 + t) * 0.18) * 6.5);

        vec3 baseSpec = spectrum(lon / 6.28318 + lat * 0.45 + t * 0.12);
        vec3 accentSpec = spectrum(lat * 0.7 - t * 0.18 + 0.35);

        vec3 col = mix(vec3(0.04, 0.05, 0.12), baseSpec, 0.38 + 0.52 * bands);
        col += accentSpec * eqPulse * 0.88;

        // LED exosphere micro-dot matrix texture
        float ledX = smoothstep(0.15, 0.45, abs(fract(vUv.x * 160.0) - 0.5));
        float ledY = smoothstep(0.15, 0.45, abs(fract(vUv.y * 80.0) - 0.5));
        float ledMask = 0.78 + 0.22 * (1.0 - ledX * ledY);

        gl_FragColor = vec4(col * ledMask * (1.08 + uCombo * 0.25), 1.0);
      }
    `,
  })
}

/**
 * Curved thin-film iridescent glass facade shader for Googleplex Bay View & Apple Park Ring.
 */
export function makeIridescentGlassMaterial(
  tintHex = 0x16324c,
  accentHex = 0x38e8ff
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTint: { value: new THREE.Color(tintHex) },
      uAccent: { value: new THREE.Color(accentHex) },
    },
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uTint;
      uniform vec3 uAccent;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec2 vUv;
      void main() {
        float ndotv = clamp(abs(dot(normalize(vNormal), normalize(vView))), 0.0, 1.0);
        float fresnel = pow(1.0 - ndotv, 2.4);
        // Subtle architectural curtain-wall mullions
        float mullionX = smoothstep(0.94, 0.99, abs(fract(vUv.x * 36.0) - 0.5) * 2.0);
        float mullionY = smoothstep(0.93, 0.99, abs(fract(vUv.y * 6.0) - 0.5) * 2.0);
        float frame = max(mullionX, mullionY);

        // Sunset & thin-film iridescent sky reflection
        vec3 irid = 0.55 + 0.45 * cos(6.28318 * (ndotv * 1.15 + uTime * 0.05 + vec3(0.0, 0.30, 0.62)));
        vec3 col = mix(uTint, uAccent, fresnel * 0.72);
        col += irid * fresnel * 0.42;
        col = mix(col, vec3(0.75, 0.88, 0.98), frame * 0.35);

        gl_FragColor = vec4(col, 0.82);
      }
    `,
  })
}
