import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildZones, resolveWalls } from './map'

let scene: THREE.Scene
let collidables: THREE.Object3D[]
let zones: ReturnType<typeof buildZones>
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  scene = new THREE.Scene()
  collidables = []
  zones = buildZones(scene, collidables)
  scene.updateMatrixWorld(true)
})
afterEach(() => {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose()
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material?.dispose()
  })
  vi.restoreAllMocks()
})

describe('vertical bridge arena', () => {
  it.each([[-120, 8.5, -135, 'south-tower-gantry'], [120, 8.5, 135, 'north-tower-gantry'], [0, 6, -12, 'mid-bridge-skybridge']] as const)(
    'builds the platform at z=%s with a launch pad, frame and raycastable deck', (z, top, padZ, name) => {
      expect(zones.walkRects).toContainEqual({ x0: -6, x1: 6, z0: z - 6, z1: z + 6, top })
      const pad = zones.pads.find((point) => point.z === padZ)!
      expect(pad.toArray()).toEqual([0, 0.6, padZ])
      expect(pad.boost.x).toBe(0)
      expect(pad.boost.z).toBe(0)
      expect(pad.boost.y ** 2 / (2 * 24)).toBeGreaterThan(top - pad.y)
      expect(scene.getObjectByName(`${name}-frame`)).toBeInstanceOf(THREE.LineSegments)
      const slab = scene.getObjectByName(`${name}-deck`)!
      expect(collidables).toContain(slab)
      const ray = new THREE.Raycaster(new THREE.Vector3(0, top + 5, z), new THREE.Vector3(0, -1, 0))
      expect(ray.intersectObject(slab)[0]!.point.y).toBeCloseTo(top)
      ray.set(new THREE.Vector3(0, 2.4, z), new THREE.Vector3(0, 1, 0))
      expect(ray.intersectObject(slab)[0]!.point.y).toBeCloseTo(top - 0.45)
    }
  )

  it('keeps the road underneath and walking on top open while colliding with slab sides and railings', () => {
    for (const [z, top] of [[-120, 8.5], [120, 8.5], [0, 6]]) {
      const underneath = new THREE.Vector3(0, 2.4, z)
      resolveWalls(zones.walls, underneath, 0.55, 0.6)
      expect(underneath.toArray()).toEqual([0, 2.4, z])
      const above = new THREE.Vector3(0, top! + 1.8, z)
      resolveWalls(zones.walls, above, 0.55, top!)
      expect(above.x).toBe(0)
      expect(above.z).toBe(z)
      const side = new THREE.Vector3(0, top! - 0.1, z! - 6.1)
      resolveWalls(zones.walls, side, 0.55, side.y - 1.8)
      expect(side.z).toBeLessThanOrEqual(z! - 6.5)
      const rail = new THREE.Vector3(5.8, top! + 1.8, z)
      resolveWalls(zones.walls, rail, 0.55, top!)
      expect(rail.x).toBeLessThan(5.5)
    }
  })

  it('provides four animated pads and preserves the warehouse roof', () => {
    expect(zones.pads).toHaveLength(4)
    expect(scene.children.filter((child) => child.name === 'jump-pad')).toHaveLength(4)
    expect(zones.walkRects).toContainEqual({ x0: 8, x1: 24, z0: 300, z1: 360, top: 7 })
    expect(() => zones.update(1)).not.toThrow()
  })

  it('spawns flying enemies over walkable regions and outside every wall/slab, including the fallback', () => {
    for (const random of [0, 0.5, 0.99]) {
      vi.spyOn(Math, 'random').mockReturnValue(random)
      for (const z of [-370, -120, 0, 120, 330, 390]) {
        const spawn = zones.randomSpawnPoint(new THREE.Vector3(0, 10.3, z))
        expect(zones.walkRects.some((r) => spawn.x >= r.x0 && spawn.x <= r.x1 && spawn.z >= r.z0 && spawn.z <= r.z1 && spawn.y > r.top)).toBe(true)
        for (const wall of zones.walls) {
          const overlaps = Math.abs(spawn.x - wall.x) <= wall.hw + 2.5 && Math.abs(spawn.z - wall.z) <= wall.hd + 2.5
          if (overlaps) expect(spawn.y - 2.5).toBeGreaterThan(wall.h)
        }
      }
    }
  })
})
