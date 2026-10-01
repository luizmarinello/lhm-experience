// Áudio opt-in. Nada toca sem clique do usuário (o AudioContext só nasce em enable()).
// Hoje: uma ambiência procedural (sem arquivos) que reage à velocidade do scroll,
// e um "tick" curto para microinterações. Futuras experiências podem trocar
// `ambience` por faixas/efeitos próprios mantendo a mesma interface.

export interface AudioController {
  readonly enabled: boolean
  enable(): Promise<void>
  disable(): void
  /** 0..1 — intensidade contínua (ex.: velocidade do scroll). Barato, pode ser chamado todo frame. */
  setIntensity(x: number): void
  /** Som curto de interface. */
  tick(pitch?: number): void
}

class ProceduralAudio implements AudioController {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private oscs: OscillatorNode[] = []
  enabled = false

  async enable() {
    if (!this.ctx) {
      const ctx = new AudioContext()
      const master = ctx.createGain()
      master.gain.value = 0
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 220
      filter.Q.value = 0.7
      filter.connect(master).connect(ctx.destination)
      // Drone grave: duas senoides levemente desafinadas + uma quinta bem baixa.
      for (const [f, g] of [[55, 0.5], [55.4, 0.5], [82.4, 0.18]] as const) {
        const o = ctx.createOscillator()
        const og = ctx.createGain()
        o.frequency.value = f
        og.gain.value = g
        o.connect(og).connect(filter)
        o.start()
        this.oscs.push(o)
      }
      this.ctx = ctx
      this.master = master
      this.filter = filter
    }
    await this.ctx.resume()
    this.master!.gain.setTargetAtTime(0.06, this.ctx.currentTime, 0.8)
    this.enabled = true
  }

  disable() {
    if (!this.ctx || !this.master) return
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3)
    this.enabled = false
    const ctx = this.ctx
    setTimeout(() => { if (!this.enabled) ctx.suspend() }, 1200)
  }

  setIntensity(x: number) {
    if (!this.enabled || !this.ctx || !this.filter) return
    this.filter.frequency.setTargetAtTime(220 + Math.min(1, x) * 900, this.ctx.currentTime, 0.15)
  }

  tick(pitch = 1) {
    if (!this.enabled || !this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(1400 * pitch, t)
    o.frequency.exponentialRampToValueAtTime(700 * pitch, t + 0.06)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    o.connect(g).connect(this.ctx.destination)
    o.start(t)
    o.stop(t + 0.1)
  }
}

export const audio: AudioController = new ProceduralAudio()
