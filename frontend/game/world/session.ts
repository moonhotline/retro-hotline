import {
  battery, checkpointKeys, checkpoints, clearSight, distance, insideBlock,
  slide, spawn, terminal, walkable, type Checkpoint, type Position,
} from './map'

export const saveKey = 'retro-hotline.fireseed.v1'
export const enemySpecs = {
  craw: { x: 2.9, z: -8.4, hp: 90, eye: 1.33, radius: .83, notice: 12, leash: 39, speed: 5.1, range: 3.2 },
  bug: { x: 3.2, z: -24.2, hp: 126, eye: .83, radius: .84, notice: 10, leash: 5, speed: 1.8, range: 3.8 },
} as const

export type EnemyId = keyof typeof enemySpecs
export const enemyIds = Object.keys(enemySpecs) as EnemyId[]
export type Stage = 'collect' | 'carry' | 'powered' | 'finished'
type Motion = 'patrol' | 'pursuit' | 'windup' | 'strike' | 'recovery' | 'return'
type EnemySave = Position & { hp: number }
export interface Snapshot {
  version: 1
  checkpoint: Checkpoint
  stage: Stage
  enemies: Record<EnemyId, EnemySave>
}
export interface Enemy extends EnemySave {
  id: EnemyId
  yaw: number
  motion: Motion
  moving: boolean
  timer: number
  unseen: number
  goal: Position
}
export interface Input { forward: number; side: number; sprint: boolean; fire: boolean }
export interface Shot { x: number; y: number; z: number; endX: number; endY: number; endZ: number; age: number }
export type Interaction = 'battery' | 'power' | 'terminal' | null

const stages: Stage[] = ['collect', 'carry', 'powered', 'finished']
const safeNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export function parseSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const save = value as Snapshot
    if (save.version !== 1 || !checkpointKeys.includes(save.checkpoint) ||
      !stages.includes(save.stage) || !save.enemies) return null
    const enemy = (id: EnemyId) => {
      const entry = save.enemies[id]
      const spec = enemySpecs[id]
      if (!entry || !safeNumber(entry.hp) || entry.hp < 0 || entry.hp > spec.hp ||
        !safeNumber(entry.x) || !safeNumber(entry.z)) throw new Error('Invalid enemy')
      const valid = walkable(entry, .44) && distance(entry, spec) <= spec.leash + 2
      return { x: valid ? entry.x : spec.x, z: valid ? entry.z : spec.z, hp: entry.hp }
    }
    return { version: 1, checkpoint: save.checkpoint, stage: save.stage, enemies: { craw: enemy('craw'), bug: enemy('bug') } }
  } catch {
    return null
  }
}

export function readSave() {
  try { return parseSnapshot(localStorage.getItem(saveKey)) } catch { return null }
}

export function writeSave(save: Snapshot) {
  try {
    localStorage.setItem(saveKey, JSON.stringify(save))
    return true
  } catch {
    return false
  }
}

function enemy(id: EnemyId, saved?: EnemySave): Enemy {
  const spec = enemySpecs[id]
  const start = saved ?? spec
  return { id, x: start.x, z: start.z, hp: start.hp, yaw: 0,
    motion: 'patrol', moving: false, timer: 0, unseen: 0, goal: spec }
}

function turn(current: number, target: number, limit: number) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + Math.max(-limit, Math.min(limit, diff))
}

export class WorldSession {
  readonly player = { ...spawn, yaw: 0, pitch: 0, hp: 100 }
  readonly enemies: Record<EnemyId, Enemy>
  readonly destroyedAt: Partial<Record<EnemyId, number>> = {}
  checkpoint: Checkpoint
  stage: Stage
  opening: boolean
  openingTime = 0
  time = 0
  slowTime = 0
  shot: Shot | null = null
  hit = 0
  hurt = 0
  notice = ''
  noticeTime = 0
  storageFailed = false
  private cooldown = 0

  constructor(saved: Snapshot | null, private readonly persist: (save: Snapshot) => boolean = writeSave) {
    this.checkpoint = saved?.checkpoint ?? 'docks'
    this.stage = saved?.stage ?? 'collect'
    this.enemies = { craw: enemy('craw', saved?.enemies.craw), bug: enemy('bug', saved?.enemies.bug) }
    this.opening = !saved
    this.placeAtCheckpoint()
  }

  save() {
    const { craw, bug } = this.enemies
    this.storageFailed = !this.persist({
      version: 1, checkpoint: this.checkpoint, stage: this.stage,
      enemies: { craw: { x: craw.x, z: craw.z, hp: craw.hp }, bug: { x: bug.x, z: bug.z, hp: bug.hp } },
    })
  }

