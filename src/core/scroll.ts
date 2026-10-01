import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { MathUtils } from 'three'
import { invalidate, rafMs } from './loop'

gsap.registerPlugin(ScrollTrigger)

// Fonte única de verdade do scroll. O 3D lê `smooth` (progresso amortecido)
// e `velocity` (progresso/s, com sinal); o DOM usa ScrollTriggers próprios.
export const scroll = {
  progress: 0,
  smooth: 0,
  velocity: 0,
  lenis: null as Lenis | null,
}

let last = 0

export function startScroll(story: HTMLElement): () => void {
  // Lenis respeita prefers-reduced-motion por padrão (lerp vira 1).
  const lenis = new Lenis({ autoRaf: false, lerp: 0.075, wheelMultiplier: 0.75 })
  lenis.on('scroll', ScrollTrigger.update)
  const raf = (_t: number, _d: number, _f: number, v?: unknown) => lenis.raf(rafMs(v)) // mesmo relógio do render
  gsap.ticker.add(raf, false, true) // prioridade: scroll atualizado antes do render
  gsap.ticker.lagSmoothing(0)

  const st = ScrollTrigger.create({
    trigger: story,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (s) => { scroll.progress = s.progress; invalidate() }, // modo sob demanda: scroll pede quadros
  })
  scroll.lenis = lenis
  scroll.progress = scroll.smooth = last = st.progress

  // Fontes mudam a altura do texto: recalcular as posições depois delas.
  document.fonts?.ready.then(() => ScrollTrigger.refresh())

  return () => {
    st.kill()
    gsap.ticker.remove(raf)
    lenis.destroy()
    scroll.lenis = null
  }
}

// Chamado uma vez por frame pelo loop. lambda alto = segue o scroll mais de perto.
export function updateScroll(dt: number, lambda: number) {
  scroll.smooth = MathUtils.damp(scroll.smooth, scroll.progress, lambda, dt)
  const inst = (scroll.smooth - last) / Math.max(dt, 1e-3)
  scroll.velocity = MathUtils.damp(scroll.velocity, inst, 6, dt)
  last = scroll.smooth
}

export function scrollToProgress(p: number) {
  const max = document.documentElement.scrollHeight - innerHeight
  if (scroll.lenis) {
    if (scroll.lenis.isStopped) scroll.lenis.start() // saindo do explore (página travada)
    scroll.lenis.scrollTo(p * max, { duration: 2.2 })
  }
  else scrollTo({ top: p * max, behavior: 'smooth' })
}
