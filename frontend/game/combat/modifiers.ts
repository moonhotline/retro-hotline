import type { Vector3 } from 'three'
import type { Enemy } from '../waves'
import type { WeaponId } from '../types'

export type HackId = 'freeze' | 'burn' | 'attack_speed' | 'max_hp' | 'move_speed'
export type HackTier = 'COMMON' | 'RARE' | 'OVERCLOCK'

export interface NeonHack {
  id: HackId
  name: string
  tier: HackTier
  tagline: string
  description: string
  badge: string
}

export const NEON_HACKS: readonly NeonHack[] = [
  {
    id: 'freeze',
    name: '极寒冰冻 // Cryo Freeze',
    tier: 'RARE',
    badge: 'CF',
    tagline: 'SUB-ZERO CONTROL.',
    description: '攻击附带极寒冰冻效果，降低敌人 60% 移速与射击频率，持续 2.5 秒。',
  },
  {
    id: 'burn',
    name: '烈焰焚化 // Pyro Burn',
    tier: 'RARE',
    badge: 'PB',
    tagline: 'IGNITE AND INCINERATE.',
    description: '攻击附带烈焰点燃效果，每 0.5 秒造成持续真实伤害，持续 3 秒。',
  },
  {
    id: 'attack_speed',
    name: '超频扳机 // Rapid Trigger',
    tier: 'COMMON',
    badge: 'RT',
    tagline: 'LEAD ACCELERATOR.',
    description: '永久缩短 35% 开火冷却，全面提升武器射速与弹幕爆发力。',
  },
  {
    id: 'max_hp',
    name: '纳米重甲 // Vitality Matrix',
    tier: 'COMMON',
    badge: 'HP',
    tagline: 'REINFORCED CHASSIS.',
    description: '永久增加 50 点生命值上限，并立即恢复 50 点生命值。',
  },
  {
    id: 'move_speed',
    name: '极速敏捷 // Cyber Agility',
    tier: 'COMMON',
    badge: 'MS',
    tagline: 'KINETIC OVERDRIVE.',
    description: '永久提升 30% 基础移动与冲刺速度，增强战术机动与规避。',
  },
]

export interface HitSource {
  position: Vector3
  kind: 'bullet' | 'ricochet'
  ignoreShield: boolean
}

export interface HitContext {
  enemies: readonly Enemy[]
  damageEnemy(enemy: Enemy, damage: number, ignoreShield: boolean): void
  canHit(from: Vector3, to: Vector3): boolean
  arc?(from: Vector3, to: Vector3): void
}

export interface MomentumContext {
  resetDashCooldown(): void
}

export interface GloryKillContext extends MomentumContext {
  enemies: readonly Enemy[]
  maxHp(enemy: Enemy): number
  damageEnemy(enemy: Enemy, damage: number, ignoreShield: boolean): void
  arc?(from: Vector3, to: Vector3): void
}

export interface SlamContext {
  radius: number
  staggerAll: boolean
}

/** Run-scoped build state. Hooks use explicit callbacks so combat still owns kills and FX. */
export class HackManager {
  readonly activeHacks = new Set<HackId>()
  speedBoostRemaining = 0
  ammoEfficiency = 1

  has(id: HackId): boolean { return this.activeHacks.has(id) }

  apply(id: HackId): void {
    if (NEON_HACKS.some((hack) => hack.id === id)) this.activeHacks.add(id)
  }

  reset(): void {
    this.activeHacks.clear()
    this.speedBoostRemaining = 0
    this.ammoEfficiency = 1
  }

  list(): NeonHack[] { return NEON_HACKS.filter((hack) => this.has(hack.id)) }

  getRandomDraft(count = 3): NeonHack[] {
    if (!Number.isFinite(count) || count <= 0) return []
    const pool = NEON_HACKS.filter((hack) => !this.has(hack.id))
    // Fisher–Yates, without duplicates or mutating the catalog.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
    }
    return pool.slice(0, Math.floor(count))
  }

  update(dt: number): void {
    this.speedBoostRemaining = Math.max(0, this.speedBoostRemaining - Math.max(0, dt))
  }

  get speedMultiplier(): number {
    const base = this.has('move_speed') ? 1.3 : 1
    return base * (this.speedBoostRemaining > 0 ? 1.4 : 1)
  }

  get fireCooldownMultiplier(): number {
    return this.has('attack_speed') ? 0.65 : 1
  }

  get maxHpBonus(): number {
    return this.has('max_hp') ? 50 : 0
  }

  gloryKillRange(baseRange = 7): number {
    return baseRange
  }

  ammoCost(_weapon: WeaponId): number {
    return 1
  }

  onHit(target: Enemy | null, _damage: number, _source: HitSource, _context: HitContext): void {
    if (!target || target.hp <= 0) return
    if (this.has('freeze')) {
      target.frozenTimer = Math.max(target.frozenTimer ?? 0, 2.5)
    }
    if (this.has('burn')) {
      target.burnTimer = Math.max(target.burnTimer ?? 0, 3.0)
    }
  }

  onGloryKill(_target: Enemy | Vector3, context: GloryKillContext): { chainedEnemies: Enemy[] } {
    this.onDashKill(context)
    return { chainedEnemies: [] }
  }

  onDashKill(context: MomentumContext): void {
    context.resetDashCooldown()
    this.speedBoostRemaining = 2
  }

  onParry(_context: { refillMagazine(): void }): void {}

  onSlam(_context: SlamContext): void {}
}
