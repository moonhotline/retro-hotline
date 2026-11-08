import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRONE_STATS, makeDrone, makeLaserLine, type Particles } from '../effects'
import type { Sfx } from '../audio'
import type { DroneType } from '../types'
import { WaveDirector, type CombatHost, type Enemy } from '../waves'
import { GloryKillSystem } from './gloryKill'

function fixture() {
  const player = new THREE.Vector3(0, 2.4, 0)
  const camera = new THREE.PerspectiveCamera(75)
  camera.position.copy(player)
  const host: CombatHost = {
    scene: new THREE.Scene(), camera,
    sfx: { gloryKill: vi.fn(), explode: vi.fn(), eshot: vi.fn(), shotgun: vi.fn(), sniper: vi.fn(), charge: vi.fn() } as unknown as Sfx,
    particles: { burst: vi.fn() } as unknown as Particles,
    playerPos: () => player, now: () => 0,
    addShake: vi.fn(), hitstop: vi.fn(), shockwave: vi.fn(), damagePlayer: vi.fn(),
    onKill: vi.fn(), onGloryKill: vi.fn(), onWaveStart: vi.fn(), onWaveClear: vi.fn(),
    sfxPan: () => 0, spawnPoint: () => new THREE.Vector3(0, 3, -40),
    collidables: () => [], walls: () => [],
  }
  const director = new WaveDirector(host)
  const system = new GloryKillSystem(director, host)
  const spawn = (type: DroneType = 'gunner', z = -5) => {
    const stats = DRONE_STATS[type]
    const enemy: Enemy = {
      type, parts: makeDrone(type), hp: stats.hp, radius: stats.radius,
      speed: stats.speed, damage: stats.damage, phase: 0, flash: 0,
      staggerTimer: 0, fireT: 0, burst: 0, burstT: 0, aimT: 0, laser: null,
    }
    enemy.parts.group.position.set(0, player.y, z)
    enemy.parts.proxy.userData['enemy'] = enemy
    host.scene.add(enemy.parts.group)
    director.enemies.push(enemy)
    return enemy
  }
  const stagger = (enemy: Enemy) => director.damageEnemy(enemy, enemy.hp - 1, true)
  const execute = () => system.tryGloryKill(player, camera, director.enemies, host)
  return { host, player, camera, director, system, spawn, stagger, execute }
}

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null))
afterEach(() => vi.restoreAllMocks())

describe('stagger window', () => {
  it.each(Object.keys(DRONE_STATS) as DroneType[])('staggers %s at its threshold, without extending the current window', (type) => {
    const { director, spawn } = fixture()
    const enemy = spawn(type)
    const threshold = Math.max(1.2, DRONE_STATS[type].hp * 0.28)
    director.damageEnemy(enemy, enemy.hp - threshold - 0.1, true)
    expect(enemy.staggerTimer).toBe(0)
    director.damageEnemy(enemy, 0.11, true)
    expect(enemy.staggerTimer).toBe(3)
    director.update(0.1, 0.1)
    director.damageEnemy(enemy, 0.1, true)
    expect(enemy.staggerTimer).toBeCloseTo(2.9)
  })

  it('interrupts a pending burst, slows movement to 15%, then restores firing and colors', () => {
    const { host, director, spawn, stagger } = fixture()
    const enemy = spawn('gunner', -30)
    enemy.burst = 3
    stagger(enemy)
    const start = enemy.parts.group.position.clone()
    director.update(0.5, 0.5)
    expect(enemy.parts.group.position.distanceTo(start)).toBeCloseTo(enemy.speed * 0.15 * 0.5)
    expect(enemy.burst).toBe(0)
    expect(host.sfx.eshot).not.toHaveBeenCalled()
    director.update(2.51, 3.01)
    expect(enemy.staggerTimer).toBe(0)
    expect(host.sfx.eshot).toHaveBeenCalled()
    expect((enemy.parts.outer.material as THREE.LineBasicMaterial).color.getHex()).toBe(DRONE_STATS.gunner.color)
    expect(enemy.parts.core.material.color.getHex()).toBe(DRONE_STATS.gunner.coreColor)
  })

  it('cancels a marksman laser and pauses contact detonation', () => {
    const { host, director, spawn, stagger } = fixture()
    const sniper = spawn('marksman', -30)
    sniper.laser = makeLaserLine(0xff2975)
    ;(sniper.laser.material as THREE.LineBasicMaterial).opacity = 1
    sniper.aimT = 1.14
    stagger(sniper)
    expect((sniper.laser.material as THREE.LineBasicMaterial).opacity).toBe(0)
    const melee = spawn('swarm', -1)
    stagger(melee)
    director.update(0.1, 0.1)
    expect(host.damagePlayer).not.toHaveBeenCalled()
    expect(director.enemies).toContain(melee)
    expect(host.sfx.sniper).not.toHaveBeenCalled()
  })

  it('lethal damage still kills immediately', () => {
    const { director, spawn, host } = fixture()
    const enemy = spawn()
    expect(director.damageEnemy(enemy, 999, true)).toBe(true)
    expect(enemy.staggerTimer).toBe(0)
    expect(host.onKill).toHaveBeenCalledTimes(1)
  })
})

