import * as THREE from 'three'
import type { DroneType, PickupKind, WeaponId } from './types'
import { buildIndustrialPulseRifle } from './models/pulseRifle'
import { buildLoftedSurface, superellipseRing } from './models/geometry'

/**
 * All visuals are raster glow sprites + pure line primitives
 * (circles / rectangles / segments) — no solid polygon meshes, no SVG.
 */

let glowTex: THREE.CanvasTexture | null = null

function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d')
  if (!ctx) {
    // No 2D canvas (headless/test env): fall back to an untextured sprite
    glowTex = new THREE.CanvasTexture(c)
    return glowTex
  }
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  glowTex = new THREE.CanvasTexture(c)
  return glowTex
}

export function makeGlowSprite(color: number, scale: number, opacity = 0.9): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const s = new THREE.Sprite(mat)
  s.scale.set(scale, scale, 1)
  return s
}

/** Circle/regular-polygon outline as a LineLoop — the "vector arcade" primitive. */
export function circleLine(r: number, color: number, seg = 40, opacity = 1): THREE.LineLoop {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0))
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  return new THREE.LineLoop(geo, mat)
}

/** Outline box (rectangle edges only). */
export function edgeBox(
  w: number,
  h: number,
  d: number,
  color: number,
  opacity = 1
): THREE.LineSegments {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d))
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  return new THREE.LineSegments(geo, mat)
}

let skyscraperTex: THREE.CanvasTexture | null = null

/** Procedural nocturnal glass-tower facade texture with glowing skyscraper windows. */
export function skyscraperWindowTexture(): THREE.CanvasTexture {
  if (skyscraperTex) return skyscraperTex
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const ctx = c.getContext('2d')
  if (!ctx) {
    skyscraperTex = new THREE.CanvasTexture(c)
    return skyscraperTex
  }
  ctx.fillStyle = '#091020'
  ctx.fillRect(0, 0, 128, 256)
  // Subtle metallic mullions
  ctx.fillStyle = '#0e172c'
  for (let x = 0; x < 128; x += 16) ctx.fillRect(x, 0, 2, 256)
  let s = 42
  const rnd = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  for (let row = 4; row < 248; row += 10) {
    const floorLit = rnd() > 0.34
    for (let col = 4; col < 122; col += 12) {
      if (!floorLit || rnd() > 0.62) continue
      const warm = rnd() > 0.52
      const alpha = 0.25 + rnd() * 0.65
      ctx.fillStyle = warm
        ? `rgba(255, 198, 138, ${alpha})`
        : `rgba(128, 224, 255, ${alpha})`
      ctx.fillRect(col, row, 7, 5)
    }
  }
  skyscraperTex = new THREE.CanvasTexture(c)
  skyscraperTex.wrapS = THREE.RepeatWrapping
  skyscraperTex.wrapT = THREE.RepeatWrapping
  return skyscraperTex
}

/** Dark brushed-gunmetal PBR architectural block with restrained subtle neon trim. */
export function solidEdgeBox(
  w: number,
  h: number,
  d: number,
  edgeColor: number,
  opacity = 0.45,
  coreColor = 0x111a2c,
  coreOpacity = 1
): THREE.Group {
  const group = new THREE.Group()
  const boxGeo = new THREE.BoxGeometry(w, h, d)
  const coreMat = new THREE.MeshStandardMaterial({
    color: coreColor,
    roughness: 0.46,
    metalness: 0.58,
    transparent: coreOpacity < 1,
    opacity: coreOpacity,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const core = new THREE.Mesh(boxGeo, coreMat)
  group.add(core)
  if (opacity > 0.02) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(boxGeo),
      new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: Math.min(opacity, 0.42) })
    )
    group.add(edges)
  }
  return group
}

/** Invisible collision proxy used for raycast hit detection. */
export function ghostSphere(r: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(r, 8, 6),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  )
}

/** Invisible box proxy for walls / cover (raycast + LOS blocking). */
export function ghostBox(w: number, h: number, d: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  )
}

export interface WeaponStats {
  name: string
  label: string
  mag: number
  fireCd: number
  dmg: number
  auto: boolean
  reloadTime: number
  recoil: number
  kick: number
  shake: number
  critChance: number
  tracer: number
  tracerWidth: number
  flash: number
}