  endOpening() {
    if (!this.opening) return
    this.opening = false
    this.save()
  }

  get interaction(): Interaction {
    if (this.opening) return null
    if (this.stage === 'collect' && distance(this.player, battery) <= 2.15) return 'battery'
    if (distance(this.player, terminal) <= 2.1 && this.player.z > terminal.z - .3) {
      if (this.stage === 'carry') return 'power'
      if (this.stage === 'powered') return 'terminal'
    }
    return null
  }

  interact() {
    const target = this.interaction
    if (target === 'battery') {
      this.stage = 'carry'
      this.message('拿到了就走。桥还通。', 4.2)
      this.save()
    }
    if (target === 'power') {
      this.stage = 'powered'
      this.message('种子库供电恢复。撤离门已解锁。', 5)
      this.save()
    }
    return target
  }

  finish() {
    if (this.interaction !== 'terminal') return false
    this.stage = 'finished'
    this.save()
    return true
  }

  look(yaw: number, pitch: number) {
    if (this.opening || this.stage === 'finished') return
    this.player.yaw = (this.player.yaw + yaw) % (Math.PI * 2)
    this.player.pitch = Math.min(1.3, Math.max(-1.3, this.player.pitch + pitch))
  }

  step(dt: number, input: Input, loaded: (z: number) => boolean) {
    if (this.opening) {
      this.openingTime += dt
      if (this.openingTime >= 4.3) this.endOpening()
      return
    }
    if (this.stage === 'finished') return
    this.slowTime = Math.max(0, this.slowTime - dt)
    this.hit = Math.max(0, this.hit - dt)
    this.hurt = Math.max(0, this.hurt - dt)
    this.noticeTime = Math.max(0, this.noticeTime - dt)
    if (this.shot && (this.shot.age += dt) >= .07) this.shot = null
    const step = dt * (this.slowTime > 0 ? .42 : 1)
    this.time += step
    this.cooldown -= step
    const { forward, side } = input
    const { yaw } = this.player
    const pace = (input.sprint ? 11.8 : 6.1) * step / Math.max(1, Math.hypot(forward, side))
    if (forward || side) {
      const next = slide(this.player, (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * pace,
        (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * pace, .28)
      const occupied = enemyIds.some(id => {
        const e = this.enemies[id]
        return e.hp > 0 && distance(next, e) < .94 && distance(next, e) < distance(this.player, e)
      })
      if (!occupied && loaded(next.z)) Object.assign(this.player, { x: next.x, z: next.z })
    }

    const arrived = checkpointKeys.find(key => distance(this.player, checkpoints[key]) < 2.05)
    if (arrived && arrived !== this.checkpoint) {
      this.checkpoint = arrived
      this.message(checkpoints[arrived].name, 1.7)
      this.save()
    }
    if (input.fire && this.cooldown <= 0) this.fire()
    for (const id of enemyIds) this.moveEnemy(this.enemies[id], step, loaded)
  }

  private fire() {
    this.cooldown = .21
    const { x, z, yaw, pitch } = this.player
    const y = 1.63
    const dx = -Math.sin(yaw) * Math.cos(pitch)
    const dz = -Math.cos(yaw) * Math.cos(pitch)
    const dy = Math.sin(pitch)
    let reach = 36
    for (let t = .15; t < reach; t += .16) {
      const elevation = y + dy * t
      if (elevation <= 0 || insideBlock({ x: x + dx * t, z: z + dz * t }, 0, elevation)) {
        reach = t
        break
      }
    }

    let target: Enemy | undefined
    for (const id of enemyIds) {
      const e = this.enemies[id]
      const spec = enemySpecs[id]
      if (e.hp <= 0) continue
      const vx = e.x - x
      const vy = spec.eye - y
      const vz = e.z - z
      const along = vx * dx + vy * dy + vz * dz
      const miss = (vx - dx * along) ** 2 + (vy - dy * along) ** 2 + (vz - dz * along) ** 2
      if (along <= 0 || miss >= spec.radius ** 2) continue
      const contact = Math.max(0, along - Math.sqrt(spec.radius ** 2 - miss))
      if (contact >= reach) continue
      target = e
      reach = contact
    }
    this.shot = { x, y: y - .08, z, endX: x + dx * reach, endY: y + dy * reach, endZ: z + dz * reach, age: 0 }
    if (!target) return
    const angle = Math.atan2(x - target.x, z - target.z)
    const shield = target.id === 'bug' && Math.cos(angle - target.yaw) > .56
    this.hit = .18
    target.hp = Math.max(0, target.hp - (shield ? 9 : 30))
    if (target.hp === 0) {
      target.moving = false
      this.destroyedAt[target.id] = this.time
      this.slowTime = .34
    } else if (shield) {
      this.message('正面装甲 · 从侧面打', 1.15)
    }
    this.save()
  }

  private moveEnemy(e: Enemy, dt: number, loaded: (z: number) => boolean) {
    e.moving = false
    if (e.hp <= 0) return
    const spec = enemySpecs[e.id]
    const gap = distance(e, this.player)
    if (gap > 28 && e.motion === 'patrol') return
    const sight = gap < 21 && clearSight(e, this.player, spec.eye)
    e.timer = Math.max(0, e.timer - dt)
    e.unseen = sight ? 0 : e.unseen + dt

    if (e.motion === 'windup' || e.motion === 'recovery') {
      if (e.motion === 'windup' && e.timer === 0) {
        if (e.id === 'craw') {
          e.motion = 'strike'
          e.timer = .22
          return
        }
        e.motion = 'recovery'
        e.timer = 1.12
        const aim = Math.atan2(this.player.x - e.x, this.player.z - e.z)
        if (sight && gap <= spec.range && Math.cos(e.yaw - aim) > .58) this.damage(22)
      } else if (e.motion === 'recovery' && e.timer === 0) {
        e.motion = 'pursuit'
      }
      return
    }
    if (e.motion === 'strike') {
      const next = slide(e, Math.sin(e.yaw) * dt * 10, Math.cos(e.yaw) * dt * 10, .44)
      if (gap > 1.15 && loaded(next.z) && distance(next, spec) <= spec.leash) {
        e.moving = distance(e, next) > .002
        Object.assign(e, next)
      }
      if (e.timer === 0 || distance(e, this.player) <= 1.24) {
        e.motion = 'recovery'
        e.timer = .76
        if (distance(e, this.player) <= 1.24 && clearSight(e, this.player)) this.damage(27)
      }
      return
    }
    if (e.motion === 'patrol' && sight && gap < spec.notice &&
      (e.id === 'craw' || this.player.z > -43 && this.player.z < -12.5)) {
      e.motion = 'pursuit'
      e.goal = { ...this.player }
    }

    if (e.motion === 'pursuit') {
      if (e.unseen > 2.4 || distance(e, spec) >= spec.leash ||
        (e.id === 'bug' && (this.player.z < -43 || this.player.z > -12.5))) e.motion = 'return'
      else if (sight) {
        e.goal = { ...this.player }
        if (gap <= spec.range * .79) {
          e.motion = 'windup'
          e.timer = e.id === 'craw' ? .50 : .88
          e.yaw = Math.atan2(this.player.x - e.x, this.player.z - e.z)
          this.message(e.id === 'craw' ? 'CRAW · 冲撞' : 'BUG · 蓄力', e.timer)
          return
        }
      }
    }
    if (e.motion === 'return') {
      e.goal = spec
      if (distance(e, spec) < .22) {
        e.motion = 'patrol'
        e.timer = 2
      }
    }
    if (e.motion === 'patrol') {
      if (e.timer > 0) return
      const phase = Math.sin(this.time * .57)
      e.goal = { x: spec.x - 1 + phase * 1.05, z: spec.z + Math.cos(this.time * .57) * 1.65 }
    }
    const goal = distance(e, e.goal)
    if (goal < .15) return
    const dx = (e.goal.x - e.x) / goal
    const dz = (e.goal.z - e.z) / goal
    const speed = (e.motion === 'pursuit' ? spec.speed : e.motion === 'return' ? 2.6 : 1.08) * dt
    const next = slide(e, dx * speed, dz * speed, .44)
    if (!loaded(next.z) || (e.id === 'bug' && distance(next, spec) > spec.leash + .12)) return
    e.moving = distance(e, next) > .002
    if (!e.moving) return
    e.yaw = turn(e.yaw, Math.atan2(next.x - e.x, next.z - e.z), dt * 9)
    Object.assign(e, next)
  }

  private damage(points: number) {
    this.hurt = .36
    this.player.hp -= points
    if (this.player.hp > 0) return
    for (const id of enemyIds) {
      const e = this.enemies[id]
      if (e.hp > 0 && e.motion !== 'patrol') Object.assign(e, enemy(id), { hp: e.hp })
    }
    this.placeAtCheckpoint()
    this.message('已撤回最近的安全点。', 2.4)
    this.save()
  }

  private placeAtCheckpoint() {
    const { x, z, yaw } = checkpoints[this.checkpoint]
    Object.assign(this.player, { x, z, yaw, pitch: 0, hp: 100 })
  }

  private message(text: string, duration: number) {
    this.notice = text
    this.noticeTime = duration
  }
}
