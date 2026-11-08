/** Procedural synth SFX with stereo panning for spatial cues. */
export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private muted = false

  /** Must be called from a user gesture (click) to satisfy autoplay policy. */
  resume() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.5
      this.master.connect(this.ctx.destination)
      const len = Math.floor(this.ctx.sampleRate)
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : 0.5
  }

  debugState() {
    return { ctx: this.ctx?.state ?? 'none' }
  }

  private out(g: GainNode, pan: number) {
    if (!this.master) return
    if (pan !== 0 && this.ctx && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      g.connect(p).connect(this.master)
    } else {
      g.connect(this.master)
    }
  }

  private noise(dur: number, freq: number, q: number, vol: number, sweepTo?: number, pan = 0) {
    if (!this.ctx || !this.noiseBuf) return
    const t0 = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(freq, t0)
    filter.Q.value = q
    if (sweepTo !== undefined) filter.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    src.connect(filter).connect(g)
    this.out(g, pan)
    src.start(t0)
    src.stop(t0 + dur)
  }

  private tone(
    freq: number,
    dur: number,
    vol: number,
    type: OscillatorType,
    to?: number,
    attack = 0.002,
    pan = 0
  ) {
    if (!this.ctx) return
    const t0 = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(vol, t0 + attack)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    osc.connect(g)
    this.out(g, pan)
    osc.start(t0)
    osc.stop(t0 + dur)
  }

  // ---- player weapons ----

  gloryPing() {
    this.tone(880, 0.12, 0.16, 'triangle', 1760)
    this.tone(1760, 0.08, 0.08, 'square', 2200)
  }

  shoot() {
    this.tone(920, 0.13, 0.28, 'sawtooth', 120)
    this.tone(1840, 0.09, 0.1, 'square', 240)
    this.noise(0.04, 2800, 2, 0.22)
  }

  deagle() {
    this.tone(150, 0.3, 0.6, 'sawtooth', 36)
    this.tone(85, 0.35, 0.5, 'sine', 28)
    this.noise(0.22, 1400, 0.7, 0.55, 180)
  }

  crit() {
    this.tone(1320, 0.16, 0.32, 'sawtooth', 150)
    this.tone(2640, 0.12, 0.14, 'square', 330)
    this.noise(0.06, 3600, 2, 0.2)
  }

  hit() {
    this.tone(1250, 0.05, 0.16, 'triangle', 820)
  }

  punch() {
    this.tone(130, 0.16, 0.55, 'sine', 42)
    this.noise(0.1, 520, 0.7, 0.35, 120)
  }

  gloryKill() {
    this.tone(60, 0.4, 0.75, 'sine', 28, 0.003)
    this.tone(2400, 0.09, 0.18, 'square', 900, 0.001)
    this.tone(1320, 0.24, 0.24, 'triangle', 660, 0.001)
    if (!this.ctx || !this.noiseBuf) return
    const t0 = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.4
    filter.frequency.setValueAtTime(320, t0)
    filter.frequency.exponentialRampToValueAtTime(4200, t0 + 0.035)
    filter.frequency.exponentialRampToValueAtTime(180, t0 + 0.3)
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.001, t0)
    gain.gain.linearRampToValueAtTime(0.65, t0 + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32)
    src.connect(filter).connect(gain)
    this.out(gain, 0)
    src.onended = () => {
      src.disconnect()
      filter.disconnect()
      gain.disconnect()
    }
    src.start(t0)
    src.stop(t0 + 0.32)
  }

  phaseDash() {
    this.noise(0.18, 800, 0.9, 0.55, 120)
  }

  parryClash() {
    this.noise(0.025, 6200, 0.8, 0.45, 1800)
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const carrier = this.ctx.createOscillator()
    const modulator = this.ctx.createOscillator()
    const depth = this.ctx.createGain()
    const envelope = this.ctx.createGain()
    carrier.type = modulator.type = 'sine'
    carrier.frequency.setValueAtTime(2200, t)
    modulator.frequency.setValueAtTime(3300, t)
    depth.gain.setValueAtTime(1100, t)
    depth.gain.exponentialRampToValueAtTime(1, t + 0.3)
    envelope.gain.setValueAtTime(0.001, t)
    envelope.gain.linearRampToValueAtTime(0.35, t + 0.002)
    envelope.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
    modulator.connect(depth).connect(carrier.frequency)
    carrier.connect(envelope)
    this.out(envelope, 0)
    carrier.onended = () => {
      carrier.disconnect()
      modulator.disconnect()
      depth.disconnect()
      envelope.disconnect()
    }
    carrier.start(t)
    modulator.start(t)
    carrier.stop(t + 0.4)
    modulator.stop(t + 0.4)
  }

  slamImpact() {
    this.tone(45, 0.65, 0.8, 'sine', 24, 0.003)
    this.noise(0.42, 650, 0.55, 0.6, 70)
    this.noise(0.12, 1900, 0.7, 0.3, 260)
  }

  whoosh() {
    this.noise(0.4, 380, 0.8, 0.32, 2200)
    this.tone(180, 0.35, 0.12, 'sine', 520)
  }

  swap() {
    this.tone(700, 0.04, 0.16, 'square')
    window.setTimeout(() => this.tone(480, 0.05, 0.18, 'square'), 70)
  }

  explode(big = false, pan = 0) {
    this.tone(big ? 150 : 180, big ? 0.7 : 0.4, 0.45, 'sine', big ? 26 : 34, 0.002, pan)
    this.noise(big ? 0.8 : 0.45, big ? 480 : 900, 0.7, 0.4, big ? 60 : 110, pan)
    if (big) this.noise(1.1, 130, 0.5, 0.28, 36, pan)
  }

  hurt() {
    this.tone(150, 0.32, 0.38, 'sawtooth', 58)
    this.tone(156, 0.32, 0.32, 'sawtooth', 52)
  }

  pickup() {
    const notes = [520, 660, 880, 1320]
    notes.forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.07, 0.2, 'square'), i * 55)
    })
  }

  streak() {
    this.tone(440, 0.55, 0.28, 'sawtooth', 1760)
    this.tone(660, 0.55, 0.16, 'square', 2640)
  }

  waveStart() {
    this.tone(220, 0.12, 0.25, 'square')
    window.setTimeout(() => this.tone(330, 0.12, 0.25, 'square'), 130)
    window.setTimeout(() => this.tone(440, 0.22, 0.3, 'square'), 260)
  }

  fanfare() {
    const notes = [523, 659, 784, 1046, 1318]
    notes.forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.16, 0.22, 'square'), i * 80)
    })
    this.tone(440, 0.7, 0.12, 'sawtooth', 1760)
  }

  reload() {
    this.tone(520, 0.05, 0.16, 'square')
    window.setTimeout(() => this.tone(720, 0.05, 0.16, 'square'), 160)
    window.setTimeout(() => this.tone(420, 0.07, 0.2, 'square'), 480)
  }

  gameover() {
    const notes = [392, 311, 233, 155]
    notes.forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.3, 0.3, 'sawtooth'), i * 220)
    })
  }

  // ---- enemy sounds (panned in stereo) ----

  /** Enemy pulse-bolt shot. */
  eshot(pan = 0) {
    this.tone(760, 0.09, 0.12, 'square', 190, 0.002, pan)
  }

  /** Brawler screech. */
  screech(pan = 0) {
    this.tone(320, 0.3, 0.2, 'sawtooth', 1250, 0.002, pan)
  }

  /** Enforcer shotgun blast. */
  shotgun(pan = 0) {
    this.noise(0.28, 900, 0.6, 0.45, 130, pan)
    this.tone(110, 0.25, 0.4, 'sawtooth', 38, 0.002, pan)
  }

  /** Marksman charge beep + fire crack. */
  charge(pan = 0) {
    this.tone(880, 0.07, 0.14, 'square', undefined, 0.002, pan)
    window.setTimeout(() => this.tone(1180, 0.07, 0.14, 'square', undefined, 0.002, pan), 260)
  }

  sniper(pan = 0) {
    this.noise(0.2, 3000, 1.2, 0.45, 300, pan)
    this.tone(220, 0.25, 0.35, 'sawtooth', 55, 0.002, pan)
  }

  /** Boss roar. */
  roar(pan = 0) {
    this.tone(55, 0.9, 0.5, 'sawtooth', 38, 0.05, pan)
    this.noise(0.7, 300, 0.6, 0.35, 60, pan)
  }
}
