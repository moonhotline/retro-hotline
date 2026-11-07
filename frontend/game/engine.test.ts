import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameEngine } from './engine'
import { DRONE_STATS, makeDrone, WEAPONS } from './effects'
import type { Enemy } from './waves'
import { GLORY_KILL_BANNER } from './combat/gloryKill'

// Keep combat, movement, pickups and input real; replace only GPU/audio/environment setup.
vi.mock('three', async (importOriginal) => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: class {
    domElement = document.createElement('canvas')
    info = { render: { calls: 0, triangles: 0, lines: 0 }, memory: { geometries: 0, textures: 0 }, programs: [] }
    setPixelRatio() {}
    setSize() {}
    dispose() {}
  },
}))
vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class { addPass() {} render() {} setSize() {} dispose() {} },
}))
vi.mock('./environment', () => ({
  buildEnvironment: () => ({
    walls: [], collidables: [], pads: [],
    walkRects: [{ x0: -100, x1: 100, z0: -500, z1: 500, top: 0.6 }],
    randomSpawnPoint: () => new THREE.Vector3(0, 3, -100), update() {},
  }),
}))
vi.mock('./music', () => ({
  SynthMusic: class { start() {} setIntensity() {} dispose() {} debugState() { return {} } },
}))

let engine: GameEngine
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  engine = new GameEngine(document.createElement('div'), () => {})
  vi.spyOn(engine.sfx, 'resume').mockImplementation(() => {})
  engine['renderer'].domElement.requestPointerLock = vi.fn()
  engine.start()
  // No wave transitions or passive health regeneration during these scenarios.
  engine['director'].intermission = 999
  engine['lastHitAt'] = 0
  vi.spyOn(Math, 'random').mockReturnValue(0.9)
})
afterEach(() => {
  engine.dispose()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function target(distance = 5, staggered = true) {
  const stats = DRONE_STATS.gunner
  const enemy: Enemy = {
    type: 'gunner', parts: makeDrone('gunner'), hp: stats.hp,
    radius: stats.radius, speed: stats.speed, damage: stats.damage, phase: 0,
    flash: 0, staggerTimer: 0, fireT: 99, burst: 0, burstT: 0, aimT: 0, laser: null,
  }
  enemy.parts.group.position.copy(engine.playerPos()).add(new THREE.Vector3(0, 0, -distance))
  enemy.parts.proxy.userData['enemy'] = enemy
  engine.scene.add(enemy.parts.group)
  engine['director'].enemies.push(enemy)
  if (staggered) engine['director'].damageEnemy(enemy, 3, true)
  return enemy
}
function tick(seconds: number) {
  engine['clock'].elapsedTime += seconds
  engine['update'](seconds)
}
function key(code: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }))
  window.dispatchEvent(new KeyboardEvent('keyup', { code }))
}

describe('engine glory kill integration', () => {
  it.each(['KeyE', 'KeyF', 'RMB'])('%s executes once and produces collectible +35 HP and overdrive', (input) => {
    engine['health'] = 50
    const enemy = target()
    // Keep another enemy alive so the existing no-damage wave bonus is separate.
    target(50, false)
    if (input === 'RMB') document.dispatchEvent(new MouseEvent('mousedown', { button: 2 }))
    else key(input)
    expect(engine['director'].enemies).not.toContain(enemy)
    expect(engine.stats().kills).toBe(1)
    expect(engine.stats().score).toBe(DRONE_STATS.gunner.points + 350)
    expect(engine['pickups'].map((p) => p.parts.kind).sort()).toEqual(['heal', 'overcharge'])
    expect(engine['pickups'].find((p) => p.parts.kind === 'heal')?.healAmount).toBe(35)
    expect(engine['banner']).toBe(GLORY_KILL_BANNER)
    expect(engine.camera.fov).toBe(96)
    expect(engine['hitstopT']).toBe(0.12)
    key('KeyE')
    expect(engine.stats().kills).toBe(1)
    for (let i = 0; i < 20; i++) tick(0.05)
    expect(engine.stats().health).toBe(85)
    expect(engine['overchargeT']).toBeGreaterThan(0)
    expect(engine['banner']).toBe(GLORY_KILL_BANNER)
    expect(engine.camera.fov).toBeCloseTo(75, 0)
    expect(engine['pickups']).toHaveLength(0)
  })

  it('keeps punch fallback, slide, weapon swap and reload working', () => {
    const enemy = target(3, false)
    key('KeyF')
    expect(engine.stats().kills).toBe(1)
    expect(engine.stats().score).toBeGreaterThanOrEqual(DRONE_STATS.gunner.points)
    expect(engine['banner']).not.toBe(GLORY_KILL_BANNER)
    expect(engine['director'].enemies).not.toContain(enemy)
    expect(engine['punchCd']).toBeGreaterThan(0)
    key('KeyC')
    expect(engine['slideT']).toBeGreaterThan(0)
    key('KeyQ')
    expect(engine.stats().weapon).toBe('deagle')
    engine['ammo'].deagle = 1
    key('KeyR')
    expect(engine.stats().reloading).toBe(true)
    for (let i = 0; i < 80; i++) tick(0.05)
    expect(engine.stats().reloading).toBe(false)
    expect(engine.stats().ammo.deagle).toBe(WEAPONS.deagle.mag)
  })

  it('holds hitstop for 120 ms of real time and restores normal simulation timing', () => {
    const update = vi.spyOn(engine['director'], 'update')
    engine.hitstop(0.05, 0.12)
    tick(0.05)
    expect(update.mock.calls.at(-1)?.[0]).toBeCloseTo(0.0025)
    tick(0.05)
    expect(update.mock.calls.at(-1)?.[0]).toBeCloseTo(0.0025)
    tick(0.02)
    expect(update.mock.calls.at(-1)?.[0]).toBeCloseTo(0.001)
    tick(0.05)
    expect(update.mock.calls.at(-1)?.[0]).toBeCloseTo(0.05)
    engine.hitstop(0.05, 0.12)
    engine['update'](0.05, 0.3)
    expect(engine['hitstopT']).toBe(0)
    tick(0.05)
    expect(update.mock.calls.at(-1)?.[0]).toBeCloseTo(0.05)
  })

  it('ignores execution input while paused and clears dash, hitstop, FX and pickups on restart', () => {
    target()
    engine['status'] = 'paused'
    key('KeyE')
    expect(engine.stats().kills).toBe(0)
    engine['status'] = 'playing'
    key('KeyE')
    expect(engine['gloryKills'].isDashing).toBe(true)
    engine.restart()
    expect(engine['gloryKills'].isDashing).toBe(false)
    expect(engine['hitstopT']).toBe(0)
    expect(engine.camera.fov).toBe(75)
    expect(engine['pickups']).toHaveLength(0)
    expect(engine.stats().kills).toBe(0)
    expect(engine.stats().health).toBe(100)
  })
})
