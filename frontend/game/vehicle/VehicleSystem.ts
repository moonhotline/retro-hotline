import * as THREE from 'three'
import { buildIndustrialSportsCar, type IndustrialCarRig } from '../models/neonSportsCar'
import type { VehicleSpawnPoint } from '../world/SectorStreamer'
import type { VehicleHudState } from '../types'
import { resolveWalls, type Wall } from '../map'

export interface VehicleInstance {
  id: string
  sectorId: string
  rig: IndustrialCarRig
  halo: THREE.Mesh
  pos: THREE.Vector3
  heading: number
  speed: number
  steerAngle: number
  driftAngle: number
  nitrous: number
  drifting: boolean
  boosting: boolean
}

export interface VehicleDriveInput {
  throttle: number // -1..1 (W=+1, S=-1)
  steer: number // -1..1 (A=+1 left, D=-1 right)
  drift: boolean // SPACE handbrake drift
  nitrous: boolean // SHIFT nitrous boost
  fire: boolean // LMB twin front pulse cannons
}

interface SkidRibbon {
  mesh: THREE.Mesh
  life: number
  maxLife: number
}

const ENTER_RANGE = 7.8
const MAX_SPEED = 45
const MAX_NITROUS_SPEED = 66
const MAX_REVERSE = -16
const ACCEL = 34
const NITROUS_ACCEL = 58
const BRAKE_DECEL = 48
const DRAG = 8.5
const WHEEL_RADIUS = 0.36
const STREAM_VIS_RANGE = 680

export class VehicleSystem {
  readonly vehicles: VehicleInstance[] = []
  active: VehicleInstance | null = null
  private skids: SkidRibbon[] = []
  private skidAccum = 0
  private cannonCd = 0
  private chasePos = new THREE.Vector3()
  private chaseLook = new THREE.Vector3()
  private chaseInit = false

  constructor(
    private scene: THREE.Scene,
    spawns: readonly VehicleSpawnPoint[]
  ) {
    const haloGeo = new THREE.TorusGeometry(3.2, 0.08, 10, 48).rotateX(Math.PI / 2)
    for (let i = 0; i < spawns.length; i++) {
      const sp = spawns[i]!
      const rig = buildIndustrialSportsCar()
      rig.group.position.set(sp.x, sp.y, sp.z)
      // Face north (+Z) down the 5-landmark corridor
      const heading = 0
      rig.group.rotation.y = heading
      scene.add(rig.group)

      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x28e8ff,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
      const halo = new THREE.Mesh(haloGeo, haloMat)
      halo.position.set(sp.x, sp.y + 0.06, sp.z)
      scene.add(halo)

      this.vehicles.push({
        id: `gt-coupe-${i + 1}`,
        sectorId: sp.sectorId,
        rig,
        halo,
        pos: new THREE.Vector3(sp.x, sp.y, sp.z),
        heading,
        speed: 0,
        steerAngle: 0,
        driftAngle: 0,
        nitrous: 1,
        drifting: false,
        boosting: false,
      })
    }
  }

  get isDriving(): boolean {
    return this.active !== null
  }

  nearestEnterable(playerPos: THREE.Vector3): VehicleInstance | null {
    if (this.active) return null
    let best: VehicleInstance | null = null
    let bestD = ENTER_RANGE
    for (const v of this.vehicles) {
      const d = Math.hypot(v.pos.x - playerPos.x, v.pos.z - playerPos.z)
      if (d <= bestD) {
        bestD = d
        best = v
      }
    }
    return best
  }

  enterNearest(playerPos: THREE.Vector3): VehicleInstance | null {
    const target = this.nearestEnterable(playerPos)
    if (!target) return null
    this.active = target
    target.halo.visible = false
    target.rig.setHeadlightsOn(true)
    this.chaseInit = false
    return target
  }

