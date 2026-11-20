import * as THREE from 'three'
import type { DroneType, PickupKind, WeaponId } from './types'

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
  deagle: THREE.Group
  prism: THREE.Group
  sniper: THREE.Group
  flash: THREE.Sprite
}

/** Four sleek brushed-gunmetal PBR viewmodel weapons with recessed emissive energy strips. */
export function buildGun(camera: THREE.PerspectiveCamera): GunRig {
  const gunMetal = (color: number, metalness = 0.78, roughness = 0.3) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness })
  const stripMat = (color: number) =>
    new THREE.MeshBasicMaterial({ color })
  const part = (w: number, h: number, d: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)

  const rifle = new THREE.Group()
  const body = part(0.13, 0.16, 0.68, gunMetal(0x182336))
  const shroud = part(0.145, 0.06, 0.42, gunMetal(0x0f1624, 0.85, 0.25))
  shroud.position.set(0, 0.06, -0.1)
  const barrel = part(0.055, 0.055, 0.52, gunMetal(0x23324a, 0.88, 0.22))
  barrel.position.set(0, 0.03, -0.54)
  const rail = part(0.025, 0.014, 0.46, stripMat(0x38e8ff))
  rail.position.set(0, 0.095, -0.14)
  const grip = part(0.1, 0.24, 0.14, gunMetal(0x101724, 0.4, 0.65))
  grip.position.set(0, -0.18, 0.2)
  grip.rotation.x = 0.28
  rifle.add(body, shroud, barrel, rail, grip)
  rifle.position.set(0.48, -0.38, -0.92)
  rifle.rotation.y = 0.04
  camera.add(rifle)

  const deagle = new THREE.Group()
  const slideBox = part(0.13, 0.16, 0.44, gunMetal(0x2a3344, 0.88, 0.2))
  const deagleBarrel = part(0.09, 0.09, 0.24, gunMetal(0x141b29, 0.85, 0.28))
  deagleBarrel.position.set(0, 0.02, -0.30)
  const deagleTrim = part(0.02, 0.016, 0.36, stripMat(0xffc861))
  deagleTrim.position.set(0, 0.086, -0.02)
  const deagleGrip = part(0.11, 0.26, 0.17, gunMetal(0x121824, 0.45, 0.6))
  deagleGrip.position.set(0, -0.2, 0.12)
  deagleGrip.rotation.x = 0.24
  deagle.add(slideBox, deagleBarrel, deagleTrim, deagleGrip)
  deagle.position.set(0.48, -0.38, -0.92)
  deagle.rotation.y = 0.04
  deagle.visible = false
  camera.add(deagle)

  const prism = new THREE.Group()
  const prismChassis = part(0.18, 0.17, 0.56, gunMetal(0x152034, 0.82, 0.26))
  const prismLeftRail = part(0.045, 0.075, 0.5, gunMetal(0x1e2c44, 0.88, 0.22))
  prismLeftRail.position.set(-0.075, 0.03, -0.42)
  const prismRightRail = part(0.045, 0.075, 0.5, gunMetal(0x1e2c44, 0.88, 0.22))
  prismRightRail.position.set(0.075, 0.03, -0.42)
  const prismLeftGlow = part(0.014, 0.02, 0.46, stripMat(0xff4d88))
  prismLeftGlow.position.set(-0.075, 0.072, -0.42)
  const prismRightGlow = part(0.014, 0.02, 0.46, stripMat(0x38e8ff))
  prismRightGlow.position.set(0.075, 0.072, -0.42)
  const prismCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.055, 0),
    new THREE.MeshBasicMaterial({ color: 0x56ffd8 })
  )
  prismCore.position.set(0, 0.085, -0.28)
  const prismGrip = part(0.11, 0.24, 0.15, gunMetal(0x101724, 0.45, 0.6))
  prismGrip.position.set(0, -0.19, 0.16)
  prismGrip.rotation.x = 0.26
  prism.add(prismChassis, prismLeftRail, prismRightRail, prismLeftGlow, prismRightGlow, prismCore, prismGrip)
  prism.position.set(0.48, -0.38, -0.92)
  prism.rotation.y = 0.04
  prism.visible = false
  camera.add(prism)

  const sniper = new THREE.Group()
  const sniperBody = part(0.11, 0.14, 0.84, gunMetal(0x151d2e, 0.82, 0.28))
  const sniperBarrel = part(0.048, 0.048, 1.02, gunMetal(0x26354d, 0.9, 0.2))
  sniperBarrel.position.set(0, 0.03, -0.88)
  const sniperRail = part(0.016, 0.014, 0.88, stripMat(0xff4d79))
  sniperRail.position.set(0, 0.06, -0.82)
  const sniperScope = part(0.065, 0.075, 0.34, gunMetal(0x0f1624, 0.85, 0.22))
  sniperScope.position.set(0, 0.13, -0.14)
  const sniperGrip = part(0.09, 0.24, 0.14, gunMetal(0x101724, 0.45, 0.6))
  sniperGrip.position.set(0, -0.19, 0.24)
  sniperGrip.rotation.x = 0.24
  sniper.add(sniperBody, sniperBarrel, sniperRail, sniperScope, sniperGrip)
  sniper.position.set(0.48, -0.38, -0.92)
  sniper.rotation.y = 0.04
  sniper.visible = false
  camera.add(sniper)

  const flash = makeGlowSprite(0xbef6ff, 0.65, 0.9)
  flash.position.set(0.48, -0.26, -1.45)
  flash.visible = false
  camera.add(flash)

  return { rifle, deagle, prism, sniper, flash }
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

