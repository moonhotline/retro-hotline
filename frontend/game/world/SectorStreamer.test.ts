import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildInterconnectedWorld } from './SectorStreamer'

describe('5-Landmark Interconnected Open World & SectorStreamer', () => {
  it('registers all 5 themed landmarks and 5 vehicle spawn points across the 3,600m corridor', () => {
    const scene = new THREE.Scene()
    const collidables: THREE.Object3D[] = []
    const world = buildInterconnectedWorld(scene, collidables)

    expect(world.sectors.map((s) => s.id)).toEqual([
      'golden-gate',
      'times-square',
      'vegas-sphere',
      'googleplex',
      'apple-park',
    ])
    expect(world.vehicleSpawns).toHaveLength(5)
    expect(world.vehicleSpawns.map((v) => v.sectorId)).toEqual([
      'golden-gate',
      'times-square',
      'vegas-sphere',
      'googleplex',
      'apple-park',
    ])
    expect(scene.getObjectByName('las-vegas-sphere')).toBeDefined()
    expect(scene.getObjectByName('googleplex-canopy')).toBeDefined()
    expect(scene.getObjectByName('apple-park-ring')).toBeDefined()
  })

  it('provides seamless continuous walkable road coverage from Silicon Valley (z=680) to Apple Park (z=3480)', () => {
    const scene = new THREE.Scene()
    const collidables: THREE.Object3D[] = []
    const world = buildInterconnectedWorld(scene, collidables)

    for (let z = 685; z <= 3475; z += 50) {
      const covered = world.walkRects.some((r) => 0 >= r.x0 && 0 <= r.x1 && z >= r.z0 && z <= r.z1)
      expect(covered, `Missing road coverage at z=${z}`).toBe(true)
    }
    expect(collidables.length).toBeGreaterThanOrEqual(8)
  })

  it('streams sector detail groups based on playerZ while keeping distant hero landmarks visible', () => {
    const scene = new THREE.Scene()
    const collidables: THREE.Object3D[] = []
    const world = buildInterconnectedWorld(scene, collidables)

    // Near Golden Gate (z=180): Times Square is within stream radius, Apple Park detail group is culled
    world.update(1.5, 180, 0.4)
    expect(world.sectorForZ(180).id).toBe('golden-gate')
    expect(world.sectors[1]!.group.visible).toBe(true)
    expect(world.sectors[4]!.group.visible).toBe(false)

    // Near Apple Park (z=3160): Apple Park & Googleplex active, Times Square detail culled
    world.update(2.5, 3160, 0.8)
    expect(world.sectorForZ(3160).id).toBe('apple-park')
    expect(world.sectors[4]!.group.visible).toBe(true)
    expect(world.sectors[4]!.landmark.visible).toBe(true)
    expect(world.sectors[3]!.group.visible).toBe(true)
    expect(world.sectors[1]!.group.visible).toBe(false)
  })
})