  exitVehicle(): { exitPos: THREE.Vector3; yaw: number } | null {
    const v = this.active
    if (!v) return null
    v.speed *= 0.25
    v.drifting = false
    v.boosting = false
    v.rig.setNitrousIntensity(0)
    v.rig.setBrakeIntensity(0.4)
    v.halo.visible = true
    v.halo.position.set(v.pos.x, v.pos.y + 0.06, v.pos.z)
    this.active = null
    this.chaseInit = false

    // Place player cleanly beside the left door of the vehicle
    const leftX = Math.cos(v.heading)
    const leftZ = -Math.sin(v.heading)
    const exitPos = new THREE.Vector3(v.pos.x + leftX * 2.7, v.pos.y + 1.8, v.pos.z + leftZ * 2.7)
    // Convert car heading (+Z when 0) to camera FPS yaw (-Z when 0)
    const fpsYaw = v.heading + Math.PI
    return { exitPos, yaw: fpsYaw }
  }

  reset(spawns: readonly VehicleSpawnPoint[]) {
    this.active = null
    this.chaseInit = false
    this.cannonCd = 0
    for (let i = 0; i < this.vehicles.length && i < spawns.length; i++) {
      const v = this.vehicles[i]!
      const sp = spawns[i]!
      v.pos.set(sp.x, sp.y, sp.z)
      v.heading = 0
      v.speed = 0
      v.steerAngle = 0
      v.driftAngle = 0
      v.nitrous = 1
      v.drifting = false
      v.boosting = false
      v.rig.group.position.copy(v.pos)
      v.rig.group.rotation.set(0, v.heading, 0)
      v.rig.bodyGroup.rotation.set(0, 0, 0)
      v.rig.setNitrousIntensity(0)
      v.rig.setBrakeIntensity(0)
      v.halo.position.set(sp.x, sp.y + 0.06, sp.z)
      v.halo.visible = true
    }
    this.clearSkids()
  }

