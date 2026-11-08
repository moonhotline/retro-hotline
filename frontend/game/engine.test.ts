import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameEngine } from './engine'
import { DRONE_STATS, makeDrone, WEAPONS } from './effects'
import type { Enemy } from './waves'
import { GLORY_KILL_BANNER } from './combat/gloryKill'
import { buildZones } from './map'
import { loadProfile, saveProfile } from './combat/storage'
import { installTestStorage } from './testStorage'

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
vi.mock('./music', async (importOriginal) => {
  const original = await importOriginal<typeof import('./music')>()
  return { ...original, SynthMusic: class extends original.SynthMusic {
    start = vi.fn()
    setIntensity = vi.fn(super.setIntensity.bind(this))
    setVolume = vi.fn(super.setVolume.bind(this))
    setMuted = vi.fn(super.setMuted.bind(this))
    setComboRank = vi.fn(super.setComboRank.bind(this))
    triggerFilterDrop = vi.fn(super.triggerFilterDrop.bind(this))
  } }
})

let engine: GameEngine
beforeEach(() => {
  installTestStorage()
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
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null })
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

describe('full-auto rifle and dedicated controls', () => {
  it('clears held and queued inputs on blur and ignores HUD button clicks', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    window.dispatchEvent(new Event('blur'))
    tick(1 / 60)
    expect(engine.stats().ammo.rifle).toBe(32)
    expect(engine['keys'].size).toBe(0)
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))
    button.remove()
    tick(1 / 60)
    expect(engine.stats().ammo.rifle).toBe(32)
  })

  it('keeps its cadence across uneven frames and recovers a quick tap between frames', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))
    tick(0.01)
    expect(engine.stats().ammo.rifle).toBe(31)
    for (let i = 0; i < 20; i++) tick(0.02)
    expect(engine.stats().ammo.rifle).toBe(31)
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    for (let i = 0; i < 20; i++) for (const dt of [0.01, 0.03, 0.05]) tick(dt)
    expect(31 - engine.stats().ammo.rifle).toBeGreaterThanOrEqual(20)
    expect(31 - engine.stats().ammo.rifle).toBeLessThanOrEqual(21)
  })

  it.each([30, 60, 120])('sustains the 90ms cadence at %s FPS without climbing recoil', (fps) => {
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    for (let frame = 0; frame < fps * 1.8; frame++) {
      tick(1 / fps)
      expect(engine['recoil']).toBeLessThanOrEqual(0.045)
    }
    const shots = WEAPONS.rifle.mag - engine.stats().ammo.rifle
    expect(shots).toBeGreaterThanOrEqual(20)
    expect(shots).toBeLessThanOrEqual(21)
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))
    for (let frame = 0; frame < fps; frame++) tick(1 / fps)
    expect(WEAPONS.rifle.mag - engine.stats().ammo.rifle).toBe(shots)
    expect(engine['recoil']).toBe(0)
    expect(engine['gunKick']).toBe(0)
  })

  it('does not bank idle time into a burst and resumes full auto after a reload', () => {
    for (let frame = 0; frame < 600; frame++) tick(1 / 60)
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    tick(1 / 60)
    expect(engine.stats().ammo.rifle).toBe(31)
    tick(1 / 60)
    expect(engine.stats().ammo.rifle).toBe(31)
    engine['ammo'].rifle = 0
    tick(1 / 60)
    expect(engine.stats().reloading).toBe(true)
    for (let frame = 0; frame < 90; frame++) tick(1 / 60)
    expect(engine.stats().reloading).toBe(false)
    expect(engine.stats().ammo.rifle).toBeGreaterThan(25)
    expect(engine.stats().ammo.rifle).toBeLessThan(32)
  })

  it('keeps the Eagle semi-automatic while a mouse button is held', () => {
    key('KeyQ')
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    for (let frame = 0; frame < 120; frame++) tick(1 / 60)
    expect(engine.stats().ammo.deagle).toBe(6)
  })

  it('reserves V for parry, G for slam and C for slide, including in the air', () => {
    const parry = vi.spyOn(engine['abilities'], 'tryPulseParry')
    const slam = vi.spyOn(engine['abilities'], 'tryKineticSlam')
    key('KeyC')
    expect(engine['slideT']).toBeGreaterThan(0)
    engine['grounded'] = false
    engine.playerPos().y += 10
    key('KeyC')
    for (const button of [0, 1, 2, 3, 4]) {
      document.dispatchEvent(new MouseEvent('mousedown', { button }))
      document.dispatchEvent(new MouseEvent('mouseup', { button }))
    }
    expect(engine['punchCd']).toBeGreaterThan(0)
    expect(parry).not.toHaveBeenCalled()
    expect(slam).not.toHaveBeenCalled()
    key('KeyV')
    expect(parry).toHaveBeenCalledOnce()
    key('KeyG')
    expect(slam).toHaveBeenCalledOnce()
    expect(engine['abilities'].isSlamming).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', repeat: true }))
    expect(slam).toHaveBeenCalledOnce()
  })
})

