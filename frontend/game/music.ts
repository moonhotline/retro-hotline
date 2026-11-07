/**
 * Original dark synthwave / electro score, generated live with WebAudio.
 * One continuous lookahead-scheduled loop — never restarts, never stutters.
 * Intensity levels morph the mix through a master low-pass filter and add
 * layers (pads → drums/bass → arps → lead), which doubles as the crossfade
 * between menu, intermission and combat states.
 */

type Intensity = 0 | 1 | 2 | 3

export const MUSIC_CREDIT = 'Original Dark Synthwave — generated live with WebAudio'

const BPM = 116
const STEP16 = 60 / BPM / 4

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

const FILTER_CUT: ReadonlyArray<number> = [420, 900, 2600, 6500]

export class SynthMusic {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private lp: BiquadFilterNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private timer = 0
  private step = 0
  private nextT = 0
  private intensity: Intensity = 0
  private muted = false
  private unlocked = false

  /** Must be called from a user gesture (start button). */
  start() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0
      this.master.connect(this.ctx.destination)

      this.lp = this.ctx.createBiquadFilter()
      this.lp.type = 'lowpass'
      this.lp.frequency.value = FILTER_CUT[0] as number
      this.lp.Q.value = 0.4
      this.lp.connect(this.master)

      const len = Math.floor(this.ctx.sampleRate)
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

      // Constant city-hum ambience through its own filtered voice
      const amb = this.ctx.createBufferSource()
      amb.buffer = this.noiseBuf
      amb.loop = true
      const ambFilter = this.ctx.createBiquadFilter()
      ambFilter.type = 'bandpass'
      ambFilter.frequency.value = 240
      ambFilter.Q.value = 0.6
      const ambGain = this.ctx.createGain()
      ambGain.gain.value = 0.018
      amb.connect(ambFilter).connect(ambGain).connect(this.lp)
      amb.start()

      this.nextT = this.ctx.currentTime + 0.1
      this.timer = window.setInterval(() => this.schedule(), 45)
    }
    this.unlocked = true
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    this.master?.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.4)
  }

  /** 0 = muffled ambience, 1 = groove, 2 = combat, 3 = full lead chaos. */
  setIntensity(i: Intensity) {
    this.intensity = i
    this.lp?.frequency.setTargetAtTime(FILTER_CUT[i] as number, this.ctx?.currentTime ?? 0, 0.9)
  }

  setMuted(m: boolean) {
    this.muted = m
    this.master?.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx?.currentTime ?? 0, 0.2)
  }

  dispose() {
    window.clearInterval(this.timer)
    void this.ctx?.close()
    this.ctx = null
  }

  debugState() {
    return {
      ctx: this.ctx?.state ?? 'none',
      step: this.step,
      intensity: this.intensity,
      time: this.ctx?.currentTime ?? 0,
    }
  }

  private schedule() {
    if (!this.ctx || this.ctx.state !== 'running' || !this.unlocked) return
    while (this.nextT < this.ctx.currentTime + 0.16) {
      this.playStep(this.step, this.nextT)
      this.step = (this.step + 1) % 1024
      this.nextT += STEP16
    }
  }

  private voice(
    freq: number,
    dur: number,
    vol: number,
    type: OscillatorType,
    at: number,
    attack = 0.004,
    detune = 0
  ) {
    if (!this.ctx || !this.lp) return
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    osc.detune.value = detune
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(vol, at + attack)
    g.gain.exponentialRampToValueAtTime(0.001, at + dur)
    osc.connect(g).connect(this.lp)
    osc.start(at)
    osc.stop(at + dur + 0.05)
  }

  private kick(at: number) {
    if (!this.ctx || !this.lp) return
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, at)
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.14)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.7, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.22)
    osc.connect(g).connect(this.lp)
    osc.start(at)
    osc.stop(at + 0.26)
  }

  private hit(at: number, freq: number, q: number, vol: number, dur: number) {
    if (!this.ctx || !this.lp || !this.noiseBuf) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    filter.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + dur)
    src.connect(filter).connect(g).connect(this.lp)
    src.start(at)
    src.stop(at + dur + 0.02)
  }

  private playStep(step: number, t: number) {
    const I = this.intensity
    const s16 = step % 16
    const bar = Math.floor(step / 16) % 4
    const section = Math.floor(step / 64) % 2
    const chord = (section === 0 ? PROG_A : PROG_B)[bar] as readonly [number, number, number, number]

    // Drums (from intensity 1)
    if (I >= 1) {
      if (s16 % 4 === 0) this.kick(t)
      if (s16 === 4 || s16 === 12) this.hit(t, 1900, 1.2, 0.22, 0.09)
      if (s16 % 2 === 0) this.hit(t, 8200, 1.5, 0.07, 0.03)
      if (I >= 3 && s16 % 4 === 2) this.hit(t, 8200, 1.5, 0.05, 0.06)
    }

    // Bass: muffled heartbeat at ambience, driving 8ths in combat
    if (I === 0) {
      if (s16 === 0) this.voice(chord[0] / 2, 1.6, 0.1, 'sawtooth', t, 0.3)
    } else if (s16 % 2 === 0) {
      this.voice(chord[0] / 2 * (s16 % 8 === 6 ? 2 : 1), 0.16, 0.16, 'sawtooth', t)
    }

    // Pad: always breathing underneath
    if (s16 === 0) {
      for (const f of chord) this.voice(f, 2.1, I === 0 ? 0.05 : 0.028, 'sawtooth', t, 0.5)
    }

    // Arps from intensity 1, brighter at 2+
    if (I >= 1) {
      const arpF = (chord[(step * 3) % 4] ?? chord[0]) * (s16 % 8 < 4 ? 2 : 4)
      this.voice(arpF, 0.07, I >= 2 ? 0.05 : 0.035, 'square', t)
    }

    // Lead melody only at full intensity
    if (I >= 3) {
      const pat = LEAD[bar] as ReadonlyArray<number>
      const idx = pat[s16] ?? -1
      if (idx >= 0) {
        const f = chord[idx] ?? chord[0] as number
        this.voice(f * 2, 0.16, 0.07, 'sawtooth', t, 0.008, -6)
        this.voice(f * 2, 0.16, 0.05, 'sawtooth', t, 0.008, 6)
      }
    }
  }
}
