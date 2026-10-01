// Áudio opt-in, "good vibes". Nada toca sem o visitante ligar (o AudioContext
// só nasce em enable()). Tudo procedural, sem arquivos.
//
// Base musical: escala PENTATÔNICA de Fá maior. Qualquer nota dela soa
// consonante com as outras, então toda interação vira um toque agradável.
// Timbre quente (kalimba/marimba), com reverb suave gerada por convolução.
// A ambiência é um acorde maior arejado e bem baixo — nada de drone grave.

export interface AudioController {
  readonly enabled: boolean
  enable(): Promise<void>
  disable(): void
  /** 0..1 — intensidade contínua (velocidade do scroll): abre o brilho da ambiência. */
  setIntensity(x: number): void
  /** Toque curto de interface (compat.); pitch desloca a oitava. */
  tick(pitch?: number): void
  /** Passar o mouse: nota alta e suave. */
  hover(): void
  /** Abrir/confirmar: duas notas subindo. */
  open(): void
  /** Voltar/fechar: duas notas descendo. */
  back(): void
  /** Entrar numa cena i (0..n): um sino subindo a escala. */
  scene(i: number): void
  /** Capacidade k em destaque (0..7): sobe a escala. */
  step(k: number): void
  /** Batida grave e quente (pulso do núcleo/IA). */
  pulse(): void
}

// Fá maior pentatônica: Fá, Sol, Lá, Dó, Ré (semitons a partir de Fá).
const DEG = [0, 2, 4, 7, 9]
const BASE = 174.61 // Fá3
const freq = (i: number) => {
  const oct = Math.floor(i / DEG.length)
  const deg = ((i % DEG.length) + DEG.length) % DEG.length
  return BASE * 2 ** (oct + DEG[deg] / 12)
}

class WarmAudio implements AudioController {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private dry: GainNode | null = null
  private wet: GainNode | null = null // entrada da reverb
  private padGain: GainNode | null = null
  private padFilter: BiquadFilterNode | null = null
  private oscs: OscillatorNode[] = []
  private lastHover = 0
  enabled = false

