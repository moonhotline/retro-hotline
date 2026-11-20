import * as THREE from 'three'

export interface LoftStation {
  z: number
  points: ReadonlyArray<readonly [number, number]>
}

export interface ModelTelemetry {
  triangles: number
  vertices: number
  meshes: number
}

/**
 * Generates a smooth multi-station lofted BufferGeometry with continuous normals and UVs.
 * Ideal for aerodynamic firearm shrouds, car bodies, and curved architectural shells.
 */
export function buildLoftedSurface(
  stations: readonly LoftStation[],
  closedRing = true,
  capEnds = true
): THREE.BufferGeometry {
  if (stations.length < 2) return new THREE.BufferGeometry()
  const ringLen = stations[0]!.points.length
  const cols = closedRing ? ringLen + 1 : ringLen
  const rows = stations.length

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let r = 0; r < rows; r++) {
    const st = stations[r]!
    const v = r / (rows - 1)
    for (let c = 0; c < cols; c++) {
      const pt = st.points[c % ringLen]!
      positions.push(pt[0], pt[1], st.z)
      uvs.push(c / (cols - 1), v)
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c
      const b = a + 1
      const d = (r + 1) * cols + c
      const e = d + 1
      indices.push(a, d, b)
      indices.push(b, d, e)
    }
  }

  if (capEnds && closedRing) {
    // Front cap (station 0)
    const first = stations[0]!
    let cx0 = 0
    let cy0 = 0
    for (const [x, y] of first.points) {
      cx0 += x
      cy0 += y
    }
    cx0 /= ringLen
    cy0 /= ringLen
    const c0Idx = positions.length / 3
    positions.push(cx0, cy0, first.z)
    uvs.push(0.5, 0)
    for (let c = 0; c < ringLen; c++) {
      const i0 = c
      const i1 = (c + 1) % ringLen
      indices.push(c0Idx, i0, i1)
    }

    // Rear cap (last station)
    const last = stations[rows - 1]!
    let cx1 = 0
    let cy1 = 0
    for (const [x, y] of last.points) {
      cx1 += x
      cy1 += y
    }
    cx1 /= ringLen
    cy1 /= ringLen
    const c1Idx = positions.length / 3
    positions.push(cx1, cy1, last.z)
    uvs.push(0.5, 1)
    const base = (rows - 1) * cols
    for (let c = 0; c < ringLen; c++) {
      const i0 = base + c
      const i1 = base + ((c + 1) % ringLen)
      indices.push(c1Idx, i1, i0)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Creates a superellipse / chamfered-profile ring with high curvature sampling at corners. */
export function superellipseRing(
  rx: number,
  ry: number,
  cy: number,
  segments = 36,
  power = 2.6,
  cx = 0,
  topSkew = 0
): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    const ca = Math.cos(theta)
    const sa = Math.sin(theta)
    const x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / power) * rx
    const y = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / power) * ry
    const taper = sa > 0 ? 1 - topSkew * sa : 1
    pts.push([cx + x * taper, cy + y])
  }
  return pts
}

/** Counts total triangles, vertices, and mesh draw nodes in any Three.js Object3D subtree. */
export function countModelStats(root: THREE.Object3D): ModelTelemetry {
  let triangles = 0
  let vertices = 0
  let meshes = 0
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    meshes++
    const geo = obj.geometry as THREE.BufferGeometry | undefined
    if (!geo) return
    const pos = geo.getAttribute('position')
    if (pos) vertices += pos.count
    if (geo.index) {
      triangles += Math.floor(geo.index.count / 3)
    } else if (pos) {
      triangles += Math.floor(pos.count / 3)
    }
  })
  return { triangles, vertices, meshes }
}

const metalTexCache = new Map<string, THREE.CanvasTexture>()

/** Procedural anisotropic brushed-titanium/aluminum roughness & micro-grain map. */
export function makeBrushedMetalTexture(baseHex = '#9ba6b5', streakAlpha = 0.14): THREE.CanvasTexture {
  const key = `${baseHex}:${streakAlpha}`
  const existing = metalTexCache.get(key)
  if (existing) return existing
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  let ctx: CanvasRenderingContext2D | null = null
  try { ctx = c.getContext('2d') } catch { ctx = null }
  if (ctx) {
    ctx.fillStyle = baseHex
    ctx.fillRect(0, 0, 256, 256)
    let seed = 1337
    const rnd = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let y = 0; y < 256; y++) {
      const bright = rnd() > 0.5
      const a = rnd() * streakAlpha
      ctx.fillStyle = bright ? `rgba(255,255,255,${a})` : `rgba(8,12,20,${a})`
      ctx.fillRect(0, y, 256, 1)
    }
    // Fine panel micro-seam lines
    ctx.fillStyle = 'rgba(10, 14, 24, 0.25)'
    ctx.fillRect(0, 127, 256, 1)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  metalTexCache.set(key, tex)
  return tex
}

/** Procedural crisp sci-fi industrial marking plate texture (no external bitmap needed). */
export function makeIndustrialDecalTexture(title: string, serial: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  let ctx: CanvasRenderingContext2D | null = null
  try { ctx = c.getContext('2d') } catch { ctx = null }
  if (ctx) {
    ctx.clearRect(0, 0, 512, 128)
    ctx.fillStyle = 'rgba(20, 27, 38, 0.92)'
    ctx.fillRect(0, 0, 512, 128)
    ctx.strokeStyle = 'rgba(148, 174, 202, 0.45)'
    ctx.lineWidth = 3
    ctx.strokeRect(8, 8, 496, 112)
    // Cyan accent bar
    ctx.fillStyle = '#2de4ff'
    ctx.fillRect(22, 24, 6, 80)
    // Precision typography
    ctx.fillStyle = '#d7e6f5'
    ctx.font = '700 28px monospace'
    ctx.fillText(title, 44, 58)
    ctx.fillStyle = '#7e9ab8'
    ctx.font = '600 18px monospace'
    ctx.fillText(serial, 44, 92)
    // Calibration ticks on right
    for (let i = 0; i < 12; i++) {
      const h = i % 3 === 0 ? 34 : 18
      ctx.fillStyle = i >= 9 ? '#2de4ff' : 'rgba(155, 180, 205, 0.55)'
      ctx.fillRect(364 + i * 10, 96 - h, 4, h)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  return tex
}
