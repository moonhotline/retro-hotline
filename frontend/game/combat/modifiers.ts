import type { Vector3 } from 'three'
import type { Enemy } from '../waves'
import type { WeaponId } from '../types'

export type HackId =
  | 'freeze'
  | 'burn'
  | 'attack_speed'
  | 'max_hp'
  | 'move_speed'
  | 'prism_ricochet'
  | 'chain_arc'
  | 'dash_nova'
  | 'overclock_core'
  | 'chrono_focus'
  | 'cryo_shatter'
  | 'vamp_surge'

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
  {
    id: 'prism_ricochet',
    name: '折射棱镜 // Prism Ricochet',
    tier: 'RARE',
    badge: 'PR',
    tagline: 'OPTICAL CHAIN FIRE.',
    description: '命中的弹道自动向 14 米内最近敌机折射跳弹，造成 65% 破盾伤害。',
  },
  {
    id: 'chain_arc',
    name: '电弧处决 // Arc Cascade',
    tier: 'OVERCLOCK',
    badge: 'AC',
    tagline: 'HIGH-VOLTAGE SHATTER.',
    description: '霓虹处决释放高压连锁闪电，重创周围最多 3 架敌机（50% 最大生命）并刷新冲刺。',
  },
  {
    id: 'dash_nova',
    name: '相位冲击 // Dash Nova',
    tier: 'RARE',
    badge: 'DN',
    tagline: 'KINETIC PHASE BURST.',
    description: '相位冲刺结束时释放 11 米范围冲击波，破盾打击并震慑周围敌机。',
  },
  {
    id: 'overclock_core',
    name: '超频核心 // Overclock Core',
    tier: 'RARE',
    badge: 'OC',
    tagline: 'EXTENDED OVERDRIVE.',
    description: '换弹速度永久加快 40%，霓虹处决额外延长 4 秒武器过载时间。',
  },
  {
    id: 'chrono_focus',
    name: '时序聚焦 // Chrono Focus',
    tier: 'OVERCLOCK',
    badge: 'CH',
    tagline: 'STRIKE BETWEEN SECONDS.',
    description: '处于时间膨胀状态开火时伤害提升 70%，完美放大停顿瞄准收益。',
  },
  {
    id: 'cryo_shatter',
    name: '寒霜碎裂 // Cryo Shatter',
    tier: 'OVERCLOCK',
    badge: 'CS',
    tagline: 'FROZEN DETONATION.',
    description: '击杀被冻结目标触发范围碎冰爆裂，对 9 米内敌机造成高额破盾伤害。',
  },
  {
    id: 'vamp_surge',
    name: '虹吸脉冲 // Siphon Pulse',
    tier: 'COMMON',
    badge: 'SP',
    tagline: 'MOMENTUM SUSTAIN.',
    description: '连击达到 ×3 及以上时，每次击杀立即恢复 6 点生命值。',
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

export interface ParryContext {
  refillMagazine(): void
  grantOvercharge?(seconds: number): void
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

  get reloadTimeMultiplier(): number {
    return this.has('overclock_core') ? 0.6 : 1
  }

  get bonusOverchargeSeconds(): number {
    return this.has('overclock_core') ? 4 : 0
  }

  get hasDashNova(): boolean {
    return this.has('dash_nova')
  }

  get maxHpBonus(): number {
    return this.has('max_hp') ? 50 : 0
  }

  chronoDamageMultiplier(chronoTimeScale: number): number {
    return this.has('chrono_focus') && chronoTimeScale < 0.65 ? 1.7 : 1
  }

  killHealAmount(mult: number): number {
    return this.has('vamp_surge') && mult >= 3 ? 6 : 0
  }

  gloryKillRange(baseRange = 7): number {
    return this.has('chain_arc') ? baseRange + 1.5 : baseRange
  }

  ammoCost(_weapon: WeaponId): number {
    return 1
  }

  onHit(target: Enemy | null, damage: number, source: HitSource, context: HitContext): void {
    if (target && target.hp > 0) {
      if (this.has('freeze')) {
        target.frozenTimer = Math.max(target.frozenTimer ?? 0, 2.5)
      }
      if (this.has('burn')) {
        target.burnTimer = Math.max(target.burnTimer ?? 0, 3.0)
      }
    }

    // Prism Ricochet: bounce once to the nearest clear hostile within 14m.
    if (source.kind === 'bullet' && this.has('prism_ricochet')) {
      let nearest: Enemy | null = null
      let bestDistSq = 14 * 14
      for (const candidate of context.enemies) {
        if (candidate === target || candidate.hp <= 0) continue
        const pos = candidate.parts.group.position
        const d2 = pos.distanceToSquared(source.position)
        if (d2 < bestDistSq && context.canHit(source.position, pos)) {
          bestDistSq = d2
          nearest = candidate
        }
      }
      if (nearest) {
        const bounceDmg = Math.max(1, damage * 0.65)
        context.arc?.(source.position, nearest.parts.group.position)
        context.damageEnemy(nearest, bounceDmg, true)
      }
    }
  }

  onFrozenKill(origin: Vector3, context: HitContext): number {
    if (!this.has('cryo_shatter')) return 0
    let hitCount = 0
    for (const candidate of [...context.enemies]) {
      if (candidate.hp <= 0) continue
      const pos = candidate.parts.group.position
      if (pos.distanceToSquared(origin) > 9 * 9) continue
      candidate.frozenTimer = Math.max(candidate.frozenTimer ?? 0, 2.0)
      context.arc?.(origin, pos)
      context.damageEnemy(candidate, 5.5, true)
      hitCount++
    }
    return hitCount
  }

  onGloryKill(target: Enemy | Vector3, context: GloryKillContext): { chainedEnemies: Enemy[] } {
    this.onDashKill(context)
    const chainedEnemies: Enemy[] = []
    if (!this.has('chain_arc')) return { chainedEnemies }

    const origin = 'parts' in target ? target.parts.group.position : target
    const nearby = context.enemies
      .filter((enemy) => enemy !== target && enemy.hp > 0 && enemy.parts.group.position.distanceToSquared(origin) <= 16 * 16)
      .sort((a, b) => a.parts.group.position.distanceToSquared(origin) - b.parts.group.position.distanceToSquared(origin))
      .slice(0, 3)

    for (const enemy of nearby) {
      context.arc?.(origin, enemy.parts.group.position)
      context.damageEnemy(enemy, Math.max(2, context.maxHp(enemy) * 0.5), true)
      chainedEnemies.push(enemy)
    }
    return { chainedEnemies }
  }

  onDashKill(context: MomentumContext): void {
    context.resetDashCooldown()
    this.speedBoostRemaining = 2
  }

  onParry(_context: ParryContext): void {}

  onSlam(_context: SlamContext): void {}
}
