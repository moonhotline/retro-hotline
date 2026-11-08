import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sfx } from '../audio'
import { DRONE_STATS, makeDrone, type Particles } from '../effects'
import type { DroneType } from '../types'
import { WaveDirector, type Enemy, type Projectile } from '../waves'
import { AbilitySystem, type AbilityHost } from './abilities'

function fixture() {
  const player = new THREE.Vector3(0, 2.4, 0)
  const camera = new THREE.PerspectiveCamera(75)
  camera.position.copy(player)
  const host = {
    scene: new THREE.Scene(), camera,
    sfx: {
      phaseDash: vi.fn(), parryClash: vi.fn(), slamImpact: vi.fn(),
      gloryKill: vi.fn(), explode: vi.fn(),
    } as unknown as Sfx,
    particles: { burst: vi.fn() } as unknown as Particles,
    playerPos: () => player, now: () => 0,
    isGrounded: vi.fn(() => true), groundHeight: vi.fn(() => 0.6),
    setVerticalVelocity: vi.fn(), setInvulnerable: vi.fn(),
    addShake: vi.fn(), hitstop: vi.fn(), shockwave: vi.fn(), damagePlayer: vi.fn(),
    onKill: vi.fn(), onGloryKill: vi.fn(), onWaveStart: vi.fn(), onWaveClear: vi.fn(),
    sfxPan: () => 0, spawnPoint: () => new THREE.Vector3(0, 3, -40),
    collidables: vi.fn<AbilityHost['collidables']>(() => []), walls: () => [],
  } satisfies AbilityHost
  const director = new WaveDirector(host)
  const system = new AbilitySystem(director, host)
  const spawn = (type: DroneType = 'gunner', z = -5, x = 0) => {
    const stats = DRONE_STATS[type]
    const enemy: Enemy = {
      type, parts: makeDrone(type), hp: stats.hp, radius: stats.radius,
      speed: stats.speed, damage: stats.damage, phase: 0, flash: 0,
      staggerTimer: 0, fireT: 0, burst: 0, burstT: 0, aimT: 0, laser: null,
    }
    enemy.parts.group.position.set(x, player.y, z)
    enemy.parts.proxy.userData['enemy'] = enemy
    host.scene.add(enemy.parts.group)
    director.enemies.push(enemy)
    return enemy
  }
  const projectiles: Projectile[] = []
  const bullet = (z = -3, x = 0): Projectile => {
    const projectile: Projectile = {
      sprite: new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff2975 })),
      vel: new THREE.Vector3(0, 0, 10), dmg: 5, life: 3, byPlayer: false,
    }
    projectile.sprite.position.set(x, player.y, z)
    projectiles.push(projectile)
    return projectile
  }
  const airborne = () => {
    host.isGrounded.mockReturnValue(false)
    player.y = host.groundHeight() + 4
    camera.position.copy(player)
  }
  return { host, player, camera, director, system, spawn, bullet, airborne, projectiles }
}

let context: ReturnType<typeof fixture>
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  context = fixture()
})
afterEach(() => {
  context.system.reset()
  context.director.reset()
  for (const projectile of context.projectiles) projectile.sprite.material.dispose()
  vi.restoreAllMocks()
})