export const WEAPONS: Record<WeaponId, WeaponStats> = {
  rifle: {
    name: 'PULSE RIFLE',
    label: 'PULSE RIFLE',
    mag: 32,
    fireCd: 0.09,
    dmg: 1.2,
    auto: true,
    reloadTime: 1.2,
    recoil: 0.007,
    kick: 0.08,
    shake: 0.05,
    critChance: 0.18,
    tracer: 0x9ffcff,
    tracerWidth: 0.025,
    flash: 0.65,
  },
  deagle: {
    name: 'DESERT EAGLE',
    label: 'DESERT EAGLE',
    mag: 7,
    fireCd: 0.42,
    dmg: 4,
    auto: false,
    reloadTime: 1.5,
    recoil: 0.05,
    kick: 0.4,
    shake: 0.35,
    critChance: 0.3,
    tracer: 0xffd319,
    tracerWidth: 0.06,
    flash: 1.5,
  },
  prism: {
    name: 'PRISM SCATTER',
    label: 'PRISM SCATTER',
    mag: 6,
    fireCd: 0.62,
    dmg: 1.85,
    auto: false,
    reloadTime: 1.65,
    recoil: 0.065,
    kick: 0.48,
    shake: 0.4,
    critChance: 0.22,
    tracer: 0x29e3ff,
    tracerWidth: 0.04,
    flash: 1.7,
  },
  sniper: {
    name: 'GAUSS SNIPER',
    label: 'GAUSS SNIPER',
    mag: 5,
    fireCd: 0.95,
    dmg: 24,
    auto: false,
    reloadTime: 2.0,
    recoil: 0.08,
    kick: 0.6,
    shake: 0.45,
    critChance: 0.5,
    tracer: 0xff0055,
    tracerWidth: 0.12,
    flash: 2.0,
  },
}

export interface GunRig {
  rifle: THREE.Group
  rifleBolt?: THREE.Group
  deagle: THREE.Group
  prism: THREE.Group
  sniper: THREE.Group
  flash: THREE.Sprite
}

