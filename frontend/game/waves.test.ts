import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WaveDirector, type CombatHost } from './waves'
import type { Particles } from './effects'
import type { Sfx } from './audio'

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null))
afterEach(() => vi.restoreAllMocks())

function makeHost() {
  const scene = new THREE.Scene()
  const player = new THREE.Vector3(0, 2.4, 0)
  const kills: string[] = []
  const sfx = new Proxy({}, { get: () => () => {} }) as unknown as Sfx
  const particles = { burst: () => {} } as unknown as Particles
  const host: CombatHost = {
    scene,
    camera: new THREE.PerspectiveCamera(),
    sfx,
    particles,
    playerPos: () => player,
    now: () => 0,
    addShake: () => {},
    hitstop: () => {},
    shockwave: () => {},
    damagePlayer: () => {},
    onKill: (type) => {
      kills.push(type)
    },
    onGloryKill: () => {},
    onWaveStart: () => {},
    onWaveClear: () => {},
    sfxPan: () => 0,
    // far away so melee drones never reach the player during the test
    spawnPoint: () => new THREE.Vector3(Math.random() * 10, 4, 400),
    collidables: () => [],
    walls: () => [],
  }
  return { host, scene, kills }
}

function spawnSome(d: WaveDirector, n: number) {
  d.reset()
  for (let i = 0; i < 400 && d.enemies.length < n; i++) d.update(0.05, i * 0.05)
}

describe('WaveDirector enemy lifecycle', () => {
  it('removes every enemy object from the scene when killed (no corpses)', () => {
    const { host, scene } = makeHost()
    const d = new WaveDirector(host)
    const base = scene.children.length
    spawnSome(d, 3)
    expect(d.enemies.length).toBeGreaterThan(0)
    expect(scene.children.length).toBeGreaterThan(base)
    for (const e of [...d.enemies]) d.damageEnemy(e, 999, true)
    expect(d.enemies.length).toBe(0)
    expect(scene.children.length).toBe(base)
  })

  it('reset() (restart after death) clears live enemies and lasers from the scene', () => {
    const { host, scene } = makeHost()
    const d = new WaveDirector(host)
    const base = scene.children.length
    spawnSome(d, 4)
    expect(scene.children.length).toBeGreaterThan(base)
    d.reset()
    expect(d.enemies.length).toBe(0)
    expect(scene.children.length).toBe(base)
  })

  it('a dead enemy cannot be killed twice (no double score)', () => {
    const { host, kills } = makeHost()
    const d = new WaveDirector(host)
    spawnSome(d, 1)
    const e = d.enemies[0]!
    expect(d.damageEnemy(e, 999, true)).toBe(true)
    const after = kills.length
    d.damageEnemy(e, 999, true)
    expect(kills.length).toBe(after)
  })

  it('knockback on a removed enemy is ignored', () => {
    const { host } = makeHost()
    const d = new WaveDirector(host)
    spawnSome(d, 1)
    const e = d.enemies[0]!
    d.damageEnemy(e, 999, true)
    const p = e.parts.group.position.clone()
    d.knockback(e, new THREE.Vector3(1, 0, 0), 5)
    expect(e.parts.group.position.equals(p)).toBe(true)
  })

  it('spy: onKill is reported once per kill', () => {
    const { host } = makeHost()
    const spy = vi.spyOn(host, 'onKill')
    const d = new WaveDirector(host)
    spawnSome(d, 2)
    const n = d.enemies.length
    for (const e of [...d.enemies]) d.damageEnemy(e, 999, true)
    expect(spy).toHaveBeenCalledTimes(n)
  })
})