describe('AbilitySystem phaseDash', () => {
  it('starts a dash, grants invulnerability, stops falling, and plays its sound once', () => {
    const { system, host, camera } = context
    expect(system.tryPhaseDash()).toBe(true)
    expect(system.isDashing).toBe(true)
    expect(host.setInvulnerable).toHaveBeenCalledExactlyOnceWith(true)
    expect(host.setVerticalVelocity).toHaveBeenCalledExactlyOnceWith(0)
    expect(host.sfx.phaseDash).toHaveBeenCalledOnce()
    expect(camera.getObjectByName('phase-dash-streaks')).toBeDefined()
    expect(host.scene.getObjectByName('phase-dash-ghost')).toBeDefined()
    expect(system.tryPhaseDash()).toBe(false)
    expect(host.sfx.phaseDash).toHaveBeenCalledOnce()
  })

  it('moves in the camera direction and revokes invulnerability after 0.18 seconds', () => {
    const { system, host, player, camera } = context
    camera.rotation.y = Math.PI / 2
    const start = player.clone()
    const forward = camera.getWorldDirection(new THREE.Vector3())
    system.tryPhaseDash()
    system.update(0.125, 0.125)
    expect(system.isDashing).toBe(true)
    expect(player.distanceTo(start.clone().addScaledVector(forward, 38 * 0.125))).toBeCloseTo(0)
    system.update(0.055, 0.18)
    expect(system.isDashing).toBe(false)
    expect(player.distanceTo(start)).toBeCloseTo(38 * 0.18)
    expect(host.setInvulnerable).toHaveBeenLastCalledWith(false)
    expect(camera.getObjectByName('phase-dash-streaks')).toBeUndefined()
  })

  it('blocks reactivation until the 2.5-second cooldown expires', () => {
    const { system, host } = context
    system.tryPhaseDash()
    expect(system.tryPhaseDash()).toBe(false)
    system.update(2.375, 2.375)
    expect(system.isDashing).toBe(false)
    expect(system.stats().phaseDash.remaining).toBe(0.125)
    expect(system.tryPhaseDash()).toBe(false)
    expect(host.sfx.phaseDash).toHaveBeenCalledOnce()
    system.update(0.125, 2.5)
    expect(system.tryPhaseDash()).toBe(true)
    expect(host.sfx.phaseDash).toHaveBeenCalledTimes(2)
  })

  it('executes a staggered enemy along the dash path exactly once', () => {
    const { system, director, spawn, host, player } = context
    const target = spawn('gunner', -4)
    director.staggerEnemy(target)
    const impact = target.parts.group.position.clone()
    const healthy = spawn('gunner', -5)
    const offPath = spawn('gunner', -4, 3)
    director.staggerEnemy(offPath)
    const explode = vi.spyOn(director, 'explodeEnemy')
    // A non-unit input also checks that dash speed is independent of input magnitude.
    expect(system.tryPhaseDash(new THREE.Vector3(0, 0, -10))).toBe(true)
    system.update(0.18, 0.18)
    expect(player.z).toBeCloseTo(-38 * 0.18)
    expect(explode).toHaveBeenCalledExactlyOnceWith(target, true)
    expect(director.enemies).toEqual([healthy, offPath])
    expect(host.onGloryKill).toHaveBeenCalledExactlyOnceWith(impact)
    expect(host.onKill).toHaveBeenCalledExactlyOnceWith('gunner', impact, true)
    expect(host.sfx.gloryKill).toHaveBeenCalledOnce()
    expect(host.hitstop).toHaveBeenCalledWith(0.05, 0.12)
    expect(host.addShake).toHaveBeenCalledWith(0.8)
    expect(host.shockwave).toHaveBeenCalledWith(impact, 0x00f0ff, 7)
    system.update(0.1, 0.28)
    expect(host.onGloryKill).toHaveBeenCalledOnce()
  })
})

