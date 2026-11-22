export type XYZ = [number, number, number]
export type ObjectKind = 'camera' | 'directional' | 'point' | 'sphere'
export type Transform = Pick<SceneObject, 'position' | 'rotation' | 'scale'>

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
  { kind: 'sphere' }
)

export const objectLabels: Record<ObjectKind, string> = {
  camera: '相机',
  directional: '方向光',
  point: '点光源',
  sphere: '测试球',
}

const storageKey = 'retro-hotline.dev-lab.scene.v1'

export function createObject(kind: ObjectKind, name: string, id: string = crypto.randomUUID()): SceneObject {
  const base: SceneObjectBase = { id, name, position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  switch (kind) {
    case 'camera': return { ...base, kind, position: [-3, 2.4, 3.5], rotation: [-18, -35, 0], fov: 48 }
    case 'directional': return { ...base, kind, position: [3, 4.6, 1], rotation: [-50, 40, 0], color: '#fff4df', intensity: 2.5 }
    case 'point': return { ...base, kind, position: [-3, 1.9, -2.5], color: '#d7e9ff', intensity: 22 }
    case 'sphere': return { ...base, kind }
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
