import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WaveDirector, type CombatHost } from './waves'
import type { Sfx } from './audio'
import type { Particles } from './effects'

let director: WaveDirector
let host: CombatHost
let obstacles: THREE.Object3D[]

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  const player = new THREE.Vector3(0, 3, 0)
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000)
  camera.position.copy(player)
  camera.lookAt(0, 3, -12)
  const sounds: Record<string, ReturnType<typeof vi.fn>> = {}
  obstacles = []
  host = {
    scene: new THREE.Scene(), camera,
    sfx: new Proxy({}, { get: (_, key: string) => sounds[key] ??= vi.fn() }) as Sfx,
    particles: { burst: vi.fn() } as unknown as Particles,
    playerPos: () => player, now: () => 0,
    addShake: vi.fn(), hitstop: vi.fn(), shockwave: vi.fn(), damagePlayer: vi.fn(),
    onKill: vi.fn(), onGloryKill: vi.fn(), onWaveStart: vi.fn(), onWaveClear: vi.fn(),
    sfxPan: () => -0.5, spawnPoint: () => new THREE.Vector3(0, 3, -40),
    collidables: () => obstacles, walls: () => [],
  }
  host.scene.add(camera)
  director = new WaveDirector(host)
  director.intermission = 999
})

afterEach(() => { director.reset(); vi.restoreAllMocks() })

function encounter() {
  const source = director.spawnEnemy('marksman')
  source.parts.group.position.set(-12, 3, -32)
  const target = director.spawnEnemy('enforcer')
  target.parts.group.position.set(0, 3, -12)
  for (const enemy of [source, target]) { enemy.speed = 0; enemy.fireT = 99 }
  director.update(0.4, 0.4)
  return { source, target }
}

function wall(x: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 1), new THREE.MeshBasicMaterial())
  mesh.position.set(x, 3, z)
  host.scene.add(mesh)
  mesh.updateMatrixWorld(true)
  obstacles.push(mesh)
  return mesh
}

