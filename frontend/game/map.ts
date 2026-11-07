import * as THREE from 'three'
import { edgeBox, ghostBox, makeGlowSprite } from './effects'

/**
 * Multi-zone Miami map: the bridge, a neon plaza with an arcade hall,
 * a pool courtyard with a warehouse rooftop, jump pads, palms, cars and
 * hidden stash spots. Walk rects double as a simple heightmap for the
 * player; wall boxes are used for both player/enemy collision and
 * bullet/line-of-sight blocking (cover).
 */

export interface Wall {
  x: number
  z: number
  hw: number
  hd: number
  h: number
}

export interface WalkRect {
  x0: number
  x1: number
  z0: number
  z1: number
  top: number
}

export interface Zones {
  walls: Wall[]
  walkRects: WalkRect[]
  pads: THREE.Vector3[]
  update: (t: number) => void
  randomSpawnPoint: (playerPos: THREE.Vector3) => THREE.Vector3
}

/** Push a circular body out of every wall box it overlaps (below wall height). */
export function resolveWalls(
  walls: Wall[],
  pos: THREE.Vector3,
  r: number,
  belowHeight: number
): void {
  for (const w of walls) {
    if (pos.y > w.h - 0.2 && belowHeight > w.h - 0.2) continue
    const cx = THREE.MathUtils.clamp(pos.x, w.x - w.hw, w.x + w.hw)
    const cz = THREE.MathUtils.clamp(pos.z, w.z - w.hd, w.z + w.hd)
    let dx = pos.x - cx
    let dz = pos.z - cz
    const d2 = dx * dx + dz * dz
    if (d2 >= r * r) continue
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2)
      pos.x = cx + (dx / d) * r
      pos.z = cz + (dz / d) * r
    } else {
      // Center inside the box — push out along the smallest penetration axis
      const left = pos.x - (w.x - w.hw)
      const right = w.x + w.hw - pos.x
      const back = pos.z - (w.z - w.hd)
      const front = w.z + w.hd - pos.z
      const m = Math.min(left, right, back, front)
      if (m === left) pos.x = w.x - w.hw - r
      else if (m === right) pos.x = w.x + w.hw + r
      else if (m === back) pos.z = w.z - w.hd - r
      else pos.z = w.z + w.hd + r
    }
    dx = 0
    dz = 0
  }
}

const TRUNK = 0x3a1f5c
const FROND = 0xff2975

function makePalm(x: number, z: number, scale = 1): THREE.Group {
  const g = new THREE.Group()
  const trunkMat = new THREE.LineBasicMaterial({ color: TRUNK })
  const tipMat = new THREE.LineBasicMaterial({ color: FROND })
  const pts: THREE.Vector3[] = []
  let px = 0
  let py = 0
  for (let i = 0; i < 6; i++) {
    pts.push(new THREE.Vector3(px, py, 0))
    py += 0.9 * scale
    px += 0.28 * scale
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), trunkMat))
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const dir = new THREE.Vector3(Math.cos(a), 0.4, Math.sin(a)).normalize()
    const mid = new THREE.Vector3(px, py, 0).addScaledVector(dir, 1.7 * scale)
    const end = mid.clone()
    end.y -= 1.2 * scale
    g.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(px, py, 0), mid, end]),
        i % 2 === 0 ? tipMat : trunkMat
      )
    )
  }
  g.position.set(x, 0.6, z)
  return g
}

