/**
 * Original dark synthwave / electro score, generated live with WebAudio.
 * One continuous lookahead-scheduled loop — never restarts, never stutters.
 * Intensity levels morph the mix through a master low-pass filter and add
 * layers (pads → drums/bass → arps → lead), which doubles as the crossfade
 * between menu, intermission and combat states.
 */

type Intensity = 0 | 1 | 2 | 3

export const MUSIC_CREDIT = 'Original Cyberpunk Synth Tracks — generated live with WebAudio'

export interface SynthTrackInfo {
  id: string
  name: string
  genre: string
  bpm: number
}

export interface SynthTrack extends SynthTrackInfo {
  progA: ReadonlyArray<readonly [number, number, number, number]>
  progB: ReadonlyArray<readonly [number, number, number, number]>
  lead: ReadonlyArray<ReadonlyArray<number>>
  rhythm: 'synthwave' | 'industrial' | 'breakbeat'
}

// Two 4-bar sections: A (Am Am F G) and B (Am Am F E) for a darker pull.
const PROG_A: ReadonlyArray<readonly [number, number, number, number]> = [
  [110.0, 130.81, 164.81, 220.0], // Am
  [110.0, 130.81, 164.81, 220.0], // Am
  [87.31, 110.0, 130.81, 174.61], // F
  [98.0, 123.47, 146.83, 196.0], // G
]
const PROG_B: ReadonlyArray<readonly [number, number, number, number]> = [
  [110.0, 130.81, 164.81, 220.0], // Am
  [110.0, 130.81, 164.81, 220.0], // Am
  [87.31, 110.0, 130.81, 174.61], // F
  [82.41, 103.83, 123.47, 164.81], // E
]

// Lead melody as chord-tone indices (-1 = rest), one pattern per bar.
const LEAD: ReadonlyArray<ReadonlyArray<number>> = [
  [0, -1, -1, 2, -1, -1, 1, -1, -1, 3, -1, 2, -1, 1, -1, -1],
  [-1, -1, 2, -1, 3, -1, -1, 1, -1, 2, -1, -1, 0, -1, -1, -1],
  [3, -1, -1, 2, -1, -1, 1, -1, 2, -1, -1, 0, -1, -1, 1, -1],
  [-1, 2, -1, -1, 3, -1, 2, -1, -1, 1, -1, 0, -1, -1, -1, -1],
]

export const SYNTH_TRACKS: ReadonlyArray<Readonly<SynthTrack>> = [
  {
    id: 'bay-bridge-runner', name: 'BAY BRIDGE RUNNER', genre: 'Synthwave', bpm: 116,
    progA: PROG_A, progB: PROG_B, lead: LEAD, rhythm: 'synthwave',
  },
  {
    id: 'hotline-midnight', name: 'HOTLINE MIDNIGHT', genre: 'Darksynth / EBM', bpm: 128,
    progA: [
      [73.42, 87.31, 110.0, 146.83], [58.27, 73.42, 87.31, 116.54],
      [49.00, 58.27, 73.42, 98.00], [55.00, 69.30, 82.41, 110.00],
    ],
    progB: [
      [73.42, 87.31, 110.0, 146.83], [58.27, 73.42, 87.31, 116.54],
      [49.00, 58.27, 73.42, 98.00], [69.30, 87.31, 103.83, 138.59],
    ],
    lead: [
      [0, -1, 0, 3, -1, 2, 0, -1, 0, 1, -1, 3, 2, -1, 1, 0],
      [0, 0, -1, 2, -1, 3, 2, -1, 1, -1, 0, 3, -1, 2, 1, -1],
      [3, -1, 2, 0, 1, -1, 0, -1, 3, 2, -1, 1, 0, -1, 2, 3],
      [0, -1, 1, 2, 3, -1, 2, 1, 0, 0, -1, 3, 2, 1, 0, -1],
    ],
    rhythm: 'industrial',
  },
  {
    id: 'cyber-overdrive', name: 'CYBER OVERDRIVE', genre: 'Acid Breakbeat / Neuro', bpm: 140,
    progA: [
      [82.41, 98.00, 123.47, 164.81], [65.41, 82.41, 98.00, 130.81],
      [49.00, 61.74, 73.42, 98.00], [73.42, 92.50, 110.00, 146.83],
    ],
    progB: [
      [82.41, 98.00, 123.47, 164.81], [65.41, 82.41, 98.00, 130.81],
      [55.00, 65.41, 82.41, 110.00], [61.74, 77.78, 92.50, 123.47],
    ],
    lead: [
      [0, 1, 2, -1, 3, 2, 1, 2, 3, -1, 2, 3, 1, 2, 0, -1],
      [2, 3, -1, 2, 1, 2, 3, -1, 0, 1, 2, 3, 2, -1, 1, 3],
      [3, 2, 1, 0, -1, 1, 2, 3, 2, 3, -1, 2, 1, 0, 1, 2],
      [1, 2, 3, -1, 2, 1, 0, 1, 2, -1, 3, 2, 3, 1, 2, 3],
    ],
    rhythm: 'breakbeat',
  },
]