  update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    input: VehicleDriveInput,
    walls: readonly Wall[],
    groundAt: (x: number, z: number, footY: number) => number,
    onCannonFire?: (leftOrigin: THREE.Vector3, rightOrigin: THREE.Vector3, dir: THREE.Vector3) => void
  ): {
    fovTarget: number | null
    ramOrigin: THREE.Vector3 | null
    ramSpeed: number
    ramDir: THREE.Vector3 | null
  } {
    this.updateSkids(dt)

    // Stream parked vehicles by distance to keep GPU draw calls lean
    for (const v of this.vehicles) {
      const isCurrent = v === this.active
      const distZ = Math.abs(v.pos.z - playerPos.z)
      v.rig.group.visible = isCurrent || distZ <= STREAM_VIS_RANGE
      v.halo.visible = !isCurrent && distZ <= STREAM_VIS_RANGE
      if (v.halo.visible) {
        const s = 1 + Math.sin(elapsed * 3.2) * 0.05
        v.halo.scale.set(s, 1, s)
      }
    }

    const v = this.active
    if (!v) return { fovTarget: null, ramOrigin: null, ramSpeed: 0, ramDir: null }

    const wantsBoost = input.nitrous && v.nitrous > 0.04 && input.throttle >= 0
    v.boosting = wantsBoost
    if (wantsBoost) {
      v.nitrous = Math.max(0, v.nitrous - dt * 0.32)
    } else {
      const recharge = v.drifting ? 0.28 : 0.12
      v.nitrous = Math.min(1, v.nitrous + dt * recharge)
    }

    // Acceleration / braking / coasting
    const topSpeed = wantsBoost ? MAX_NITROUS_SPEED : MAX_SPEED
    if (input.throttle > 0.05) {
      const accel = wantsBoost ? NITROUS_ACCEL : ACCEL
      v.speed = Math.min(topSpeed, v.speed + accel * input.throttle * dt)
    } else if (input.throttle < -0.05) {
      if (v.speed > 1.5) {
        v.speed = Math.max(0, v.speed - BRAKE_DECEL * dt)
      } else {
        v.speed = Math.max(MAX_REVERSE, v.speed + ACCEL * 0.7 * input.throttle * dt)
      }
    } else {
      // Natural aerodynamic coasting drag
      const dragDelta = DRAG * dt
      if (Math.abs(v.speed) <= dragDelta) v.speed = 0
      else v.speed -= Math.sign(v.speed) * dragDelta
    }

    // Handbrake drift engagement
    const absSpeed = Math.abs(v.speed)
    v.drifting = input.drift && absSpeed > 11 && Math.abs(input.steer) > 0.05
    if (input.drift && absSpeed > 3) {
      v.speed *= Math.max(0, 1 - dt * 0.45)
    }

    // Steering & arcade drift slip angle
    const steerTarget = input.steer * 0.48
    v.steerAngle = THREE.MathUtils.damp(v.steerAngle, steerTarget, 10, dt)
    const speedFactor = THREE.MathUtils.clamp(absSpeed / 12, 0, 1) * (v.speed >= 0 ? 1 : -1)
    const turnRate = (v.drifting ? 2.55 : 1.75) * speedFactor
    v.heading += input.steer * turnRate * dt

    const targetSlip = v.drifting ? input.steer * 0.34 : 0
    v.driftAngle = THREE.MathUtils.damp(v.driftAngle, targetSlip, 7, dt)

    // Move along heading
    const fwdX = Math.sin(v.heading)
    const fwdZ = Math.cos(v.heading)
    v.pos.x += fwdX * v.speed * dt
    v.pos.z += fwdZ * v.speed * dt

    // Keep within corridor world bounds and resolve wall collisions
    v.pos.x = THREE.MathUtils.clamp(v.pos.x, -108, 108)
    v.pos.z = THREE.MathUtils.clamp(v.pos.z, -385, 3510)
    resolveWalls(walls as Wall[], v.pos, 1.35, v.pos.y)

    // Snap smoothly onto bridge / highway elevation
    const gY = groundAt(v.pos.x, v.pos.z, v.pos.y + 0.5)
    if (gY > -10) {
      v.pos.y = THREE.MathUtils.damp(v.pos.y, gY + 0.02, 16, dt)
    }

    // Apply visual transforms: position, heading + drift tail-out, body roll, wheel spin/steer
    v.rig.group.position.copy(v.pos)
    v.rig.group.rotation.y = v.heading + v.driftAngle
    const rollTarget = -input.steer * THREE.MathUtils.clamp(absSpeed / 36, 0, 1) * (v.drifting ? 0.095 : 0.055)
    const pitchTarget = (input.throttle > 0 ? -0.022 : input.throttle < 0 ? 0.032 : 0) * (wantsBoost ? 1.5 : 1)
    v.rig.bodyGroup.rotation.z = THREE.MathUtils.damp(v.rig.bodyGroup.rotation.z, rollTarget, 9, dt)
    v.rig.bodyGroup.rotation.x = THREE.MathUtils.damp(v.rig.bodyGroup.rotation.x, pitchTarget, 9, dt)

    for (const pivot of v.rig.frontWheelPivots) {
      pivot.rotation.y = v.steerAngle
    }
    const spinDelta = (v.speed * dt) / WHEEL_RADIUS
    for (const spin of v.rig.wheelSpinGroups) {
      spin.rotation.x += spinDelta
    }

    v.rig.setBrakeIntensity(input.throttle < -0.05 || input.drift ? 1 : 0)
    v.rig.setNitrousIntensity(wantsBoost ? 1 : 0)

    // Dual neon tire drift skid ribbons on asphalt
    if (v.drifting) {
      this.skidAccum += dt
      if (this.skidAccum >= 0.035) {
        this.skidAccum = 0
        this.spawnDriftMarks(v)
      }
    }

    // Twin front pulse cannons (LMB while driving)
    this.cannonCd = Math.max(0, this.cannonCd - dt)
    if (input.fire && this.cannonCd <= 0 && onCannonFire) {
      this.cannonCd = 0.14
      v.rig.group.updateMatrixWorld(true)
      const leftW = v.rig.muzzleLeft.clone().applyMatrix4(v.rig.group.matrixWorld)
      const rightW = v.rig.muzzleRight.clone().applyMatrix4(v.rig.group.matrixWorld)
      const dir = new THREE.Vector3(fwdX, 0.03, fwdZ).normalize()
      onCannonFire(leftW, rightW, dir)
    }

    const fovTarget = 76 + THREE.MathUtils.clamp(absSpeed / MAX_SPEED, 0, 1) * 8 + (wantsBoost ? 9 : 0)
    return {
      fovTarget,
      ramOrigin: absSpeed > 18 ? v.pos.clone().add(new THREE.Vector3(fwdX * 1.8, 1.0, fwdZ * 1.8)) : null,
      ramSpeed: absSpeed,
      ramDir: absSpeed > 18 ? new THREE.Vector3(fwdX, 0.1, fwdZ).normalize() : null,
    }
  }

  applyChaseCamera(camera: THREE.PerspectiveCamera, dt: number) {
    const v = this.active
    if (!v) return
    const fwdX = Math.sin(v.heading)
    const fwdZ = Math.cos(v.heading)
    const dist = 6.3 + Math.min(Math.abs(v.speed) * 0.032, 1.8)
    const desiredPos = new THREE.Vector3(
      v.pos.x - fwdX * dist,
      v.pos.y + 2.35,
      v.pos.z - fwdZ * dist
    )
    const desiredLook = new THREE.Vector3(
      v.pos.x + fwdX * 14,
      v.pos.y + 1.35,
      v.pos.z + fwdZ * 14
    )
    if (!this.chaseInit) {
      this.chasePos.copy(desiredPos)
      this.chaseLook.copy(desiredLook)
      this.chaseInit = true
    } else {
      const k = 1 - Math.exp(-dt * 9.5)
      this.chasePos.lerp(desiredPos, k)
      this.chaseLook.lerp(desiredLook, k)
    }
    camera.position.copy(this.chasePos)
    camera.lookAt(this.chaseLook)
  }

  hudState(): VehicleHudState | null {
    const v = this.active
    if (!v) return null
    return {
      active: true,
      speedKmh: Math.round(Math.abs(v.speed) * 3.6),
      nitrous: v.nitrous,
      drifting: v.drifting,
      boosting: v.boosting,
    }
  }

  dispose() {
    this.clearSkids()
    for (const v of this.vehicles) {
      this.scene.remove(v.rig.group)
      this.scene.remove(v.halo)
      ;(v.halo.material as THREE.Material).dispose()
    }
  }

  private spawnDriftMarks(v: VehicleInstance) {
    const yaw = v.heading + v.driftAngle
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    for (const side of [-1, 1] as const) {
      const lx = side * 0.91
      const lz = -1.36
      const wx = v.pos.x + lx * cos + lz * sin
      const wz = v.pos.z - lx * sin + lz * cos
      const mat = new THREE.MeshBasicMaterial({
        color: side < 0 ? 0xff2e88 : 0x28e8ff,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 1.35), mat)
      mark.rotation.x = -Math.PI / 2
      mark.rotation.z = -yaw
      mark.position.set(wx, v.pos.y + 0.03, wz)
      this.scene.add(mark)
      this.skids.push({ mesh: mark, life: 1.6, maxLife: 1.6 })
    }
    if (this.skids.length > 90) {
      const old = this.skids.shift()
      if (old) {
        this.scene.remove(old.mesh)
        old.mesh.geometry.dispose()
        ;(old.mesh.material as THREE.Material).dispose()
      }
    }
  }

  private updateSkids(dt: number) {
    for (let i = this.skids.length - 1; i >= 0; i--) {
      const s = this.skids[i]!
      s.life -= dt
      if (s.life <= 0) {
        this.scene.remove(s.mesh)
        s.mesh.geometry.dispose()
        ;(s.mesh.material as THREE.Material).dispose()
        this.skids.splice(i, 1)
      } else {
        ;(s.mesh.material as THREE.MeshBasicMaterial).opacity = (s.life / s.maxLife) * 0.72
      }
    }
  }

  private clearSkids() {
    for (const s of this.skids) {
      this.scene.remove(s.mesh)
      s.mesh.geometry.dispose()
      ;(s.mesh.material as THREE.Material).dispose()
    }
    this.skids = []
  }
}
