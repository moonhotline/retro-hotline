import type { ConceptId } from '../../lab/catalog'

export interface Position { x: number; z: number }
interface Block { minX: number; maxX: number; minZ: number; maxZ: number; height: number }
interface Path { width: number; points: readonly Position[] }
type Landmark = Exclude<ConceptId, 'bug' | 'craw'>

const at = (x: number, z: number): Position => ({ x, z })
const block = (minX: number, maxX: number, minZ: number, maxZ: number, height: number): Block =>
  ({ minX, maxX, minZ, maxZ, height })

export const sectors = [
  { id: 'docks', name: '断电港区', x: 0, z: 0, north: 25, south: -43 },
  { id: 'gate', name: '金门大桥', x: 0, z: -101, north: -66, south: -183 },
  { id: 'square', name: '时代广场', x: 0, z: -214, north: -196, south: -274 },
  { id: 'sphere', name: '拉斯维加斯巨球', x: 12.4, z: -308, north: -283, south: -332 },
  { id: 'bay-view', name: 'Google Bay View', x: 23, z: -392, north: -366, south: -417 },
  { id: 'voyager', name: 'NVIDIA Voyager', x: 23, z: -466, north: -439, south: -493 },
  { id: 'orchard', name: 'Apple Park', x: 0, z: -544, north: -514, south: -550 },
] as const satisfies readonly { id: Landmark; name: string; x: number; z: number; north: number; south: number }[]

export const mainPath = [
  { width: 5.1, points: [at(0, 20), at(0, -42)] },
  { width: 4.1, points: [at(0, -42), at(0, -67)] },
  { width: 5.55, points: [at(0, -67), at(0, -183)] },
  { width: 3.55, points: [at(0, -183), at(0, -229), at(-2.8, -236), at(-2.8, -250), at(0, -256), at(0, -283)] },
  { width: 4.2, points: [at(0, -283), at(0, -498), at(0, -514), at(3.25, -524), at(4.7, -541), at(5.55, -548)] },
] satisfies Path[]

export const branches = [
  { width: 2.15, points: [at(1, -10.8), at(11, -13.2), at(11.65, -18), at(11.65, -37.5), at(9.75, -42), at(0, -43.3)] },
  { width: 2.5, points: [at(0, -283.3), at(7, -285.4), at(12.4, -287), at(10, -293), at(0, -295)] },
  { width: 2.25, points: [at(0, -368), at(7, -373), at(21.9, -378), at(22.1, -383), at(12, -383.5), at(4, -387), at(0, -391)] },
  { width: 1.9, points: [at(4.05, -532), at(7.75, -531), at(9, -535.8), at(7.9, -541), at(5.2, -545)] },
] satisfies Path[]

export const spawn = at(0, 16.6)
export const battery = at(-1.25, 15.25)
export const terminal = at(5.55, -548)

export const checkpoints = {
  docks: { name: '港区库房', ...spawn, yaw: 0 },
  approach: { name: '桥头安全点', ...at(0, -63), yaw: 0 },
  square: { name: '广场入口', ...at(0, -189), yaw: 0 },
  sphere: { name: '巨球广场', ...at(0, -287), yaw: 0 },
  bay: { name: 'Bay View 步道', ...at(0, -366), yaw: 0 },
  voyager: { name: 'Voyager 步道', ...at(0, -438), yaw: 0 },
  orchard: { name: 'Apple Park 内庭', ...at(3.55, -526), yaw: -.07 },
} as const

export type Checkpoint = keyof typeof checkpoints
export const checkpointKeys = Object.keys(checkpoints) as Checkpoint[]

const freight = Array.from({ length: 18 }, (_, i) => {
  const row = Math.floor(i / 2)
  const x = (i % 2 === 0 ? -1 : 1) * (5 + row % 3 * 1.75)
  const z = -14.8 - row * 2.46
  return block(x - .93, x + .93, z - 4.7, z, i % 4 === 0 ? 4.35 : 2.27)
})

export const blockers = [
  block(-8.72, -8.47, -12, 24, 12.1), block(8.28, 8.55, -12, 24, 12.1),
  block(-8.6, -5.8, -9.5, 19, 1.45),
  ...freight,
  block(-5.32, -4.68, -47.3, -46.7, 12), block(7.18, 7.82, -47.3, -46.7, 12),
  block(-5.32, -4.68, -32.3, -31.7, 12), block(7.18, 7.82, -32.3, -31.7, 12),
  block(-.22, 3.95, -242.7, -241.98, 28),
  block(-20, -6.69, -272, -200, 31), block(7.53, 20, -272, -200, 31),
  block(3.53, 21.3, -316, -300, 15),
  block(7.8, 38.3, -409, -388.84, 9),
  block(7.8, 38.3, -480, -463.32, 10),
  block(3.05, 3.23, -553.8, -544.5, 3.1),
  block(7.89, 8.07, -553.8, -544.5, 3.1),
  block(3.05, 8.07, -553.8, -553.62, 3.1),
  block(4.08, 7.03, -549.03, -548.67, 1.07),
  block(-1.58, -.90, 14.85, 15.55, .75),
]

export function distance(a: Position, b: Position) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function segmentDistanceSquared(p: Position, a: Position, b: Position) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const along = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)))
  return (p.x - a.x - along * dx) ** 2 + (p.z - a.z - along * dz) ** 2
}

const segments = [...mainPath, ...branches].flatMap(({ width, points }) =>
  points.slice(1).map((end, i) => ({ width, start: points[i]!, end })))

export function insideBlock(p: Position, radius: number, height = 0) {
  return blockers.some(b => height < b.height && p.x > b.minX - radius && p.x < b.maxX + radius &&
    p.z > b.minZ - radius && p.z < b.maxZ + radius)
}

export function walkable(p: Position, radius = .28) {
  if (p.z < -552.6 || p.z > 22.2 || insideBlock(p, radius)) return false
  return segments.some(({ width, start, end }) =>
    segmentDistanceSquared(p, start, end) <= (width - radius) ** 2)
}

export function slide(p: Position, dx: number, dz: number, radius: number) {
  const next = at(p.x + dx, p.z + dz)
  if (walkable(next, radius)) return next
  const alongX = at(next.x, p.z)
  if (walkable(alongX, radius)) return alongX
  const alongZ = at(p.x, next.z)
  return walkable(alongZ, radius) ? alongZ : p
}

export function clearSight(a: Position, b: Position, y = 1) {
  const steps = Math.ceil(distance(a, b) / .22)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    if (insideBlock(at(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t), 0, y)) return false
  }
  return true
}

export function zoneName(z: number) {
  if (z < -43 && z > -66) return '连接道路'
  const here = sectors.find(s => z >= s.south && z <= s.north)
  return here?.name ?? '连接道路'
}

export function zoneDistance(z: number, sector: typeof sectors[number]) {
  return Math.max(0, z - sector.north, sector.south - z)
}