const FILTER_CUT: ReadonlyArray<number> = [420, 900, 2600, 6500]

type Stem = 'pad' | 'drum' | 'bass' | 'arp' | 'lead'
type Mix = Record<Stem, number>

export class SynthMusic {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private lp: BiquadFilterNode | null = null
  private padGain: GainNode | null = null
  private drumGain: GainNode | null = null
  private bassGain: GainNode | null = null
  private arpGain: GainNode | null = null
  private leadGain: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private sources = new Map<AudioScheduledSourceNode, AudioNode[]>()
  private timer = 0
  private step = 0
  private nextT = 0
  private currentTrackIndex = 0
  private step16 = 60 / SYNTH_TRACKS[0]!.bpm / 4
  private intensity: Intensity = 0
  private combo = 0
  private volume = 0.6
  private muted = false
  private unlocked = false
  private disposed = false
  private filterDropUntil = 0
  private filterDropHz = 360

  getTracks(): SynthTrackInfo[] {
    return SYNTH_TRACKS.map(({ id, name, genre, bpm }) => ({ id, name, genre, bpm }))
  }

  getCurrentTrack(): SynthTrackInfo {
    const { id, name, genre, bpm } = SYNTH_TRACKS[this.currentTrackIndex]!
    return { id, name, genre, bpm }
  }

  getCurrentTrackIndex(): number {
    return this.currentTrackIndex
  }

  setTrack(index: number): void {
    if (!Number.isFinite(index)) return
    const length = SYNTH_TRACKS.length
    this.currentTrackIndex = ((Math.trunc(index) % length) + length) % length
    this.step16 = 60 / SYNTH_TRACKS[this.currentTrackIndex]!.bpm / 4
    // Keep the next unscheduled beat and musical phase intact. Already queued
    // voices finish naturally; subsequent beats use the new tempo on this clock.
  }

  nextTrack(): SynthTrackInfo {
    this.setTrack(this.currentTrackIndex + 1)
    return this.getCurrentTrack()
  }