describe('AbilitySystem pulseParry', () => {
  it('attaches a shield for 0.4 seconds and enforces its 3.5-second cooldown', () => {
    const { system, camera } = context
    expect(system.tryPulseParry()).toBe(true)
    expect(system.isParrying).toBe(true)
    const shield = camera.getObjectByName('pulse-parry-shield')!
    expect(shield.parent).toBe(camera)
    expect(shield.position.z).toBe(-1.2)
    expect(system.stats().pulseParry).toEqual({
      cooldown: 3.5, remaining: 3.5, active: true, ready: false, fill: 0,
    })
    expect(system.tryPulseParry()).toBe(false)
    expect(camera.getObjectByName('pulse-parry-shield')).toBe(shield)
    system.update(0.2, 0.2)
    expect(system.isParrying).toBe(true)
    system.update(0.2, 0.4)
    expect(system.isParrying).toBe(false)
    expect(shield.parent).toBeNull()
    system.update(3, 3.4)
    expect(system.tryPulseParry()).toBe(false)
    system.update(system.stats().pulseParry.remaining, 3.5)
    expect(system.tryPulseParry()).toBe(true)
  })

  it('deflects a hostile bullet at 3.5 meters toward the nearest living enemy at triple speed', () => {
    const { system, spawn, bullet, host, camera } = context
    spawn('gunner', -12)
    const dead = spawn('gunner', -3.6)
    dead.hp = 0
    const nearest = spawn('gunner', -5, 1)
    const projectile = bullet(-3.5)
    const expectedDirection = nearest.parts.group.position.clone().sub(projectile.sprite.position).normalize()
    const originalSpeed = projectile.vel.length()
    system.tryPulseParry()
    expect(system.deflectProjectile(projectile, 0)).toBe(true)
    expect(projectile.vel.length()).toBeCloseTo(originalSpeed * 3)
    expect(projectile.vel.clone().normalize().distanceTo(expectedDirection)).toBeCloseTo(0)
    expect(projectile.byPlayer).toBe(true)
    expect(projectile.sprite.material.color.getHex()).toBe(0x00f0ff)
    expect(host.sfx.parryClash).toHaveBeenCalledOnce()
    expect(host.hitstop).toHaveBeenCalledExactlyOnceWith(0.05, 0.06)
    expect(host.addShake).toHaveBeenCalledExactlyOnceWith(0.6)
    const shield = camera.getObjectByName('pulse-parry-shield') as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
    expect(shield.material.color.getHex()).toBe(0xffd319)
    expect(system.deflectProjectile(projectile, 0)).toBe(false)
    expect(projectile.vel.length()).toBeCloseTo(originalSpeed * 3)
    expect(host.sfx.parryClash).toHaveBeenCalledOnce()
  })

  it('intercepts a fast bullet crossing the shield between frames and reverses it without a target', () => {
    const { system, bullet } = context
    const projectile = bullet(-6)
    projectile.vel.set(0, 0, 100)
    system.tryPulseParry()
    expect(system.deflectProjectile(projectile, 0.1)).toBe(true)
    expect(projectile.sprite.position.z).toBeGreaterThanOrEqual(-3.5)
    expect(projectile.sprite.position.z).toBeLessThan(0)
    expect(projectile.vel.distanceTo(new THREE.Vector3(0, 0, -300))).toBeCloseTo(0)
    expect(projectile.byPlayer).toBe(true)
  })

  it.each([
    ['outside 3.5 meters', 0, -3.501],
    ['behind the player', 0, 2],
    ['outside the forward cone', 3, -1],
    ['at the player origin', 0, 0],
  ] as const)('leaves a projectile %s unchanged', (_label, x, z) => {
    const { system, bullet, host } = context
    const projectile = bullet(z, x)
    const velocity = projectile.vel.clone()
    const position = projectile.sprite.position.clone()
    system.tryPulseParry()
    expect(system.deflectProjectile(projectile, 0)).toBe(false)
    expect(projectile.byPlayer).toBe(false)
    expect(projectile.vel).toEqual(velocity)
    expect(projectile.sprite.position).toEqual(position)
    expect(projectile.sprite.material.color.getHex()).toBe(0xff2975)
    expect(host.sfx.parryClash).not.toHaveBeenCalled()
    expect(host.hitstop).not.toHaveBeenCalled()
    expect(host.addShake).not.toHaveBeenCalled()
  })

  it('rejects player-owned bullets and hostile bullets outside the active parry window', () => {
    const { system, bullet, host } = context
    const projectile = bullet()
    expect(system.deflectProjectile(projectile, 0)).toBe(false)
    system.tryPulseParry()
    projectile.byPlayer = true
    expect(system.deflectProjectile(projectile, 0)).toBe(false)
    projectile.byPlayer = false
    system.update(0.4, 0.4)
    expect(system.deflectProjectile(projectile, 0)).toBe(false)
    expect(projectile.byPlayer).toBe(false)
    expect(projectile.vel.length()).toBe(10)
    expect(host.sfx.parryClash).not.toHaveBeenCalled()
  })

  it('does not deflect through cover', () => {
    const { system, bullet, host } = context
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 0.1), new THREE.MeshBasicMaterial())
    wall.position.set(0, 2.4, -1.5)
    host.collidables.mockReturnValue([wall])
    system.tryPulseParry()
    const projectile = bullet()
    expect(system.deflectProjectile(projectile, 0)).toBe(false)
    expect(projectile.byPlayer).toBe(false)
    expect(host.sfx.parryClash).not.toHaveBeenCalled()
    wall.geometry.dispose()
    wall.material.dispose()
  })
})