/** Four Route B curved industrial PBR viewmodel weapons attached to the camera. */
export function buildGun(camera: THREE.PerspectiveCamera): GunRig {
  const gunMetal = (color: number, metalness = 0.8, roughness = 0.28) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness })
  const glowMat = (color: number) =>
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.18 })

  // 1. Industrial Route B Pulse Rifle MK-IV (20k-35k tris)
  const rifleRig = buildIndustrialPulseRifle()
  const rifle = rifleRig.group
  rifle.position.set(0.36, -0.31, -0.68)
  rifle.rotation.y = 0.04
  camera.add(rifle)

  // 2. Sculpted Curved Desert Eagle (lofted slide + curved grip, no flat boxes)
  const deagle = new THREE.Group()
  const deagleSlide = new THREE.Mesh(
    buildLoftedSurface([
      { z: -0.34, points: superellipseRing(0.044, 0.056, 0.02, 28, 3.4, 0, 0.2) },
      { z: -0.18, points: superellipseRing(0.052, 0.066, 0.022, 28, 3.6, 0, 0.18) },
      { z:  0.16, points: superellipseRing(0.054, 0.068, 0.020, 28, 3.4, 0, 0.16) },
      { z:  0.24, points: superellipseRing(0.048, 0.060, 0.015, 28, 3.0, 0, 0.18) },
    ]),
    gunMetal(0x8894a6, 0.88, 0.22)
  )
  const deagleBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.024, 0.18, 24).rotateX(Math.PI / 2),
    gunMetal(0x1f2736, 0.88, 0.26)
  )
  deagleBarrel.position.set(0, 0.025, -0.40)
  const deagleTrim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.42, 14).rotateX(Math.PI / 2),
    glowMat(0xffc861)
  )
  deagleTrim.position.set(0, 0.088, -0.06)
  const deagleGripCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.03, 0.10),
    new THREE.Vector3(0, -0.14, 0.13),
    new THREE.Vector3(0, -0.24, 0.165),
  ])
  const deagleGrip = new THREE.Mesh(new THREE.TubeGeometry(deagleGripCurve, 16, 0.032, 18, false), gunMetal(0x141924, 0.4, 0.62))
  deagle.add(deagleSlide, deagleBarrel, deagleTrim, deagleGrip)
  deagle.position.set(0.42, -0.34, -0.82)
  deagle.rotation.y = 0.04
  deagle.visible = false
  camera.add(deagle)

  // 3. Sculpted Prism Scattergun (twin curved optical rails + smooth glass core sphere)
  const prism = new THREE.Group()
  const prismBody = new THREE.Mesh(
    buildLoftedSurface([
      { z: -0.46, points: superellipseRing(0.058, 0.056, 0.01, 32, 3.0, 0, 0.15) },
      { z: -0.18, points: superellipseRing(0.078, 0.070, 0.015, 32, 3.2, 0, 0.12) },
      { z:  0.22, points: superellipseRing(0.068, 0.064, 0.010, 32, 3.0, 0, 0.14) },
    ]),
    gunMetal(0x7a889b, 0.82, 0.25)
  )
  for (const side of [-1, 1] as const) {
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.020, 0.54, 20).rotateX(Math.PI / 2),
      gunMetal(0x1f293c, 0.88, 0.22)
    )
    rail.position.set(side * 0.074, 0.028, -0.38)
    const strip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.48, 12).rotateX(Math.PI / 2),
      glowMat(side < 0 ? 0xff4d88 : 0x38e8ff)
    )
    strip.position.set(side * 0.074, 0.052, -0.38)
    prism.add(rail, strip)
  }
  const prismCore = new THREE.Mesh(new THREE.SphereGeometry(0.042, 24, 18), glowMat(0x4dffdf))
  prismCore.position.set(0, 0.072, -0.24)
  prism.add(prismBody, prismCore)
  prism.position.set(0.42, -0.34, -0.82)
  prism.rotation.y = 0.04
  prism.visible = false
  camera.add(prism)

  // 4. Sculpted Gauss Sniper (long tapered carbon-titanium rail + cylindrical scope)
  const sniper = new THREE.Group()
  const sniperBody = new THREE.Mesh(
    buildLoftedSurface([
      { z: -0.58, points: superellipseRing(0.036, 0.048, 0.01, 28, 3.2, 0, 0.18) },
      { z:  0.05, points: superellipseRing(0.056, 0.066, 0.015, 28, 3.4, 0, 0.14) },
      { z:  0.38, points: superellipseRing(0.046, 0.058, 0.005, 28, 3.0, 0, 0.16) },
    ]),
    gunMetal(0x283244, 0.84, 0.26)
  )
  const sniperBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.026, 0.96, 28).rotateX(Math.PI / 2),
    gunMetal(0x7c8a9e, 0.9, 0.2)
  )
  sniperBarrel.position.set(0, 0.025, -0.84)
  const sniperScope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.022, 0.36, 24).rotateX(Math.PI / 2),
    gunMetal(0x161d2b, 0.88, 0.22)
  )
  sniperScope.position.set(0, 0.115, -0.10)
  const sniperRail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0045, 0.0045, 0.84, 12).rotateX(Math.PI / 2),
    glowMat(0xff4d79)
  )
  sniperRail.position.set(0, 0.055, -0.78)
  sniper.add(sniperBody, sniperBarrel, sniperScope, sniperRail)
  sniper.position.set(0.42, -0.34, -0.82)
  sniper.rotation.y = 0.04
  sniper.visible = false
  camera.add(sniper)

  const flash = makeGlowSprite(0x9ef6ff, 0.58, 0.9)
  flash.position.set(0.36, -0.25, -1.42)
  flash.visible = false
  camera.add(flash)

  return { rifle, rifleBolt: rifleRig.boltGroup, deagle, prism, sniper, flash }
}

export interface DroneStats {
  hp: number
  speed: number
  damage: number
  points: number
  radius: number
  color: number
  coreColor: number
  height: number
  kind: 'melee' | 'ranged' | 'sniper' | 'support'
  label: string
}

export const DRONE_STATS: Record<DroneType, DroneStats> = {
  swarm: {
    hp: 2, speed: 8.5, damage: 8, points: 80, radius: 0.55,
    color: 0x00f0ff, coreColor: 0x9ffcff, height: 2.5, kind: 'melee', label: 'SEEKER',
  },
  brawler: {
    hp: 3, speed: 10.5, damage: 22, points: 150, radius: 0.7,
    color: 0xff9f1c, coreColor: 0xffd9a0, height: 2.2, kind: 'melee', label: 'BRAWLER',
  },
  gunner: {
    hp: 4, speed: 5, damage: 10, points: 180, radius: 0.8,
    color: 0xff2975, coreColor: 0xffb3cf, height: 3, kind: 'ranged', label: 'GUNNER',
  },
  enforcer: {
    hp: 14, speed: 2.8, damage: 26, points: 350, radius: 1.8,
    color: 0x8a2be2, coreColor: 0xd9b3ff, height: 2.6, kind: 'melee', label: 'ENFORCER',
  },
  marksman: {
    hp: 3, speed: 4.5, damage: 18, points: 300, radius: 0.9,
    color: 0xff2244, coreColor: 0xff99aa, height: 9, kind: 'sniper', label: 'MARKSMAN',
  },
  aegis: {
    hp: 5, speed: 6.2, damage: 8, points: 260, radius: 0.85,
    color: 0x39ff88, coreColor: 0xa6ffcf, height: 4.8, kind: 'support', label: 'AEGIS WEAVER',
  },
  boss: {
    hp: 60, speed: 3.2, damage: 40, points: 1500, radius: 3.2,
    color: 0xff2244, coreColor: 0xffd319, height: 4, kind: 'melee', label: 'APEX MAINFRAME',
  },
}