describe('district HUD', () => {
  it.each([
    [-285, 'SOUTH PLAZA // NEON ARCADE'],
    [-284, 'BAY BRIDGE // TRANSIT SPAN'],
    [284, 'BAY BRIDGE // TRANSIT SPAN'],
    [285, 'NORTH GATE // LOGISTICS HUB'],
    [400, 'NORTH GATE // LOGISTICS HUB'],
    [401, 'SILICON VALLEY // QUANTUM CAMPUS'],
    [680, 'SILICON VALLEY // QUANTUM CAMPUS'],
  ])('publishes the district at camera z=%s', (z, district) => {
    const onHud = vi.fn()
    engine['onHud'] = onHud
    engine.camera.position.z = Number(z)
    engine['emit'](true)
    expect(onHud).toHaveBeenLastCalledWith(expect.objectContaining({ district }))
  })
})

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

describe('engine neon hack integration', () => {
  function draft() {
    engine['director'].wave = 1
    const last = target(5, false)
    engine['director'].damageEnemy(last, 999, true)
    return engine.stats().draftHacks
  }

  it('opens a draft on wave clear, freezes gameplay clocks and rejects resume and unrelated IDs', () => {
    engine.hackManager.apply('blood_momentum')
    engine.hackManager.onDashKill({ resetDashCooldown: () => {} })
    engine['abilities'].tryPulseParry()
    engine['keys'].add('KeyW')
    engine['firing'] = engine['triggerQueued'] = true
    const cards = draft()
    expect(cards).toHaveLength(3)
    expect(engine.stats().draftOpen).toBe(true)
    expect(engine.stats().status).toBe('paused')
    expect(engine['director'].draftPending).toBe(true)
    expect(engine['keys'].size).toBe(0)
    expect(engine['firing']).toBe(false)
    expect(engine['triggerQueued']).toBe(false)
    const time = engine.now()
    const parry = engine.stats().abilities.pulseParry.remaining
    const position = engine.playerPos().clone()
    const intermission = engine['director'].intermission
    key('ShiftLeft')
    key('KeyQ')
    key('KeyE')
    engine.resume()
    engine['onLockError']()
    tick(30)
    expect(engine.stats().status).toBe('paused')
    expect(engine.now()).toBe(time)
    expect(engine.playerPos().equals(position)).toBe(true)
    expect(engine['director'].intermission).toBe(intermission)
    expect(engine.stats().abilities.pulseParry.remaining).toBe(parry)
    expect(engine.hackManager.speedBoostRemaining).toBe(2)
    expect(engine.stats().weapon).toBe('rifle')
    engine.applyDraftHack('blood_momentum')
    expect(engine.stats().draftOpen).toBe(true)
    engine.applyDraftHack(cards[1]!.id)
    expect(engine.stats().status).toBe('playing')
    expect(engine.stats().draftOpen).toBe(false)
    expect(engine['director'].draftPending).toBe(false)
    expect(engine.hackManager.has(cards[1]!.id)).toBe(true)
    const count = engine.hackManager.list().length
    engine.applyDraftHack(cards[2]!.id)
    expect(engine.hackManager.list()).toHaveLength(count)
    expect(engine['renderer'].domElement.requestPointerLock).toHaveBeenCalled()
    tick(0.1)
    expect(engine['director'].intermission).toBeLessThan(intermission)
  })

  it('releases pointer lock and prevents a late lock event from bypassing the draft', () => {
    const canvas = engine['renderer'].domElement
    const lock = vi.spyOn(document, 'pointerLockElement', 'get').mockReturnValue(canvas)
    document.exitPointerLock = vi.fn()
    draft()
    expect(document.exitPointerLock).toHaveBeenCalledOnce()
    engine['onLockChange']()
    expect(engine.stats().status).toBe('paused')
    expect(document.exitPointerLock).toHaveBeenCalledTimes(2)
    lock.mockReturnValue(null)
    engine['onLockChange']()
    expect(engine.stats().draftOpen).toBe(true)
  })

  it('clears the build, draft and temporary buffs on restart', () => {
    engine.hackManager.apply('blood_momentum')
    engine.hackManager.apply('overdrive_heatsink')
    engine.hackManager.onDashKill({ resetDashCooldown: () => {} })
    engine.hackManager.onParry({ refillMagazine: () => {} })
    draft()
    engine.restart()
    expect(engine.stats().draftOpen).toBe(false)
    expect(engine.stats().activeHacks).toEqual([])
    expect(engine.stats().speedBoostRemaining).toBe(0)
    expect(engine.stats().ammoEfficiency).toBe(1)
    expect(engine['director'].draftPending).toBe(false)
    expect(engine.stats().wave).toBe(0)
    expect(engine.stats().status).toBe('playing')
  })

  it('publishes the final execution rewards in the paused HUD and resets timed HUD state', () => {
    const hud = vi.fn()
    engine['onHud'] = hud
    engine['director'].wave = 1
    target()
    key('KeyE')
    expect(engine.stats().draftOpen).toBe(true)
    expect(hud.mock.lastCall?.[0].score).toBe(engine.stats().score)
    expect(hud.mock.lastCall?.[0].banner).toBe(GLORY_KILL_BANNER)
    engine['gameplayTime'] = 100
    engine['lastHitAt'] = 95
    engine.restart()
    expect(engine['popups']).toEqual([])
    engine['health'] = 90
    tick(0.1)
    expect(engine['health']).toBeGreaterThan(90)
  })

  it('bounces real hitscan bullets to exactly one other enemy', () => {
    engine.hackManager.apply('ricochet')
    const primary = target(5, false)
    const secondary = target(6, false)
    secondary.parts.group.position.x = 3
    const untouched = target(8, false)
    untouched.parts.group.position.x = 6
    engine.camera.position.copy(engine.playerPos())
    engine.camera.rotation.set(0, 0, 0)
    engine.scene.updateMatrixWorld(true)
    engine['fire']()
    expect(primary.hp).toBeCloseTo(DRONE_STATS.gunner.hp - WEAPONS.rifle.dmg)
    expect(secondary.hp).toBeCloseTo(DRONE_STATS.gunner.hp - WEAPONS.rifle.dmg * 0.6)
    expect(untouched.hp).toBe(DRONE_STATS.gunner.hp)
    expect(engine.stats().tracers).toBe(2)
  })

  it('bounces wall hits toward a visible target without shooting through the wall', () => {
    engine.hackManager.apply('ricochet')
    const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 0.5), new THREE.MeshBasicMaterial())
    wall.position.copy(engine.playerPos()).add(new THREE.Vector3(0, 0, -5))
    engine.scene.add(wall)
    engine['env'].collidables.push(wall)
    const behind = target(6, false)
    const visible = target(4, false)
    visible.parts.group.position.x = 3
    engine.camera.position.copy(engine.playerPos())
    engine.camera.rotation.set(0, 0, 0)
    engine.scene.updateMatrixWorld(true)
    engine['fire']()
    expect(behind.hp).toBe(DRONE_STATS.gunner.hp)
    expect(visible.hp).toBeCloseTo(DRONE_STATS.gunner.hp - WEAPONS.rifle.dmg * 0.6)
  })

  it('chains execution damage and refreshes dash cooldown and movement speed together', () => {
    engine.hackManager.apply('chain_lightning')
    engine.hackManager.apply('blood_momentum')
    const executed = target()
    const nearby = target(10, false)
    const distant = target(30, false)
    engine['abilities'].tryPhaseDash(new THREE.Vector3(1, 0, 0))
    engine['abilities'].cancelMotion()
    expect(engine.stats().abilities.phaseDash.remaining).toBeGreaterThan(0)
    key('KeyE')
    expect(engine['director'].enemies).not.toContain(executed)
    expect(nearby.hp).toBeCloseTo(DRONE_STATS.gunner.hp * 0.65)
    expect(distant.hp).toBe(DRONE_STATS.gunner.hp)
    expect(engine.stats().abilities.phaseDash.remaining).toBe(0)
    expect(engine.hackManager.speedMultiplier).toBe(1.4)
    engine['gloryKills'].reset()
    engine['hitstopT'] = 0
    engine['timescale'] = 1
    engine['keys'].add('KeyW')
    const z = engine.playerPos().z
    tick(0.1)
    expect(z - engine.playerPos().z).toBeCloseTo(8 * 1.4 * 0.1)
  })

  it('refreshes Blood Momentum on a phase dash slice', () => {
    engine.hackManager.apply('blood_momentum')
    const sliced = target(3)
    target(50, false)
    key('ShiftLeft')
    tick(0.05)
    expect(engine['director'].enemies).not.toContain(sliced)
    expect(engine.stats().abilities.phaseDash.remaining).toBe(0)
    expect(engine.stats().speedBoostRemaining).toBe(2)
  })

  it('only refills the equipped magazine on a successful parry, cancels reload and saves ammo', () => {
    engine.hackManager.apply('overdrive_heatsink')
    engine['ammo'] = { rifle: 2, deagle: 1 }
    key('KeyR')
    key('KeyV')
    expect(engine.stats().ammo.rifle).toBe(2)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial())
    sprite.position.copy(engine.playerPos()).add(new THREE.Vector3(0, 0, -3))
    const projectile = { sprite, vel: new THREE.Vector3(0, 0, 10), dmg: 5, life: 3, byPlayer: false }
    expect(engine.deflectProjectile(projectile, 0)).toBe(true)
    expect(engine.stats().ammo).toEqual({ rifle: WEAPONS.rifle.mag, deagle: 1 })
    expect(engine.stats().reloading).toBe(false)
    engine['fire']()
    engine['fire']()
    expect(engine.stats().ammo.rifle).toBe(WEAPONS.rifle.mag - 1)
    expect(engine.deflectProjectile(projectile, 0)).toBe(false)
    expect(engine.stats().ammo.rifle).toBe(WEAPONS.rifle.mag - 1)
    sprite.material.dispose()
  })

  it('Bass Drop extends the slam impact to 18m and forces stagger above the usual HP threshold', () => {
    engine.hackManager.apply('bass_drop')
    const inside = target(18, false)
    inside.hp = 200
    const outside = target(18.01, false)
    outside.hp = 200
    engine['grounded'] = false
    engine.playerPos().y += 5
    expect(engine['abilities'].tryKineticSlam()).toBe(true)
    engine.playerPos().y -= 5
    engine['grounded'] = true
    engine['abilities'].onLanding()
    expect(inside.hp).toBe(155)
    expect(inside.staggerTimer).toBe(3)
    expect(outside.hp).toBe(200)
    expect(outside.staggerTimer).toBe(0)
  })

  it.each(['KeyE', 'KeyF', 'RMB'])('Void Leash enables a 26m execution with %s', (input) => {
    engine.hackManager.apply('void_leash')
    const far = target(26)
    target(50, false)
    if (input === 'RMB') document.dispatchEvent(new MouseEvent('mousedown', { button: 2 }))
    else key(input)
    expect(engine['director'].enemies).not.toContain(far)
    expect(engine.stats().gloryDashing).toBe(true)
  })

  it('Void Leash still requires stagger, forward aim, range and a clear path', () => {
    engine.hackManager.apply('void_leash')
    const far = target(26.01)
    key('KeyE')
    expect(engine.stats().kills).toBe(0)
    far.parts.group.position.z = engine.playerPos().z - 20
    far.staggerTimer = 0
    key('KeyE')
    expect(engine.stats().kills).toBe(0)
    far.staggerTimer = 3
    engine['yaw'] = Math.PI
    key('KeyE')
    expect(engine.stats().kills).toBe(0)
    engine['yaw'] = 0
    const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 1), new THREE.MeshBasicMaterial())
    wall.position.copy(engine.playerPos()).add(new THREE.Vector3(0, 0, -10))
    engine.scene.add(wall)
    engine['env'].collidables.push(wall)
    key('KeyE')
    expect(engine.stats().kills).toBe(0)
    expect(engine['director'].enemies).toContain(far)
  })
})


