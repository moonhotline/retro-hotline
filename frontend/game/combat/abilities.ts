import * as THREE from 'three'
import { DRONE_STATS } from '../effects'
import { resolveWalls } from '../map'
import type { AbilityState, AbilityStates } from '../types'
import type { CombatHost, Enemy, Projectile, WaveDirector } from '../waves'

const DASH_COOLDOWN = 2.5
const DASH_DURATION = 0.18
const DASH_SPEED = 38
const PARRY_COOLDOWN = 3.5
const PARRY_DURATION = 0.4
const SLAM_COOLDOWN = 5
const CYAN = 0x00f0ff
const GOLD = 0xffd319
type NeonLine = THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>

export interface AbilityHost extends CombatHost {
  isGrounded(): boolean
  groundHeight(): number
  setVerticalVelocity(velocity: number): void
  setInvulnerable(active: boolean): void
}

interface Effect {
  line: NeonLine
  life: number
  total: number
  radius?: number
}

/** Owns ability clocks, dash motion, projectile interception and disposable neon FX. */
export class AbilitySystem {
  private dashCooldown = 0
  private parryCooldown = 0
  private slamCooldown = 0
  private dashTimer = 0
  private parryTimer = 0
  private slamming = false
  private dashVelocity = new THREE.Vector3()
  private dashDistance = 0
  private ghostCount = 0
  private shield: NeonLine | null = null
  private streaks: NeonLine | null = null
  private effects: Effect[] = []
  private raycaster = new THREE.Raycaster()

  constructor(private director: WaveDirector, private host: AbilityHost) {}

  get isDashing() { return this.dashTimer > 0 }
  get isParrying() { return this.parryTimer > 0 }
  get isSlamming() { return this.slamming }

  resetDashCooldown() { this.dashCooldown = 0 }

  stats(): AbilityStates {
    const state = (cooldown: number, remaining: number, active: boolean): AbilityState => ({
      cooldown, remaining, active, ready: remaining <= 0 && !active,
      fill: THREE.MathUtils.clamp(1 - remaining / cooldown, 0, 1),
    })
    return {
      phaseDash: state(DASH_COOLDOWN, this.dashCooldown, this.isDashing),
      pulseParry: state(PARRY_COOLDOWN, this.parryCooldown, this.isParrying),
      kineticSlam: state(SLAM_COOLDOWN, this.slamCooldown, this.slamming),
    }
  }

  tryPhaseDash(direction = new THREE.Vector3()): boolean {
    if (this.dashCooldown > 0 || this.isDashing || this.slamming) return false
    this.dashVelocity.copy(direction)
    if (this.dashVelocity.lengthSq() < 0.000001) this.host.camera.getWorldDirection(this.dashVelocity)
    this.dashVelocity.normalize().multiplyScalar(DASH_SPEED)
    this.dashCooldown = DASH_COOLDOWN
    this.dashTimer = DASH_DURATION
    this.dashDistance = 0
    this.ghostCount = 0
    this.host.setInvulnerable(true)
    this.host.setVerticalVelocity(0)
    this.spawnGhost()
    this.spawnStreaks()
    this.host.sfx.phaseDash()
    return true
  }

  tryPulseParry(): boolean {
    if (this.parryCooldown > 0 || this.isParrying) return false
    this.parryCooldown = PARRY_COOLDOWN
    this.parryTimer = PARRY_DURATION
    this.shield = this.makeLoop(6, 0.65, CYAN)
    this.shield.name = 'pulse-parry-shield'
    this.shield.position.z = -1.2
    this.host.camera.add(this.shield)
    return true
  }

  tryKineticSlam(): boolean {
    if (this.slamCooldown > 0 || this.slamming || this.isDashing || this.host.isGrounded()) return false
    if (this.host.playerPos().y <= this.host.groundHeight() + 1.8) return false
    this.slamCooldown = SLAM_COOLDOWN
    this.slamming = true
    this.host.setVerticalVelocity(-45)
    return true
  }

