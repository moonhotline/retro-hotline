import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { VehicleSystem } from './VehicleSystem'
import type { VehicleSpawnPoint } from '../world/SectorStreamer'

const SPAWNS: VehicleSpawnPoint[] = [
  { sectorId: 'golden-gate', x: -3.2, y: 0.62, z: 162, heading: 0 },
  { sectorId: 'times-square', x: -5.5, y: 0.62, z: 860, heading: 0 },
]

describe('VehicleSystem (GTA 6 x Outrun Neon GT Coupe)', () => {
  it('enters nearest parked vehicle within range and exits safely beside the driver door', () => {
    const scene = new THREE.Scene()
    const sys = new VehicleSystem(scene, SPAWNS)

    // Too far away
    expect(sys.nearestEnterable(new THREE.Vector3(0, 2.4, 180))).toBeNull()
    expect(sys.enterNearest(new THREE.Vector3(0, 2.4, 180))).toBeNull()

    // Within range near Golden Gate vehicle
    const entered = sys.enterNearest(new THREE.Vector3(-2, 2.4, 165))
    expect(entered).not.toBeNull()
    expect(sys.isDriving).toBe(true)
    expect(sys.hudState()?.active).toBe(true)

    const exited = sys.exitVehicle()
    expect(exited).not.toBeNull()
    expect(sys.isDriving).toBe(false)
    expect(exited!.exitPos.distanceTo(entered!.pos)).toBeGreaterThan(2)
  })

  it('accelerates, drifts with neon tire trails, consumes nitrous, fires twin pulse cannons, and positions chase camera', () => {
    const scene = new THREE.Scene()
    const sys = new VehicleSystem(scene, SPAWNS)
    const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2000)
    const onCannon = vi.fn()

    const car = sys.enterNearest(new THREE.Vector3(-3, 2.4, 162))!
    const startZ = car.pos.z

    // Accelerate with nitrous + fire cannons
    for (let i = 0; i < 25; i++) {
      sys.update(
        0.05,
        i * 0.05,
        car.pos,
        { throttle: 1, steer: 0, drift: false, nitrous: true, fire: true },
        [],
        () => 0.6,
        onCannon
      )
    }
    expect(car.pos.z).toBeGreaterThan(startZ + 20)
    expect(car.speed).toBeGreaterThan(35)
    expect(car.nitrous).toBeLessThan(1)
    expect(onCannon).toHaveBeenCalled()

    // Engage handbrake drift + steer left
    const headingBefore = car.heading
    const res = sys.update(
      0.05,
      1.3,
      car.pos,
      { throttle: 1, steer: 1, drift: true, nitrous: false, fire: false },
      [],
      () => 0.6
    )
    expect(car.drifting).toBe(true)
    expect(car.heading).toBeGreaterThan(headingBefore)
    expect(res.ramOrigin).not.toBeNull()
    expect(res.fovTarget).toBeGreaterThan(76)

    sys.applyChaseCamera(cam, 0.05)
    expect(cam.position.z).toBeLessThan(car.pos.z)
    expect(cam.position.y).toBeGreaterThan(car.pos.y + 1.5)
  })
})
