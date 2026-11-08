import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SYNTH_TRACKS, SynthMusic } from './music'

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

describe('procedural track selection', () => {
  it('lists three distinct tracks and returns metadata without exposing mutable track definitions', () => {
    const tracks = music.getTracks()
    expect(tracks).toEqual([
      { id: 'bay-bridge-runner', name: 'BAY BRIDGE RUNNER', genre: 'Synthwave', bpm: 116 },
      { id: 'hotline-midnight', name: 'HOTLINE MIDNIGHT', genre: 'Darksynth / EBM', bpm: 128 },
      { id: 'cyber-overdrive', name: 'CYBER OVERDRIVE', genre: 'Acid Breakbeat / Neuro', bpm: 140 },
    ])
    expect(music.getCurrentTrack()).toEqual(tracks[0])
    tracks[0]!.bpm = 1
    music.getCurrentTrack().name = 'changed'
    expect(music.debugState()).toMatchObject({ trackIndex: 0, trackName: 'BAY BRIDGE RUNNER', bpm: 116 })
    expect(Context.instances).toHaveLength(0)
  })

  it('cycles round robin and safely normalizes finite indices before startup', () => {
    for (const index of [1, 2, 0, 1]) {
      expect(music.nextTrack()).toEqual(music.getTracks()[index])
      expect(music.getCurrentTrackIndex()).toBe(index)
    }
    for (const [input, index] of [[-1, 2], [3, 0], [7.9, 1], [-4, 2], [0, 0]]) {
      music.setTrack(input!)
      expect(music.getCurrentTrackIndex()).toBe(index)
    }
    music.setTrack(2)
    for (const invalid of [NaN, Infinity, -Infinity]) music.setTrack(invalid)
    music.start()
    expect(music.debugState()).toMatchObject({ trackIndex: 2, trackName: 'CYBER OVERDRIVE', bpm: 140 })
    advance(0.045)
    expect(music.debugState().nextTime).toBeCloseTo(0.1 + 60 / 140 / 4)
  })

  it('preserves the original chord sections and lead, with four complete bars per track', () => {
    expect(SYNTH_TRACKS[0]!.progA).toEqual([
      [110, 130.81, 164.81, 220], [110, 130.81, 164.81, 220],
      [87.31, 110, 130.81, 174.61], [98, 123.47, 146.83, 196],
    ])
    expect(SYNTH_TRACKS[0]!.progB).toEqual([
      ...SYNTH_TRACKS[0]!.progA.slice(0, 3), [82.41, 103.83, 123.47, 164.81],
    ])
    expect(SYNTH_TRACKS[0]!.lead).toEqual([
      [0, -1, -1, 2, -1, -1, 1, -1, -1, 3, -1, 2, -1, 1, -1, -1],
      [-1, -1, 2, -1, 3, -1, -1, 1, -1, 2, -1, -1, 0, -1, -1, -1],
      [3, -1, -1, 2, -1, -1, 1, -1, 2, -1, -1, 0, -1, -1, 1, -1],
      [-1, 2, -1, -1, 3, -1, 2, -1, -1, 1, -1, 0, -1, -1, -1, -1],
    ])
    for (const track of SYNTH_TRACKS) {
      expect(track.progA).toHaveLength(4)
      expect(track.progB).toHaveLength(4)
      expect(track.lead).toHaveLength(4)
      for (const bar of track.lead) {
        expect(bar).toHaveLength(16)
        expect(bar.every((tone) => Number.isInteger(tone) && tone >= -1 && tone <= 3)).toBe(true)
      }
    }
  })

  it('switches at the next unscheduled beat without losing mix, combo, mute, or clock continuity', () => {
    music.setVolume(0.27)
    music.setMuted(true)
    music.setIntensity(3)
    music.setComboRank(10)
    music.start()
    music.triggerFilterDrop(200, 5000)
    const play = vi.spyOn(music as any, 'playStep')
    advance(0.045)
    const buses = stems()
    const levels = buses.map((bus) => bus.gain.value)
    for (const index of [1, 2, 0]) {
      const before = music.debugState()
      const count = play.mock.calls.length
      music.setTrack(index)
      music.setTrack(index)
      expect(music.debugState()).toMatchObject({
        step: before.step, nextTime: before.nextTime, volume: 0.27, muted: true,
        intensity: 3, combo: 10, rank: 'ULTRA', stems: before.stems, filterDropping: true,
      })
      for (let tick = 0; tick < 16; tick++) advance(0.045)
      const calls = play.mock.calls.slice(count) as [number, number][]
      expect(calls.length).toBeGreaterThan(3)
      expect(calls[0]).toEqual([before.step, before.nextTime])
      const interval = 60 / SYNTH_TRACKS[index]!.bpm / 4
      for (let i = 1; i < calls.length; i++) {
        expect(calls[i]![0]).toBe(calls[i - 1]![0] + 1)
        expect(calls[i]![1] - calls[i - 1]![1]).toBeCloseTo(interval)
      }
      expect(stems()).toEqual(buses)
      expect(stems().map((bus) => bus.gain.value)).toEqual(levels)
      expect(music.debugState().nextTime).toBeGreaterThan(before.nextTime)
    }
    expect(Context.instances).toHaveLength(1)
    expect(ctx().close).not.toHaveBeenCalled()
    expect(ctx().resume).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)
    music.setMuted(false)
    expect(ctx().gains[0]!.gain.value).toBe(0.27)
  })

  it.each([0, 1, 2])('recovers from suspension and stale scheduling using track %s tempo', (index) => {
    music.start()
    advance(0.045)
    ctx().state = 'suspended'
    music.setTrack(index)
    const before = music.debugState()
    advance(200)
    expect(music.debugState().step).toBe(before.step)
    const play = vi.spyOn(music as any, 'playStep')
    music.start()
    advance(0.045)
    const calls = play.mock.calls as [number, number][]
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.length).toBeLessThanOrEqual(2)
    for (const [, time] of calls) expect(time).toBeGreaterThanOrEqual(ctx().currentTime)
    expect(music.debugState().nextTime).toBeGreaterThanOrEqual(ctx().currentTime + 0.16)
    expect(music.debugState().nextTime - calls.at(-1)![1]).toBeCloseTo(60 / SYNTH_TRACKS[index]!.bpm / 4)
    expect(Context.instances).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)
  })

  it.each([
    [0, [0, 4, 8, 12], 0], [1, [0, 4, 8, 12], 12], [2, [0, 6, 10], 16],
  ] as const)('plays the distinct kick and bass pattern for track %s', (index, kicks, bassNotes) => {
    music.setTrack(index)
    music.start()
    const kick = vi.spyOn(music as any, 'kick')
    const hit = vi.spyOn(music as any, 'hit')
    const bass = vi.spyOn(music as any, 'synthBass')
    for (let step = 0; step < 16; step++) music['playStep'](step, 1 + step * music['step16'])
    expect(kick.mock.calls.map(([at]) => Math.round(((at as number) - 1) / music['step16']))).toEqual(kicks)
    expect(bass).toHaveBeenCalledTimes(bassNotes)
    const snareHz = [1900, 2400, 2600][index]
    expect(hit.mock.calls.filter(([, frequency]) => frequency === snareHz)
      .map(([at]) => Math.round(((at as number) - 1) / music['step16']))).toEqual([4, 12])
    if (index === 1) {
      expect(ctx().sources.some((source) => source.frequency.exponentialRampToValueAtTime.mock.calls
        .some(([frequency, time]) => frequency === 73.42 && Math.abs(time - 1.025) < 1e-6))).toBe(true)
    }
    if (index === 2) expect(ctx().filters.some((filter) => filter.Q.value === 9 &&
      filter.frequency.exponentialRampToValueAtTime.mock.calls.length > 0)).toBe(true)
    music.dispose()
    expect(ctx().sources.every((source) => source.disconnect.mock.calls.length === 1)).toBe(true)
  })
})

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
