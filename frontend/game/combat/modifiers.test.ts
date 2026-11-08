import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HackManager, NEON_HACKS, type GloryKillContext, type HitContext } from './modifiers'
import type { Enemy } from '../waves'

afterEach(() => vi.restoreAllMocks())

// Hooks only need HP and world positions, not GPU resources.
function enemy(x: number, hp = 100): Enemy {
  return { hp, parts: { group: { position: new THREE.Vector3(x, 0, 0) } } } as Enemy
}
function hitContext(enemies: Enemy[]): HitContext {
  return { enemies, damageEnemy: vi.fn(), canHit: vi.fn(() => true), arc: vi.fn() }
}
function gloryContext(enemies: Enemy[]): GloryKillContext {
  return { enemies, damageEnemy: vi.fn(), maxHp: () => 100, resetDashCooldown: vi.fn(), arc: vi.fn() }
}
const shot = { position: new THREE.Vector3(), kind: 'bullet' as const, ignoreShield: false }

describe('HackManager build and draft', () => {
  it('defines all six hacks with their specified tiers and complete card copy', () => {
    expect(NEON_HACKS.map(({ id, tier }) => [id, tier])).toEqual([
      ['ricochet', 'COMMON'], ['bass_drop', 'RARE'], ['chain_lightning', 'OVERCLOCK'],
      ['blood_momentum', 'RARE'], ['overdrive_heatsink', 'COMMON'], ['void_leash', 'OVERCLOCK'],
    ])
    for (const hack of NEON_HACKS) {
      expect(hack.name).toContain(' // ')
      expect(hack.tagline).not.toBe('')
      expect(hack.description).not.toBe('')
      expect(hack.badge).not.toBe('')
    }
  })

  it('applies idempotently, lists acquired definitions and resets all run state', () => {
    const manager = new HackManager()
    expect(manager.list()).toEqual([])
    expect(manager.has('ricochet')).toBe(false)
    manager.apply('ricochet')
    manager.apply('ricochet')
    expect(manager.has('ricochet')).toBe(true)
    expect(manager.activeHacks.size).toBe(1)
    expect(manager.list()).toEqual([NEON_HACKS[0]])
    manager.list().pop()
    expect(manager.list()).toHaveLength(1)
    manager.apply('blood_momentum')
    manager.apply('overdrive_heatsink')
    manager.onDashKill({ resetDashCooldown: vi.fn() })
    manager.onParry({ refillMagazine: vi.fn() })
    manager.ammoCost('rifle')
    manager.reset()
    expect(manager.activeHacks.size).toBe(0)
    expect(manager.list()).toEqual([])
    expect(manager.speedMultiplier).toBe(1)
    expect(manager.speedBoostRemaining).toBe(0)
    expect(manager.ammoEfficiency).toBe(1)
    expect(manager.ammoCost('rifle')).toBe(1)
    expect(manager.getRandomDraft(6)).toHaveLength(6)
  })

  it('draws three unique random unowned cards without acquiring or mutating the catalog', () => {
    const manager = new HackManager()
    manager.apply('ricochet')
    const original = [...NEON_HACKS]
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    const a = manager.getRandomDraft()
    random.mockReturnValue(0.9999)
    const b = manager.getRandomDraft()
    for (const draft of [a, b]) {
      expect(draft).toHaveLength(3)
      expect(new Set(draft.map((hack) => hack.id)).size).toBe(3)
      expect(draft.some((hack) => manager.has(hack.id))).toBe(false)
    }
    expect(a).not.toEqual(b)
    expect(manager.activeHacks.size).toBe(1)
    expect(NEON_HACKS).toEqual(original)
  })

  it('handles two, one and zero cards left without duplicates or an infinite retry', () => {
    const manager = new HackManager()
    for (const hack of NEON_HACKS.slice(0, 4)) manager.apply(hack.id)
    expect(manager.getRandomDraft()).toHaveLength(2)
    manager.apply('overdrive_heatsink')
    expect(manager.getRandomDraft()).toEqual([NEON_HACKS[5]])
    manager.apply('void_leash')
    expect(manager.getRandomDraft()).toEqual([])
  })

  it.each([[1, 1], [2.9, 2], [99, 6], [0, 0], [-1, 0], [NaN, 0], [Infinity, 0]])(
    'bounds requested count %s to %s', (count, expected) => {
      expect(new HackManager().getRandomDraft(count)).toHaveLength(expected)
    })
})

