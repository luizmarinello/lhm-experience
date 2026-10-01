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

export function startLoop(onSlow: () => boolean): () => void {
  let lastRender = -1
  let measureFrom = gsap.ticker.time + WARMUP
  let frames = 0
  let windowStart = 0
  let hiccup = false

  const tick = (time: number, deltaMs: number) => {
    if (deltaMs > 250) hiccup = true // aba voltou do segundo plano, GC longo etc.
    if (loop.demand && loop.dirty <= 0) return
    if (lastRender >= 0 && time - lastRender < 0.92 / loop.maxFps) return
    lastRender = time
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
