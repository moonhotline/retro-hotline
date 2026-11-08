import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SynthMusic } from './music'

class Param {
  value = 1
  setValueAtTime = vi.fn((value: number, _time: number) => { this.value = value; return this })
  setTargetAtTime = vi.fn((value: number, _time: number, _tau: number) => { this.value = value; return this })
  linearRampToValueAtTime = vi.fn((value: number, _time: number) => { this.value = value; return this })
  exponentialRampToValueAtTime = vi.fn((value: number, _time: number) => { this.value = value; return this })
  cancelAndHoldAtTime = vi.fn((_time: number) => this)
  cancelScheduledValues = vi.fn((_time: number) => this)
}
class Node {
  connect = vi.fn((node: Node) => node)
  disconnect = vi.fn()
}
class Gain extends Node { gain = new Param() }
class Filter extends Node { frequency = new Param(); Q = new Param(); type = '' }
class Source extends Node {
  frequency = new Param()
  detune = new Param()
  buffer: unknown = null
  loop = false
  type = ''
  onended: (() => void) | null = null
  start = vi.fn((_time?: number) => {})
  stop = vi.fn((_time?: number) => {})
}
class Context {
  static instances: Context[] = []
  currentTime = 0
  state = 'running'
  sampleRate = 8000
  destination = new Node()
  gains: Gain[] = []
  filters: Filter[] = []
  sources: Source[] = []
  constructor() { Context.instances.push(this) }
  createGain() { const gain = new Gain(); this.gains.push(gain); return gain }
  createBiquadFilter() { const filter = new Filter(); this.filters.push(filter); return filter }
  createBuffer() { return { getChannelData: () => new Float32Array(this.sampleRate) } }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source }
  createOscillator() { return this.createBufferSource() }
  resume = vi.fn(async () => { this.state = 'running' })
  close = vi.fn(async () => { this.state = 'closed' })
}
let music: SynthMusic
const ctx = () => Context.instances[0]!
const stems = () => ctx().gains.slice(1, 6)
function advance(seconds: number) { ctx().currentTime += seconds; vi.advanceTimersByTime(seconds * 1000) }
beforeEach(() => {
  vi.useFakeTimers()
  Context.instances = []
  vi.stubGlobal('AudioContext', Context)
  music = new SynthMusic()
})
afterEach(() => { music.dispose(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('continuous multi-stem score', () => {
  it('connects all five stem buses through the master lowpass and routes voices into each bus', () => {
    music.start()
    const [master] = ctx().gains
    const lp = ctx().filters[0]!
    expect(master!.connect).toHaveBeenCalledWith(ctx().destination)
    expect(lp.type).toBe('lowpass')
    expect(lp.connect).toHaveBeenCalledWith(master)
    expect(stems()).toHaveLength(5)
    for (const stem of stems()) expect(stem.connect).toHaveBeenCalledWith(lp)
    advance(0.045)
    for (const stem of stems()) expect(ctx().gains.some((gain) => gain.connect.mock.calls.some(([node]) => node === stem))).toBe(true)
    expect(master!.gain.value).toBe(0.6)
  })

  it.each([[0, 'D', 0.16, 0], [1, 'D', 0.16, 0], [2, 'C', 0.7, 0], [4, 'B', 0.7, 0], [5, 'S', 1, 1], [10, 'ULTRA', 1, 1.2]])(
    'mixes combo %s as rank %s without restarting transport', (combo, rank, arp, lead) => {
      music.start()
      music.setIntensity(2)
      advance(0.1)
      const step = music.debugState().step
      music.setComboRank(combo as number)
      const [padGain, drumGain, bassGain, arpGain, leadGain] = stems()
      expect(padGain!.gain.value).toBe(0.7)
      expect(drumGain!.gain.value).toBe((combo as number) >= 2 ? 1 : 0.75)
      expect(bassGain!.gain.value).toBe((combo as number) >= 5 ? 1.35 : 1)
      expect(arpGain!.gain.value).toBe(arp)
      expect(leadGain!.gain.value).toBe(lead)
      expect(music.debugState()).toMatchObject({ combo, rank, step })
      expect(Context.instances).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(1)
    }
  )

  it('honors settings before start, fades down for menus, and resets the lead when a combo expires', () => {
    music.setIntensity(3)
    music.setComboRank(5)
    music.setVolume(0.25)
    music.start()
    expect(ctx().filters[0]!.frequency.value).toBe(6500)
    expect(stems()[4]!.gain.value).toBe(1)
    music.setIntensity(0)
    expect(stems()[4]!.gain.value).toBe(0)
    expect(stems()[1]!.gain.value).toBe(0)
    music.setIntensity(2)
    music.setComboRank(0)
    expect(stems()[4]!.gain.value).toBe(0)
    expect(ctx().gains[0]!.gain.value).toBe(0.25)
  })

  it('clamps volume, retains it through mute/start, and ignores non-finite volume', () => {
    music.setVolume(2)
    music.setMuted(true)
    music.start()
    const master = ctx().gains[0]!
    expect(master.gain.value).toBe(0)
    music.setVolume(0.3)
    expect(master.gain.value).toBe(0)
    music.start()
    music.setMuted(false)
    expect(master.gain.value).toBe(0.3)
    music.setVolume(NaN)
    expect(master.gain.value).toBe(0.3)
    music.setVolume(-1)
    expect(master.gain.value).toBe(0)
    expect(music.debugState().volume).toBe(0)
  })

  it('dips the cutoff on the audio clock and restores the current intensity target', () => {
    music.start()
    music.setIntensity(2)
    const frequency = ctx().filters[0]!.frequency
    music.triggerFilterDrop()
    expect(frequency.cancelAndHoldAtTime).toHaveBeenLastCalledWith(0)
    expect(frequency.linearRampToValueAtTime).toHaveBeenLastCalledWith(360, 0.02)
    expect(frequency.setValueAtTime).toHaveBeenLastCalledWith(360, 0.18)
    expect(frequency.setTargetAtTime).toHaveBeenLastCalledWith(2600, 0.18, 0.16)
    expect(music.debugState().filterDropping).toBe(true)
    advance(0.05)
    music.setIntensity(3)
    expect(frequency.setTargetAtTime).toHaveBeenLastCalledWith(6500, 0.18, 0.16)
    advance(0.14)
    expect(music.debugState().filterDropping).toBe(false)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('replaces overlapping drops and handles browsers without cancelAndHoldAtTime', () => {
    music.start()
    music.setIntensity(3)
    const frequency = ctx().filters[0]!.frequency
    Object.assign(frequency, { cancelAndHoldAtTime: undefined })
    music.triggerFilterDrop(120, 100)
    advance(0.05)
    music.triggerFilterDrop(200, 400)
    expect(frequency.cancelScheduledValues).toHaveBeenLastCalledWith(0.05)
    expect(frequency.setValueAtTime).toHaveBeenLastCalledWith(200, 0.45)
    expect(frequency.setTargetAtTime).toHaveBeenLastCalledWith(6500, 0.45, 0.16)
  })

  it('sanitizes invalid combos and impact inputs', () => {
    music.start()
    music.setComboRank(NaN)
    expect(music.debugState().rank).toBe('D')
    music.triggerFilterDrop(-100, -20)
    expect(ctx().filters[0]!.frequency.linearRampToValueAtTime).toHaveBeenLastCalledWith(20, 0.02)
    music.triggerFilterDrop(Infinity, NaN)
    expect(ctx().filters[0]!.frequency.setValueAtTime).toHaveBeenLastCalledWith(360, 0.18)
  })

  it('keeps step/time monotonic beyond 1024 beats and skips stale beats after a stall', () => {
    music.start()
    const play = vi.spyOn(music as any, 'playStep')
    advance(0.05)
    const first = music.debugState()
    music.start()
    music.setIntensity(3)
    music.setComboRank(8)
    expect(music.debugState().step).toBe(first.step)
    advance(200)
    const after = music.debugState()
    expect(after.step).toBeGreaterThan(1024)
    expect(after.nextTime).toBeGreaterThan(first.nextTime)
    expect(play).toHaveBeenCalledTimes(2)
    const last = play.mock.calls.at(-1) as unknown as [number, number]
    expect(last[1]).toBeGreaterThanOrEqual(ctx().currentTime)
    expect(last[1]).toBeLessThan(ctx().currentTime + 0.16)
    ctx().state = 'suspended'
    advance(2)
    expect(music.debugState().step).toBe(after.step)
    music.start()
    expect(ctx().resume).toHaveBeenCalledOnce()
  })

  it('disconnects ended voices and stops every source, timer and bus on idempotent disposal', () => {
    music.start()
    advance(0.05)
    const context = ctx()
    const voice = context.sources[1]!
    const before = music.debugState().activeSources
    voice.onended!()
    expect(voice.disconnect).toHaveBeenCalledOnce()
    expect(music.debugState().activeSources).toBe(before - 1)
    music.dispose()
    music.dispose()
    music.start()
    music.triggerFilterDrop()
    expect(context.close).toHaveBeenCalledOnce()
    for (const source of context.sources) expect(source.disconnect).toHaveBeenCalledOnce()
    for (const node of [...context.gains, ...context.filters]) expect(node.disconnect).toHaveBeenCalledOnce()
    expect(context.sources[0]!.stop).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    expect(Context.instances).toHaveLength(1)
    expect(music.debugState()).toMatchObject({ ctx: 'none', activeSources: 0, disposed: true, filterDropping: false })
  })

  it('is safe before startup, without Web Audio, and during SSR', () => {
    music.triggerFilterDrop()
    expect(music.debugState()).toMatchObject({ ctx: 'none', step: 0, rank: 'D', volume: 0.6 })
    vi.stubGlobal('AudioContext', undefined)
    music.start()
    vi.stubGlobal('window', undefined)
    music.start()
    expect(Context.instances).toHaveLength(0)
  })
})