describe('ricochet', () => {
  it('is inert without the hack and never ricochets a ricochet or a zero-damage hit', () => {
    const manager = new HackManager()
    const context = hitContext([enemy(2)])
    expect(manager.onHit(null, 10, shot, context)).toEqual({})
    manager.apply('ricochet')
    expect(manager.onHit(null, 10, { ...shot, kind: 'ricochet' }, context)).toEqual({})
    expect(manager.onHit(null, 0, shot, context)).toEqual({})
    expect(context.damageEnemy).not.toHaveBeenCalled()
  })

  it('hits only the nearest living visible secondary enemy for 60% of the shot', () => {
    const manager = new HackManager()
    manager.apply('ricochet')
    const target = enemy(0), dead = enemy(1, 0), blocked = enemy(2), near = enemy(3), far = enemy(4)
    const context = hitContext([target, dead, blocked, far, near])
    context.canHit = (_, to) => to !== blocked.parts.group.position
    expect(manager.onHit(target, 10, shot, context)).toEqual({ ricochetTarget: near })
    expect(context.damageEnemy).toHaveBeenCalledExactlyOnceWith(near, 6, false)
    expect(context.arc).toHaveBeenCalledExactlyOnceWith(shot.position, near.parts.group.position)
  })

  it('bounces from a wall at the 9m boundary, excluding targets beyond it', () => {
    const manager = new HackManager()
    manager.apply('ricochet')
    const edge = enemy(9), outside = enemy(9.001)
    const context = hitContext([outside, edge])
    expect(manager.onHit(null, 20, { ...shot, ignoreShield: true }, context).ricochetTarget).toBe(edge)
    expect(context.damageEnemy).toHaveBeenCalledExactlyOnceWith(edge, 12, true)
    expect(manager.onHit(null, 20, shot, hitContext([outside])).ricochetTarget).toBeUndefined()
    expect(manager.onHit(null, 20, shot, hitContext([])).ricochetTarget).toBeUndefined()
  })
})

describe('chain lightning', () => {
  it('does nothing without the hack', () => {
    const context = gloryContext([enemy(1)])
    expect(new HackManager().onGloryKill(new THREE.Vector3(), context)).toEqual({ chainedEnemies: [] })
    expect(context.damageEnemy).not.toHaveBeenCalled()
    expect(context.resetDashCooldown).not.toHaveBeenCalled()
  })

  it('arcs to every living enemy within 12m for 35% max HP, bypassing armor', () => {
    const manager = new HackManager()
    manager.apply('chain_lightning')
    const target = enemy(0), a = enemy(2, 20), b = enemy(12, 50), outside = enemy(12.001), dead = enemy(4, 0)
    const context = gloryContext([target, a, b, outside, dead])
    context.maxHp = (e) => e === b ? 200 : 100
    expect(manager.onGloryKill(target, context).chainedEnemies).toEqual([a, b])
    expect(context.damageEnemy).toHaveBeenNthCalledWith(1, a, 35, true)
    expect(context.damageEnemy).toHaveBeenNthCalledWith(2, b, 70, true)
    expect(context.arc).toHaveBeenCalledTimes(2)
  })

  it('snapshots the chain before lethal hits remove elements from the live enemy array', () => {
    const manager = new HackManager()
    manager.apply('chain_lightning')
    const enemies = [enemy(1, 5), enemy(2, 5), enemy(3, 5)]
    const expected = [...enemies]
    const context = gloryContext(enemies)
    context.damageEnemy = (e) => { enemies.splice(enemies.indexOf(e), 1) }
    expect(manager.onGloryKill(new THREE.Vector3(), context).chainedEnemies).toEqual(expected)
    expect(enemies).toHaveLength(0)
  })
})

