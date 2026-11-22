import { describe, expect, it } from 'vitest'
import {
  battery, branches, checkpoints, distance, mainPath, sectors, spawn, terminal, walkable, zoneName,
} from './map'
import { enemySpecs, parseSnapshot, WorldSession, type Input, type Snapshot } from './session'

const none: Input = { forward: 0, side: 0, fire: false, sprint: false }
const open = () => true

function run(saved: Snapshot | null = null) {
  let latest = saved
  const session = new WorldSession(saved, value => { latest = value; return true })
  session.endOpening()
  return { session, read: () => parseSnapshot(JSON.stringify(latest)) }
}

function simulate(session: WorldSession, seconds: number, input: Partial<Input> = {}, ready: (z: number) => boolean = open) {
  for (let i = 0; i < Math.floor(seconds * 60); i++) session.step(1 / 60, { ...none, ...input }, ready)
}

function aimAt(session: WorldSession, id: keyof typeof enemySpecs) {
  const to = session.enemies[id], from = session.player
  from.yaw = Math.atan2(from.x - to.x, from.z - to.z)
  from.pitch = Math.atan2(enemySpecs[id].eye - 1.63, distance(from, to))
}

describe('the connected route', () => {
  it('joins every landmark and both ends of each branch using traversable points', () => {
    expect(sectors.map(x => x.id)).toEqual(['docks', 'gate', 'square', 'sphere', 'bay-view', 'voyager', 'orchard'])
    for (const path of [...mainPath, ...branches]) {
      path.points.slice(1).forEach((b, i) => {
        const a = path.points[i]!
        for (let j = 0; j <= 30; j++) {
          const p = { x: a.x + (b.x - a.x) * j / 30, z: a.z + (b.z - a.z) * j / 30 }
          expect(walkable(p), `path at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`).toBe(true)
        }
      })
    }
  })

  it('walks dock to bridge and back without replacing the session', () => {
    const { session } = run()
    const direction = Math.sign(spawn.z - checkpoints.approach.z)
    simulate(session, 8.5, { forward: direction, sprint: true })
    expect(zoneName(session.player.z)).toBe('金门大桥')
    expect(session.checkpoint).toBe('approach')
    const z = session.player.z
    simulate(session, 4, { forward: -direction, sprint: true })
    expect(session.player.z).toBeGreaterThan(z + 40)
    expect(zoneName(session.player.z)).toBe('断电港区')
  })

  it('stops at an unprepared seam and only crosses once the segment is ready', () => {
    const { session } = run()
    Object.assign(session.player, { x: 0, z: -64 })
    simulate(session, 1, { forward: 1 }, (z: number) => z >= -66)
    expect(session.player.z).toBeGreaterThanOrEqual(-66)
    simulate(session, 1, { forward: 1 })
    expect(session.player.z).toBeLessThan(-69)
  })
})

describe('mechanical enemies', () => {
  it('lets CRAW cross the cargo yard seam and return on losing the player', () => {
    const { session } = run()
    const craw = session.enemies.craw
    Object.assign(craw, { x: 0, z: -42, motion: 'pursuit' })
    Object.assign(session.player, { x: 0, z: -49 })
    simulate(session, .55, {}, (z: number) => z >= -43)
    expect(craw.z).toBeGreaterThanOrEqual(-43)
    simulate(session, .45)
    expect(craw.z).toBeLessThan(-43)
    Object.assign(session.player, { x: 0, z: -75 })
    simulate(session, 16.8)
    expect(distance(craw, enemySpecs.craw)).toBeLessThan(2.2)
  })

  it('keeps BUG in the yard and applies different damage to its front and side', () => {
    const { session } = run()
    const bug = session.enemies.bug
    session.enemies.craw.hp = 0
    Object.assign(bug, { x: 1, z: -26, yaw: 0, motion: 'windup', timer: 50 })
    Object.assign(session.player, { x: 1, z: -20 })
    aimAt(session, 'bug')
    simulate(session, .05, { fire: true })
    expect(bug.hp).toBe(117)
    simulate(session, .24)
    Object.assign(session.player, { x: -3, z: -26 })
    aimAt(session, 'bug')
    simulate(session, .05, { fire: true })
    expect(bug.hp).toBe(87)
    Object.assign(bug, { motion: 'pursuit' })
    Object.assign(session.player, { x: 0, z: -45 })
    simulate(session, 10)
    expect(distance(bug, enemySpecs.bug)).toBeLessThan(5.12)
  })

  it('restores the safe point and preserves enemy damage and wreck records after death', () => {
    const { session, read } = run()
    session.checkpoint = 'approach'
    session.player.hp = 15
    session.enemies.craw.hp = 0
    const bug = session.enemies.bug
    Object.assign(bug, { x: 1.2, z: -26, motion: 'windup', timer: .01, yaw: 0, hp: 76 })
    Object.assign(session.player, { x: 1.2, z: -24 })
    simulate(session, .03)
    expect(session.player).toMatchObject({ x: checkpoints.approach.x, z: checkpoints.approach.z, hp: 100 })
    expect(bug).toMatchObject({ x: enemySpecs.bug.x, z: enemySpecs.bug.z, hp: 76, motion: 'patrol' })
    expect(read()?.enemies.craw.hp).toBe(0)
    expect(read()?.enemies.bug.hp).toBe(76)
  })

  it('persists a shot, core rupture and a kill without reviving on reload', () => {
    const { session, read } = run()
    Object.assign(session.player, { x: 1.2, z: -1.9 })
    Object.assign(session.enemies.craw, { x: 1.2, z: -5.8, hp: 30 })
    aimAt(session, 'craw')
    simulate(session, .02, { fire: true })
    expect(session.shot).not.toBeNull()
    expect(session.destroyedAt.craw).toBeDefined()
    expect(session.slowTime).toBeGreaterThan(0)
    simulate(session, .1)
    expect(session.shot).toBeNull()
    expect(run(read()).session.enemies.craw.hp).toBe(0)
  })
})

describe('Fireseed', () => {
  it('persists progression, lets the player leave after power-up, and ends only at the terminal', () => {
    const { session, read } = run()
    Object.assign(session.player, { x: terminal.x, z: terminal.z })
    expect(session.interact()).toBeNull()
    Object.assign(session.player, { x: battery.x + 1.2, z: battery.z })
    expect(session.interact()).toBe('battery')
    expect(read()?.stage).toBe('carry')
    session.checkpoint = 'orchard'
    Object.assign(session.player, { x: terminal.x, z: terminal.z })
    expect(session.interact()).toBe('power')
    session.player.z += 5
    expect(session.finish()).toBe(false)
    const restored = run(read()).session
    expect(restored.opening).toBe(false)
    expect(restored.player).toMatchObject({ x: checkpoints.orchard.x, z: checkpoints.orchard.z })
    expect(restored.stage).toBe('powered')
    Object.assign(restored.player, { x: terminal.x, z: terminal.z })
    expect(restored.finish()).toBe(true)
    expect(restored.stage).toBe('finished')
    const next = run().session
    expect(next.stage).toBe('collect')
    expect(next.enemies.craw.hp).toBe(enemySpecs.craw.hp)
  })
})