  /** Must be called from a user gesture (start button). */
  start() {
    if (this.disposed || typeof window === 'undefined') return
    if (!this.ctx) {
      const Ctor = window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0
      this.master.connect(this.ctx.destination)
      this.lp = this.ctx.createBiquadFilter()
      this.lp.type = 'lowpass'
      this.lp.frequency.value = FILTER_CUT[this.intensity]!
      this.lp.Q.value = 0.4
      this.lp.connect(this.master)
      const stem = () => {
        const gain = this.ctx!.createGain()
        gain.connect(this.lp!)
        return gain
      }
      this.padGain = stem()
      this.drumGain = stem()
      this.bassGain = stem()
      this.arpGain = stem()
      this.leadGain = stem()
      this.applyMix(true)

      const len = Math.floor(this.ctx.sampleRate)
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

      const amb = this.ctx.createBufferSource()
      amb.buffer = this.noiseBuf
      amb.loop = true
      const ambFilter = this.ctx.createBiquadFilter()
      ambFilter.type = 'bandpass'
      ambFilter.frequency.value = 240
      ambFilter.Q.value = 0.6
      const ambGain = this.ctx.createGain()
      ambGain.gain.value = 0.018
      amb.connect(ambFilter).connect(ambGain).connect(this.padGain)
      this.track(amb, [ambFilter, ambGain])
      amb.start()

      this.nextT = this.ctx.currentTime + 0.1
      this.timer = window.setInterval(() => this.schedule(), 45)
    }
    this.unlocked = true
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {})
    this.ramp(this.master!.gain, this.muted ? 0 : this.volume, 0.2)
  }

  /** 0 = muffled ambience, 1 = groove, 2 = combat, 3 = full brightness. */
  setIntensity(i: Intensity) {
    if (i === this.intensity) return
    this.intensity = i
    this.applyMix()
    this.applyFilter()
  }

  setComboRank(combo: number) {
    const next = Number.isFinite(combo) ? Math.max(0, Math.floor(combo)) : 0
    if (next === this.combo) return
    this.combo = next
    this.applyMix()
  }

  triggerFilterDrop(targetHz = 360, durationMs = 180) {
    if (!this.ctx || !this.lp) return
    this.filterDropHz = Number.isFinite(targetHz) ? Math.max(20, targetHz) : 360
    this.filterDropUntil = this.ctx.currentTime + Math.max(20, Number.isFinite(durationMs) ? durationMs : 180) / 1000
    this.applyFilter()
  }

  setVolume(v: number) {
    if (!Number.isFinite(v)) return
    this.volume = Math.max(0, Math.min(1, v))
    if (this.master) this.ramp(this.master.gain, this.muted ? 0 : this.volume, 0.08)
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master) this.ramp(this.master.gain, m ? 0 : this.volume, 0.08)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.unlocked = false
    if (typeof window !== 'undefined') window.clearInterval(this.timer)
    this.timer = 0
    for (const source of [...this.sources.keys()]) {
      try { source.stop() } catch { /* A scheduled voice may already have ended. */ }
      this.release(source)
    }
    for (const gain of Object.values(this.stems())) gain?.disconnect()
    this.lp?.disconnect()
    this.master?.disconnect()
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => {})
    this.ctx = null
    this.lp = this.master = null
    this.padGain = this.drumGain = this.bassGain = this.arpGain = this.leadGain = null
    this.noiseBuf = null
  }

  debugState() {
    const currentTrack = this.getCurrentTrack()
    return {
      trackIndex: this.currentTrackIndex, trackName: currentTrack.name, bpm: currentTrack.bpm,
      ctx: this.ctx?.state ?? 'none', step: this.step, nextTime: this.nextT,
      intensity: this.intensity, combo: this.combo,
      rank: this.combo >= 10 ? 'ULTRA' : this.combo >= 5 ? 'S' : this.combo >= 3 ? 'B' : this.combo >= 2 ? 'C' : 'D',
      time: this.ctx?.currentTime ?? 0, volume: this.volume, muted: this.muted,
      stems: this.mix(), cutoff: FILTER_CUT[this.intensity]!,
      filterDropping: !!this.ctx && this.ctx.currentTime < this.filterDropUntil,
      activeSources: this.sources.size, disposed: this.disposed,
    }
  }

  private stems(): Record<Stem, GainNode | null> {
    return { pad: this.padGain, drum: this.drumGain, bass: this.bassGain, arp: this.arpGain, lead: this.leadGain }
  }

  private mix(): Mix {
    const active = this.intensity > 0
    return {
      pad: active ? 0.7 : 1,
      drum: active ? (this.combo >= 2 ? 1 : 0.75) : 0,
      bass: active ? (this.combo >= 5 ? 1.35 : 1) : 0.5,
      arp: active ? (this.combo >= 5 ? 1 : this.combo >= 2 ? 0.7 : 0.16) : 0.06,
      lead: active && this.combo >= 5 ? (this.combo >= 10 ? 1.2 : 1) : 0,
    }
  }

  private applyMix(immediate = false) {
    const mix = this.mix()
    for (const [name, gain] of Object.entries(this.stems())) {
      if (!gain) continue
      if (immediate) gain.gain.value = mix[name as Stem]
      else this.ramp(gain.gain, mix[name as Stem], 0.08)
    }
  }

  private hold(param: AudioParam, at: number) {
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at)
    else {
      const value = param.value
      param.cancelScheduledValues(at)
      param.setValueAtTime(value, at)
    }
  }

  private ramp(param: AudioParam, value: number, tau: number) {
    if (!this.ctx) return
    this.hold(param, this.ctx.currentTime)
    param.setTargetAtTime(value, this.ctx.currentTime, tau)
  }

  private applyFilter() {
    if (!this.ctx || !this.lp) return
    const now = this.ctx.currentTime
    const frequency = this.lp.frequency
    const target = FILTER_CUT[this.intensity]!
    this.hold(frequency, now)
    if (now < this.filterDropUntil) {
      const dip = Math.min(this.filterDropHz, target)
      frequency.linearRampToValueAtTime(dip, Math.min(now + 0.02, this.filterDropUntil))
      frequency.setValueAtTime(dip, this.filterDropUntil)
      frequency.setTargetAtTime(target, this.filterDropUntil, 0.16)
    } else frequency.setTargetAtTime(target, now, 0.9)
  }

  private schedule() {
    if (!this.ctx || this.ctx.state !== 'running' || !this.unlocked) return
    // A background tab can miss whole bars. Skip stale beats without resetting phase
    // or scheduling hundreds of voices at once in the past.
    if (this.nextT < this.ctx.currentTime) {
      const missed = Math.ceil((this.ctx.currentTime - this.nextT) / this.step16)
      this.step += missed
      this.nextT += missed * this.step16
    }
    while (this.nextT < this.ctx.currentTime + 0.16) {
      this.playStep(this.step, this.nextT)
      this.step++
      this.nextT += this.step16
    }
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    this.sources.set(source, nodes)
    source.onended = () => this.release(source)
  }

  private release(source: AudioScheduledSourceNode) {
    source.onended = null
    source.disconnect()
    for (const node of this.sources.get(source) ?? []) node.disconnect()
    this.sources.delete(source)
  }

  private voice(
    stem: GainNode | null, freq: number, dur: number, vol: number,
    type: OscillatorType, at: number, attack = 0.004, detune = 0
  ) {
    if (!this.ctx || !stem) return
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    osc.detune.value = detune
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(vol, at + attack)
    g.gain.exponentialRampToValueAtTime(0.001, at + dur)
    osc.connect(g).connect(stem)
    this.track(osc, [g])
    osc.start(at)
    osc.stop(at + dur + 0.05)
  }

  private kick(at: number, industrial = false) {
    if (!this.ctx || !this.drumGain) return
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(industrial ? 220 : 160, at)
    osc.frequency.exponentialRampToValueAtTime(industrial ? 38 : 42, at + (industrial ? 0.09 : 0.14))
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.7, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.22)
    osc.connect(g).connect(this.drumGain)
    this.track(osc, [g])
    osc.start(at)
    osc.stop(at + 0.26)
    if (industrial) this.hit(at, 3200, 0.8, 0.08, 0.018)
  }

  private hit(at: number, freq: number, q: number, vol: number, dur: number) {
    if (!this.ctx || !this.drumGain || !this.noiseBuf) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    filter.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + dur)
    src.connect(filter).connect(g).connect(this.drumGain)
    this.track(src, [filter, g])
    src.start(at)
    src.stop(at + dur + 0.02)
  }

  private synthBass(freq: number, at: number, acid: boolean, accent: boolean) {
    if (!this.ctx || !this.bassGain) return
    const dur = this.step16 * (acid ? 0.9 : 0.6)
    const osc = this.ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(acid ? freq : freq * 1.8, at)
    if (!acid) osc.frequency.exponentialRampToValueAtTime(freq, at + 0.025)
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = acid ? 9 : 1.5
    filter.frequency.setValueAtTime(acid ? (accent ? 4200 : 1800) : 1300, at)
    filter.frequency.exponentialRampToValueAtTime(acid ? 180 : 100, at + dur)
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.linearRampToValueAtTime(acid ? (accent ? 0.07 : 0.05) : 0.16, at + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur)
    osc.connect(filter).connect(gain).connect(this.bassGain)
    this.track(osc, [filter, gain])
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  private playStep(step: number, t: number) {
    const track = SYNTH_TRACKS[this.currentTrackIndex]!
    const s16 = step % 16
    const bar = Math.floor(step / 16) % 4
    const section = Math.floor(step / 64) % 2
    const chord = (section === 0 ? track.progA : track.progB)[bar]!

    // Every stem keeps its musical phase, even while its bus is muted.
    if (track.rhythm === 'synthwave') {
      if (s16 % 4 === 0) this.kick(t)
      if (s16 === 4 || s16 === 12) this.hit(t, 1900, 1.2, 0.22, 0.09)
      if (s16 % 2 === 0) this.hit(t, 8200, 1.5, 0.07, 0.03)
      if (this.combo >= 5 && s16 % 4 === 2) this.hit(t, 8200, 1.5, 0.05, 0.06)
      if (s16 % 2 === 0) {
        this.voice(this.bassGain, chord[0] / 2 * (s16 % 8 === 6 ? 2 : 1), 0.16, 0.16, 'sawtooth', t)
      }
    } else if (track.rhythm === 'industrial') {
      if (s16 % 4 === 0) this.kick(t, true)
      if (s16 === 4 || s16 === 12) {
        this.hit(t, 2400, 3.5, 0.2, 0.1)
        this.hit(t + 0.012, 4200, 5, 0.1, 0.055)
        this.voice(this.drumGain, 185, 0.06, 0.07, 'triangle', t)
      }
      if (s16 % 4 >= 2) this.hit(t, 9600, 2, s16 % 2 === 0 ? 0.07 : 0.04, 0.025)
      if (s16 % 8 !== 4 && s16 % 8 !== 7) {
        this.synthBass(chord[0] * (s16 % 8 === 3 ? 2 : 1), t, false, false)
      }
    } else {
      if (s16 === 0 || s16 === 6 || s16 === 10) this.kick(t)
      if (s16 === 4 || s16 === 12) this.hit(t, 2600, 1.8, 0.2, 0.065)
      this.hit(t, 8800, 1.5, s16 % 2 === 0 ? 0.055 : 0.025, 0.02)
      const tone = s16 % 4 === 3 ? chord[2] : chord[0]
      this.synthBass(tone * (s16 % 8 === 6 ? 2 : 1), t, true, s16 % 4 === 2)
    }
    if (s16 === 0) {
      for (const f of chord) this.voice(this.padGain, f, this.step16 * 16 + 0.03, 0.04, 'sawtooth', t, 0.5)
    }
    const arpF = chord[(step * 3) % 4]! * (s16 % 8 < 4 ? 2 : 4)
    this.voice(this.arpGain, arpF, 0.07, 0.05, 'square', t)

    const idx = track.lead[bar]![s16] ?? -1
    if (idx >= 0) {
      const f = chord[idx]! * (track.rhythm === 'breakbeat' ? 4 : 2)
      const dur = track.rhythm === 'synthwave' ? 0.16 : this.step16 * 0.9
      this.voice(this.leadGain, f, dur, 0.07, 'sawtooth', t, 0.008, -6)
      this.voice(this.leadGain, f, dur, 0.05, 'sawtooth', t, 0.008, 6)
    }
  }
}
