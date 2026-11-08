import * as THREE from 'three'
import {
  DRONE_STATS,
  makeDrone,
  makeLaserLine,
  makeProjectile,
  type DroneParts,
} from './effects'
import { resolveWalls, type Wall } from './map'
import type { DroneType } from './types'
import type { Sfx } from './audio'
import type { Particles } from './effects'
import type { HackManager, NeonHack } from './combat/modifiers'

export interface Enemy {
  type: DroneType
  parts: DroneParts
  hp: number
  speed: number
  damage: number
  radius: number
  phase: number
  flash: number
  staggerTimer: number
  fireT: number
  burst: number
  burstT: number
  aimT: number
  laser: THREE.Line | null
  frozenTimer?: number
  burnTimer?: number
  burnTick?: number
}

export interface Projectile {
  sprite: THREE.Sprite
  vel: THREE.Vector3
  dmg: number
  life: number
  byPlayer?: boolean
}

export interface CombatHost {
  hackManager?: HackManager
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  sfx: Sfx
  particles: Particles
  playerPos(): THREE.Vector3
  now(): number
  addShake(amount: number): void
  hitstop(scale: number, duration: number): void
  shockwave(pos: THREE.Vector3, color: number, scale: number): void
  damagePlayer(n: number): void
  onKill(type: DroneType, pos: THREE.Vector3, byPlayer: boolean): void
  onGloryKill(pos: THREE.Vector3): void
  onWaveStart(wave: number): void
  onWaveClear(): void
  onWaveDraft?(draftHacks: NeonHack[]): void
  sfxPan(pos: THREE.Vector3): number
  spawnPoint(): THREE.Vector3
  collidables(): THREE.Object3D[]
  walls(): Wall[]
  deflectProjectile?(projectile: Projectile, dt: number): boolean
}

const BURST_A = new THREE.Color(0xff2975)
const BURST_B = new THREE.Color(0xffd319)
const BURST_C = new THREE.Color(0x00f0ff)
const SPARK = new THREE.Color(0x9ffcff)
const BURN_COLOR = new THREE.Color(0xff5500)
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpC = new THREE.Vector3()

const AIM_TIME = 1.15

/** Owns enemies, ranged projectiles, spawn pacing and wave composition. */
export class WaveDirector {
  wave = 0
  enemies: Enemy[] = []
  intermission = 0
  draftPending = false
  private projectiles: Projectile[] = []
  private queue: DroneType[] = []
  private spawnTimer = 0
  private raycaster = new THREE.Raycaster()

  constructor(private host: CombatHost) {}

  get remaining(): number {
    return this.queue.length + this.enemies.length
  }

  clearEnemies() {
    this.queue = []
    this.intermission = 999
    for (const e of [...this.enemies]) this.explodeEnemy(e, false)
  }

  reset() {
    this.draftPending = false
    for (const e of this.enemies) {
      this.host.scene.remove(e.parts.group)
      if (e.laser) {
        this.host.scene.remove(e.laser)
        e.laser.geometry.dispose()
        ;(e.laser.material as THREE.Material).dispose()
        e.laser = null
      }
      this.disposeEnemy(e)
    }
    this.enemies = []
    for (const p of this.projectiles) {
      this.host.scene.remove(p.sprite)
      p.sprite.material.dispose()
    }
    this.projectiles = []
    this.queue = []
    this.wave = 0
    this.intermission = 2.2
  }

  resumeAfterDraft() {
    this.draftPending = false
  }

  raycastTargets(): THREE.Object3D[] {
    return this.enemies.map((e) => e.parts.proxy)
  }

  /** ignoreShield bypasses the Enforcer's front plating (deagle / melee). */
  damageEnemy(enemy: Enemy, dmg: number, ignoreShield = false): boolean {
    if (!this.enemies.includes(enemy)) return false
    if (!ignoreShield && (enemy.type === 'enforcer' || enemy.type === 'boss')) {
      dmg *= 0.35 // pulse rifle pings off armor
    }
    enemy.hp -= dmg
    enemy.flash = 0.3
    if (enemy.hp <= 0) {
      this.explodeEnemy(enemy, true)
      return true
    }
    const stats = DRONE_STATS[enemy.type]
    if (enemy.hp <= Math.max(1.2, stats.hp * 0.28)) this.staggerEnemy(enemy)
    return false
  }

