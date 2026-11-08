import type { Vector3 } from 'three'
import type { Enemy } from '../waves'
import type { WeaponId } from '../types'

export type HackId = 'ricochet' | 'bass_drop' | 'chain_lightning' | 'blood_momentum' | 'overdrive_heatsink' | 'void_leash'
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
    id: 'ricochet', name: '跳弹演算 // Ricochet.exe', tier: 'COMMON', badge: 'RC',
    tagline: 'ONE SHOT. ANOTHER PROBLEM.',
    description: '子弹命中敌人或墙壁后，弹射至 9m 内的一个可见目标，造成原伤害的 60%。每发只弹射一次。',
  },
  {
    id: 'bass_drop', name: '重音重压 // Bass Drop', tier: 'RARE', badge: 'BD',
    tagline: 'MAKE THE FLOOR HIT BACK.',
    description: 'Kinetic Slam 冲击波半径增加 50%（12m → 18m），使所有被击中且存活的敌人进入硬直。',
  },
  {
    id: 'chain_lightning', name: '电弧链式 // Chain Lightning', tier: 'OVERCLOCK', badge: 'CL',
    tagline: 'ONE EXECUTION. ALL CONNECTED.',
    description: 'Glory Kill 向处决点 12m 内所有敌人释放电弧，造成各目标最大生命值 35% 的伤害，无视护甲。',
  },
  {
    id: 'blood_momentum', name: '嗜血推进 // Blood Momentum', tier: 'RARE', badge: 'BM',
    tagline: 'KILL. RESET. KEEP MOVING.',
    description: '冲刺击杀或 Glory Kill 立即重置 Phase Dash 冷却，并获得持续 2 秒的 40% 移速加成。再次触发刷新持续时间。',
  },
  {
    id: 'overdrive_heatsink', name: '超频散热 // Overdrive Heatsink', tier: 'COMMON', badge: 'OH',
    tagline: 'SEND IT BACK. STAY LOADED.',
    description: 'Pulse Parry 成功反弹时立即补满当前弹匣，此后本局弹药效率翻倍：每两发仅消耗一发弹药。',
  },
  {
    id: 'void_leash', name: '虚空抓钩 // Void Leash', tier: 'OVERCLOCK', badge: 'VL',
    tagline: 'DISTANCE IS A SUGGESTION.',
    description: '用 E / F / 鼠标右键，从最远 26m 拉近并处决准星前方的硬直敌人。路径必须畅通。',
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
  private paidShot: Record<WeaponId, boolean> = { rifle: false, deagle: false }

  has(id: HackId): boolean { return this.activeHacks.has(id) }

  apply(id: HackId): void {
    if (NEON_HACKS.some((hack) => hack.id === id)) this.activeHacks.add(id)
  }

  reset(): void {
    this.activeHacks.clear()
    this.speedBoostRemaining = 0
    this.ammoEfficiency = 1
    this.paidShot = { rifle: false, deagle: false }
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

  get speedMultiplier(): number { return this.speedBoostRemaining > 0 ? 1.4 : 1 }

  gloryKillRange(baseRange = 7): number { return this.has('void_leash') ? 26 : baseRange }

  /** Alternate free/paid shots per weapon, keeping both the HUD and magazines integral. */
  ammoCost(weapon: WeaponId): number {
    if (!this.has('overdrive_heatsink') || this.ammoEfficiency === 1) return 1
    const cost = this.paidShot[weapon] ? 1 : 0
    this.paidShot[weapon] = !this.paidShot[weapon]
    return cost
  }

  onHit(target: Enemy | null, damage: number, source: HitSource, context: HitContext): { ricochetTarget?: Enemy } {
    if (!this.has('ricochet') || source.kind !== 'bullet' || damage <= 0) return {}
    let ricochetTarget: Enemy | undefined
    let nearest = Infinity
    for (const enemy of context.enemies) {
      if (enemy === target || enemy.hp <= 0) continue
      const distance = enemy.parts.group.position.distanceToSquared(source.position)
      if (distance > 9 * 9 || distance >= nearest || !context.canHit(source.position, enemy.parts.group.position)) continue
      nearest = distance
      ricochetTarget = enemy
    }
    if (ricochetTarget) {
      context.arc?.(source.position, ricochetTarget.parts.group.position.clone())
      context.damageEnemy(ricochetTarget, damage * 0.6, source.ignoreShield)
    }
    return { ricochetTarget }
  }

  onGloryKill(target: Enemy | Vector3, context: GloryKillContext): { chainedEnemies: Enemy[] } {
    this.onDashKill(context)
    if (!this.has('chain_lightning')) return { chainedEnemies: [] }
    const position = 'parts' in target ? target.parts.group.position : target
    // Snapshot before damage: killing enemies mutates the director's live array.
    const chainedEnemies = context.enemies.filter((enemy) => enemy !== target && enemy.hp > 0 &&
      enemy.parts.group.position.distanceToSquared(position) <= 12 * 12)
    for (const enemy of chainedEnemies) {
      context.arc?.(position, enemy.parts.group.position.clone())
      context.damageEnemy(enemy, context.maxHp(enemy) * 0.35, true)
    }
    return { chainedEnemies }
  }

  onDashKill(context: MomentumContext): void {
    if (!this.has('blood_momentum')) return
    context.resetDashCooldown()
    this.speedBoostRemaining = 2
  }

  onParry(context: { refillMagazine(): void }): void {
    if (!this.has('overdrive_heatsink')) return
    context.refillMagazine()
    this.ammoEfficiency = 2
  }

  onSlam(context: SlamContext): void {
    if (!this.has('bass_drop')) return
    context.radius *= 1.5
    context.staggerAll = true
  }
}
