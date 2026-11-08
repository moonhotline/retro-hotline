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
  sniper: THREE.Group
  flash: THREE.Sprite
}

/** Three neon-outline viewmodel weapons attached to the camera. */
export function buildGun(camera: THREE.PerspectiveCamera): GunRig {
  const rifle = new THREE.Group()
  const body = edgeBox(0.14, 0.18, 0.66, 0x00f0ff)
  const barrel = edgeBox(0.08, 0.08, 0.56, 0xff2975)
  barrel.position.set(0, 0.05, -0.56)
  const grip = edgeBox(0.12, 0.26, 0.16, 0x8a2be2)
  grip.position.set(0, -0.2, 0.2)
  grip.rotation.x = 0.3
  const sight = edgeBox(0.05, 0.08, 0.14, 0x00f0ff)
  sight.position.set(0, 0.14, -0.2)
  rifle.add(body, barrel, grip, sight)
  rifle.position.set(0.52, -0.42, -0.95)
  rifle.rotation.y = 0.05
  camera.add(rifle)

  const deagle = new THREE.Group()
  const slideBox = edgeBox(0.16, 0.2, 0.4, 0xffd319)
  const deagleBarrel = edgeBox(0.12, 0.12, 0.34, 0xff2975)
  deagleBarrel.position.set(0, 0.03, -0.34)
  const deagleGrip = edgeBox(0.14, 0.3, 0.2, 0xffd319)
  deagleGrip.position.set(0, -0.24, 0.12)
  deagleGrip.rotation.x = 0.25
  const deagleSight = edgeBox(0.05, 0.07, 0.1, 0xff2975)
  deagleSight.position.set(0, 0.15, -0.1)
  deagle.add(slideBox, deagleBarrel, deagleGrip, deagleSight)
  deagle.position.set(0.52, -0.42, -0.95)
  deagle.rotation.y = 0.05
  deagle.visible = false
  camera.add(deagle)

  const sniper = new THREE.Group()
  const sniperBody = edgeBox(0.12, 0.16, 0.85, 0xff2975)
  const sniperBarrel = edgeBox(0.06, 0.06, 1.05, 0x00f0ff)
  sniperBarrel.position.set(0, 0.04, -0.9)
  const sniperScope = edgeBox(0.08, 0.1, 0.35, 0xffd319)
  sniperScope.position.set(0, 0.15, -0.15)
  const sniperGrip = edgeBox(0.1, 0.28, 0.16, 0x8a2be2)
  sniperGrip.position.set(0, -0.22, 0.25)
  sniperGrip.rotation.x = 0.25
  sniper.add(sniperBody, sniperBarrel, sniperScope, sniperGrip)
  sniper.position.set(0.52, -0.42, -0.95)
  sniper.rotation.y = 0.05
  sniper.visible = false
  camera.add(sniper)

  const flash = makeGlowSprite(0x9ffcff, 0.7, 1)
  flash.position.set(0.52, -0.28, -1.5)
  flash.visible = false
  camera.add(flash)

  return { rifle, deagle, sniper, flash }
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
  kind: 'melee' | 'ranged' | 'sniper'
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
  boss: {
    hp: 60, speed: 3.2, damage: 40, points: 1500, radius: 3.2,
    color: 0xff2244, coreColor: 0xffd319, height: 4, kind: 'melee', label: 'THE BOSS',
  },
}

export interface DroneParts {
  group: THREE.Group
  proxy: THREE.Mesh
  outer: THREE.LineLoop
  inner: THREE.LineLoop
  frame: THREE.LineLoop | null
  core: THREE.Sprite
}

/** Vector-outline drone with a distinct silhouette per archetype. */
export function makeDrone(type: DroneType): DroneParts {
  const st = DRONE_STATS[type]
  const group = new THREE.Group()

  // Outer silhouette: triangle (brawler), crosshair circles (marksman),
  // square frame (enforcer/boss), polygon circles otherwise.
  let seg = 40
  if (type === 'brawler') seg = 3
  else if (type === 'swarm') seg = 24
  else if (type === 'marksman') seg = 32

  const outer = circleLine(st.radius, st.color, seg)
  const inner = circleLine(st.radius * 0.55, st.color, type === 'brawler' ? 3 : 20)
  const core = makeGlowSprite(st.coreColor, st.radius * 2.2, 0.95)
  let frame: THREE.LineLoop | null = null

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
  }
  if (type === 'marksman') {
    // Crosshair spokes
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
    // Forward barrel line
    const barrelLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, st.radius * 0.6),
        new THREE.Vector3(0, 0, st.radius * 1.6),
      ]),
      new THREE.LineBasicMaterial({ color: st.color })
    )
    group.add(barrelLine)
  }

  const proxy = ghostSphere(st.radius * 1.1)
  group.add(outer, inner, core, proxy)
  return { group, proxy, outer, inner, frame, core }
}

/** Glowing projectile bolt fired by ranged enemies. */
export function makeProjectile(color: number): THREE.Sprite {
  const s = makeGlowSprite(color, 0.55, 1)
  return s
}

/** Marksman laser sight line (two endpoints updated per frame). */
export function makeLaserLine(color: number): THREE.Line {
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
      size: 0.26,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
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