describe('blood momentum', () => {
  it('resets dash cooldown and grants exactly 40% speed for two gameplay seconds', () => {
    const manager = new HackManager()
    const context = { resetDashCooldown: vi.fn() }
    manager.onDashKill(context)
    expect(context.resetDashCooldown).not.toHaveBeenCalled()
    manager.apply('blood_momentum')
    manager.onDashKill(context)
    expect(context.resetDashCooldown).toHaveBeenCalledOnce()
    expect(manager.speedMultiplier).toBe(1.4)
    manager.update(1.99)
    expect(manager.speedMultiplier).toBe(1.4)
    manager.update(0.02)
    expect(manager.speedMultiplier).toBe(1)
    expect(manager.speedBoostRemaining).toBe(0)
  })

  it('also triggers on glory kills and refreshes rather than stacking duration or speed', () => {
    const manager = new HackManager()
    manager.apply('blood_momentum')
    const context = gloryContext([])
    manager.onGloryKill(new THREE.Vector3(), context)
    manager.update(1)
    manager.onGloryKill(new THREE.Vector3(), context)
    expect(context.resetDashCooldown).toHaveBeenCalledTimes(2)
    expect(manager.speedBoostRemaining).toBe(2)
    expect(manager.speedMultiplier).toBe(1.4)
  })
})

describe('overdrive heatsink', () => {
  it('refills the magazine only when owned and enables double ammo efficiency', () => {
    const manager = new HackManager()
    const context = { refillMagazine: vi.fn() }
    manager.onParry(context)
    expect(context.refillMagazine).not.toHaveBeenCalled()
    manager.apply('overdrive_heatsink')
    expect(manager.ammoCost('rifle')).toBe(1)
    manager.onParry(context)
    expect(context.refillMagazine).toHaveBeenCalledOnce()
    expect(manager.ammoEfficiency).toBe(2)
    expect(Array.from({ length: 64 }, () => manager.ammoCost('rifle')).reduce((a, b) => a + b, 0)).toBe(32)
    expect(Array.from({ length: 16 }, () => manager.ammoCost('deagle')).reduce((a, b) => a + b, 0)).toBe(8)
    manager.onParry(context)
    expect(manager.ammoEfficiency).toBe(2)
  })

  it('preserves each weapon’s paid shot across swaps and clears the phase on reset', () => {
    const manager = new HackManager()
    manager.apply('overdrive_heatsink')
    manager.onParry({ refillMagazine: vi.fn() })
    expect(manager.ammoCost('rifle')).toBe(0)
    expect(manager.ammoCost('deagle')).toBe(0)
    expect(manager.ammoCost('rifle')).toBe(1)
    manager.reset()
    manager.apply('overdrive_heatsink')
    manager.onParry({ refillMagazine: vi.fn() })
    expect(manager.ammoCost('deagle')).toBe(0)
  })
})

describe('slam and leash modifiers', () => {
  it('increases the slam radius by 50% and staggers every survivor only with Bass Drop', () => {
    const manager = new HackManager()
    const normal = { radius: 12, staggerAll: false }
    manager.onSlam(normal)
    expect(normal).toEqual({ radius: 12, staggerAll: false })
    manager.apply('bass_drop')
    manager.onSlam(normal)
    expect(normal).toEqual({ radius: 18, staggerAll: true })
  })

  it('extends glory kill range to 26m only while Void Leash is equipped', () => {
    const manager = new HackManager()
    expect(manager.gloryKillRange()).toBe(7)
    manager.apply('void_leash')
    expect(manager.gloryKillRange()).toBe(26)
    manager.reset()
    expect(manager.gloryKillRange()).toBe(7)
  })
})