describe('engine persistence and layered audio', () => {
  it('cycles tracks once per key press, emits the name and banner, and restores the selection', () => {
    const onHud = vi.fn()
    engine['onHud'] = onHud
    saveProfile({ musicVolume: 0.25, highScore: 500 })
    key('KeyN')
    expect(engine['music'].getCurrentTrackIndex()).toBe(1)
    expect(loadProfile()).toMatchObject({ musicTrackIndex: 1, musicVolume: 0.25, highScore: 500 })
    expect(onHud).toHaveBeenLastCalledWith(expect.objectContaining({
      musicTrackName: 'HOTLINE MIDNIGHT', musicTrackBpm: 128, banner: 'TRACK // HOTLINE MIDNIGHT [128 BPM]',
    }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', repeat: true }))
    expect(engine['music'].getCurrentTrackIndex()).toBe(1)
    key('KeyN')
    expect(engine['music'].getCurrentTrackIndex()).toBe(2)
    key('KeyN')
    expect(engine['music'].getCurrentTrackIndex()).toBe(0)
    key('KeyN')
    engine.dispose()
    engine = new GameEngine(document.createElement('div'), onHud)
    expect(engine['music'].getCurrentTrackIndex()).toBe(1)
    expect(onHud).toHaveBeenLastCalledWith(expect.objectContaining({ musicTrackName: 'HOTLINE MIDNIGHT' }))
  })

  it.each(['menu', 'paused', 'over'] as const)('allows track selection in %s', (status) => {
    engine['status'] = status
    key('KeyN')
    expect(loadProfile().musicTrackIndex).toBe(1)
  })

  it('ignores track shortcuts during typing, composition, modified keys, and drafts', () => {
    for (const tag of ['input', 'textarea', 'select', 'div']) {
      const element = document.createElement(tag)
      if (tag === 'div') element.setAttribute('contenteditable', 'true')
      const target = tag === 'div' ? element.appendChild(document.createElement('span')) : element
      document.body.appendChild(element)
      target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', bubbles: true }))
      element.remove()
    }
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'isComposing']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', [modifier]: true }))
    }
    engine['draftHacks'] = engine.hackManager.getRandomDraft(3)
    expect(engine['draftHacks'].length).toBeGreaterThan(0)
    key('KeyN')
    expect(engine['music'].getCurrentTrackIndex()).toBe(0)
    expect(loadProfile().musicTrackIndex).toBe(0)
    expect(engine['banner']).not.toContain('TRACK //')
  })

  it('records death once, preserving best combo, glory kills, selected hacks and audio preferences', () => {
    saveProfile({ musicVolume: 0.25, sfxVolume: 0.2 })
    engine.hackManager.apply('bass_drop')
    engine['director'].wave = 3
    target()
    target(50, false)
    key('KeyE')
    const score = engine.stats().score
    expect(engine['music'].triggerFilterDrop).toHaveBeenCalledOnce()
    expect(engine['music'].setComboRank).toHaveBeenLastCalledWith(1)
    engine['gloryKills'].reset()
    engine.damagePlayer(1000)
    expect(engine['music'].setComboRank).toHaveBeenLastCalledWith(0)
    expect(loadProfile()).toEqual({ highScore: score, maxWave: 3, maxCombo: 1, totalKills: 1, totalGloryKills: 1,
      unlockedHacks: ['bass_drop'], sfxVolume: 0.2, musicVolume: 0.25, musicTrackIndex: 0 })
    expect(engine['debugApi']().profile()).toEqual(loadProfile())
    engine.damagePlayer(1000)
    engine.restart()
    expect(engine.stats().gloryKills).toBe(0)
    expect(loadProfile().totalKills).toBe(1)
  })

  it('records a living run on restart and disposal, but never records the same run twice', () => {
    engine['kills'] = 3
    engine['score'] = 100
    engine.restart()
    expect(loadProfile().totalKills).toBe(3)
    engine['kills'] = 2
    engine['score'] = 50
    engine.dispose()
    engine['finishRun']()
    expect(loadProfile()).toMatchObject({ totalKills: 5, highScore: 100 })
  })

  it('drops the music filter once on slam impact and resets the rank when a combo expires', () => {
    engine['grounded'] = false
    engine.playerPos().y += 5
    engine['abilities'].tryKineticSlam()
    expect(engine['music'].triggerFilterDrop).not.toHaveBeenCalled()
    engine.playerPos().y -= 5
    engine['grounded'] = true
    engine['abilities'].onLanding()
    engine['abilities'].onLanding()
    expect(engine['music'].triggerFilterDrop).toHaveBeenCalledOnce()
    engine['combo'] = 5
    engine['comboTimer'] = 0.01
    tick(0.05)
    expect(engine['music'].setComboRank).toHaveBeenLastCalledWith(0)
  })
})