describe('AbilitySystem kineticSlam', () => {
  it('rejects a grounded player without spending the cooldown', () => {
    const { system, host, player } = context
    player.y = host.groundHeight() + 10
    expect(system.tryKineticSlam()).toBe(false)
    expect(system.isSlamming).toBe(false)
    expect(system.stats().kineticSlam.remaining).toBe(0)
    expect(host.setVerticalVelocity).not.toHaveBeenCalled()
  })

  it.each([0, 1.799, 1.8])('rejects an airborne player %s meters above ground', (height) => {
    const { system, host, player } = context
    host.isGrounded.mockReturnValue(false)
    host.groundHeight.mockReturnValue(7)
    player.y = host.groundHeight() + height
    expect(system.tryKineticSlam()).toBe(false)
    expect(system.isSlamming).toBe(false)
    expect(system.stats().kineticSlam.ready).toBe(true)
    expect(host.setVerticalVelocity).not.toHaveBeenCalled()
  })

  it('starts just above 1.8 meters and maintains a downward velocity of 45 while airborne', () => {
    const { system, host, player } = context
    host.isGrounded.mockReturnValue(false)
    player.y = host.groundHeight() + 1.801
    expect(system.tryKineticSlam()).toBe(true)
    expect(system.isSlamming).toBe(true)
    expect(host.setVerticalVelocity).toHaveBeenCalledExactlyOnceWith(-45)
    expect(system.stats().kineticSlam.remaining).toBe(5)
    expect(system.tryKineticSlam()).toBe(false)
    expect(system.tryPhaseDash()).toBe(false)
    system.update(0.1, 0.1)
    expect(system.isSlamming).toBe(true)
    expect(host.setVerticalVelocity).toHaveBeenCalledTimes(2)
    expect(host.setVerticalVelocity).toHaveBeenLastCalledWith(-45)
    expect(host.sfx.slamImpact).not.toHaveBeenCalled()
    expect(host.scene.getObjectByName('kinetic-slam-shockwave')).toBeUndefined()
  })

  it('cannot start during a phase dash', () => {
    const { system, airborne } = context
    airborne()
    system.tryPhaseDash()
    expect(system.tryKineticSlam()).toBe(false)
    expect(system.isSlamming).toBe(false)
    expect(system.stats().kineticSlam.remaining).toBe(0)
  })

  it('lands once, shakes the screen, plays impact audio, and expands a shockwave to 14 meters', () => {
    const { system, host, player, airborne } = context
    airborne()
    system.tryKineticSlam()
    host.isGrounded.mockReturnValue(true)
    player.y = host.groundHeight() + 1.8
    system.update(0.1, 0.1)
    expect(system.isSlamming).toBe(false)
    expect(host.sfx.slamImpact).toHaveBeenCalledOnce()
    expect(host.addShake).toHaveBeenCalledExactlyOnceWith(1)
    const wave = host.scene.getObjectByName('kinetic-slam-shockwave') as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
    expect(wave.parent).toBe(host.scene)
    expect(wave.position.toArray()).toEqual([player.x, host.groundHeight() + 0.08, player.z])
    expect(wave.rotation.x).toBe(-Math.PI / 2)
    expect(host.particles.burst).toHaveBeenCalledWith(wave.position, new THREE.Color(0xffd319), 60, 16, 0.6)
    const geometryDispose = vi.spyOn(wave.geometry, 'dispose')
    const materialDispose = vi.spyOn(wave.material, 'dispose')
    system.onLanding()
    system.update(0.499, 0.599)
    expect(wave.scale.x).toBeCloseTo(14, 1)
    expect(wave.scale.y).toBe(wave.scale.x)
    expect(host.sfx.slamImpact).toHaveBeenCalledOnce()
    system.update(0.01, 0.609)
    expect(wave.parent).toBeNull()
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
  })

  it('ignores a normal landing when no slam is active', () => {
    const { system, host, director } = context
    const damage = vi.spyOn(director, 'damageEnemy')
    system.onLanding()
    expect(host.sfx.slamImpact).not.toHaveBeenCalled()
    expect(host.addShake).not.toHaveBeenCalled()
    expect(host.scene.children).toHaveLength(0)
    expect(damage).not.toHaveBeenCalled()
  })

  it('deals 45 armor-piercing damage within 12 meters, including the boundary', () => {
    const { system, host, director, spawn, airborne } = context
    airborne()
    const near = spawn('boss', -3)
    const boundary = spawn('boss', -12)
    const outside = spawn('boss', -12.001)
    const killed = spawn('gunner', -2)
    const damage = vi.spyOn(director, 'damageEnemy')
    const stagger = vi.spyOn(director, 'staggerEnemy')
    system.tryKineticSlam()
    host.isGrounded.mockReturnValue(true)
    system.onLanding()
    expect(damage).toHaveBeenCalledTimes(3)
    for (const enemy of [near, boundary, killed]) expect(damage).toHaveBeenCalledWith(enemy, 45, true)
    expect(near.hp).toBe(DRONE_STATS.boss.hp - 45)
    expect(boundary.hp).toBe(DRONE_STATS.boss.hp - 45)
    expect(outside.hp).toBe(DRONE_STATS.boss.hp)
    expect(outside.staggerTimer).toBe(0)
    expect(director.enemies).not.toContain(killed)
    expect(stagger).not.toHaveBeenCalledWith(killed)
    system.onLanding()
    expect(damage).toHaveBeenCalledTimes(3)
  })

  it.each([
    [0.599, true], [0.6, true], [0.601, false],
  ] as const)('staggers a surviving enemy at %s of base HP: %s', (ratio, shouldStagger) => {
    const { system, host, director, spawn, airborne } = context
    airborne()
    const enemy = spawn('boss')
    // Scaled enemy HP isolates the slam threshold from the normal 28% stagger rule.
    enemy.hp = DRONE_STATS.boss.hp * ratio + 45
    const stagger = vi.spyOn(director, 'staggerEnemy')
    system.tryKineticSlam()
    host.isGrounded.mockReturnValue(true)
    system.onLanding()
    expect(enemy.hp).toBeCloseTo(DRONE_STATS.boss.hp * ratio)
    expect(enemy.staggerTimer).toBe(shouldStagger ? 3 : 0)
    if (shouldStagger) expect(stagger).toHaveBeenCalledExactlyOnceWith(enemy)
    else expect(stagger).not.toHaveBeenCalled()
  })

  it('requires the full 5-second cooldown before another airborne slam', () => {
    const { system, host, airborne } = context
    airborne()
    system.tryKineticSlam()
    host.isGrounded.mockReturnValue(true)
    system.onLanding()
    airborne()
    expect(system.tryKineticSlam()).toBe(false)
    system.update(4.875, 4.875)
    expect(system.tryKineticSlam()).toBe(false)
    system.update(0.125, 5)
    expect(system.tryKineticSlam()).toBe(true)
  })
})

