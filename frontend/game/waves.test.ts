import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WaveDirector, type CombatHost } from './waves'
import type { Particles } from './effects'
import type { Sfx } from './audio'
import { HackManager, NEON_HACKS } from './combat/modifiers'

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

describe('wave drafts', () => {
  function setup() {
    const { host } = makeHost()
    host.hackManager = new HackManager()
    host.onWaveDraft = vi.fn()
    const director = new WaveDirector(host)
    director['beginWave'](1)
    director['queue'] = []
    director['spawnEnemy']('gunner')
    return { host, director, enemy: director.enemies[0]! }
  }

  it('offers one unowned draft after the final kill and blocks the next wave until resumed', () => {
    const { host, director, enemy } = setup()
    host.hackManager!.apply('freeze')
    director.damageEnemy(enemy, 999, true)
    expect(host.onWaveDraft).toHaveBeenCalledOnce()
    const cards = vi.mocked(host.onWaveDraft!).mock.calls[0]![0]
    expect(cards).toHaveLength(3)
    expect(cards.some((hack) => hack.id === 'freeze')).toBe(false)
    expect(director.draftPending).toBe(true)
    director.update(60, 60)
    expect(director.wave).toBe(1)
    expect(director.intermission).toBe(3.2)
    director.damageEnemy(enemy, 999, true)
    expect(host.onWaveDraft).toHaveBeenCalledOnce()
    director.resumeAfterDraft()
    director.update(3.3, 63.3)
    expect(director.wave).toBe(2)
    director.reset()
  })

  it('waits for queued enemies as well as living enemies', () => {
    const { host, director, enemy } = setup()
    director['queue'] = ['gunner']
    director.damageEnemy(enemy, 999, true)
    expect(host.onWaveDraft).not.toHaveBeenCalled()
    expect(director.draftPending).toBe(false)
    director.reset()
  })

  it('continues automatically when the player already owns all six hacks', () => {
    const { host, director, enemy } = setup()
    for (const hack of NEON_HACKS) host.hackManager!.apply(hack.id)
    director.damageEnemy(enemy, 999, true)
    expect(host.onWaveDraft).toHaveBeenCalledExactlyOnceWith([])
    expect(director.draftPending).toBe(false)
    director.update(3.3, 3.3)
    expect(director.wave).toBe(2)
    director.reset()
  })

  it('reset discards the pending draft and restores the initial wave delay', () => {
    const { director, enemy } = setup()
    director.damageEnemy(enemy, 999, true)
    director.reset()
    expect(director.draftPending).toBe(false)
    expect(director.wave).toBe(0)
    expect(director.intermission).toBe(2.2)
  })
})
