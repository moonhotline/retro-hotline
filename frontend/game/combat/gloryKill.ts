import * as THREE from 'three'
import { resolveWalls } from '../map'
import type { CombatHost, Enemy, WaveDirector } from '../waves'

export const GLORY_KILL_BANNER = 'GLORY KILL // SHATTERED'
const RANGE = 7
const DASH_TIME = 0.12
const FOV_TIME = 0.4
const GOLD = new THREE.Color(0xffd319)
const CYAN = new THREE.Color(0x00f0ff)
type NeonLine = THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>

interface Fragment {
  line: NeonLine
  velocity: THREE.Vector3
  spin: THREE.Vector3
  life: number
}

/** Stagger targeting, collision-checked dash snaps and disposable neon shatter FX. */
export class GloryKillSystem {
  private reticles = new Map<Enemy, NeonLine>()
  private fragments: Fragment[] = []
  private raycaster = new THREE.Raycaster()
  private dash: { player: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3; elapsed: number } | null = null
  private fovTimer = 0

  constructor(private director: WaveDirector, private host: CombatHost) {}

  get isDashing(): boolean {
    return this.dash !== null
  }

  /** Floor for the engine's existing sprint/slide FOV controller. */
  get fovFloor(): number {
    return this.fovTimer > 0 ? 75 + 21 * Math.min(1, this.fovTimer / 0.25) : 0
  }

  tryGloryKill(
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    enemies: Enemy[],
    host: CombatHost = this.host
  ): boolean {
    if (this.isDashing) return false
    const forward = camera.getWorldDirection(new THREE.Vector3())
    const toEnemy = new THREE.Vector3()
    let target: Enemy | null = null
    let destination: THREE.Vector3 | null = null
    const range = host.hackManager?.gloryKillRange(RANGE) ?? RANGE
    let nearest = range + 0.001
    const collidables = host.collidables()
    for (const object of collidables) object.updateWorldMatrix(true, false)

    for (const enemy of enemies) {
      if (enemy.hp <= 0 || enemy.staggerTimer <= 0 || !this.director.enemies.includes(enemy)) continue
      toEnemy.subVectors(enemy.parts.group.position, playerPos)
      const distance = toEnemy.length()
      if (distance > range || distance >= nearest || distance < 0.001) continue
      toEnemy.divideScalar(distance)
      if (toEnemy.dot(forward) <= 0.6 + Number.EPSILON) continue
      this.raycaster.set(playerPos, toEnemy)
      this.raycaster.far = distance
      if (this.raycaster.intersectObjects(collidables, false).length > 0) continue

      const end = playerPos.clone().addScaledVector(toEnemy, Math.max(0, distance - 1.25))
      // Check the entire player-sized sweep, including thin walls near the route.
      if (!this.dashClear(playerPos, end, host)) continue
      target = enemy
      destination = end
      nearest = distance
    }
    if (!target || !destination) return false

    const impact = target.parts.group.position.clone()
    this.dash = { player: playerPos, from: playerPos.clone(), to: destination, elapsed: 0 }
    this.fovTimer = FOV_TIME
    camera.fov = 96
    camera.updateProjectionMatrix()
    host.hitstop(0.05, 0.12)
    host.addShake(0.8)
    this.removeReticle(target)
    this.shatter(impact, target.radius)
    host.particles.burst(impact, GOLD, 36, 18, 0.6)
    host.particles.burst(impact, CYAN, 36, 14, 0.7)
    host.shockwave(impact, 0x00f0ff, 7)
    host.sfx.gloryKill()
    this.director.explodeEnemy(target, true)
    // Award after normal kill/wave callbacks so their banners cannot hide the execution.
    host.onGloryKill(impact)
    return true
  }