export function buildZones(scene: THREE.Scene, collidables: THREE.Object3D[]): Zones {
  const walls: Wall[] = []
  const walkRects: WalkRect[] = [
    { x0: -7, x1: 7, z0: -286, z1: 286, top: 0.6 }, // bridge deck
    { x0: -26, x1: 26, z0: -380, z1: -284, top: 0.6 }, // south plaza
    { x0: -26, x1: 26, z0: 284, z1: 380, top: 0.6 }, // north courtyard
    { x0: 8, x1: 24, z0: 300, z1: 360, top: 7 }, // warehouse roof
  ]
  const pads: THREE.Vector3[] = [new THREE.Vector3(16, 0.6, 292)]
  const pulse: Array<{ mat: THREE.LineBasicMaterial; base: number; speed: number }> = []

  const addWall = (
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    color = 0x9a2be2,
    visual = true
  ) => {
    walls.push({ x, z, hw: w / 2, hd: d / 2, h })
    const ghost = ghostBox(w, h, d)
    ghost.position.set(x, h / 2 + 0.3, z)
    scene.add(ghost)
    collidables.push(ghost)
    if (visual) {
      const e = edgeBox(w, h, d, color)
      e.position.set(x, h / 2 + 0.3, z)
      scene.add(e)
    }
  }

  /** Dim violet floor grid with a bright perimeter outline. */
  const floorGrid = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    rim = 0xff2975
  ) => {
    const pairs: number[] = []
    for (let x = x0; x <= x1 + 0.01; x += 8) pairs.push(x, 0.62, z0, x, 0.62, z1)
    for (let z = z0; z <= z1 + 0.01; z += 8) pairs.push(x0, 0.62, z, x1, 0.62, z)
    const grid = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(pairs, 3)
      ),
      new THREE.LineBasicMaterial({ color: 0x5a2b8a, transparent: true, opacity: 0.55 })
    )
    scene.add(grid)
    // Perimeter
    const rimPairs = [
      x0, 0.62, z0, x1, 0.62, z0,
      x1, 0.62, z0, x1, 0.62, z1,
      x1, 0.62, z1, x0, 0.62, z1,
      x0, 0.62, z1, x0, 0.62, z0,
    ]
    const rimMat = new THREE.LineBasicMaterial({ color: rim })
    const rimLine = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(rimPairs, 3)
      ),
      rimMat
    )
    scene.add(rimLine)
    pulse.push({ mat: rimMat, base: 1, speed: 0.6 })
  }

  // ---- South Plaza ----
  floorGrid(-26, 26, -380, -284)
  for (const [px, pz] of [
    [-22, -300], [22, -300], [-22, -372], [22, -372], [-13, -288], [13, -288],
  ] as const) {
    scene.add(makePalm(px, pz, 1 + Math.random() * 0.5))
  }
  // Parked cars as low cover
  addWall(10, -322, 2, 4.5, 1.7, 0x00f0ff)
  addWall(-13, -300, 4.5, 2, 1.7, 0xff9f1c)
  addWall(18, -356, 4.5, 2, 1.7, 0xff2975)

  // ---- Arcade hall (hollow: wall segments with two door gaps) ----
  const AX0 = -24
  const AX1 = -8
  const AZ0 = -360
  const AZ1 = -316
  const AH = 4.5
  // south wall: segments [-24,-19] and [-15,-8] (door gap between -19..-15)
  addWall((-24 + -19) / 2, AZ0, 5, 1, AH, 0x00f0ff)
  addWall((-15 + -8) / 2, AZ0, 7, 1, AH, 0x00f0ff)
  addWall(AX0, (AZ0 + AZ1) / 2, 1, AZ1 - AZ0, AH, 0xff2975) // west
  addWall((-24 + -17) / 2, AZ1, 7, 1, AH, 0xff2975) // north seg A
  addWall((-13 + -8) / 2, AZ1, 5, 1, AH, 0xff2975) // north seg B (door gap -17..-13)
  addWall(AX1, (AZ0 + -346) / 2, 1, -346 - AZ0, AH, 0x9a2be2) // east seg A (z -360..-346)
  addWall(AX1, (-332 + AZ1) / 2, 1, AZ1 + 332, AH, 0x9a2be2) // east seg B (z -332..-316)
  // Arcade cabinets inside along the west wall
  for (let i = 0; i < 4; i++) {
    const cab = edgeBox(1.3, 2.2, 0.9, 0x00f0ff)
    cab.position.set(-22.5, 1.7, -354 + i * 8)
    scene.add(cab)
    const screen = makeGlowSprite(i % 2 === 0 ? 0x00f0ff : 0xff2975, 1.6, 0.55)
    screen.position.set(-22.5, 2.1, -354 + i * 8)
    scene.add(screen)
  }

  // ---- North Courtyard ----
  floorGrid(-26, 26, 284, 380)
  for (const [px, pz] of [
    [-22, 300], [22, 300], [-22, 372], [22, 372], [13, 378], [-13, 288],
  ] as const) {
    scene.add(makePalm(px, pz, 1 + Math.random() * 0.5))
  }
  addWall(-12, 350, 4.5, 2, 1.7, 0xffd319) // car cover
  addWall(0, 320, 2, 4.5, 1.7, 0x00f0ff)

  // ---- Pool (glowing rectangle, animated water lines) ----
  const poolX0 = -22
  const poolX1 = -6
  const poolZ0 = 300
  const poolZ1 = 330
  const poolMat = new THREE.LineBasicMaterial({ color: 0x00f0ff })
  const poolOutline = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          poolX0, 0.64, poolZ0, poolX1, 0.64, poolZ0,
          poolX1, 0.64, poolZ0, poolX1, 0.64, poolZ1,
          poolX1, 0.64, poolZ1, poolX0, 0.64, poolZ1,
          poolX0, 0.64, poolZ1, poolX0, 0.64, poolZ0,
        ],
        3
      )
    ),
    poolMat
  )
  scene.add(poolOutline)
  pulse.push({ mat: poolMat, base: 1, speed: 1.4 })
  for (let i = 1; i < 5; i++) {
    const z = poolZ0 + ((poolZ1 - poolZ0) * i) / 5
    const waveMat = new THREE.LineBasicMaterial({ color: 0x00c8e0, transparent: true, opacity: 0.5 })
    const wave = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(poolX0 + 1, 0.64, z),
        new THREE.Vector3(poolX1 - 1, 0.64, z),
      ]),
      waveMat
    )
    scene.add(wave)
    pulse.push({ mat: waveMat, base: 0.5, speed: 2 + i })
  }

  // ---- Warehouse (solid block, walkable roof at y=7) ----
  addWall(16, 330, 16, 60, 6.4, 0xff9f1c)
  // Roof grid for readability + rim
  {
    const pairs: number[] = []
    for (let x = 8; x <= 24.01; x += 4) pairs.push(x, 7.02, 300, x, 7.02, 360)
    for (let z = 300; z <= 360.01; z += 6) pairs.push(8, 7.02, z, 24, 7.02, z)
    const grid = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(pairs, 3)
      ),
      new THREE.LineBasicMaterial({ color: 0xff9f1c, transparent: true, opacity: 0.5 })
    )
    scene.add(grid)
  }
  // Neon sign on the warehouse's south face
  const sign = edgeBox(5, 1.6, 0.4, 0xff2975)
  sign.position.set(16, 4.6, 299.6)
  scene.add(sign)
  const signGlow = makeGlowSprite(0xff2975, 4, 0.5)
  signGlow.position.set(16, 4.6, 299)
  scene.add(signGlow)

  // ---- Jump pad (launches onto the warehouse roof) ----
  {
    const g = new THREE.Group()
    const ringPts: THREE.Vector3[] = []
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      ringPts.push(new THREE.Vector3(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5))
    }
    const ringMat = new THREE.LineBasicMaterial({ color: 0x00f0ff })
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), ringMat)
    const arrow = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.1, 1), new THREE.Vector3(0, 0.1, -1),
        new THREE.Vector3(0, 0.1, -1), new THREE.Vector3(-0.5, 0.1, -0.2),
        new THREE.Vector3(0, 0.1, -1), new THREE.Vector3(0.5, 0.1, -0.2),
      ]),
      ringMat
    )
    arrow.rotation.x = 0
    g.add(ring, arrow)
    g.position.set(16, 0.66, 292)
    scene.add(g)
    pulse.push({ mat: ringMat, base: 1, speed: 3 })
    const padGlow = makeGlowSprite(0x00f0ff, 4.5, 0.4)
    padGlow.position.set(16, 1.4, 292)
    scene.add(padGlow)
  }

  // ---- Downtown skyline blocks past the plaza (visual depth) ----
  for (let i = 0; i < 12; i++) {
    const h = 14 + Math.random() * 40
    const b = edgeBox(10 + Math.random() * 10, h, 10, 0xff2975, 0.5)
    b.position.set(-90 + Math.random() * 180, h / 2, -420 - Math.random() * 90)
    scene.add(b)
  }
  for (let i = 0; i < 12; i++) {
    const h = 14 + Math.random() * 40
    const b = edgeBox(10 + Math.random() * 10, h, 10, 0x9a2be2, 0.5)
    b.position.set(-90 + Math.random() * 180, h / 2, 420 + Math.random() * 90)
    scene.add(b)
  }

  const randomSpawnPoint = (playerPos: THREE.Vector3): THREE.Vector3 => {
    const candidates: THREE.Vector3[] = []
    for (const r of walkRects) {
      for (let k = 0; k < 4; k++) {
        const x = r.x0 + 2 + Math.random() * Math.max(r.x1 - r.x0 - 4, 1)
        const z = r.z0 + 2 + Math.random() * Math.max(r.z1 - r.z0 - 4, 1)
        const y = r.top + 2 + Math.random() * 8
        const p = new THREE.Vector3(x, y, z)
        const d = p.distanceTo(playerPos)
        if (d > 28 && d < 85) candidates.push(p)
      }
    }
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)] as THREE.Vector3
    }
    return new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(30),
      6,
      playerPos.z > 0 ? playerPos.z - 45 : playerPos.z + 45
    )
  }

  return {
    walls,
    walkRects,
    pads,
    update(t: number) {
      for (const p of pulse) {
        p.mat.opacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * p.speed))
      }
    },
    randomSpawnPoint,
  }
}
