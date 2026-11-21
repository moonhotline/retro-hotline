import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

/**
 * Volumetric Golden Sunset Light Shafts (Crepuscular Rays) & Venetian Blind Shadow Pass.
 * Direct architectural port of Max Payne 3: São Paulo Floor 42 render pipeline.
 *
 * Distinctive Visual Principle:
 * The exact same sunset ray projects Venetian blind shadow stripes onto the marble floor,
 * AND forms golden volumetric light shafts in the air. Both effects share the exact same
 * DirectionalLight shadow map and shadow matrix, ensuring that the beams match the floor
 * stripes 1:1 in shape, angle, and timing.
 */

const VolumetricRaymarchShader = {
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    tShadow: { value: null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0.86, 0.34, 0.38).normalize() },
    uSunRad: { value: new THREE.Vector3(1.45, 1.05, 0.58) }, // Golden-hour sunset radiance
    uAmbCol: { value: new THREE.Vector3(0.08, 0.12, 0.18) }, // Cool ambient fill
    uTanHalf: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 1000.0 },
    uMaxDist: { value: 68.0 },
    uSigma: { value: 0.042 },
    uTime: { value: 0.0 },
    uIntensity: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;

    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform sampler2D tShadow;
    uniform mat4 uShadowMatrix;
    uniform mat4 uCamWorld;
    uniform vec3 uCamPos;
    uniform vec3 uSunDir;
    uniform vec3 uSunRad;
    uniform vec3 uAmbCol;
    uniform vec2 uTanHalf;
    uniform float uNear;
    uniform float uFar;
    uniform float uMaxDist;
    uniform float uSigma;
    uniform float uTime;
    uniform float uIntensity;

    const int VOL_STEPS = 28;

    // Interleaved gradient noise for jittering raymarch steps
    float ign(vec2 p) {
      vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
      return fract(magic.z * fract(dot(p, magic.xy)));
    }

    // Dual-lobe Henyey-Greenstein scattering phase function
    float hgPhase(float mu, float g) {
      float g2 = g * g;
      return (1.0 - g2) / (12.5663706 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
    }

    // Queries the sun's shadow map directly
    float sunVisibility(vec3 p) {
      vec4 sc = uShadowMatrix * vec4(p, 1.0);
      vec3 proj = sc.xyz / sc.w;
      if (proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0 || proj.z < 0.0 || proj.z > 1.0) {
        return 1.0;
      }
      float shadowDepth = texture2D(tShadow, proj.xy).r;
      return step(proj.z - 0.0012, shadowDepth);
    }

    // HVAC airborne dust motes & subtle air movement
    float hvacDustSwirl(vec3 p, float t) {
      vec3 q = p * vec3(0.42, 0.85, 0.42) + vec3(t * 0.09, -t * 0.045, t * 0.06);
      float w1 = sin(q.x * 1.7 + sin(q.z * 1.3 + t * 0.12)) * cos(q.y * 1.9 - q.x * 0.7);
      float w2 = sin(q.z * 2.9 - q.y * 1.4 + t * 0.18);
      return 0.82 + 0.28 * (0.65 * w1 + 0.35 * w2);
    }

    void main() {
      vec4 baseColor = texture2D(tColor, vUv);
      float d = texture2D(tDepth, vUv).r;

      // Linearize depth
      float z = (uNear * uFar) / max(uFar - d * (uFar - uNear), 1e-5);
      float surfDist = min(z, uMaxDist);

      vec3 vd = vec3((vUv * 2.0 - 1.0) * uTanHalf, -1.0);
      vec3 rd = normalize(mat3(uCamWorld) * vd);

      float mu = dot(rd, normalize(uSunDir));
      // Dual-lobe Henyey-Greenstein: blazing forward Mie glow + broad architectural side-scatter
      float phase = min(hgPhase(mu, 0.76) * 0.56 + hgPhase(mu, 0.26) * 0.48 + 0.038, 1.35);

      float jitter = ign(gl_FragCoord.xy);
      vec3 accum = vec3(0.0);
      float trans = 1.0;
      float tPrev = 0.0;

      for (int i = 0; i < VOL_STEPS; i++) {
        float f = (float(i) + 1.0) / float(VOL_STEPS);
        float t1 = surfDist * f * (0.40 + 0.60 * f);
        float ds = t1 - tPrev;
        float tMid = tPrev + ds * jitter;
        vec3 p = uCamPos + rd * tMid;

        float sh = sunVisibility(p);
        float dust = hvacDustSwirl(p, uTime);
        float heightFalloff = 0.45 + 0.55 * exp(-max(p.y, 0.0) / 7.5);

        float ext = uSigma * heightFalloff * (1.0 + 0.45 * dust);
        float Ti = exp(-ext * ds);

        float nearBoost = mix(1.65, 0.85, smoothstep(2.0, 45.0, tMid));
        vec3 inScatter = uSunRad * (phase * sh * nearBoost * dust) + uAmbCol * (0.25 + 0.75 * sh);

        accum += trans * inScatter * (1.0 - Ti);
        trans *= Ti;
        tPrev = t1;
      }

      // Additive golden sun shaft inscattering + transmittance
      vec3 result = baseColor.rgb * trans + accum * uIntensity;
      gl_FragColor = vec4(result, baseColor.a);
    }
  `,
}

export class VolumetricSunShaftPass extends Pass {
  private material?: THREE.ShaderMaterial
  private fsQuad?: FullScreenQuad
  private sunLight: THREE.DirectionalLight
  private camera: THREE.PerspectiveCamera

  constructor(camera: THREE.PerspectiveCamera, sunLight: THREE.DirectionalLight) {
    super()
    this.camera = camera
    this.sunLight = sunLight

    try {
      this.material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(VolumetricRaymarchShader.uniforms),
        vertexShader: VolumetricRaymarchShader.vertexShader,
        fragmentShader: VolumetricRaymarchShader.fragmentShader,
      })
      this.fsQuad = new FullScreenQuad(this.material)
    } catch {
      // Headless / jsdom test environment safe fallback
    }
  }

  setIntensity(val: number): void {
    if (this.material && this.material.uniforms['uIntensity']) {
      this.material.uniforms['uIntensity'].value = val
    }
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    if (!this.material || !this.fsQuad || !readBuffer || !readBuffer.texture) return

    const u = this.material.uniforms as Record<string, THREE.IUniform>

    if (u['tColor']) u['tColor'].value = readBuffer.texture
    if (readBuffer.depthTexture && u['tDepth']) {
      u['tDepth'].value = readBuffer.depthTexture
    }

    if (this.sunLight.shadow && this.sunLight.shadow.map) {
      if (u['tShadow']) u['tShadow'].value = this.sunLight.shadow.map.texture
      if (u['uShadowMatrix']) (u['uShadowMatrix'].value as THREE.Matrix4).copy(this.sunLight.shadow.matrix)
    }

    if (u['uCamWorld']) (u['uCamWorld'].value as THREE.Matrix4).copy(this.camera.matrixWorld)
    if (u['uCamPos']) (u['uCamPos'].value as THREE.Vector3).setFromMatrixPosition(this.camera.matrixWorld)

    const sunDir = new THREE.Vector3().copy(this.sunLight.position).sub(this.sunLight.target.position).normalize()
    if (u['uSunDir']) (u['uSunDir'].value as THREE.Vector3).copy(sunDir)

    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5))
    if (u['uTanHalf']) (u['uTanHalf'].value as THREE.Vector2).set(tanHalfFov * this.camera.aspect, tanHalfFov)
    if (u['uNear']) u['uNear'].value = this.camera.near
    if (u['uFar']) u['uFar'].value = this.camera.far
    if (u['uTime']) u['uTime'].value = performance.now() * 0.001

    if (this.renderToScreen) {
      renderer.setRenderTarget(null)
      this.fsQuad.render(renderer)
    } else {
      renderer.setRenderTarget(writeBuffer)
      if (this.clear) renderer.clear()
      this.fsQuad.render(renderer)
    }
  }

  override dispose(): void {
    this.material?.dispose()
    this.fsQuad?.dispose()
  }
}
