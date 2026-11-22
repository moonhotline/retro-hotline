import { Group, PerspectiveCamera } from 'three/webgpu'
import { expect, test, vi } from 'vitest'
import { createPlaySession, type PlayEvent } from './playSession'

function makeSession() {
  const actor = new Group()
  actor.position.set(1, 0, 2)
  const asset = {
    stats: { size: [1, 1.8, 1] as [number, number, number], triangles: 0, meshes: 0, materials: 0, bones: 0, clips: [] },
    play: vi.fn(),
    pose: vi.fn(),
    stop: vi.fn(),
  }
  const events: PlayEvent[] = []
  const session = createPlaySession('character', actor, asset, new PerspectiveCamera(), 2,
    event => events.push(event))
  function key(type: 'keydown' | 'keyup', code: string) {
    window.dispatchEvent(new KeyboardEvent(type, { code, cancelable: true }))
  }
  return { session, actor, asset, events, key }
}

test('pauses the simulation, resumes it and cleans up input on exit', () => {
  const { session, actor, asset, events, key } = makeSession()
  try {
    session.enter()
    key('keydown', 'KeyW')
    expect(session.advance(0.1)).toBe(true)
    expect(actor.position.z).toBeCloseTo(2.2)
    session.pause()
    key('keydown', 'KeyW')
    expect(session.advance(0.1)).toBe(false)
    expect(actor.position.z).toBeCloseTo(2.2)
    session.resume()
    session.advance(0.1)
    expect(actor.position.z).toBeCloseTo(2.2)
    key('keydown', 'Escape')
    expect(actor.position.toArray()).toEqual([1, 0, 2])
    const count = asset.play.mock.calls.length
    key('keydown', 'KeyW')
    session.exit()
    expect(asset.play).toHaveBeenCalledTimes(count)
    expect(events.filter(event => event.type !== 'action').map(event => event.type)).toEqual(['enter', 'pause', 'resume', 'exit'])
  } finally {
    session.exit()
  }
})

test('emits the jump phases and returns the actor to the spawn floor', () => {
  const { session, actor, events, key } = makeSession()
  try {
    session.enter()
    key('keydown', 'Space')
    session.advance(0.05)
    expect(actor.position.y).toBeGreaterThan(0)
    for (let i = 0; i < 32; i++) session.advance(0.05)
    expect(actor.position.y).toBe(0)
    expect(events.flatMap(event => event.type === 'action' ? [event.motion] : []))
      .toEqual(['takeoff', 'airborne', 'land', 'idle'])
  } finally {
    session.exit()
  }
})