  staggerEnemy(enemy: Enemy) {
    if (!this.enemies.includes(enemy) || enemy.hp <= 0 || enemy.staggerTimer > 0) return
    enemy.staggerTimer = 3
    // Interrupt queued bursts and laser charges; recovery starts a fresh attack.
    enemy.burst = 0
    enemy.aimT = 0
    enemy.fireT = Math.max(enemy.fireT, 0.6)
    if (enemy.laser) (enemy.laser.material as THREE.LineBasicMaterial).opacity = 0
  }

  /** Push an enemy away (punch / slide impact). */
  knockback(enemy: Enemy, dir: THREE.Vector3, force: number) {
    if (!this.enemies.includes(enemy)) return
    enemy.parts.group.position.addScaledVector(dir, force)
    enemy.parts.group.position.y += 1.4
  }

  update(dt: number, t: number) {
    if (this.draftPending) return
    // Wave pacing
    if (this.intermission > 0) {
      this.intermission -= dt
      if (this.intermission <= 0) this.beginWave(this.wave + 1)
    } else if (this.queue.length > 0) {
      this.spawnTimer -= dt
      const maxAlive = Math.min(3 + this.wave, 11)
      if (this.spawnTimer <= 0 && this.enemies.length < maxAlive) {
        this.spawnEnemy(this.queue.pop() as DroneType)
        this.spawnTimer = Math.max(0.55, 1.7 - this.wave * 0.1)
      }
    }

    const pp = this.host.playerPos()
    const collidables = this.host.collidables()

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]!
      this.updateEnemy(e, dt, t, pp, collidables)
      if (this.draftPending) return
    }

    // Swept collisions also cover bolts accelerated by Pulse Parry.
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!
      p.life -= dt
      if (p.life <= 0) {
        this.removeProjectile(i)
        continue
      }
      this.host.deflectProjectile?.(p, dt)
      const step = tmpA.copy(p.vel).multiplyScalar(dt)
      const len = step.length()
      if (len <= 0) continue
      this.raycaster.set(p.sprite.position, step.normalize())
      this.raycaster.far = len
      const blocked = this.raycaster.intersectObjects(collidables, false)
      let nearest = Math.min(len, blocked[0]?.distance ?? Infinity)
      let target: Enemy | null = null
      let hitPlayer = false
      const hitDistance = (center: THREE.Vector3, radius: number): number => {
        if (p.sprite.position.distanceToSquared(center) <= radius * radius) return 0
        const point = this.raycaster.ray.intersectSphere(new THREE.Sphere(center, radius), tmpC)
        return point ? point.distanceTo(p.sprite.position) : Infinity
      }
      if (p.byPlayer) {
        for (const enemy of this.enemies) {
          const distance = hitDistance(enemy.parts.group.position, enemy.radius)
          if (distance < nearest) { nearest = distance; target = enemy }
        }
      } else {
        hitPlayer = hitDistance(pp, 1.2) < nearest
      }
      if (target) {
        this.damageEnemy(target, p.dmg, true)
        this.removeProjectile(i)
        if (this.draftPending) return
      } else if (hitPlayer) {
        this.host.damagePlayer(p.dmg)
        this.removeProjectile(i)
      } else if (blocked.length > 0) {
        this.host.particles.burst(p.sprite.position, SPARK, 5, 3, 0.3)
        this.removeProjectile(i)
      } else {
        p.sprite.position.addScaledVector(p.vel, dt)
      }
    }
  }

  private updateEnemy(
    e: Enemy,
    dt: number,
    t: number,
    pp: THREE.Vector3,
    collidables: THREE.Object3D[]
  ) {
    const g = e.parts.group
    const stats = DRONE_STATS[e.type]
    const pan = this.host.sfxPan(g.position)
    const dir = tmpB.subVectors(pp, g.position)
    const dist = dir.length()
    dir.normalize()

    // Shared spin/flash visuals
    e.parts.outer.rotation.z += dt * 3
    e.parts.inner.rotation.z -= dt * 5
    if (e.parts.frame) e.parts.frame.rotation.z += dt * 1.5
    e.flash = Math.max(0, e.flash - dt)
    const pop = 1 + e.flash * 0.9
    e.parts.core.scale.set(e.radius * 2.2 * pop, e.radius * 2.2 * pop, 1)
    const outerMat = e.parts.outer.material as THREE.LineBasicMaterial
    outerMat.opacity = 0.75 + e.flash * 2

    e.staggerTimer = Math.max(0, e.staggerTimer - dt)
    const isFrozen = (e.frozenTimer ?? 0) > 0
    if (isFrozen) {
      e.frozenTimer = Math.max(0, (e.frozenTimer ?? 0) - dt)
    }

    const isBurning = (e.burnTimer ?? 0) > 0
    if (isBurning) {
      e.burnTimer = Math.max(0, (e.burnTimer ?? 0) - dt)
      e.burnTick = (e.burnTick ?? 0) + dt
      if (e.burnTick >= 0.5) {
        e.burnTick = 0
        this.damageEnemy(e, 1.2, true)
        this.host.particles.burst(g.position, BURN_COLOR, 3, 2, 0.4)
      }
    }

    if (e.staggerTimer > 0) {
      const color = Math.sin(t * 18) >= 0 ? 0xffd319 : 0x00f0ff
      outerMat.color.setHex(color)
      e.parts.core.material.color.setHex(color)
      g.position.addScaledVector(dir, e.speed * 0.15 * dt)
      resolveWalls(this.host.walls(), g.position, e.radius + 0.4, g.position.y - e.radius)
      g.lookAt(pp)
      // Staggered drones cannot shoot or detonate on contact with the player.
      return
    }

    if (isFrozen) {
      outerMat.color.setHex(0x00f0ff)
      e.parts.core.material.color.setHex(0x9ffcff)
    } else if (isBurning) {
      outerMat.color.setHex(0xff3b00)
      e.parts.core.material.color.setHex(0xffa500)
    } else {
      outerMat.color.setHex(stats.color)
      e.parts.core.material.color.setHex(stats.coreColor)
    }

    const speedScale = isFrozen ? 0.4 : 1
    const move = (v: THREE.Vector3, speed: number) => {
      g.position.addScaledVector(v, speed * speedScale * dt)
    }

    switch (stats.kind) {
      case 'melee': {
        // Rush the player with type-specific strafe and burst patterns
        const strafeAmp = e.type === 'brawler' ? 6 : e.type === 'swarm' ? 3 : 0.6
        const speedMod =
          e.type === 'brawler' ? 1 + 0.55 * Math.sin(t * 5 + e.phase) : 1
        move(dir, e.speed * speedMod)
        const side = tmpC.set(-dir.z, 0, dir.x)
        g.position.addScaledVector(side, Math.sin(t * 1.7 + e.phase) * dt * strafeAmp)
        g.position.y += Math.sin(t * 2.6 + e.phase) * dt * 1.2

        // Enforcer / boss: shotgun volley
        if (e.type === 'enforcer' || e.type === 'boss') {
          e.fireT -= dt
          if (e.fireT < 0.45 && e.fireT > 0) {
            // telegraph: pulse the core
            e.parts.core.scale.setScalar(e.radius * 2.6)
          }
          if (e.fireT <= 0 && dist < 22 && !this.losBlocked(g.position, pp, collidables)) {
            const pellets = e.type === 'boss' ? 8 : 5
            for (let k = 0; k < pellets; k++) {
              const spread = THREE.MathUtils.randFloatSpread(0.7)
              const v = dir
                .clone()
                .applyAxisAngle(new THREE.Vector3(0, 1, 0), spread)
                .setY(0)
                .normalize()
              this.spawnProjectile(g.position, v, 18, 5, 0xb18cff)
            }
            this.host.sfx.shotgun(pan)
            this.host.addShake(0.25)
            e.fireT = e.type === 'boss' ? 2.2 : 3.4
          }
        }
        break
      }
      case 'ranged': {
        // Gunner: hold mid-range, orbit, fire 3-round bursts
        if (dist > 26) move(dir, e.speed)
        else {
          const orbit = tmpC.set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(e.phase) > 0 ? 1 : -1)
          g.position.addScaledVector(orbit, e.speed * 0.6 * dt)
        }
        e.fireT -= dt
        if (e.fireT <= 0 && dist < 34 && !this.losBlocked(g.position, pp, collidables)) {
          e.burst = 3
          e.burstT = 0
          e.fireT = 2.4 + Math.random() * 0.6
        }
        if (e.burst > 0) {
          e.burstT -= dt
          if (e.burstT <= 0) {
            const v = dir.clone().setY(0).normalize()
            v.x += THREE.MathUtils.randFloatSpread(0.08)
            v.z += THREE.MathUtils.randFloatSpread(0.08)
            this.spawnProjectile(g.position, v.normalize(), 26, 5, stats.color)
            this.host.sfx.eshot(pan)
            e.burst--
            e.burstT = 0.16
          }
        }
        break
      }
      case 'sniper': {
        // Marksman: keep distance, laser telegraph, hitscan shot
        e.fireT -= dt
        const laser = e.laser
        if (dist < 24) {
          move(dir, -e.speed) // retreat
          e.aimT = 0
          if (laser) (laser.material as THREE.LineBasicMaterial).opacity = 0
        } else if (this.losBlocked(g.position, pp, collidables)) {
          e.aimT = 0
          if (laser) (laser.material as THREE.LineBasicMaterial).opacity = 0
          // reposition along the perpendicular
          const orbit = tmpC.set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(e.phase) > 0 ? 1 : -1)
          g.position.addScaledVector(orbit, e.speed * dt)
        } else {
          if (e.aimT >= 0 && e.aimT < 0.01) {
            // start of a new aim: charge beep
            if (e.fireT <= 0) this.host.sfx.charge(pan)
          }
          e.aimT += dt
          if (laser) {
            const mat = laser.material as THREE.LineBasicMaterial
            const attr = laser.geometry.getAttribute('position') as THREE.BufferAttribute
            attr.setXYZ(0, g.position.x, g.position.y, g.position.z)
            attr.setXYZ(1, pp.x, pp.y, pp.z)
            attr.needsUpdate = true
            if (e.aimT >= AIM_TIME) {
              // Fire
              this.host.damagePlayer(e.damage)
              this.host.sfx.sniper(pan)
              e.aimT = -2.6 // cooldown as negative time
              mat.color.set(0xffffff)
              mat.opacity = 1
            } else {
              const hot = e.aimT > AIM_TIME - 0.35
              mat.color.set(hot ? 0xffffff : 0xff2975)
              mat.opacity = e.aimT < 0 ? 0 : hot ? 1 : 0.35 + 0.3 * Math.sin(t * 18)
            }
          }
          if (e.aimT < AIM_TIME) {
            // slow strafe while aiming
            const orbit = tmpC.set(-dir.z, 0, dir.x)
            g.position.addScaledVector(orbit, Math.sin(t * 0.9 + e.phase) * dt * 2)
          }
        }
        if (e.aimT < 0) e.aimT += dt
        break
      }
    }

    // Contact damage for melee archetypes
    if (stats.kind === 'melee' && dist < 1.5 + e.radius * 0.7) {
      this.host.damagePlayer(e.damage)
      this.explodeEnemy(e, false)
      return
    }

    // Keep enemies out of walls
    resolveWalls(this.host.walls(), g.position, e.radius + 0.4, g.position.y - e.radius)

    g.lookAt(pp)
  }

  private losBlocked(a: THREE.Vector3, b: THREE.Vector3, collidables: THREE.Object3D[]): boolean {
    const dir = tmpA.subVectors(b, a)
    const dist = dir.length()
    this.raycaster.set(a, dir.normalize())
    this.raycaster.far = dist - 0.5
    return this.raycaster.intersectObjects(collidables, false).length > 0
  }

  private spawnProjectile(
    from: THREE.Vector3,
    vel: THREE.Vector3,
    speed: number,
    dmg: number,
    color: number
  ) {
    if (this.projectiles.length > 60) return
    const sprite = makeProjectile(color)
    sprite.position.copy(from)
    this.host.scene.add(sprite)
    this.projectiles.push({ sprite, vel: vel.clone().multiplyScalar(speed), dmg, life: 4 })
  }

  private removeProjectile(i: number) {
    const p = this.projectiles[i]!
    this.host.scene.remove(p.sprite)
    p.sprite.material.dispose()
    this.projectiles.splice(i, 1)
  }

  private beginWave(n: number) {
    this.wave = n
    this.queue = this.buildQueue(n)
    this.spawnTimer = 0.8
    this.host.onWaveStart(n)
  }

  private buildQueue(wave: number): DroneType[] {
    const bossWave = wave % 4 === 0
    const total = bossWave ? 4 + wave : 5 + wave * 2
    const q: DroneType[] = []
    const brawlers = Math.ceil(total * 0.3)
    const swarms = Math.ceil(total * 0.25)
    const gunners = wave >= 2 ? Math.floor(total * 0.25) : 0
    const marksmen = wave >= 2 ? 1 + Math.floor(wave / 4) : 0
    const enforcers = wave >= 3 ? 1 + Math.floor((wave - 3) / 2) : 0
    for (let i = 0; i < brawlers; i++) q.push('brawler')
    for (let i = 0; i < swarms; i++) q.push('swarm')
    for (let i = 0; i < gunners; i++) q.push('gunner')
    for (let i = 0; i < marksmen; i++) q.push('marksman')
    for (let i = 0; i < enforcers; i++) q.push('enforcer')
    if (bossWave) q.push('boss')
    // Shuffle
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = q[i] as DroneType
      q[i] = q[j] as DroneType
      q[j] = tmp
    }
    return q
  }

  private spawnEnemy(type: DroneType) {
    const st = DRONE_STATS[type]
    const parts = makeDrone(type)
    const pos = this.host.spawnPoint()
    const enemy: Enemy = {
      type,
      parts,
      hp: st.hp,
      speed: st.speed + Math.min(waveScale(this.wave), 2.5) * 0.5 + Math.random(),
      damage: st.damage,
      radius: st.radius,
      phase: Math.random() * Math.PI * 2,
      flash: 0,
      staggerTimer: 0,
      fireT: type === 'marksman' ? 0 : 1.2 + Math.random(),
      burst: 0,
      burstT: 0,
      aimT: 0,
      laser: null,
      frozenTimer: 0,
      burnTimer: 0,
      burnTick: 0,
    }
    parts.proxy.userData['enemy'] = enemy
    parts.group.position.copy(pos)
    parts.group.position.y = Math.max(pos.y, st.height + this.host.playerPos().y - 1)
    if (type === 'marksman') {
      const laser = makeLaserLine(0xff2975)
      this.host.scene.add(laser)
      enemy.laser = laser
      parts.group.position.y = Math.max(parts.group.position.y, 8)
    }
    this.host.scene.add(parts.group)
    this.enemies.push(enemy)

    // Spawn audio cues
    if (type === 'brawler') this.host.sfx.screech(this.host.sfxPan(pos))
    if (type === 'boss') this.host.sfx.roar(this.host.sfxPan(pos))
  }

  explodeEnemy(enemy: Enemy, byPlayer: boolean) {
    const i = this.enemies.indexOf(enemy)
    if (i < 0) return
    this.enemies.splice(i, 1)
    enemy.staggerTimer = 0
    const pos = enemy.parts.group.position.clone()
    this.host.scene.remove(enemy.parts.group)
    if (enemy.laser) {
      this.host.scene.remove(enemy.laser)
      enemy.laser.geometry.dispose()
      ;(enemy.laser.material as THREE.Material).dispose()
      enemy.laser = null
    }
    this.disposeEnemy(enemy)

    const big = enemy.type === 'enforcer' || enemy.type === 'boss'
    this.host.particles.burst(pos, BURST_A, big ? 44 : 26, big ? 15 : 11, 0.9)
    this.host.particles.burst(pos, BURST_B, big ? 24 : 14, big ? 9 : 7, 0.6)
    if (enemy.type !== 'swarm') this.host.particles.burst(pos, BURST_C, 18, 8, 0.5)
    this.host.shockwave(pos, DRONE_STATS[enemy.type].color, big ? 8 : 4.5)
    this.host.sfx.explode(enemy.type === 'boss', this.host.sfxPan(pos))

    const pp = this.host.playerPos()
    const dist = pos.distanceTo(pp)
    this.host.addShake(Math.max(0.15, (big ? 0.9 : 0.5) - dist * 0.004))

    this.host.onKill(enemy.type, pos, byPlayer)

    if (this.queue.length === 0 && this.enemies.length === 0) {
      this.intermission = 3.2
      this.host.onWaveClear()
      if (this.wave > 0 && this.host.onWaveDraft && this.host.hackManager) {
        const draft = this.host.hackManager.getRandomDraft()
        this.draftPending = draft.length > 0
        this.host.onWaveDraft(draft)
      }
    }
  }

  private disposeEnemy(e: Enemy) {
    delete e.parts.proxy.userData['enemy']
    e.parts.group.traverse((o) => {
      const obj = o as THREE.Line & THREE.Mesh & THREE.Sprite
      if (obj.geometry && !(o instanceof THREE.Sprite)) {
        obj.geometry.dispose()
      }
      const mat = (obj as THREE.Line).material
      if (mat) {
        const list = Array.isArray(mat) ? mat : [mat]
        for (const m of list) m.dispose()
      }
    })
    e.parts.group.clear()
  }
}

function waveScale(wave: number): number {
  return Math.min(2.5, wave * 0.15)
}
