/** One decoded, sample-accurate loop; the app retains synthesis on any load failure. */
export class StudioLoop {
  private gain: GainNode
  private source: AudioBufferSourceNode | null = null
  private abort = new AbortController()
  private enabled = false
  private intensity = 0
  private state: 'idle' | 'loading' | 'playing' | 'failed' | 'disposed' = 'idle'

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly onChange: () => void,
  ) {
    this.gain = ctx.createGain()
    this.gain.gain.value = 0
    this.gain.connect(destination)
  }

  get active(): boolean { return this.enabled && this.state === 'playing' }

  debugState() { return { state: this.state, active: this.active } }

  setEnabled(enabled: boolean) {
    if (this.state === 'disposed') return
    this.enabled = enabled
    this.applyGain()
    if (enabled && this.state === 'idle') void this.load()
  }

  setIntensity(intensity: number) {
    this.intensity = intensity
    this.applyGain()
  }

  private applyGain() {
    if (this.state === 'disposed') return
    const now = this.ctx.currentTime
    const param = this.gain.gain
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now)
    else {
      const value = param.value
      param.cancelScheduledValues(now)
      param.setValueAtTime(value, now)
    }
    const volume = this.intensity === 0 ? 0.18 : this.intensity === 1 ? 0.4 : 0.55
    param.setTargetAtTime(this.active ? volume : 0, now, 0.12)
  }

  private async load() {
    this.state = 'loading'
    try {
      const response = await fetch('/audio/bgm_combat.ogg?v=combat-suite-1', { signal: this.abort.signal })
      if (this.abort.signal.aborted) return
      if (!response.ok) throw new Error(`Soundtrack HTTP ${response.status}`)
      const encoded = await response.arrayBuffer()
      if (this.abort.signal.aborted) return
      const buffer = await this.ctx.decodeAudioData(encoded)
      if (this.abort.signal.aborted) return
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.loopStart = 0
      source.loopEnd = buffer.duration
      source.connect(this.gain)
      source.start()
      this.source = source
      this.state = 'playing'
      this.applyGain()
      this.onChange()
    } catch {
      if (this.abort.signal.aborted) return
      this.state = 'failed'
      this.onChange()
    }
  }

  dispose() {
    if (this.state === 'disposed') return
    this.state = 'disposed'
    this.abort.abort()
    if (this.source) {
      try { this.source.stop() } catch { /* Already stopped. */ }
      this.source.disconnect()
      this.source = null
    }
    this.gain.disconnect()
  }
}