/** 3D obsidian-and-neon drone with a distinct polyhedral silhouette per archetype. */
export function makeDrone(type: DroneType): DroneParts {
  const st = DRONE_STATS[type]
  const group = new THREE.Group()

  let seg = 40
  if (type === 'brawler') seg = 3
  else if (type === 'swarm') seg = 24
  else if (type === 'marksman') seg = 32
  else if (type === 'aegis') seg = 6

  const outer = circleLine(st.radius, st.color, seg, 0.42)
  const inner = circleLine(st.radius * 0.55, st.color, type === 'brawler' ? 3 : type === 'aegis' ? 6 : 20, 0.28)
  const core = makeGlowSprite(st.coreColor, st.radius * 1.9, 0.88)
  let frame: THREE.LineLoop | null = null

  // Sculpted dark-titanium PBR polyhedral drone chassis
  const hull = new THREE.Group()
  let hullGeo: THREE.BufferGeometry
  if (type === 'brawler' || type === 'marksman') {
    hullGeo = new THREE.TetrahedronGeometry(st.radius * 0.68, 0)
  } else if (type === 'enforcer' || type === 'boss') {
    hullGeo = new THREE.DodecahedronGeometry(st.radius * 0.68, 0)
  } else if (type === 'aegis') {
    hullGeo = new THREE.OctahedronGeometry(st.radius * 0.7, 0)
  } else {
    hullGeo = new THREE.OctahedronGeometry(st.radius * 0.62, 0)
  }
  const hullMesh = new THREE.Mesh(
    hullGeo,
    new THREE.MeshStandardMaterial({
      color: 0x162238,
      metalness: 0.76,
      roughness: 0.28,
      emissive: new THREE.Color(st.color),
      emissiveIntensity: 0.24,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
  )
  const hullEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(hullGeo),
    new THREE.LineBasicMaterial({ color: st.color, transparent: true, opacity: 0.55 })
  )
  hull.add(hullMesh, hullEdges)
  group.add(hull)

  if (type === 'enforcer' || type === 'boss') {
    const r = st.radius * 1.35
    frame = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(r, 0, 0),
        new THREE.Vector3(0, r, 0),
        new THREE.Vector3(-r, 0, 0),
        new THREE.Vector3(0, -r, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xff2975, transparent: true })
    )
    group.add(frame)
    if (type === 'boss') {
      const crownRing = circleLine(st.radius * 1.15, 0xffd319, 12, 0.85)
      crownRing.rotation.x = Math.PI / 2.6
      hull.add(crownRing)
    }
  }
  if (type === 'marksman') {
    const spokes = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(st.radius * 1.3, 0, 0),
        new THREE.Vector3(st.radius * 0.7, 0, 0),
        new THREE.Vector3(-st.radius * 1.3, 0, 0),
        new THREE.Vector3(-st.radius * 0.7, 0, 0),
        new THREE.Vector3(0, st.radius * 1.3, 0),
        new THREE.Vector3(0, st.radius * 0.7, 0),
        new THREE.Vector3(0, -st.radius * 1.3, 0),
        new THREE.Vector3(0, -st.radius * 0.7, 0),
      ]),
      new THREE.LineBasicMaterial({ color: st.color })
    )
    group.add(spokes)
  }
  if (type === 'gunner') {
    const barrelLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, st.radius * 0.6),
        new THREE.Vector3(0, 0, st.radius * 1.6),
      ]),
      new THREE.LineBasicMaterial({ color: st.color })
    )
    group.add(barrelLine)
  }
  if (type === 'aegis') {
    const halo = circleLine(st.radius * 1.15, 0x00f0ff, 6, 0.75)
    halo.rotation.x = Math.PI / 2
    hull.add(halo)
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

/** Shootable volatile prism canister: plasma detonation or cryo freeze shockwave. */
export function makeHazardCanister(kind: HazardKind): HazardParts {
  const color = kind === 'cryo' ? 0x00f0ff : 0xff4d2e
  const coreTint = kind === 'cryo' ? 0x051828 : 0x20080a
  const group = new THREE.Group()
  const cylGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.6, 6)
  const core = new THREE.Mesh(
    cylGeo,
    new THREE.MeshBasicMaterial({
      color: coreTint,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
  )
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(cylGeo),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
  )
  const band = circleLine(0.75, color, 6, 0.7)
  band.rotation.x = Math.PI / 2
  const glow = makeGlowSprite(color, 2.8, 0.7)
  const proxy = ghostSphere(1.15)
  group.add(core, edges, band, glow, proxy)
  return { group, proxy, glow, kind }
}