describe('engine vertical traversal', () => {
  function arena() {
    const collidables: THREE.Object3D[] = []
    Object.assign(engine['env'], buildZones(engine.scene, collidables), { collidables })
  }

  it.each([30, 60, 120])('crosses the north gate and launches onto the Quantum Vault at %s FPS', (fps) => {
    arena()
    engine.playerPos().set(0, 2.4, 399)
    engine['yaw'] = Math.PI
    engine['keys'].add('KeyW')
    for (let i = 0; i < fps / 2; i++) tick(1 / fps)
    expect(engine.playerPos().z).toBeGreaterThan(400)
    engine['keys'].clear()
    engine.playerPos().set(0, 2.4, 420)
    tick(1 / fps)
    expect(engine['grounded']).toBe(false)
    let apex = 0
    for (let i = 0; i < fps * 3; i++) {
      tick(1 / fps)
      apex = Math.max(apex, engine.playerPos().y - 1.8)
    }
    expect(apex).toBeGreaterThan(9.5)
    expect(engine.playerPos().y).toBeCloseTo(11.3)
    expect(engine.playerPos().z).toBeGreaterThan(480)
    expect(engine.playerPos().z).toBeLessThan(560)
    expect(engine['grounded']).toBe(true)
    const landedZ = engine.playerPos().z
    tick(1 / fps)
    expect(engine.playerPos().z).toBe(landedZ)
  })

  it.each([[-135, -120, 8.5, Math.PI], [135, 120, 8.5, 0], [-12, 0, 6, Math.PI]] as const)(
    'launches from z=%s and lands on its gantry', (padZ, z, top, yaw) => {
      arena()
      engine.playerPos().set(0, 2.4, padZ)
      engine['yaw'] = yaw
      tick(0.02)
      expect(engine['vy']).toBeGreaterThan(19)
      engine['keys'].add('KeyW')
      let apex = 0
      for (let i = 0; i < 160; i++) {
        if (Math.abs(engine.playerPos().z - z) < 0.2) engine['keys'].clear()
        tick(0.02)
        apex = Math.max(apex, engine.playerPos().y - 1.8)
      }
      expect(apex).toBeGreaterThan(top)
      expect(engine.playerPos().y).toBeCloseTo(top + 1.8)
      expect(engine['grounded']).toBe(true)
      engine['keys'].add('KeyD')
      tick(0.05)
      expect(Math.abs(engine.playerPos().x)).toBeGreaterThan(0.3)
      expect(engine.playerPos().y).toBeCloseTo(top + 1.8)
    }
  )

  it('walks under a platform and stops upward movement at its underside', () => {
    arena()
    engine.playerPos().set(0, 2.4, 0)
    tick(0.05)
    expect(engine.playerPos().y).toBeCloseTo(2.4)
    engine['grounded'] = false
    engine['vy'] = 23
    for (let i = 0; i < 10; i++) tick(0.02)
    expect(engine.playerPos().y).toBeLessThan(5.55)
    expect(engine.playerPos().y).toBeGreaterThan(2.4)
    expect(engine['vy']).toBeLessThanOrEqual(0)
  })

  it('catches a fast slam on a gantry and allows walking off its open end', () => {
    arena()
    engine.playerPos().set(0, 14, -120)
    engine['grounded'] = false
    engine['vy'] = -100
    tick(0.05)
    expect(engine.playerPos().y).toBeCloseTo(10.3)
    engine['keys'].add('KeyW')
    for (let i = 0; i < 30; i++) tick(0.05)
    expect(engine.playerPos().z).toBeLessThan(-126)
    expect(engine.playerPos().y).toBeCloseTo(2.4)
  })

  it('does not launch a player standing on a surface above a pad', () => {
    arena()
    engine['env'].walkRects.push({ x0: -2, x1: 2, z0: -137, z1: -133, top: 10 })
    engine.playerPos().set(0, 11.8, -135)
    tick(0.05)
    expect(engine['grounded']).toBe(true)
    expect(engine['vy']).toBe(0)
  })
})