export interface DroneParts {
  group: THREE.Group
  proxy: THREE.Mesh
  outer: THREE.LineLoop
  inner: THREE.LineLoop
  frame: THREE.LineLoop | null
  core: THREE.Sprite
  hull?: THREE.Group
}

/** Smooth optical glass-lens & gyroscopic energy drone (zero low-poly faceted blocks). */
export function makeDrone(type: DroneType): DroneParts {
  const st = DRONE_STATS[type]
  const group = new THREE.Group()

  const outer = circleLine(st.radius, st.color, 48, 0.34)
  const inner = circleLine(st.radius * 0.58, st.color, 36, 0.22)
  const core = makeGlowSprite(st.coreColor, st.radius * 2.0, 0.92)
  let frame: THREE.LineLoop | null = null

  // Smooth obsidian optical-lens orb with Fresnel rim shader (matches standby prism DNA)
  const hull = new THREE.Group()
  const orbGeo = new THREE.SphereGeometry(st.radius * 0.56, 28, 20)
  const orbMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(st.color) },
      uCore: { value: new THREE.Color(st.coreColor) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uCore;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float ndotv = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
        float fresnel = pow(1.0 - ndotv, 2.6);
        vec3 glass = mix(vec3(0.03, 0.06, 0.12), uColor, fresnel * 0.92);
        glass += uCore * pow(ndotv, 5.0) * 0.55;
        gl_FragColor = vec4(glass, 1.0);
      }
    `,
  })
  hull.add(new THREE.Mesh(orbGeo, orbMat))

  // Machined curved gyroscopic titanium ring(s) around the optical core
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x202a3c,
    metalness: 0.88,
    roughness: 0.22,
    emissive: new THREE.Color(st.color),
    emissiveIntensity: 0.35,
  })
  const primaryGyro = new THREE.Mesh(
    new THREE.TorusGeometry(st.radius * 0.82, st.radius * 0.065, 14, 44),
    ringMat
  )
  hull.add(primaryGyro)

  if (type === 'enforcer' || type === 'boss' || type === 'aegis') {
    const crossGyro = new THREE.Mesh(
      new THREE.TorusGeometry(st.radius * 0.96, st.radius * 0.05, 12, 44),
      ringMat
    )
    crossGyro.rotation.x = Math.PI / 2.2
    hull.add(crossGyro)
  }

  group.add(hull)

  if (type === 'enforcer' || type === 'boss') {
    frame = circleLine(st.radius * 1.28, 0xff4d88, 48, 0.45)
    group.add(frame)
  }

  const proxy = ghostSphere(st.radius * 1.1)
  group.add(outer, inner, core, proxy)
  return { group, proxy, outer, inner, frame, core, hull }
}

/** Glowing projectile bolt fired by ranged enemies. */
export function makeProjectile(color: number): THREE.Sprite {
  const s = makeGlowSprite(color, 0.55, 1)
  return s
}

/** Marksman laser sight line (two endpoints updated per frame). */
export function makeLaserLine(color: number): THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3))
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 })
  const line = new THREE.Line(geo, mat)
  line.frustumCulled = false
  return line
}

const MAX_PARTICLES = 700

/** Additive Points-based particle system for sparks and explosions. */
export class Particles {
  private points: THREE.Points
  private pos: Float32Array
  private col: Float32Array
  private vel: Float32Array
  private life: Float32Array
  private cursor = 0

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry()
    this.pos = new Float32Array(MAX_PARTICLES * 3)
    this.col = new Float32Array(MAX_PARTICLES * 3)
    this.vel = new Float32Array(MAX_PARTICLES * 3)
    this.life = new Float32Array(MAX_PARTICLES)
    for (let i = 0; i < MAX_PARTICLES; i++) this.pos[i * 3 + 1] = -9999
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3))

    const mat = new THREE.PointsMaterial({
      size: 0.24,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  burst(center: THREE.Vector3, color: THREE.Color, count: number, speed: number, life: number) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % MAX_PARTICLES
      const i3 = i * 3
      this.pos[i3] = center.x
      this.pos[i3 + 1] = center.y
      this.pos[i3 + 2] = center.z
      this.col[i3] = color.r
      this.col[i3 + 1] = color.g
      this.col[i3 + 2] = color.b
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const s = speed * (0.4 + Math.random() * 0.9)
      this.vel[i3] = Math.sin(phi) * Math.cos(theta) * s
      this.vel[i3 + 1] = Math.abs(Math.cos(phi)) * s * 0.8 + 2
      this.vel[i3 + 2] = Math.sin(phi) * Math.sin(theta) * s
      this.life[i] = life * (0.5 + Math.random() * 0.8)
    }
    const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const colAttr = this.points.geometry.getAttribute('color') as THREE.BufferAttribute
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
  }

  clear() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.life[i] = 0
      this.pos[i * 3 + 1] = -9999
    }
    const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    posAttr.needsUpdate = true
  }

  update(dt: number) {
    let any = false
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i]! <= 0) continue
      any = true
      this.life[i] = this.life[i]! - dt
      const i3 = i * 3
      if (this.life[i]! <= 0) {
        this.pos[i3 + 1] = -9999
        continue
      }
      this.vel[i3 + 1] = this.vel[i3 + 1]! - 14 * dt
      this.pos[i3] = this.pos[i3]! + this.vel[i3]! * dt
      this.pos[i3 + 1] = this.pos[i3 + 1]! + this.vel[i3 + 1]! * dt
      this.pos[i3 + 2] = this.pos[i3 + 2]! + this.vel[i3 + 2]! * dt
    }
    if (any) {
      const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
      posAttr.needsUpdate = true
    }
  }
}

export interface Shockwave {
  line: THREE.LineLoop
  life: number
  total: number
  maxScale: number
}

/** Expanding neon shockwave ring. */
export function makeShockwave(
  scene: THREE.Scene,
  pos: THREE.Vector3,
  color: number,
  maxScale: number,
  dur: number
): Shockwave {
  const line = circleLine(1, color, 48, 1)
  line.position.copy(pos)
  scene.add(line)
  return { line, life: dur, total: dur, maxScale }
}

export interface PickupParts {
  group: THREE.Group
  proxy: THREE.Mesh
  glow: THREE.Sprite
  kind: PickupKind
}

/** Spinning neon pickup: heal, gem, hidden stash or overcharge. */
export function makePickup(kind: PickupKind): PickupParts {
  const conf: Record<PickupKind, { color: number; seg: number; scale: number }> = {
    heal: { color: 0x39ff88, seg: 8, scale: 1 },
    gem: { color: 0xffd319, seg: 4, scale: 1 },
    stash: { color: 0xffd319, seg: 8, scale: 1.35 },
    overcharge: { color: 0xb18cff, seg: 3, scale: 1 },
  }
  const { color, seg, scale } = conf[kind]
  const group = new THREE.Group()
  const ring = circleLine(0.55, color, seg)
  const cross = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.32 * scale, 0, 0),
      new THREE.Vector3(-0.32 * scale, 0, 0),
      new THREE.Vector3(0, 0.32 * scale, 0),
      new THREE.Vector3(0, -0.32 * scale, 0),
    ]),
    new THREE.LineBasicMaterial({ color })
  )
  const glow = makeGlowSprite(color, 1.8 * scale, 0.75)
  const proxy = ghostSphere(0.7 * scale)
  group.add(ring, cross, glow, proxy)
  group.scale.setScalar(scale)
  return { group, proxy, glow, kind }
}

export type HazardKind = 'plasma' | 'cryo'

export interface HazardParts {
  group: THREE.Group
  proxy: THREE.Mesh
  glow: THREE.Sprite
  kind: HazardKind
}

/** Smooth lathed industrial volatile canister (plasma or cryo). */
export function makeHazardCanister(kind: HazardKind): HazardParts {
  const color = kind === 'cryo' ? 0x29e3ff : 0xff4d6d
  const group = new THREE.Group()
  const profile = [
    new THREE.Vector2(0.01, -0.78),
    new THREE.Vector2(0.46, -0.78),
    new THREE.Vector2(0.56, -0.66),
    new THREE.Vector2(0.56, 0.66),
    new THREE.Vector2(0.46, 0.78),
    new THREE.Vector2(0.01, 0.78),
  ]
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 32),
    new THREE.MeshStandardMaterial({ color: 0x162033, metalness: 0.82, roughness: 0.28 })
  )
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.045, 14, 36).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.35, metalness: 0.3, roughness: 0.2 })
  )
  const glow = makeGlowSprite(color, 2.5, 0.55)
  const proxy = ghostSphere(1.15)
  group.add(body, collar, glow, proxy)
  return { group, proxy, glow, kind }
}