  /** Uses unscaled time so the lunge and FOV kick remain responsive during hitstop. */
  update(dt: number, t: number) {
    this.fovTimer = Math.max(0, this.fovTimer - dt)
    if (this.dash) {
      const dash = this.dash
      dash.elapsed += dt
      const k = Math.min(1, dash.elapsed / DASH_TIME)
      dash.player.lerpVectors(dash.from, dash.to, 1 - Math.pow(1 - k, 3))
      if (k >= 1) this.dash = null
    }

    for (const [enemy] of this.reticles) {
      if (enemy.staggerTimer <= 0 || !this.director.enemies.includes(enemy)) this.removeReticle(enemy)
    }
    for (const enemy of this.director.enemies) {
      if (enemy.staggerTimer <= 0) continue
      let reticle = this.reticles.get(enemy)
      if (!reticle) {
        reticle = this.makeLoop(8, enemy.radius * 1.5 + 0.45, 0xffd319)
        this.reticles.set(enemy, reticle)
        this.host.scene.add(reticle)
      }
      reticle.position.copy(enemy.parts.group.position)
      reticle.quaternion.copy(this.host.camera.quaternion)
      reticle.rotateZ(t * 2.8)
      reticle.scale.setScalar(1 + Math.sin(t * 12) * 0.06)
      reticle.material.color.copy(Math.sin(t * 18) >= 0 ? GOLD : CYAN)
    }

    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const fragment = this.fragments[i]!
      fragment.life -= dt
      if (fragment.life <= 0) {
        this.disposeLine(fragment.line)
        this.fragments.splice(i, 1)
        continue
      }
      fragment.line.position.addScaledVector(fragment.velocity, dt)
      fragment.velocity.y -= dt * 5
      fragment.line.rotation.x += fragment.spin.x * dt
      fragment.line.rotation.y += fragment.spin.y * dt
      fragment.line.rotation.z += fragment.spin.z * dt
      fragment.line.scale.setScalar(1 + (0.7 - fragment.life) * 2)
      fragment.line.material.opacity = fragment.life / 0.7
    }
  }

  reset() {
    for (const [enemy] of this.reticles) this.removeReticle(enemy)
    for (const fragment of this.fragments) this.disposeLine(fragment.line)
    this.fragments = []
    this.dash = null
    this.fovTimer = 0
  }

  private dashClear(from: THREE.Vector3, to: THREE.Vector3, host: CombatHost): boolean {
    const steps = Math.max(1, Math.ceil(from.distanceTo(to) / 0.2))
    const sample = new THREE.Vector3()
    const resolved = new THREE.Vector3()
    for (let i = 0; i <= steps; i++) {
      sample.lerpVectors(from, to, i / steps)
      resolved.copy(sample)
      resolveWalls(host.walls(), resolved, 0.55, resolved.y - 1.8)
      if (sample.distanceToSquared(resolved) > 0.000001) return false
    }
    return true
  }

  private makeLoop(sides: number, radius: number, color: number): NeonLine {
    const points = Array.from({ length: sides }, (_, i) => {
      const angle = i / sides * Math.PI * 2
      return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
    })
    return new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    )
  }

  private shatter(at: THREE.Vector3, radius: number) {
    for (let i = 0; i < 18; i++) {
      const angle = i / 18 * Math.PI * 2
      const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), (Math.random() - 0.5) * 1.4)
        .applyQuaternion(this.host.camera.quaternion).normalize()
      const line = this.makeLoop(i % 2 === 0 ? 3 : 4, 0.12 + radius * 0.15, i % 2 === 0 ? 0xffd319 : 0x00f0ff)
      line.position.copy(at).addScaledVector(direction, radius * 0.5)
      line.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, angle)
      this.host.scene.add(line)
      this.fragments.push({
        line,
        velocity: direction.multiplyScalar(8 + Math.random() * 8),
        spin: new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6),
        life: 0.7,
      })
    }
  }

  private removeReticle(enemy: Enemy) {
    const reticle = this.reticles.get(enemy)
    if (reticle) this.disposeLine(reticle)
    this.reticles.delete(enemy)
  }

  private disposeLine(line: NeonLine) {
    line.removeFromParent()
    line.geometry.dispose()
    line.material.dispose()
  }
}
