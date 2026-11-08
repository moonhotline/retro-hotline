import * as THREE from 'three'
import { edgeBox, ghostBox, makeGlowSprite } from './effects'

/**
 * Bay Area arena: bridge, neon arcade plaza, logistics courtyard and the
 * Silicon Valley campus with a launch route to Sand Hill Quantum Vault.
 * Walk rects double as a simple heightmap for the
 * player; wall boxes are used for both player/enemy collision and
 * bullet/line-of-sight blocking (cover).
 */

export interface Wall {
  x: number
  z: number
  hw: number
  hd: number
  h: number
  /** World-space underside; omitted for walls rising from the ground. */
  bottom?: number
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
  pads: JumpPad[]
  update: (t: number) => void
  randomSpawnPoint: (playerPos: THREE.Vector3) => THREE.Vector3
}

export interface JumpPad extends THREE.Vector3 {
  boost: THREE.Vector3
}

/** Push a circular body out of every wall box it overlaps (below wall height). */
export function resolveWalls(
  walls: Wall[],
  pos: THREE.Vector3,
  r: number,
  belowHeight: number
): void {
  for (const w of walls) {
    if (w.bottom !== undefined && pos.y + r < w.bottom) continue
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
    { x0: -40, x1: 40, z0: 380, z1: 680, top: 0.6 }, // Silicon Valley campus
    { x0: -18, x1: 18, z0: 480, z1: 560, top: 9.5 }, // Sand Hill Quantum Vault
  ]
  const pad = (x: number, z: number, velocity: number): JumpPad =>
    Object.assign(new THREE.Vector3(x, 0.6, z), { boost: new THREE.Vector3(0, velocity, 0) })
  const pads: JumpPad[] = [pad(16, 292, 20), pad(0, -135, 23), pad(0, 135, 23), pad(0, -12, 20)]
  const vaultPad = pad(0, 420, 30)
  vaultPad.boost.z = 34
  pads.push(vaultPad)
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

  // Suspended platforms have thin collision slabs, leaving the road underneath open.
  const gantry = (z: number, top: number, name: string, color: number) => {
    walkRects.push({ x0: -6, x1: 6, z0: z - 6, z1: z + 6, top })
    const slab = ghostBox(12, 0.45, 12)
    slab.name = `${name}-deck`
    slab.position.set(0, top - 0.225, z)
    scene.add(slab)
    collidables.push(slab)
    walls.push({ x: 0, z, hw: 6, hd: 6, h: top, bottom: top - 0.45 })
    const rim = edgeBox(12, 0.45, 12, color)
    rim.position.copy(slab.position)
    scene.add(rim)

    const lines: number[] = []
    for (const x of [-6, 6]) {
      // Open ends let players enter from the jump pads and drop back onto the road.
      walls.push({ x, z, hw: 0.1, hd: 6, h: top + 1.1, bottom: top })
      for (const y of [top + 0.55, top + 1.1]) lines.push(x, y, z - 6, x, y, z + 6)
      for (let dz = -6; dz <= 6; dz += 3) lines.push(x, top, z + dz, x, top + 1.1, z + dz)
      for (const dz of [-6, 6]) {
        const strut = edgeBox(0.5, top - 0.6, 0.5, color)
        strut.position.set(x, (top + 0.6) / 2, z + dz)
        scene.add(strut)
        const solid = ghostBox(0.5, top - 0.6, 0.5)
        solid.position.copy(strut.position)
        scene.add(solid)
        collidables.push(solid)
        walls.push({ x, z: z + dz, hw: 0.25, hd: 0.25, h: top })
      }
      lines.push(x, 0.6, z - 6, x, top - 0.45, z + 6)
      lines.push(x, 0.6, z + 6, x, top - 0.45, z - 6)
    }
    for (let offset = -4; offset <= 4; offset += 2) {
      lines.push(-6, top + 0.02, z + offset, 6, top + 0.02, z + offset)
      lines.push(offset, top + 0.02, z - 6, offset, top + 0.02, z + 6)
    }
    const frame = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)),
      new THREE.LineBasicMaterial({ color })
    )
    frame.name = `${name}-frame`
    scene.add(frame)
  }
  gantry(-120, 8.5, 'south-tower-gantry', 0x00f0ff)
  gantry(120, 8.5, 'north-tower-gantry', 0x00f0ff)
  gantry(0, 6, 'mid-bridge-skybridge', 0xff2975)

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

  // ---- Silicon Valley / Palo Alto Data Monoliths ----
  floorGrid(-40, 40, 380, 680, 0x00f0ff)
  // Keep a broad central approach and side routes through the server clusters.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 5; row++) {
      const x = side * (row % 2 === 0 ? 31 : 28)
      const z = 442 + row * 48
      const height = 16 + (row % 3) * 7
      const color = row % 2 === 0 ? 0x00f0ff : 0x39ff14
      addWall(x, z, 8, 12, height, color)
      const monolith = new THREE.Group()
      monolith.name = 'palo-alto-data-monolith'
      for (let y = 3; y < height; y += 4) {
        const rack = edgeBox(8.1, 0.5, 12.1, color, 0.55)
        rack.position.set(x, y, z)
        monolith.add(rack)
      }
      scene.add(monolith)
    }
    // Campus edge barriers, with the south approach left open.
    addWall(side * 40, 530, 0.4, 300, 1.4, 0x00f0ff)
  }
  addWall(0, 680, 80, 0.4, 1.4, 0x39ff14)

  // Suspended vault: collision slab, traversable underside, open entry/exit.
  const vaultDeck = ghostBox(36, 0.6, 80)
  vaultDeck.name = 'sand-hill-quantum-vault-deck'
  vaultDeck.position.set(0, 9.2, 520)
  scene.add(vaultDeck)
  collidables.push(vaultDeck)
  walls.push({ x: 0, z: 520, hw: 18, hd: 40, h: 9.5, bottom: 8.9 })
  const vaultFrame = edgeBox(36, 0.6, 80, 0x00f0ff)
  vaultFrame.name = 'sand-hill-quantum-vault-frame'
  vaultFrame.position.copy(vaultDeck.position)
  scene.add(vaultFrame)
  const vaultLines: number[] = []
  for (let x = -18; x <= 18; x += 6) vaultLines.push(x, 9.52, 480, x, 9.52, 560)
  for (let z = 480; z <= 560; z += 8) vaultLines.push(-18, 9.52, z, 18, 9.52, z)
  for (const x of [-18, 18]) {
    walls.push({ x, z: 520, hw: 0.15, hd: 40, h: 10.6, bottom: 9.5 })
    vaultLines.push(x, 10.6, 480, x, 10.6, 560)
    for (const z of [480, 520, 560]) {
      addWall(x, z, 0.8, 0.8, 9.5, 0x00f0ff)
      vaultLines.push(x, 9.5, z, x, 10.6, z)
    }
  }
  scene.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vaultLines, 3)),
    new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.45 })
  ))
  const core = edgeBox(5, 5, 5, 0x39ff14)
  core.name = 'sand-hill-quantum-core'
  core.position.set(0, 15, 535)
  core.rotation.set(Math.PI / 4, Math.PI / 4, 0)
  scene.add(core)
  const coreGlow = makeGlowSprite(0x39ff14, 13, 0.4)
  coreGlow.position.copy(core.position)
  scene.add(coreGlow)
  // Direction chevrons lead from the logistics hub to the launch pad.
  const approachLines: number[] = []
  for (let z = 390; z <= 414; z += 8) {
    approachLines.push(-2, 0.65, z, 0, 0.65, z + 3, 0, 0.65, z + 3, 2, 0.65, z)
  }
  scene.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(approachLines, 3)),
    new THREE.LineBasicMaterial({ color: 0x39ff14 })
  ))

  // ---- Jump pads: pulsing rings and vertical launch arrows ----
  for (const pad of pads) {
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
        new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0, 1.8, 0),
        new THREE.Vector3(0, 1.8, 0), new THREE.Vector3(-0.5, 1.2, 0),
        new THREE.Vector3(0, 1.8, 0), new THREE.Vector3(0.5, 1.2, 0),
      ]),
      ringMat
    )
    arrow.rotation.x = 0
    g.add(ring, arrow)
    g.name = 'jump-pad'
    g.position.copy(pad).add(new THREE.Vector3(0, 0.06, 0))
    scene.add(g)
    pulse.push({ mat: ringMat, base: 1, speed: 3 })
    const padGlow = makeGlowSprite(0x00f0ff, 4.5, 0.4)
    padGlow.position.copy(pad).add(new THREE.Vector3(0, 0.8, 0))
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
    b.position.set(-90 + Math.random() * 180, h / 2, 720 + Math.random() * 90)
    scene.add(b)
  }

  // Drones fly; lift spawn centers above overlapping cover with room for the boss.
  const clearSpawn = (p: THREE.Vector3): THREE.Vector3 => {
    for (const wall of walls) {
      if (Math.abs(p.x - wall.x) <= wall.hw + 2.5 && Math.abs(p.z - wall.z) <= wall.hd + 2.5) {
        p.y = Math.max(p.y, wall.h + 2.6)
      }
    }
    return p
  }
  const randomSpawnPoint = (playerPos: THREE.Vector3): THREE.Vector3 => {
    const candidates: THREE.Vector3[] = []
    for (const r of walkRects) {
      for (let k = 0; k < 4; k++) {
        const x = r.x0 + 2 + Math.random() * Math.max(r.x1 - r.x0 - 4, 1)
        const z = r.z0 + 2 + Math.random() * Math.max(r.z1 - r.z0 - 4, 1)
        const y = r.top + 2 + Math.random() * 8
        const p = clearSpawn(new THREE.Vector3(x, y, z))
        const d = p.distanceTo(playerPos)
        if (d > 28 && d < 85) candidates.push(p)
      }
    }
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)] as THREE.Vector3
    }
    const z = THREE.MathUtils.clamp(playerPos.z + (playerPos.z > 0 ? -45 : 45), -378, 678)
    return clearSpawn(new THREE.Vector3(0, Math.max(4, playerPos.y + 2), z))
  }

  return {
    walls,
    walkRects,
    pads,
    update(t: number) {
      core.rotation.y = Math.PI / 4 + t * 0.35
      core.rotation.z = Math.sin(t * 0.4) * 0.2
      for (const p of pulse) {
        p.mat.opacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * p.speed))
      }
    },
    randomSpawnPoint,
  }
}
