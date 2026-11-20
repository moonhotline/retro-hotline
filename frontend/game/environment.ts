import * as THREE from 'three'
import { makeGlowSprite, skyscraperWindowTexture, solidEdgeBox } from './effects'
import { buildZones, type BoostStrip, type HazardSpot, type Wall, type WalkRect, type Zones } from './map'
import type { EnvironmentTheme } from './levels/types'

export type { BoostStrip, HazardSpot, Wall, WalkRect }

export interface Environment {
  update: (elapsed: number) => void
  applyStageTheme?: (config: EnvironmentTheme) => void
  setComboIntensity?: (mult: number) => void
  collidables: THREE.Object3D[]
  walls: Wall[]
  walkRects: WalkRect[]
  pads: Zones['pads']
  boostStrips?: BoostStrip[]
  hazardSpots?: HazardSpot[]
  randomSpawnPoint: (playerPos: THREE.Vector3) => THREE.Vector3
}

/**
 * Neo-Noir Bay Bridge & Silicon Valley world: 3-point atmospheric lighting,
 * exponential bay mist, realistic nocturnal twilight sky & shimmering bay water,
 * wet-asphalt roadway with metallic guardrails, lit-window skyscraper skyline,
 * GPU slanted night rain, sweeping volumetric searchlights, and expressway traffic.
 */

const DECK_HALF_LEN = 300
const TOWER_Z = 140
const CABLE_TOP = 88
const ANCHOR_Z = 308
const CYAN = 0x38e8ff
const ROSE = 0xff4d79
const STEEL_DARK = 0x111a2d
const STEEL_MID = 0x1a2640
const FOG_COLOR = 0x0b1224

function cableY(z: number): number {
  const a = Math.abs(z)
  if (a <= TOWER_Z) {
    const t = a / TOWER_Z
    return CABLE_TOP - 76 * (1 - t * t)
  }
  const span = ANCHOR_Z - TOWER_Z
  const t = THREE.MathUtils.clamp((ANCHOR_Z - a) / span, 0, 1)
  return 2.5 + (CABLE_TOP - 2.5) * Math.pow(t, 1.6)
}

function ghostBox(w: number, h: number, d: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  )
}

function segmentsGeom(pairs: number[], color: number, opacity = 1): THREE.LineSegments {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pairs, 3))
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }))
}