describe('AbilitySystem stats', () => {
  it('reports ready abilities with their cooldown lengths and full meters initially', () => {
    expect(context.system.stats()).toEqual({
      phaseDash: { cooldown: 2.5, remaining: 0, active: false, ready: true, fill: 1 },
      pulseParry: { cooldown: 3.5, remaining: 0, active: false, ready: true, fill: 1 },
      kineticSlam: { cooldown: 5, remaining: 0, active: false, ready: true, fill: 1 },
    })
  })

  it('tracks independent cooldowns, active windows, fill ratios, and readiness', () => {
    const { system, airborne, host } = context
    system.tryPhaseDash()
    system.tryPulseParry()
    system.update(0.125, 0.125)
    let stats = system.stats()
    expect(stats.phaseDash).toMatchObject({ remaining: 2.375, active: true, ready: false })
    expect(stats.phaseDash.fill).toBeCloseTo(0.125 / 2.5)
    expect(stats.pulseParry).toMatchObject({ remaining: 3.375, active: true, ready: false })
    expect(stats.pulseParry.fill).toBeCloseTo(0.125 / 3.5)
    system.update(0.375, 0.5)
    airborne()
    system.tryKineticSlam()
    stats = system.stats()
    expect(stats.phaseDash).toMatchObject({ cooldown: 2.5, remaining: 2, active: false, ready: false })
    expect(stats.phaseDash.fill).toBeCloseTo(0.2)
    expect(stats.pulseParry).toMatchObject({ remaining: 3, active: false, ready: false })
    expect(stats.kineticSlam).toEqual({ cooldown: 5, remaining: 5, active: true, ready: false, fill: 0 })
    system.update(1, 1.5)
    stats = system.stats()
    expect(stats.phaseDash.remaining).toBe(1)
    expect(stats.phaseDash.fill).toBeCloseTo(0.6)
    expect(stats.pulseParry.remaining).toBe(2)
    expect(stats.pulseParry.fill).toBeCloseTo(1.5 / 3.5)
    expect(stats.kineticSlam).toMatchObject({ remaining: 4, active: true, ready: false })
    expect(stats.kineticSlam.fill).toBeCloseTo(0.2)
    system.update(10, 11.5)
    stats = system.stats()
    for (const state of Object.values(stats)) {
      expect(state.remaining).toBe(0)
      expect(state.fill).toBe(1)
    }
    expect(stats.phaseDash.ready).toBe(true)
    expect(stats.pulseParry.ready).toBe(true)
    expect(stats.kineticSlam).toMatchObject({ active: true, ready: false })
    host.isGrounded.mockReturnValue(true)
    system.onLanding()
    expect(system.stats().kineticSlam).toMatchObject({ active: false, ready: true })
  })
})

