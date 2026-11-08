import * as THREE from 'three'
import { edgeBox, makeGlowSprite } from './effects'
import { buildZones, type Wall, type WalkRect, type Zones } from './map'

export type { Wall, WalkRect }

export interface Environment {
  update: (elapsed: number) => void
  collidables: THREE.Object3D[]
  walls: Wall[]
  walkRects: WalkRect[]
  pads: Zones['pads']
  randomSpawnPoint: (playerPos: THREE.Vector3) => THREE.Vector3
}

/**
 * Miami-nights Bay Bridge world: gradient sky with a scanline sun, a glowing
 * grid ocean, the bridge as neon lines, plus the multi-zone map (plaza,
 * arcade, pool courtyard, warehouse rooftop). Line art only — no solid
 * polygon meshes in view, no SVG.
 */

const DECK_HALF_LEN = 300
const TOWER_Z = 140
const CABLE_TOP = 88
const ANCHOR_Z = 308
const MAGENTA = 0xff2975
const CYAN = 0x00f0ff
const VIOLET = 0x9a2be2
const ORANGE = 0xff9f1c
const FOG_COLOR = 0x16042e

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

/** Ghost collision box: renders nothing but is raycastable. */
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

  // --- Fog (fades distant neon lines into the horizon) ---
  const fog = new THREE.Fog(FOG_COLOR, 140, 950)
  scene.fog = fog

  // --- Sky dome: purple gradient, scanline sun, stars ---
  const domeUniforms = { uTime: { value: 0 } }
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 24, 16),
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
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(vec3(0.16, 0.02, 0.18), vec3(0.02, 0.0, 0.06), smoothstep(0.0, 0.6, h));
          // magenta horizon glow
          float glow = exp(-abs(h) * 16.0);
          col += vec3(0.9, 0.12, 0.5) * glow * 0.85;
          // the sun
          vec3 sunDir = normalize(vec3(-0.55, 0.085, -0.82));
          float ang = dot(d, sunDir);
          float sun = smoothstep(0.99865, 0.99935, ang);
          float halo = smoothstep(0.9955, 0.99865, ang) * 0.3;
          float sunT = clamp(h * 7.0 + 0.35, 0.0, 1.0);
          vec3 sunCol = mix(vec3(1.0, 0.15, 0.55), vec3(1.0, 0.85, 0.28), sunT);
          float below = clamp((0.06 - h) * 14.0, 0.0, 1.0);
          float slit = step(0.45, 0.5 + 0.5 * sin(h * 300.0 - uTime * 2.0));
          float sunVis = mix(1.0, slit, below);
          col = mix(col, sunCol, sun * sunVis);
          col += sunCol * halo * sunVis;
          // stars in the upper sky
          float zone = smoothstep(0.12, 0.45, h);
          vec2 suv = d.xz / max(d.y, 0.25) * 60.0;
          vec2 cell = floor(suv);
          float hash = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float star = step(0.985, hash) * zone * (0.4 + 0.6 * abs(sin(uTime * 2.5 + hash * 40.0)));
          col += vec3(0.75, 0.85, 1.0) * star * 0.8;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  )
  scene.add(dome)

  // --- Ocean: glowing grid with the sun's reflection streak ---
  const waterUniforms = {
    uTime: { value: 0 },
    fogColor: { value: fog.color.clone() },
    fogNear: { value: fog.near },
    fogFar: { value: fog.far },
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
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        void main() {
          vec3 col = vec3(0.02, 0.0, 0.05);
          vec2 coord = vWorld.xz / 40.0;
          vec2 gw = fwidth(coord);
          vec2 gg = abs(fract(coord - 0.5) - 0.5) / gw;
          float line = 1.0 - min(min(gg.x, gg.y), 1.0);
          float grid = line * smoothstep(900.0, 300.0, length(vWorld.xz));
          col += vec3(0.0, 0.65, 0.85) * grid * 0.6;
          vec2 sunAz = normalize(vec2(-0.55, -0.82));
          float along = dot(vWorld.xz, sunAz);
          float perp = dot(vWorld.xz, vec2(-sunAz.y, sunAz.x));
          float wob = sin(vWorld.z * 0.15 + uTime * 2.5) * 3.0 + sin(vWorld.x * 0.2 + uTime * 1.8) * 2.0;
          float streak = exp(-abs(perp + wob) * 0.012) * smoothstep(40.0, 420.0, along);
          col += vec3(1.0, 0.3, 0.5) * streak * (0.25 + grid * 1.2);
          col += vec3(1.0, 0.6, 0.2) * streak * 0.2;
          float wave = pow(max(0.0, sin(vWorld.z * 0.08 + uTime * 1.5)), 6.0);
          col += vec3(0.1, 0.4, 0.6) * wave * grid * 0.4;
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

  // --- Bridge deck ---
  const deckGhost = ghostBox(14, 1.2, DECK_HALF_LEN * 2)
  collidables.push(deckGhost)
  scene.add(deckGhost)
  const deckEdges = edgeBox(14, 1.2, DECK_HALF_LEN * 2, MAGENTA)
  scene.add(deckEdges)

  // Center line + lane dashes
  {
    const pairs: number[] = []
    for (const x of [-0.28, 0.28]) {
      pairs.push(x, 0.62, -298, x, 0.62, 298)
    }
    const center = segmentsGeom(pairs, MAGENTA)
    scene.add(center)

    const dashPairs: number[] = []
    for (let z = -294; z <= 294; z += 18) {
      for (const x of [-3.4, 3.4]) {
        dashPairs.push(x, 0.62, z - 1.3, x, 0.62, z + 1.3)
      }
    }
    scene.add(segmentsGeom(dashPairs, CYAN, 0.9))
  }

  // Railings
  {
    const postPairs: number[] = []
    for (let z = -295; z <= 295; z += 10) {
      for (const x of [-6.9, 6.9]) {
        postPairs.push(x, 0.62, z, x, 1.9, z)
      }
    }
    scene.add(segmentsGeom(postPairs, CYAN, 0.8))

    const railPairs: number[] = []
    for (const x of [-6.9, 6.9]) {
      for (const y of [1.1, 1.72]) {
        railPairs.push(x, y, -300, x, y, 300)
      }
    }
    scene.add(segmentsGeom(railPairs, VIOLET))
  }

  // --- Towers ---
  for (const tz of [-TOWER_Z, TOWER_Z]) {
    for (const x of [-6, 6]) {
      const ghost = ghostBox(1.7, 92, 1.7)
      ghost.position.set(x, 46, tz)
      scene.add(ghost)
      collidables.push(ghost)
    }

    const g = new THREE.Group()
    for (const x of [-6, 6]) {
      const leg = edgeBox(1.7, 92, 1.7, CYAN)
      leg.position.set(x, 46, 0)
      g.add(leg)
    }
    const levels = [8, 21, 34, 47, 60, 73, 86]
    for (const y of levels) {
      const strut = edgeBox(13, 1.3, 1.3, MAGENTA)
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
    g.add(segmentsGeom(bracePairs, VIOLET))
    const beacon = makeGlowSprite(0xff3355, 4, 0.7)
    beacon.position.set(0, 92.5, 0)
    g.add(beacon)
    g.position.z = tz
    scene.add(g)
  }

  // --- Cables + suspenders ---
  {
    const cableMat = new THREE.LineBasicMaterial({ color: MAGENTA })
    for (const x of [-6, 6]) {
      const pts: THREE.Vector3[] = []
      for (let z = -ANCHOR_Z; z <= ANCHOR_Z; z += 4) {
        pts.push(new THREE.Vector3(x, cableY(z), z))
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat))
    }
    const suspPairs: number[] = []
    for (let z = -296; z <= 296; z += 12) {
      if (Math.abs(Math.abs(z) - TOWER_Z) < 10) continue
      const y = cableY(z)
      for (const x of [-6, 6]) {
        suspPairs.push(x, y, z, x, 0.9, z)
      }
    }
    scene.add(segmentsGeom(suspPairs, CYAN, 0.7))
    for (const z of [-ANCHOR_Z, ANCHOR_Z]) {
      const anchor = edgeBox(16, 4, 7, VIOLET)
      anchor.position.set(0, 0.4, z)
      scene.add(anchor)
    }
  }

  // --- Wireframe mountain terrain flanking the bridge ---
  for (const side of [-1, 1] as const) {
    const height = (x0: number, z: number): number => {
      const d = x0
      const ridge = 30 * Math.abs(Math.sin(z * 0.009 + d * 0.02)) + 14 * Math.abs(Math.sin(z * 0.031 + 1.7))
      const taper = Math.min(1, d / 90) * Math.exp(-d / 380)
      return -14 + (ridge + 20) * taper
    }
    const pairs: number[] = []
    const cols: number[] = []
    for (let x = 60; x <= 380; x += 32) cols.push(x)
    const zs: number[] = []
    for (let z = -720; z <= 720; z += 48) zs.push(z)
    for (const x of cols) {
      for (let i = 0; i < zs.length - 1; i++) {
        const z0 = zs[i] as number
        const z1 = zs[i + 1] as number
        pairs.push(side * x, height(x, z0), z0, side * x, height(x, z1), z1)
      }
    }
    for (const z of zs) {
      for (let i = 0; i < cols.length - 1; i++) {
        const x0 = cols[i] as number
        const x1 = cols[i + 1] as number
        pairs.push(side * x0, height(x0, z), z, side * x1, height(x1, z), z)
      }
    }
    const terrain = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pairs, 3)),
      new THREE.LineBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.8 })
    )
    scene.add(terrain)
  }

  // --- Distant neon skyline (west, toward the sun) ---
  {
    for (let i = 0; i < 24; i++) {
      const h = 18 + rand() * 75
      const b = edgeBox(14 + rand() * 22, h, 14 + rand() * 18, i % 3 === 0 ? ORANGE : MAGENTA, 0.7)
      b.position.set(-330 - rand() * 180, h / 2 - 16, -380 + i * 30 + rand() * 18)
      scene.add(b)
      if (rand() > 0.6) {
        const glow = makeGlowSprite(0xff2975, 4, 0.5)
        glow.position.copy(b.position)
        glow.position.y = h - 16
        scene.add(glow)
      }
    }
    const tower = edgeBox(22, 110, 22, MAGENTA, 0.8)
    tower.position.set(-400, 39, -60)
    scene.add(tower)
  }

  // --- Multi-zone map (plaza, arcade, pool courtyard, warehouse roof) ---
  const zones: Zones = buildZones(scene, collidables)

  return {
    update(elapsed: number) {
      domeUniforms.uTime.value = elapsed
      waterUniforms.uTime.value = elapsed
      zones.update(elapsed)
    },
    collidables,
    walls: zones.walls,
    walkRects: zones.walkRects,
    pads: zones.pads,
    randomSpawnPoint: zones.randomSpawnPoint,
  }
}