export function buildEnvironment(scene: THREE.Scene): Environment {
  const collidables: THREE.Object3D[] = []
  let seed = 7
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }

  // --- Cinematic 3-Point + Hemisphere Lighting Rig ---
  const hemiLight = new THREE.HemisphereLight(0x7caae0, 0x0b1020, 1.35)
  scene.add(hemiLight)

  const sunsetKey = new THREE.DirectionalLight(0xffb59b, 1.9)
  sunsetKey.position.set(-220, 110, -280)
  scene.add(sunsetKey)

  const cyanRim = new THREE.DirectionalLight(0x38d8ff, 1.05)
  cyanRim.position.set(180, 95, 220)
  scene.add(cyanRim)

  // --- Smooth Exponential Bay Mist ---
  const fog = new THREE.FogExp2(FOG_COLOR, 0.0019)
  scene.fog = fog

  // --- Nocturnal Twilight Bay Sky Dome (cinematic gradient, soft sunset halo, crisp stars) ---
  const domeUniforms = {
    uTime: { value: 0 },
    uSkyTop: { value: new THREE.Color(0x040814) },
    uSkyMid: { value: new THREE.Color(0x0e1a34) },
    uSkyHorizon: { value: new THREE.Color(0x231a3a) },
    uGlowColor: { value: new THREE.Color(0xd94e7a) },
    uSunColor: { value: new THREE.Color(0xffb385) },
    uComboGlow: { value: 0 },
  }
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1450, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: domeUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uSkyTop;
        uniform vec3 uSkyMid;
        uniform vec3 uSkyHorizon;
        uniform vec3 uGlowColor;
        uniform vec3 uSunColor;
        uniform float uComboGlow;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, -0.05);
          // Smooth nocturnal atmospheric twilight gradient
          vec3 col = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.22, h));
          col = mix(col, uSkyTop, smoothstep(0.18, 0.65, h));

          // Soft atmospheric horizon glow
          float glow = exp(-abs(d.y - 0.01) * 11.0);
          col += uGlowColor * glow * (0.42 + uComboGlow * 0.22);

          // Subtle upper-sky aurora sheen
          float aurora = sin(d.x * 4.5 + uTime * 0.25) * cos(d.z * 3.8 - uTime * 0.18);
          float auroraBand = exp(-pow((d.y - 0.30 + aurora * 0.04) * 7.5, 2.0));
          col += mix(vec3(0.10, 0.52, 0.78), uGlowColor, 0.5 + 0.5 * aurora) * auroraBand * (0.10 + uComboGlow * 0.16);

          // Atmospheric glowing twilight sun / moon orb (smooth optical disc, no harsh stripes)
          vec3 sunDir = normalize(vec3(-0.55, 0.095, -0.82));
          float ang = dot(d, sunDir);
          float sunDisc = smoothstep(0.9990, 0.99945, ang);
          float sunHalo = pow(max(0.0, ang), 90.0) * 0.45 + pow(max(0.0, ang), 14.0) * 0.16;
          col += mix(uGlowColor, uSunColor, 0.65) * sunHalo;
          col = mix(col, mix(uSunColor, vec3(1.0, 0.96, 0.92), 0.55), sunDisc * 0.92);

          // Pinpoint realistic stars in upper sky (circular sub-cell dots, never blocky squares)
          float zone = smoothstep(0.14, 0.48, d.y);
          vec2 suv = d.xz / max(d.y, 0.25) * 46.0;
          vec2 cell = floor(suv);
          vec2 fuv = fract(suv) - 0.5;
          float hash = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          vec2 jitter = vec2(fract(hash * 31.7), fract(hash * 71.3)) - 0.5;
          float dStar = length(fuv - jitter * 0.55);
          float starDot = smoothstep(0.085, 0.01, dStar);
          float star = step(0.92, hash) * starDot * zone * (0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * 2.2 + hash * 45.0)));
          col += vec3(0.84, 0.92, 1.0) * star * 0.85;

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  )
  scene.add(dome)

  // --- Shimmering Nocturnal Bay Ocean (realistic animated dark waves & twilight reflections) ---
  const waterUniforms = {
    uTime: { value: 0 },
    uDeepColor: { value: new THREE.Color(0x050b18) },
    uAccentColor: { value: new THREE.Color(0x1f6e96) },
    uStreakColor: { value: new THREE.Color(0xf27d8b) },
    fogColor: { value: fog.color.clone() },
    fogDensity: { value: fog.density },
  }
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(3400, 3400),
    new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      fog: true,
      vertexShader: `
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uDeepColor;
        uniform vec3 uAccentColor;
        uniform vec3 uStreakColor;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        void main() {
          // Layered animated water ripples
          float w1 = sin(vWorld.x * 0.09 + vWorld.z * 0.06 + uTime * 1.15);
          float w2 = cos(vWorld.x * 0.16 - vWorld.z * 0.13 + uTime * 0.85);
          float w3 = sin(vWorld.z * 0.24 + uTime * 1.65) * 0.5;
          float ripple = (w1 + w2 + w3) * 0.33;

          vec3 col = uDeepColor + uAccentColor * (0.08 + 0.08 * smoothstep(-0.2, 0.8, ripple));

          // Soft twilight reflection path across the bay surface
          vec2 sunAz = normalize(vec2(-0.55, -0.82));
          float along = dot(vWorld.xz, sunAz);
          float perp = dot(vWorld.xz, vec2(-sunAz.y, sunAz.x));
          float shimmer = exp(-abs(perp + ripple * 16.0) * 0.011) * smoothstep(35.0, 480.0, along);
          float glints = pow(max(0.0, 0.5 + 0.5 * sin(vWorld.z * 0.42 + vWorld.x * 0.22 + uTime * 2.2)), 6.0);
          col += uStreakColor * shimmer * (0.34 + glints * 0.95);

          // Subtle reflection of the Bay Bridge lights right under the span
          float underBridge = exp(-abs(vWorld.x) * 0.055) * smoothstep(360.0, 40.0, abs(vWorld.z));
          col += uAccentColor * underBridge * (0.22 + glints * 0.38);

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    })
  )
  water.rotation.x = -Math.PI / 2
  water.position.y = -14
  scene.add(water)
  collidables.push(water)

  // --- Bridge Deck: collision proxy + sculpted wet-asphalt road + steel substructure ---
  const deckGhost = ghostBox(14, 1.2, DECK_HALF_LEN * 2)
  collidables.push(deckGhost)
  scene.add(deckGhost)

  // Solid steel underside slab so the bridge reads as real infrastructure
  const deckSlab = new THREE.Mesh(
    new THREE.BoxGeometry(14.4, 1.15, DECK_HALF_LEN * 2),
    new THREE.MeshStandardMaterial({ color: STEEL_DARK, metalness: 0.62, roughness: 0.55 })
  )
  deckSlab.position.y = -0.02
  scene.add(deckSlab)

  const roadUniforms = {
    uTime: { value: 0 },
    uRain: { value: 0.25 },
    uPrimary: { value: new THREE.Color(CYAN) },
    uSecondary: { value: new THREE.Color(ROSE) },
    uComboGlow: { value: 0 },
  }
  const deckRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(13.6, DECK_HALF_LEN * 2),
    new THREE.ShaderMaterial({
      uniforms: roadUniforms,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform float uRain;
        uniform vec3 uPrimary;
        uniform vec3 uSecondary;
        uniform float uComboGlow;
        varying vec3 vWorld;
        void main() {
          // Smooth wet dark asphalt surface (no blocky pixel tiling)
          float micro = sin(vWorld.x * 17.3 + vWorld.z * 9.1) * cos(vWorld.z * 13.7 - vWorld.x * 6.4) * 0.004;
          vec3 col = vec3(0.032, 0.042, 0.068) + micro;

          // Clean painted center double line & subtle lane dashes
          float centerDouble = smoothstep(0.09, 0.04, abs(abs(vWorld.x) - 0.18));
          col = mix(col, vec3(0.75, 0.62, 0.36), centerDouble * 0.55);

          float laneDash = smoothstep(0.08, 0.03, abs(abs(vWorld.x) - 3.5)) * step(0.55, fract(vWorld.z * 0.065));
          col = mix(col, vec3(0.55, 0.72, 0.85), laneDash * 0.38);

          // Recessed subtle architectural LED curb bounce
          float curbGlow = smoothstep(4.8, 6.75, abs(vWorld.x));
          col += uPrimary * curbGlow * 0.22;

          // Wet-asphalt specular reflections scaled by rain
          float puddle = sin(vWorld.x * 0.8 + vWorld.z * 0.12) * cos(vWorld.z * 0.08 - vWorld.x * 0.5);
          float wet = smoothstep(0.12, 0.86, puddle) * (0.28 + uRain * 0.72);
          float shimmer = 0.6 + 0.4 * sin(vWorld.z * 0.14 - uTime * (1.8 + uComboGlow * 1.6));
          col += mix(uPrimary, uSecondary, 0.5 + 0.5 * sin(vWorld.z * 0.02 + uTime * 0.25)) * wet * shimmer * 0.14;

          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  )
  deckRoad.rotation.x = -Math.PI / 2
  deckRoad.position.y = 0.605
  scene.add(deckRoad)

  // Sleek metallic guardrails + thin recessed cyan deck LED strips (clean, zero wireframe clutter)
  {
    const railMetal = new THREE.MeshStandardMaterial({ color: STEEL_MID, metalness: 0.75, roughness: 0.38 })
    const ledMat = new THREE.MeshBasicMaterial({ color: CYAN })
    for (const x of [-6.95, 6.95]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.52, DECK_HALF_LEN * 2), railMetal)
      curb.position.set(x, 0.86, 0)
      scene.add(curb)

      const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, DECK_HALF_LEN * 2), railMetal)
      topBar.position.set(x, 1.62, 0)
      scene.add(topBar)

      const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, DECK_HALF_LEN * 2), ledMat)
      ledStrip.position.set(x > 0 ? x - 0.17 : x + 0.17, 0.92, 0)
      scene.add(ledStrip)
    }

    const postPairs: number[] = []
    for (let z = -290; z <= 290; z += 14) {
      for (const x of [-6.95, 6.95]) {
        postPairs.push(x, 0.9, z, x, 1.62, z)
      }
    }
    scene.add(segmentsGeom(postPairs, 0x3b5878, 0.75))
  }

  // --- Sculpted Steel Suspension Towers + Recessed Architectural Lighting + Searchlights ---
  const searchlights: Array<{ mesh: THREE.Mesh; baseRot: number; speed: number }> = []
  const towerMetal = new THREE.MeshStandardMaterial({ color: STEEL_MID, metalness: 0.74, roughness: 0.36 })
  const towerAccentMat = new THREE.MeshBasicMaterial({ color: CYAN })
  for (const tz of [-TOWER_Z, TOWER_Z]) {
    for (const x of [-6.2, 6.2]) {
      const ghost = ghostBox(1.8, 92, 1.8)
      ghost.position.set(x, 46, tz)
      scene.add(ghost)
      collidables.push(ghost)
    }

    const g = new THREE.Group()
    for (const x of [-6.2, 6.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.9, 92, 2.2), towerMetal)
      leg.position.set(x, 46, 0)
      g.add(leg)
      // Thin vertical architectural LED strip along inner tower column
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 84, 0.16), towerAccentMat)
      strip.position.set(x > 0 ? x - 0.98 : x + 0.98, 45, 0)
      g.add(strip)
    }
    const levels = [10, 25, 40, 56, 72, 86]
    for (const y of levels) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(13.2, 1.5, 1.6), towerMetal)
      strut.position.set(0, y, 0)
      g.add(strut)
    }
    const bracePairs: number[] = []
    for (let i = 1; i < levels.length; i++) {
      const y0 = levels[i - 1] as number
      const y1 = levels[i] as number
      bracePairs.push(-6, y0, 0, 6, y1, 0)
      bracePairs.push(6, y0, 0, -6, y1, 0)
    }
    g.add(segmentsGeom(bracePairs, 0x3b5c82, 0.65))

    const beacon = makeGlowSprite(0xff4264, 5.5, 0.85)
    beacon.position.set(0, 92.8, 0)
    g.add(beacon)

    // Soft atmospheric volumetric searchlight cone
    const coneGeo = new THREE.ConeGeometry(18, 185, 18, 1, true)
    coneGeo.translate(0, -92.5, 0)
    const coneMat = new THREE.MeshBasicMaterial({
      color: tz > 0 ? CYAN : ROSE,
      transparent: true,
      opacity: 0.036,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const cone = new THREE.Mesh(coneGeo, coneMat)
    cone.position.set(0, 91, 0)
    cone.rotation.x = Math.PI * 0.72
    g.add(cone)
    searchlights.push({ mesh: cone, baseRot: tz > 0 ? 0.5 : -0.6, speed: tz > 0 ? 0.22 : -0.17 })

    g.position.z = tz
    scene.add(g)
  }

  // --- Suspension Cables & Vertical Suspenders ---
  {
    const cableMat = new THREE.LineBasicMaterial({ color: 0x62b4d9, transparent: true, opacity: 0.82 })
    for (const x of [-6.2, 6.2]) {
      const pts: THREE.Vector3[] = []
      for (let z = -ANCHOR_Z; z <= ANCHOR_Z; z += 4) {
        pts.push(new THREE.Vector3(x, cableY(z), z))
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat))
    }
    const suspPairs: number[] = []
    for (let z = -294; z <= 294; z += 14) {
      if (Math.abs(Math.abs(z) - TOWER_Z) < 10) continue
      const y = cableY(z)
      for (const x of [-6.2, 6.2]) {
        suspPairs.push(x, y, z, x, 1.2, z)
      }
    }
    scene.add(segmentsGeom(suspPairs, 0x3b6c8c, 0.48))
    for (const z of [-ANCHOR_Z, ANCHOR_Z]) {
      const anchor = solidEdgeBox(16, 4.2, 7.5, CYAN, 0.25, STEEL_DARK)
      anchor.position.set(0, 0.5, z)
      scene.add(anchor)
    }
  }

  // --- High-Speed Expressway Traffic Lightbar Streams ---
  const trafficGroup = new THREE.Group()
  interface TrafficRunner {
    mesh: THREE.Mesh
    speed: number
    dir: number
    zMin: number
    zMax: number
  }
  const trafficRunners: TrafficRunner[] = []
  {
    const barGeo = new THREE.BoxGeometry(0.38, 0.22, 6.8)
    const cyanMat = new THREE.MeshBasicMaterial({ color: 0x70ecff, transparent: true, opacity: 0.78 })
    const roseMat = new THREE.MeshBasicMaterial({ color: 0xff5a7a, transparent: true, opacity: 0.78 })
    const amberMat = new THREE.MeshBasicMaterial({ color: 0xffc470, transparent: true, opacity: 0.72 })
    for (let i = 0; i < 32; i++) {
      const side = i % 2 === 0 ? -1 : 1
      const tier = i % 3
      const x = side * (18 + tier * 14 + rand() * 6)
      const y = tier === 0 ? -3.2 : tier === 1 ? 14 + rand() * 8 : 28 + rand() * 14
      const dir = side > 0 ? -1 : 1
      const mat = tier === 2 ? amberMat : dir > 0 ? cyanMat : roseMat
      const mesh = new THREE.Mesh(barGeo, mat)
      mesh.position.set(x, y, -360 + rand() * 780)
      trafficGroup.add(mesh)
      trafficRunners.push({ mesh, speed: 46 + rand() * 54, dir, zMin: -380, zMax: 440 })
    }
    scene.add(trafficGroup)
  }

  // --- GPU-driven Soft Night Rain ---
  const rainUniforms = {
    uTime: { value: 0 },
    uRainOpacity: { value: 0.18 },
    uRainColor: { value: new THREE.Color(0x9ce8ff) },
  }
  {
    const dropCount = 460
    const positions = new Float32Array(dropCount * 2 * 3)
    const phases = new Float32Array(dropCount * 2)
    for (let i = 0; i < dropCount; i++) {
      const x = (rand() - 0.5) * 140
      const y = rand() * 68
      const z = -340 + rand() * 980
      const phase = rand()
      const idx = i * 6
      positions[idx] = x
      positions[idx + 1] = y
      positions[idx + 2] = z
      positions[idx + 3] = x + 0.16
      positions[idx + 4] = y - 2.1
      positions[idx + 5] = z + 0.08
      phases[i * 2] = phase
      phases[i * 2 + 1] = phase
    }
    const rainGeo = new THREE.BufferGeometry()
    rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    rainGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    const rainMat = new THREE.ShaderMaterial({
      uniforms: rainUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aPhase;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float fall = fract(aPhase + uTime * 0.56);
          p.y = mod(p.y - fall * 68.0, 68.0) - 2.0;
          vAlpha = smoothstep(0.0, 0.14, p.y / 68.0) * smoothstep(1.0, 0.84, p.y / 68.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uRainOpacity;
        uniform vec3 uRainColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uRainColor, vAlpha * uRainOpacity);
        }`,
    })
    const rain = new THREE.LineSegments(rainGeo, rainMat)
    rain.frustumCulled = false
    scene.add(rain)
  }

  // --- Sculpted Dark Coastal Hills Flanking the Bay (solid atmospheric silhouettes) ---
  {
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x0c1426,
      roughness: 0.92,
      metalness: 0.08,
      flatShading: true,
    })
    for (const side of [-1, 1] as const) {
      const geo = new THREE.PlaneGeometry(340, 1440, 12, 28)
      geo.rotateX(-Math.PI / 2)
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < posAttr.count; i++) {
        const lx = posAttr.getX(i)
        const lz = posAttr.getZ(i)
        const distFromWater = Math.max(0, (side > 0 ? lx : -lx) + 170)
        const ridge = 36 * Math.abs(Math.sin(lz * 0.008 + distFromWater * 0.015)) + 16 * Math.abs(Math.cos(lz * 0.022 + 1.4))
        const taper = Math.min(1, distFromWater / 110) * Math.exp(-distFromWater / 420)
        posAttr.setY(i, -15 + (ridge + 18) * taper)
      }
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, hillMat)
      mesh.position.set(side * 250, 0, 0)
      scene.add(mesh)
    }
  }

  // --- Distant Lit-Window San Francisco Skyline (real glass towers in bay mist) ---
  {
    const winTex = skyscraperWindowTexture()
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x162238,
      map: winTex,
      emissive: 0xffffff,
      emissiveMap: winTex,
      emissiveIntensity: 0.62,
      roughness: 0.35,
      metalness: 0.72,
    })
    for (let i = 0; i < 30; i++) {
      const w = 16 + rand() * 24
      const h = 32 + rand() * 110
      const d = 16 + rand() * 22
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat)
      b.position.set(-290 - rand() * 210, h / 2 - 16, -420 + i * 32 + rand() * 18)
      scene.add(b)
      if (h > 85) {
        const beacon = makeGlowSprite(i % 2 === 0 ? 0xff4d79 : 0x56e4ff, 5, 0.58)
        beacon.position.set(b.position.x, h - 15, b.position.z)
        scene.add(beacon)
      }
    }
    // Signature Salesforce-style tapered spire on the west skyline
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(8, 16, 155, 8), buildingMat)
    spire.position.set(-370, 62, -65)
    scene.add(spire)
    const spireCrown = makeGlowSprite(0x56e4ff, 14, 0.65)
    spireCrown.position.set(-370, 140, -65)
    scene.add(spireCrown)
  }

  // --- Multi-zone map (plaza, arcade, pool courtyard, warehouse roof, Silicon Valley vault) ---
  const zones: Zones = buildZones(scene, collidables)
  let lastElapsed = 0

  return {
    update(elapsed: number) {
      const dt = Math.min(Math.max(elapsed - lastElapsed, 0), 0.1)
      lastElapsed = elapsed
      domeUniforms.uTime.value = elapsed
      waterUniforms.uTime.value = elapsed
      roadUniforms.uTime.value = elapsed
      rainUniforms.uTime.value = elapsed
      for (const s of searchlights) {
        s.mesh.rotation.z = s.baseRot + Math.sin(elapsed * s.speed) * 0.42
      }
      if (trafficGroup.visible && dt > 0) {
        for (const r of trafficRunners) {
          r.mesh.position.z += r.dir * r.speed * dt
          if (r.dir > 0 && r.mesh.position.z > r.zMax) r.mesh.position.z = r.zMin
          else if (r.dir < 0 && r.mesh.position.z < r.zMin) r.mesh.position.z = r.zMax
        }
      }
      zones.update(elapsed)
    },
    applyStageTheme(config: EnvironmentTheme) {
      // Blend chapter palette cleanly into the neo-noir nocturnal lighting rig
      fog.color.setHex(config.fogColor).lerp(new THREE.Color(FOG_COLOR), 0.45)
      fog.density = THREE.MathUtils.clamp(config.fogDensity * 1.05, 0.0014, 0.0032)
      waterUniforms.fogColor.value.copy(fog.color)
      waterUniforms.fogDensity.value = fog.density
      domeUniforms.uSkyTop.value.setHex(config.groundColor).lerp(new THREE.Color(0x040814), 0.5)
      domeUniforms.uSkyHorizon.value.setHex(config.skyColor).lerp(new THREE.Color(0x1f1936), 0.4)
      domeUniforms.uGlowColor.value.setHex(config.neonSecondary)
      domeUniforms.uSunColor.value.setHex(config.neonPrimary).lerp(new THREE.Color(0xffc99e), 0.55)
      waterUniforms.uAccentColor.value.setHex(config.neonPrimary).lerp(new THREE.Color(0x1f6e96), 0.55)
      waterUniforms.uStreakColor.value.setHex(config.neonSecondary).lerp(new THREE.Color(0xff9b85), 0.45)
      roadUniforms.uPrimary.value.setHex(config.neonPrimary)
      roadUniforms.uSecondary.value.setHex(config.neonSecondary)
      roadUniforms.uRain.value = THREE.MathUtils.clamp(config.rainIntensity, 0, 1)
      rainUniforms.uRainOpacity.value = THREE.MathUtils.clamp(config.rainIntensity * 0.48, 0.05, 0.45)
      rainUniforms.uRainColor.value.setHex(config.neonPrimary).lerp(new THREE.Color(0xbceeff), 0.5)
      trafficGroup.visible = config.trafficLanes
    },
    setComboIntensity(mult: number) {
      const k = THREE.MathUtils.clamp((mult - 1) / 4, 0, 1)
      domeUniforms.uComboGlow.value = k
      roadUniforms.uComboGlow.value = k
    },
    collidables,
    walls: zones.walls,
    walkRects: zones.walkRects,
    pads: zones.pads,
    boostStrips: zones.boostStrips,
    hazardSpots: zones.hazardSpots,
    randomSpawnPoint: zones.randomSpawnPoint,
  }
}
