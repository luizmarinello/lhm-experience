import gsap from 'gsap'
import { advance } from '@react-three/fiber'

// Um único rAF para tudo: o ticker do GSAP move o Lenis (prioridade) e depois
// avança o R3F (Canvas com frameloop="never"). Isso dá, com pouco código:
// - teto de FPS (maxFps) para aparelhos fracos;
// - modo "sob demanda" (reduced motion): só desenha quando algo mudou;
// - medição de FPS para rebaixar a qualidade uma vez, sem oscilar.
export const loop = {
  maxFps: 120,
  demand: false,
  dirty: 60,
  frames: 0,
}

export function invalidate(frames = 45) {
  loop.dirty = Math.max(loop.dirty, frames)
}

const WARMUP = 2.5 // s antes de medir (compilação de shader, fontes)
const WINDOW = 2 // s por janela de medição
const SLOW_FPS = 42

// Relógio do quadro: o timestamp do rAF (alinhado ao vsync, com fração de ms),
// que o ticker do GSAP repassa como 4º argumento. O tempo do próprio GSAP é
// Date.now (ms inteiros, lido quando o callback roda): num limite de FPS por
// tempo ele pula quadros de forma irregular em telas de 120–165 Hz (tremor).
export const rafMs = (v?: unknown) => (typeof v === 'number' && v > 2 ? v : performance.now())

export function startLoop(onSlow: () => boolean): () => void {
  let prev = -1
  let vsync = 0
  let hz = 60
  const gaps: number[] = []
  let measureFrom = performance.now() / 1000 + WARMUP
  let frames = 0
  let windowStart = 0
  let hiccup = false

  const tick = (_t: number, _d: number, _f: number, v?: unknown) => {
    const ms = rafMs(v)
    const deltaMs = prev < 0 ? 0 : ms - prev
    prev = ms
    // frequência da tela: mediana dos primeiros 48 intervalos do rAF
    if (deltaMs > 0 && gaps.length < 48) {
      gaps.push(deltaMs)
      if (gaps.length === 48) hz = 1000 / gaps.slice().sort((a, b) => a - b)[24]
    }
    if (deltaMs > 250) hiccup = true // aba voltou do segundo plano, GC longo etc.
    if (loop.demand && loop.dirty <= 0) return
    // teto de FPS em múltiplos inteiros do vsync: tela de 144 Hz com teto 120 desenha
    // 1 de cada 2 vsyncs (72 fps constantes) em vez de alternar 1 e 2 (anda-trava)
    const every = Math.max(1, Math.ceil(hz / loop.maxFps - 0.05))
    if (++vsync % every !== 0) return
    const time = ms / 1000
    loop.dirty = Math.max(0, loop.dirty - 1)
    advance(time)
    loop.frames++

    if (loop.demand || time < measureFrom) return
    if (frames === 0) { windowStart = time; hiccup = false }
    frames++
    const span = time - windowStart
    if (span < WINDOW) return
    const fps = (frames - 1) / span
    frames = 0
    if (hiccup) return
    // onSlow devolve false quando já está no nível mais baixo: para de medir.
    if (fps < SLOW_FPS) measureFrom = onSlow() ? time + WARMUP : Infinity
  }

  gsap.ticker.add(tick)
  return () => gsap.ticker.remove(tick)
}

if (import.meta.env.DEV) (window as unknown as { __loop: typeof loop }).__loop = loop