describe('single-shot sniper Hack', () => {
  it('publishes directional charge and emits acquisition/urgent cues once on the same simulation clock', () => {
    encounter()
    const first = director.sniperHackState()
    expect(first.warnings).toHaveLength(1)
    expect(first.warnings[0]!.bearing).toBeCloseTo(-0.35877, 4)
    expect(first.warnings[0]!.progress).toBeCloseTo(0.4 / 1.15)
    expect(first.warnings[0]!.urgent).toBe(false)
    expect(host.sfx.sniperAlert).toHaveBeenCalledExactlyOnceWith(-0.5, false)
    director.update(0, 10)
    expect(director.sniperHackState().warnings[0]!.progress).toBe(first.warnings[0]!.progress)
    director.update(0.41, 10.41)
    expect(director.sniperHackState().warnings[0]!.urgent).toBe(true)
    director.update(0.1, 10.51)
    expect(host.sfx.sniperAlert).toHaveBeenCalledTimes(2)
    expect(host.sfx.sniperAlert).toHaveBeenLastCalledWith(-0.5, true)
    expect(host.damagePlayer).not.toHaveBeenCalled()
  })

  it('redirects the remaining charge, fires from the source, kills armor, credits the player and freezes briefly', () => {
    const { source, target } = encounter()
    const progress = director.sniperHackState().warnings[0]!.progress
    expect(director.sniperHackState().status).toBe('ready')
    expect(director.hackSniperShot()).toBe(true)
    expect(director.sniperHackState()).toMatchObject({ status: 'redirected', warnings: [{ progress, redirected: true }] })
    expect(source.laser!.material.color.getHex()).toBe(0x00f0ff)
    expect(director.hackSniperShot()).toBe(false)
    director.update(0.7, 1.1)
    expect(director.enemies).toContain(target)
    director.update(0.06, 1.16)
    expect(director.enemies).not.toContain(target)
    expect(director.enemies).toContain(source)
    expect(host.damagePlayer).not.toHaveBeenCalled()
    expect(host.onKill).toHaveBeenCalledExactlyOnceWith('enforcer', expect.any(THREE.Vector3), true)
    expect(host.hitstop).toHaveBeenCalledExactlyOnceWith(0, 0.12)
    const positions = source.laser!.geometry.getAttribute('position')
    expect(positions.getX(0)).toBe(-12)
    expect(positions.getZ(0)).toBe(-32)
  })

  it('rejects Hack through cover from either the camera or sniper and rejects self-targeting', () => {
    const { source } = encounter()
    const cover = wall(-6, -22)
    expect(director.sniperHackState().status).toBe('blocked')
    expect(director.hackSniperShot()).toBe(false)
    obstacles.length = 0
    host.scene.remove(cover)
    wall(0, -6)
    expect(director.sniperHackState().status).toBe('blocked')
    expect(director.hackSniperShot()).toBe(false)
    obstacles.length = 0
    host.camera.lookAt(source.parts.group.position)
    expect(director.hackSniperShot()).toBe(false)
    expect(director.sniperHackState().cooldown).toBe(0)
  })

  it('hits new cover on the actual source-to-target path instead of damaging through it', () => {
    const { target } = encounter()
    expect(director.hackSniperShot()).toBe(true)
    wall(-6, -22)
    director.update(0.76, 1.16)
    expect(target.hp).toBe(14)
    expect(host.damagePlayer).not.toHaveBeenCalled()
    expect(host.onKill).not.toHaveBeenCalled()
  })

  it('lets an intervening drone absorb the redirected ray', () => {
    const { target } = encounter()
    expect(director.hackSniperShot()).toBe(true)
    const blocker = director.spawnEnemy('gunner')
    blocker.speed = 0
    blocker.fireT = 99
    blocker.parts.group.position.set(-6, 3, -22)
    director.update(0.76, 1.16)
    expect(director.enemies).not.toContain(blocker)
    expect(target.hp).toBe(14)
    expect(host.damagePlayer).not.toHaveBeenCalled()
  })

  it('cancels a shot whose target died without falling back to the player', () => {
    const { target } = encounter()
    director.hackSniperShot()
    director.damageEnemy(target, 999, true)
    director.update(0.8, 1.2)
    expect(host.damagePlayer).not.toHaveBeenCalled()
    expect(host.sfx.sniper).not.toHaveBeenCalled()
    expect(director.sniperHackState().warnings).toHaveLength(0)
  })

  it('cancels locks on cover, source death or stagger and resets Hack cooldown on restart', () => {
    const { source } = encounter()
    const cover = wall(-6, -16)
    director.update(0.1, 0.5)
    expect(director.sniperHackState().warnings).toHaveLength(0)
    obstacles.length = 0
    host.scene.remove(cover)
    director.update(0.1, 0.6)
    expect(director.hackSniperShot()).toBe(true)
    const remaining = director.sniperHackState().cooldown
    director.draftPending = true
    director.update(20, 20)
    expect(director.sniperHackState().cooldown).toBe(remaining)
    director.draftPending = false
    director.staggerEnemy(source)
    expect(director.sniperHackState().warnings).toHaveLength(0)
    director.damageEnemy(source, 999, true)
    expect(director.hackSniperShot()).toBe(false)
    director.reset()
    expect(director.sniperHackState()).toEqual({ warnings: [], status: 'none', cooldown: 0 })
  })

  it('keeps normal sniper damage and waits the full cooldown before reacquiring', () => {
    encounter()
    director.update(0.76, 1.16)
    expect(host.damagePlayer).toHaveBeenCalledExactlyOnceWith(18)
    director.update(1.4, 2.56)
    expect(director.sniperHackState().warnings).toHaveLength(0)
    director.update(1.1, 3.66)
    expect(director.sniperHackState().warnings).toHaveLength(0)
    director.update(0.11, 3.77)
    director.update(0.1, 3.87)
    expect(director.sniperHackState().warnings).toHaveLength(1)
    expect(host.damagePlayer).toHaveBeenCalledTimes(1)
  })
})