  async enable() {
    if (!this.ctx) {
      const ctx = new AudioContext()
      const master = ctx.createGain()
      master.gain.value = 0
      const comp = ctx.createDynamicsCompressor() // segura picos, soa coeso
      comp.threshold.value = -14
      comp.ratio.value = 3
      master.connect(comp).connect(ctx.destination)

      // reverb suave (impulso gerado): dá "ar" sem pesar
      const conv = ctx.createConvolver()
      conv.buffer = impulse(ctx, 1.8, 2.6)
      const wet = ctx.createGain()
      wet.gain.value = 0.9
      const wetOut = ctx.createGain()
      wetOut.gain.value = 0.32
      wet.connect(conv).connect(wetOut).connect(master)
      const dry = ctx.createGain()
      dry.connect(master)

      // ambiência: acorde Fá maior 9 arejado (médio-agudo), bem baixo
      const padFilter = ctx.createBiquadFilter()
      padFilter.type = 'lowpass'
      padFilter.frequency.value = 900
      padFilter.Q.value = 0.4
      const padGain = ctx.createGain()
      padGain.gain.value = 0
      padFilter.connect(padGain)
      padGain.connect(dry)
      padGain.connect(wet)
      // Fá3, Lá3, Dó4, Sol4 (Fadd9), com leve desafino para "vida"
      for (const [f, g, det] of [[174.61, 0.5, -4], [261.63, 0.42, 3], [349.23, 0.3, -2], [392.0, 0.22, 5]] as const) {
        const o = ctx.createOscillator()
        const og = ctx.createGain()
        o.type = 'triangle'
        o.frequency.value = f
        o.detune.value = det
        og.gain.value = g
        o.connect(og).connect(padFilter)
        o.start()
        this.oscs.push(o)
      }
      // tremolo lento no filtro: o acorde "respira"
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      lfo.frequency.value = 0.07
      lfoGain.gain.value = 220
      lfo.connect(lfoGain).connect(padFilter.frequency)
      lfo.start()
      this.oscs.push(lfo)

      this.ctx = ctx
      this.master = master
      this.dry = dry
      this.wet = wet
      this.padGain = padGain
      this.padFilter = padFilter
    }
    if (import.meta.env.DEV) {
      const an = this.ctx.createAnalyser()
      this.master!.connect(an)
      const buf = new Uint8Array(an.fftSize)
      ;(window as unknown as { __audioPeak: () => number; __audioState: () => string }).__audioPeak = () => {
        an.getByteTimeDomainData(buf)
        let m = 0
        for (const v of buf) m = Math.max(m, Math.abs(v - 128))
        return m / 128
      }
      ;(window as unknown as { __audioState: () => string }).__audioState = () => this.ctx?.state ?? 'none'
    }
    await this.ctx.resume()
    this.master!.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.6)
    this.padGain!.gain.setTargetAtTime(0.06, this.ctx.currentTime, 1.2)
    this.enabled = true
    this.arp([7, 9, 11], 0.09, 0.18) // "sino" de boas-vindas
  }

  disable() {
    if (!this.ctx || !this.master || !this.padGain) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(0, t, 0.25)
    this.padGain.gain.setTargetAtTime(0, t, 0.25)
    this.enabled = false
    const ctx = this.ctx
    setTimeout(() => { if (!this.enabled) ctx.suspend() }, 1000)
  }

  setIntensity(x: number) {
    if (!this.enabled || !this.ctx || !this.padFilter) return
    this.padFilter.frequency.setTargetAtTime(900 + Math.min(1, x) * 1400, this.ctx.currentTime, 0.2)
  }

  /** Uma nota pentatônica (marimba/kalimba): ataque rápido, cauda macia. */
  private note(i: number, { gain = 0.14, dur = 0.5, when = 0, pan = 0 } = {}) {
    const ctx = this.ctx
    if (!this.enabled || !ctx || !this.dry || !this.wet) return
    const t = ctx.currentTime + when
    const f = freq(i)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const out: AudioNode = pan ? ctx.createStereoPanner() : g
    if (pan) { (out as StereoPannerNode).pan.value = pan; g.connect(out) }
    out.connect(this.dry)
    out.connect(this.wet)
    // fundamental (triângulo) + brilho curto (seno 2ª harmônica) = corpo de marimba
    const o1 = ctx.createOscillator()
    o1.type = 'triangle'
    o1.frequency.value = f
    o1.connect(g)
    o1.start(t)
    o1.stop(t + dur + 0.05)
    const o2 = ctx.createOscillator()
    const g2 = ctx.createGain()
    o2.type = 'sine'
    o2.frequency.value = f * 2
    g2.gain.setValueAtTime(gain * 0.5, t)
    g2.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.12, dur))
    o2.connect(g2).connect(out)
    o2.start(t)
    o2.stop(t + 0.2)
  }

  private arp(degs: number[], step = 0.08, gain = 0.12) {
    degs.forEach((d, k) => this.note(d, { gain, dur: 0.6, when: k * step }))
  }

  hover() {
    // nota aguda aleatória, suave; limita a frequência para não "metralhar"
    const now = this.ctx ? this.ctx.currentTime : 0
    if (now - this.lastHover < 0.05) return
    this.lastHover = now
    const i = 10 + Math.floor(Math.random() * 5) // oitava alta
    this.note(i, { gain: 0.07, dur: 0.35, pan: (Math.random() - 0.5) * 0.5 })
  }

  open() { this.note(7, { gain: 0.13, dur: 0.5 }); this.note(9, { gain: 0.13, dur: 0.6, when: 0.07 }) }
  back() { this.note(6, { gain: 0.11, dur: 0.4 }); this.note(4, { gain: 0.11, dur: 0.5, when: 0.07 }) }
  scene(i: number) { this.note(5 + i, { gain: 0.12, dur: 0.7 }); this.note(5 + i + 2, { gain: 0.07, dur: 0.8, when: 0.09 }) }
  step(k: number) { this.note(6 + k, { gain: 0.08, dur: 0.4 }) }
  pulse() { this.note(0, { gain: 0.16, dur: 1.1 }); this.note(2, { gain: 0.09, dur: 1.0, when: 0.03 }) }
  tick(pitch = 1) { this.note(pitch > 1 ? 12 : 9, { gain: 0.1, dur: 0.4 }) }
}

/** Impulso de reverb procedural: ruído com decaimento exponencial, estéreo. */
function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = ctx.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay
  }
  return buf
}

export const audio: AudioController = new WarmAudio()