describe('AbilitySystem cleanup', () => {
  it('reset disposes shields, streaks, ghosts, and shockwaves and clears every cooldown', () => {
    const { system, host, camera, airborne } = context
    airborne()
    system.tryKineticSlam()
    host.isGrounded.mockReturnValue(true)
    system.onLanding()
    system.tryPhaseDash()
    system.tryPulseParry()
    const effects = [...host.scene.children, ...camera.children] as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[]
    expect(effects.map((effect) => effect.name).sort()).toEqual([
      'kinetic-slam-shockwave', 'phase-dash-ghost', 'phase-dash-streaks', 'pulse-parry-shield',
    ])
    const disposals = effects.map((effect) => ({
      geometry: vi.spyOn(effect.geometry, 'dispose'), material: vi.spyOn(effect.material, 'dispose'),
    }))
    system.reset()
    expect(host.scene.children).toHaveLength(0)
    expect(camera.children).toHaveLength(0)
    expect(host.setInvulnerable).toHaveBeenLastCalledWith(false)
    expect(system.isDashing).toBe(false)
    expect(system.isParrying).toBe(false)
    expect(system.isSlamming).toBe(false)
    for (const state of Object.values(system.stats())) {
      expect(state).toMatchObject({ remaining: 0, active: false, ready: true, fill: 1 })
    }
    system.reset()
    system.update(1, 1)
    for (const { geometry, material } of disposals) {
      expect(geometry).toHaveBeenCalledOnce()
      expect(material).toHaveBeenCalledOnce()
    }
    expect(system.tryPhaseDash()).toBe(true)
    expect(system.tryPulseParry()).toBe(true)
  })

  it('reset cancels an airborne slam without causing a later impact', () => {
    const { system, host, airborne } = context
    airborne()
    system.tryKineticSlam()
    system.reset()
    expect(system.isSlamming).toBe(false)
    host.setVerticalVelocity.mockClear()
    system.update(0.1, 0.1)
    expect(host.setVerticalVelocity).not.toHaveBeenCalled()
    host.isGrounded.mockReturnValue(true)
    system.onLanding()
    expect(host.sfx.slamImpact).not.toHaveBeenCalled()
    expect(host.scene.children).toHaveLength(0)
    airborne()
    expect(system.tryKineticSlam()).toBe(true)
  })

  it('expires dash and parry effects without leaving attached objects', () => {
    const { system, host, camera } = context
    system.tryPhaseDash()
    system.tryPulseParry()
    system.update(0.18, 0.18)
    system.update(0.5, 0.68)
    expect(host.scene.children).toHaveLength(0)
    expect(camera.children).toHaveLength(0)
    expect(system.isDashing).toBe(false)
    expect(system.isParrying).toBe(false)
    expect(host.setInvulnerable).toHaveBeenLastCalledWith(false)
  })
})