describe('glory kill targeting and lifecycle', () => {
  it.each([
    ['healthy', 0, -5, false], ['out of range', 0, -7.01, true],
    ['behind', 0, 5, true], ['outside facing cone', 4, -2, true],
    ['exact facing boundary', 4, -3, true],
  ] as const)('rejects %s targets', (_label, x, z, shouldStagger) => {
    const { spawn, stagger, execute, host } = fixture()
    const enemy = spawn('gunner', z)
    enemy.parts.group.position.x = x
    if (shouldStagger) stagger(enemy)
    expect(execute()).toBe(false)
    expect(host.onGloryKill).not.toHaveBeenCalled()
  })

  it('accepts exactly 7 meters and awards one execution, even if given a stale enemy list', () => {
    const { spawn, stagger, execute, host, system, player, camera, director } = fixture()
    const enemy = spawn('gunner', -7)
    stagger(enemy)
    expect(execute()).toBe(true)
    expect(camera.fov).toBe(96)
    expect(host.hitstop).toHaveBeenCalledWith(0.05, 0.12)
    expect(host.sfx.gloryKill).toHaveBeenCalledTimes(1)
    expect(host.onKill).toHaveBeenCalledTimes(1)
    expect(host.onGloryKill).toHaveBeenCalledTimes(1)
    expect(director.enemies).toHaveLength(0)
    expect(enemy.parts.proxy.userData['enemy']).toBeUndefined()
    system.update(0.06, 0.06)
    expect(player.z).toBeLessThan(-4)
    expect(system.isDashing).toBe(true)
    system.update(0.06, 0.12)
    expect(player.z).toBeCloseTo(-5.75)
    expect(system.isDashing).toBe(false)
    expect(system.tryGloryKill(player, camera, [enemy], host)).toBe(false)
    expect(host.onGloryKill).toHaveBeenCalledTimes(1)
  })

  it('selects the nearest eligible enemy and rejects cover and a blocked player sweep', () => {
    const { spawn, stagger, execute, host, director } = fixture()
    const far = spawn('gunner', -6)
    const near = spawn('gunner', -4)
    stagger(far)
    stagger(near)
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 0.1), new THREE.MeshBasicMaterial())
    wall.position.set(0, 2.4, -2)
    host.collidables = () => [wall]
    expect(execute()).toBe(false)
    host.collidables = () => []
    host.walls = () => [{ x: 0.6, z: -2, hw: 0.1, hd: 0.1, h: 6 }]
    expect(execute()).toBe(false)
    host.walls = () => []
    expect(execute()).toBe(true)
    expect(director.enemies).toEqual([far])
  })

  it('disposes reticles after recovery or normal death and shatter fragments after expiry/reset', () => {
    const { spawn, stagger, execute, system, host, director } = fixture()
    const enemy = spawn()
    stagger(enemy)
    system.update(0.01, 0.01)
    const reticle = host.scene.children.find((object) => object instanceof THREE.LineLoop) as THREE.LineLoop
    expect(reticle).toBeDefined()
    const dispose = vi.spyOn(reticle.geometry, 'dispose')
    enemy.staggerTimer = 0
    system.update(0.01, 3.1)
    expect(dispose).toHaveBeenCalledOnce()
    expect(reticle.parent).toBeNull()
    stagger(enemy)
    system.update(0.01, 3.2)
    director.damageEnemy(enemy, 999, true)
    system.update(0.01, 3.3)
    expect(host.scene.children).toHaveLength(0)

    stagger(spawn())
    expect(execute()).toBe(true)
    expect(host.scene.children).toHaveLength(18)
    system.update(0.8, 4.1)
    expect(host.scene.children).toHaveLength(0)
    expect(system.fovFloor).toBe(0)
    stagger(spawn())
    expect(execute()).toBe(true)
    system.reset()
    expect(host.scene.children).toHaveLength(0)
    expect(system.isDashing).toBe(false)
  })
})