  /** Called before movement, using unscaled gameplay time. Pausing freezes these clocks. */
  update(dt: number, t: number) {
    this.dashCooldown = Math.max(0, this.dashCooldown - dt)
    this.parryCooldown = Math.max(0, this.parryCooldown - dt)
    this.slamCooldown = Math.max(0, this.slamCooldown - dt)
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]!
      effect.life -= dt
      if (effect.life <= 0) {
        this.disposeLine(effect.line)
        this.effects.splice(i, 1)
      } else {
        effect.line.material.opacity = effect.life / effect.total
        if (effect.radius) effect.line.scale.setScalar(0.2 + (1 - effect.life / effect.total) * (effect.radius - 0.2))
      }
    }

    if (this.isDashing) {
      this.moveDash(Math.min(dt, this.dashTimer))
      this.dashTimer = Math.max(0, this.dashTimer - dt)
      if (!this.isDashing) this.endDash()
    }
    this.parryTimer = Math.max(0, this.parryTimer - dt)
    if (this.shield) {
      this.shield.rotation.z = t * 7
      this.shield.material.opacity = 0.55 + Math.sin(t * 35) * 0.2
      if (!this.isParrying) {
        this.disposeLine(this.shield)
        this.shield = null
      }
    }
    if (this.slamming) {
      if (this.host.isGrounded()) this.onLanding()
      else this.host.setVerticalVelocity(-45)
    }
  }

  /** WaveDirector calls this before moving a hostile bolt, including its swept path. */
  deflectProjectile(projectile: Projectile, dt: number): boolean {
    if (!this.isParrying || projectile.byPlayer) return false
    const origin = projectile.sprite.position
    const player = this.host.playerPos()
    const forward = this.host.camera.getWorldDirection(new THREE.Vector3())
    const travel = projectile.vel.length() * dt
    const steps = Math.max(1, Math.ceil(travel / 0.2))
    const point = new THREE.Vector3()
    const offset = new THREE.Vector3()
    for (let i = 0; i <= steps; i++) {
      point.copy(origin).addScaledVector(projectile.vel, dt * i / steps)
      offset.subVectors(point, player)
      const distance = offset.length()
      if (distance < 0.000001 || distance > 3.5 || offset.divideScalar(distance).dot(forward) <= 0.4) continue
      if (!this.clearLine(player, point) || !this.clearLine(origin, point)) continue

      let closest: Enemy | undefined
      let nearest = Infinity
      for (const enemy of this.director.enemies) {
        if (enemy.hp <= 0) continue
        const d = enemy.parts.group.position.distanceToSquared(point)
        if (d < nearest) { nearest = d; closest = enemy }
      }
      const speed = projectile.vel.length() * 3
      const direction = closest ? closest.parts.group.position.clone().sub(point) : projectile.vel.clone().negate()
      if (direction.lengthSq() < 0.000001) direction.copy(forward)
      projectile.vel.copy(direction.normalize()).multiplyScalar(speed)
      projectile.sprite.position.copy(point)
      projectile.sprite.material.color.setHex(CYAN)
      projectile.byPlayer = true
      this.host.sfx.parryClash()
      this.host.addShake(0.6)
      this.host.hitstop(0.05, 0.06)
      if (this.shield) this.shield.material.color.setHex(GOLD)
      return true
    }
    return false
  }

  /** Resolve the impact immediately after ground collision, before jump pads can launch again. */
  onLanding() {
    if (!this.slamming) return
    this.slamming = false
    const at = this.host.playerPos().clone()
    const impact = { radius: 12, staggerAll: false }
    this.host.hackManager?.onSlam(impact)
    at.y = this.host.groundHeight() + 0.08
    const wave = this.makeLoop(64, 1, CYAN)
    wave.name = 'kinetic-slam-shockwave'
    wave.position.copy(at)
    wave.rotation.x = -Math.PI / 2
    wave.scale.setScalar(0.2)
    this.host.scene.add(wave)
    this.effects.push({ line: wave, life: 0.5, total: 0.5, radius: 14 * impact.radius / 12 })
    this.host.addShake(1)
    this.host.sfx.slamImpact()
    this.host.particles.burst(at, new THREE.Color(GOLD), 60, 16, 0.6)
    for (const enemy of [...this.director.enemies]) {
      if (enemy.parts.group.position.distanceTo(this.host.playerPos()) > impact.radius) continue
      const killed = this.director.damageEnemy(enemy, 45, true)
      if (!killed && (impact.staggerAll || enemy.hp <= DRONE_STATS[enemy.type].hp * 0.6)) this.director.staggerEnemy(enemy)
    }
  }

  /** Cancel motion on a fall rescue without refunding cooldowns. */
  cancelMotion() {
    this.endDash()
    this.slamming = false
  }

  reset() {
    this.cancelMotion()
    this.dashCooldown = this.parryCooldown = this.slamCooldown = this.parryTimer = 0
    this.dashVelocity.set(0, 0, 0)
    this.dashDistance = this.ghostCount = 0
    if (this.shield) this.disposeLine(this.shield)
    this.shield = null
    for (const effect of this.effects) this.disposeLine(effect.line)
    this.effects = []
  }

  private moveDash(dt: number) {
    const position = this.host.playerPos()
    const steps = Math.max(1, Math.ceil(DASH_SPEED * dt / 0.2))
    const from = new THREE.Vector3()
    const intended = new THREE.Vector3()
    for (let i = 0; i < steps; i++) {
      from.copy(position)
      intended.copy(position).addScaledVector(this.dashVelocity, dt / steps)
      position.copy(intended)
      resolveWalls(this.host.walls(), position, 0.55, position.y)
      position.x = THREE.MathUtils.clamp(position.x, -60, 60)
      position.z = THREE.MathUtils.clamp(position.z, -400, 400)
      this.dashDistance += position.distanceTo(from)
      this.sliceTargets(from, position)
      while (this.ghostCount < 3 && this.dashDistance >= this.ghostCount * DASH_SPEED * DASH_DURATION / 3) this.spawnGhost()
      if (position.distanceToSquared(intended) > 0.000001) { this.endDash(); break }
    }
  }

  private sliceTargets(from: THREE.Vector3, to: THREE.Vector3) {
    const segment = new THREE.Line3(from, to)
    const closest = new THREE.Vector3()
    for (const enemy of [...this.director.enemies]) {
      if (enemy.hp <= 0 || enemy.staggerTimer <= 0) continue
      const at = enemy.parts.group.position
      segment.closestPointToPoint(at, true, closest)
      if (closest.distanceToSquared(at) > 4 || !this.clearLine(closest, at)) continue
      // A slice preserves the dash direction and awards the same execution rewards.
      const impact = at.clone()
      this.director.explodeEnemy(enemy, true)
      this.host.onGloryKill(impact)
      this.host.sfx.gloryKill()
      this.host.hitstop(0.05, 0.12)
      this.host.addShake(0.8)
      this.host.shockwave(impact, CYAN, 7)
    }
  }

  private clearLine(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const offset = new THREE.Vector3().subVectors(to, from)
    const distance = offset.length()
    if (distance < 0.000001) return true
    const collidables = this.host.collidables()
    for (const object of collidables) object.updateWorldMatrix(true, false)
    this.raycaster.set(from, offset.divideScalar(distance))
    this.raycaster.far = distance
    return this.raycaster.intersectObjects(collidables, false).length === 0
  }

  private spawnGhost() {
    const box = new THREE.BoxGeometry(0.75, 1.6, 0.4)
    const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(box), this.material(CYAN))
    box.dispose()
    ghost.name = 'phase-dash-ghost'
    ghost.position.copy(this.host.playerPos())
    ghost.position.y -= 0.6
    ghost.quaternion.copy(this.host.camera.quaternion)
    this.host.scene.add(ghost)
    this.effects.push({ line: ghost, life: 0.32, total: 0.32 })
    this.ghostCount++
  }

  private spawnStreaks() {
    const points: THREE.Vector3[] = []
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2
      const x = Math.cos(angle), y = Math.sin(angle)
      points.push(new THREE.Vector3(x * 0.82, y * 0.82, -1), new THREE.Vector3(x * 1.2, y * 1.2, -1))
    }
    this.streaks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), this.material(CYAN))
    this.streaks.name = 'phase-dash-streaks'
    // Fit camera-local lines to the current viewport without blocking the crosshair.
    const height = Math.tan(THREE.MathUtils.degToRad(this.host.camera.fov / 2))
    this.streaks.scale.set(height * this.host.camera.aspect, height, 1)
    this.host.camera.add(this.streaks)
  }

  private endDash() {
    this.dashTimer = 0
    this.host.setInvulnerable(false)
    if (this.streaks) this.disposeLine(this.streaks)
    this.streaks = null
  }

  private material(color: number) {
    return new THREE.LineBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  }

  private makeLoop(sides: number, radius: number, color: number): NeonLine {
    const points = Array.from({ length: sides }, (_, i) => {
      const angle = i / sides * Math.PI * 2
      return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
    })
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), this.material(color))
  }

  private disposeLine(line: NeonLine) {
    line.removeFromParent()
    line.geometry.dispose()
    line.material.dispose()
  }
}
