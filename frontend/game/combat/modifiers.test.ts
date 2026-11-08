import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HackManager, NEON_HACKS, type GloryKillContext, type HitContext } from './modifiers'
import type { Enemy } from '../waves'

afterEach(() => vi.restoreAllMocks())

function enemy(x: number, hp = 100): Enemy {
  return {
    hp,
    parts: { group: { position: new THREE.Vector3(x, 0, 0) } },
    frozenTimer: 0,
    burnTimer: 0,
    burnTick: 0,
  } as unknown as Enemy
}

function hitContext(enemies: Enemy[]): HitContext {
  return { enemies, damageEnemy: vi.fn(), canHit: vi.fn(() => true), arc: vi.fn() }
}

function gloryContext(enemies: Enemy[]): GloryKillContext {
  return { enemies, damageEnemy: vi.fn(), maxHp: () => 100, resetDashCooldown: vi.fn(), arc: vi.fn() }
}

const shot = { position: new THREE.Vector3(), kind: 'bullet' as const, ignoreShield: false }

describe('HackManager build and draft', () => {
  it('defines exactly the 5 streamlined hacks with their specified tiers and card copy', () => {
    expect(NEON_HACKS.map(({ id, tier }) => [id, tier])).toEqual([
      ['freeze', 'RARE'],
      ['burn', 'RARE'],
      ['attack_speed', 'COMMON'],
      ['max_hp', 'COMMON'],
      ['move_speed', 'COMMON'],
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
    expect(manager.has('freeze')).toBe(false)
    manager.apply('freeze')
    manager.apply('freeze')
    expect(manager.has('freeze')).toBe(true)
    expect(manager.activeHacks.size).toBe(1)
    expect(manager.list()).toEqual([NEON_HACKS[0]])
    manager.list().pop()
    expect(manager.list()).toHaveLength(1)
    manager.apply('move_speed')
    manager.apply('attack_speed')
    expect(manager.speedMultiplier).toBe(1.3)
    expect(manager.fireCooldownMultiplier).toBe(0.65)
    manager.reset()
    expect(manager.activeHacks.size).toBe(0)
    expect(manager.list()).toEqual([])
    expect(manager.speedMultiplier).toBe(1)
    expect(manager.fireCooldownMultiplier).toBe(1)
    expect(manager.maxHpBonus).toBe(0)
    expect(manager.getRandomDraft(5)).toHaveLength(5)
  })

  it('draws unique random unowned cards without mutating the catalog', () => {
    const manager = new HackManager()
    manager.apply('freeze')
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

  it('handles remaining pool exhaustion gracefully', () => {
    const manager = new HackManager()
    for (const hack of NEON_HACKS.slice(0, 3)) manager.apply(hack.id)
    expect(manager.getRandomDraft()).toHaveLength(2)
    manager.apply(NEON_HACKS[3]!.id)
    expect(manager.getRandomDraft()).toEqual([NEON_HACKS[4]])
    manager.apply(NEON_HACKS[4]!.id)
    expect(manager.getRandomDraft()).toEqual([])
  })

  it.each([[1, 1], [2.9, 2], [99, 5], [0, 0], [-1, 0], [NaN, 0], [Infinity, 0]])(
    'bounds requested count %s to %s', (count, expected) => {
      expect(new HackManager().getRandomDraft(count)).toHaveLength(expected)
    })
})

describe('freeze and burn mechanics', () => {
  it('applies freeze timer on hit when freeze hack is owned', () => {
    const manager = new HackManager()
    const target = enemy(5)
    const context = hitContext([target])
    manager.onHit(target, 10, shot, context)
    expect(target.frozenTimer).toBe(0)

    manager.apply('freeze')
    manager.onHit(target, 10, shot, context)
    expect(target.frozenTimer).toBe(2.5)
  })

  it('applies burn timer on hit when burn hack is owned', () => {
    const manager = new HackManager()
    const target = enemy(5)
    const context = hitContext([target])
    manager.onHit(target, 10, shot, context)
    expect(target.burnTimer).toBe(0)

    manager.apply('burn')
    manager.onHit(target, 10, shot, context)
    expect(target.burnTimer).toBe(3.0)
  })

  it('ignores null or dead targets', () => {
    const manager = new HackManager()
    manager.apply('freeze')
    manager.apply('burn')
    const dead = enemy(0, 0)
    const context = hitContext([dead])
    manager.onHit(null, 10, shot, context)
    manager.onHit(dead, 10, shot, context)
    expect(dead.frozenTimer).toBe(0)
    expect(dead.burnTimer).toBe(0)
  })
})

describe('stat modifiers: attack speed, max HP, move speed', () => {
  it('reduces fire cooldown by 35% with attack_speed', () => {
    const manager = new HackManager()
    expect(manager.fireCooldownMultiplier).toBe(1)
    manager.apply('attack_speed')
    expect(manager.fireCooldownMultiplier).toBe(0.65)
  })

  it('provides +50 max HP bonus with max_hp', () => {
    const manager = new HackManager()
    expect(manager.maxHpBonus).toBe(0)
    manager.apply('max_hp')
    expect(manager.maxHpBonus).toBe(50)
  })

  it('provides +30% move speed with move_speed and stacks with sprint/dash boost', () => {
    const manager = new HackManager()
    expect(manager.speedMultiplier).toBe(1)
    manager.apply('move_speed')
    expect(manager.speedMultiplier).toBeCloseTo(1.3)
    manager.onDashKill({ resetDashCooldown: vi.fn() })
    expect(manager.speedMultiplier).toBeCloseTo(1.3 * 1.4)
    manager.update(2.1)
    expect(manager.speedMultiplier).toBeCloseTo(1.3)
  })

  it('glory kills reset dash cooldown', () => {
    const manager = new HackManager()
    const context = gloryContext([])
    manager.onGloryKill(new THREE.Vector3(), context)
    expect(context.resetDashCooldown).toHaveBeenCalledOnce()
  })
})
