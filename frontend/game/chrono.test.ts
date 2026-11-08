import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameEngine } from './engine'
import { installTestStorage } from './testStorage'
import type { ShopItemData } from './types'

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
    setTimeDilation = vi.fn(super.setTimeDilation.bind(this))
  } }
})

let engine: GameEngine
let lastHud: any = null

beforeEach(() => {
  installTestStorage()
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  engine = new GameEngine(document.createElement('div'), (hud) => {
    lastHud = hud
  })
  vi.spyOn(engine.sfx, 'resume').mockImplementation(() => {})
  engine['renderer'].domElement.requestPointerLock = vi.fn()
  engine.start()
  engine.chronoMode = true
})

afterEach(() => {
  engine.dispose()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function tick(seconds: number) {
  engine['clock'].elapsedTime += seconds
  engine['update'](seconds)
}

describe('Chrono-Miami: Tactical Time-Dilation & Level Manifests', () => {
  it('dilates time towards 0.05x when player is idle and notifies WebAudio', () => {
    expect(engine.chronoTimeScale).toBeCloseTo(1.0)
    // Run several ticks while player is completely stationary
    for (let i = 0; i < 30; i++) tick(0.05)

    // Time scale should have dropped drastically into bullet-time
    expect(engine.chronoTimeScale).toBeLessThan(0.2)
    expect(engine.chronoTimeScale).toBeGreaterThanOrEqual(0.05)
    expect(engine['music'].setTimeDilation).toHaveBeenCalled()
  })

  it('restores 1.0x full-speed simulation when player moves or attacks', () => {
    // Settle into bullet time
    for (let i = 0; i < 30; i++) tick(0.05)
    expect(engine.chronoTimeScale).toBeLessThan(0.2)

    // Press movement key W
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    for (let i = 0; i < 20; i++) tick(0.05)

    expect(engine.chronoTimeScale).toBeGreaterThan(0.9)
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
  })

  it('publishes stage and room info, chrono scale, and interact prompts to HUD', () => {
    for (let i = 0; i < 30; i++) tick(0.05)
    expect(lastHud).not.toBeNull()
    expect(lastHud.chronoTimeScale).toBeLessThan(0.2)
    expect(lastHud.stageName).toBe('BAY BRIDGE RUNNER')
    expect(lastHud.chapter).toBe(1)
    expect(lastHud.roomName).toBe('OUTER CAUSEWAY')
  })

  it('interacts with in-world terminal on KeyE when close and opens story modal', () => {
    // Terminal 1 is at [0, 1.8, -120], radius 3.5
    engine.playerPos().set(0, 1.8, -121)
    tick(0.016)

    expect(engine.levelManager.activeInteractable).not.toBeNull()
    expect(lastHud.interactPrompt).toBe('◻︎ BREACH TERMINAL')

    // Press E to interact
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
    expect(engine.levelManager.storyModal.open).toBe(true)
    expect(lastHud.storyModal.open).toBe(true)
    expect(lastHud.storyModal.title).toContain('TACTICAL INTERCEPT')

    // Close dialogue
    engine.closeStoryDialogue()
    expect(engine.levelManager.storyModal.open).toBe(false)
  })

  it('interacts with hacker merchant, pauses simulation during dialogue, and receives Gauss Sniper gift', () => {
    // Merchant is at [-4.5, 1.8, 160], interaction radius 4.0
    engine.playerPos().set(-4.5, 1.8, 161)
    tick(0.016)

    expect(engine.levelManager.activeInteractable).not.toBeNull()
    expect(engine.levelManager.activeInteractable?.id).toBe('merchant-ghost')
    expect(lastHud.interactPrompt).toContain('BLACK MARKET')

    // Open dialogue
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
    expect(engine.levelManager.storyModal.open).toBe(true)
    expect(lastHud.storyModal.isShopOpen).toBe(true)
    expect(lastHud.storyModal.shopItems).toHaveLength(3)

    // Verify simulation is paused during dialogue
    const savedTime = engine['gameplayTime']
    tick(0.1)
    expect(engine['gameplayTime']).toBe(savedTime)

    // Complete dialogue to claim Gauss Sniper prototype
    engine.closeStoryDialogue()
    expect(engine.levelManager.storyModal.open).toBe(false)
    expect(engine.unlockedWeapons).toContain('sniper')
    expect(engine['weapon']).toBe('sniper')
    expect(engine['ammo'].sniper).toBe(5)
    expect(engine['banner']).toContain('GAUSS SNIPER')
  })

  it('zooms optics to 24 FOV when holding RMB with Gauss Sniper', () => {
    engine.unlockedWeapons = ['rifle', 'deagle', 'sniper']
    engine['weapon'] = 'sniper'

    document.dispatchEvent(new MouseEvent('mousedown', { button: 2 }))
    expect(engine.isAiming).toBe(true)
    expect(lastHud.isAiming).toBe(true)

    // Zoom interpolates camera FOV towards 24
    for (let i = 0; i < 20; i++) tick(0.05)
    expect(engine.camera.fov).toBeLessThan(35)

    // Releasing RMB restores normal FOV
    document.dispatchEvent(new MouseEvent('mouseup', { button: 2 }))
    expect(engine.isAiming).toBe(false)
    for (let i = 0; i < 20; i++) tick(0.05)
    expect(engine.camera.fov).toBeCloseTo(75, 0)
  })

  it('allows purchasing medkits, attack speed overclock, and ammo from shop', () => {
    engine['score'] = 1000
    engine['health'] = 40
    engine.unlockedWeapons = ['rifle', 'deagle', 'sniper']
    engine['ammo'].sniper = 1

    const healItem: ShopItemData = {
      id: 'item-nano-repair',
      name: 'NANO REPAIR KIT',
      description: 'Heals 50 HP',
      effect: '+50 HP',
      cost: 300,
      kind: 'heal',
    }
    const speedItem: ShopItemData = {
      id: 'item-overclock-trigger',
      name: 'OVERCLOCK TRIGGER',
      description: 'Increases attack speed',
      effect: '+25% SPEED',
      cost: 500,
      kind: 'attack_speed',
    }
    const ammoItem: ShopItemData = {
      id: 'item-gauss-ammo',
      name: 'RAIL AMMO CACHE',
      description: 'Refills sniper slugs',
      effect: '+5 SLUGS',
      cost: 200,
      kind: 'ammo',
    }

    // Buy Heal
    expect(engine.buyShopItem(healItem)).toBe(true)
    expect(engine['score']).toBe(700)
    expect(engine.stats().health).toBe(90)

    // Buy Speed
    expect(engine.buyShopItem(speedItem)).toBe(true)
    expect(engine['score']).toBe(200)
    expect(engine.attackSpeedMult).toBeCloseTo(1.25)

    // Buy Ammo
    expect(engine.buyShopItem(ammoItem)).toBe(true)
    expect(engine['score']).toBe(0)
    expect(engine['ammo'].sniper).toBe(6)

    // Insufficient score should reject purchase
    expect(engine.buyShopItem(healItem)).toBe(false)
    expect(engine['score']).toBe(0)
  })
})
