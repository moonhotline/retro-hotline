export type XYZ = [number, number, number]
export type PrimitiveKind = 'camera' | 'directional' | 'point' | 'sphere' | 'npc'
export type ObjectKind = PrimitiveKind | 'model'
export type Transform = Pick<SceneObject, 'position' | 'rotation' | 'scale'>
export type Sky = { kind: 'white' | 'day' | 'night' } | { kind: 'image'; id: string; name: string }

interface SceneObjectBase {
  id: string
  name: string
  position: XYZ
  rotation: XYZ
  scale: XYZ
}
export type SceneObject = SceneObjectBase & (
  { kind: 'camera'; fov: number } |
  { kind: 'directional' | 'point'; color: string; intensity: number } |
  { kind: 'sphere' } |
  { kind: 'npc'; speed: number } |
  { kind: 'model'; filename: string; bytes: number }
)

export const objectLabels: Record<ObjectKind, string> = {
  camera: '相机',
  directional: '方向光',
  point: '点光源',
  sphere: '测试球',
  npc: '试玩角色',
  model: '导入模型',
}

const storageKey = 'retro-hotline.dev-lab.scene.v1'
const skyKey = 'retro-hotline.dev-lab.sky.v1'

function objectBase(name: string, id: string): SceneObjectBase {
  return { id, name, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
}

export function createModelObject(file: File): SceneObject {
  return { ...objectBase(file.name.replace(/\.(gltf|glb)$/i, ''), crypto.randomUUID()), kind: 'model', filename: file.name, bytes: file.size }
}

export function createObject(kind: PrimitiveKind, name: string, id: string = crypto.randomUUID()): SceneObject {
  const base = objectBase(name, id)
  switch (kind) {
    case 'camera': return { ...base, kind, position: [-3, 2.4, 3.5], rotation: [-18, -35, 0], fov: 48 }
    case 'directional': return { ...base, kind, position: [3, 4.6, 1], rotation: [-50, 40, 0], color: '#fff4df', intensity: 2.5 }
    case 'point': return { ...base, kind, position: [-3, 1.9, -2.5], color: '#d7e9ff', intensity: 22 }
    case 'sphere': return { ...base, kind, position: [0, 1, 0] }
    case 'npc': return { ...base, kind, speed: 2.2 }
  }
}

function isXYZ(value: unknown): value is XYZ {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
}

function isSceneObject(value: unknown): value is SceneObject {
  if (value === null || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' ||
      !isXYZ(item.position) || !isXYZ(item.rotation) || !isXYZ(item.scale) ||
      item.scale.some(component => component < 0.01)) return false
  switch (item.kind) {
    case 'camera': return typeof item.fov === 'number' && item.fov >= 10 && item.fov <= 120
    case 'directional':
    case 'point':
      return typeof item.color === 'string' && /^#[\da-f]{6}$/i.test(item.color) &&
        typeof item.intensity === 'number' && Number.isFinite(item.intensity) && item.intensity >= 0
    case 'sphere': return true
    case 'npc': return typeof item.speed === 'number' && item.speed >= 0.2 && item.speed <= 12
    case 'model': return typeof item.filename === 'string' && typeof item.bytes === 'number' &&
      Number.isFinite(item.bytes) && item.bytes > 0
    default: return false
  }
}

export function loadScene(): SceneObject[] {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw !== null) {
      const objects: unknown = JSON.parse(raw)
      if (Array.isArray(objects) && objects.every(isSceneObject) &&
          new Set(objects.map(item => item.id)).size === objects.length) return objects
    }
  } catch {
    // The editor also works when browser storage is unavailable.
  }
  return [
    createObject('camera', '场景相机', 'camera-main'),
    createObject('directional', '主光', 'light-key'),
    createObject('point', '补光', 'light-fill'),
  ]
}

export function saveScene(objects: SceneObject[]): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(objects))
    return true
  } catch {
    return false
  }
}

export function loadSky(): Sky {
  try {
    const value = JSON.parse(localStorage.getItem(skyKey) ?? 'null')
    if (value?.kind === 'day' || value?.kind === 'night') return { kind: value.kind }
    if (value?.kind === 'image' && typeof value.id === 'string' && typeof value.name === 'string') return value
  } catch {
    // A missing or corrupt preference falls back to the white editing space.
  }
  return { kind: 'white' }
}

export function saveSky(sky: Sky): boolean {
  try {
    localStorage.setItem(skyKey, JSON.stringify(sky))
    return true
  } catch {
    return false
  }
}
