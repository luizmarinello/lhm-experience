import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { createElement, useEffect, useRef, type ReactNode } from 'react'
import { reducedMotion } from '../../core/env'
import { scroll } from '../../core/scroll'
import { window01 } from '../tracks'

gsap.registerPlugin(SplitText)

// "Todo texto nasce de uma linha": uma linha de base de 1px se desenha e os
// caracteres sobem de dentro dela. A timeline é controlada pelo progresso do
// scroll dentro de [from, to] (em %), então entrar e sair são o mesmo gesto
// tocado nos dois sentidos. O texto real fica no DOM (SplitText mantém aria-label).
interface Props {
  as?: 'div' | 'h1' | 'h2' | 'p' | 'span'
  range: [number, number]
  fade?: number // % de scroll para entrar/sair
  className?: string
  line?: boolean
  children: ReactNode
}

export function Reveal({ as = 'div', range, fade = 2.5, className, line = true, children }: Props) {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = root.current!
    const text = el.querySelector<HTMLElement>('.reveal__text')!
    const base = el.querySelector<HTMLElement>('.reveal__line')
    let tl: gsap.core.Timeline | null = null
    const split = SplitText.create(text, {
      type: 'chars,words',
      mask: 'chars',
      autoSplit: true,
      onSplit(self) {
        tl?.kill()
        tl = gsap.timeline({ paused: true })
        if (base) tl.fromTo(base, { scaleX: 0 }, { scaleX: 1, duration: 0.24, ease: 'power2.inOut' }, 0)
        tl.from(self.chars, { yPercent: 115, duration: 0.5, ease: 'power3.out', stagger: { amount: Math.min(0.6, self.chars.length * 0.03) } }, base ? 0.18 : 0)
        return tl
      },
    })

    let last = -1
    const tick = () => {
      const t = window01(scroll.smooth * 100, range[0], range[1], fade)
      const v = reducedMotion ? (t > 0.5 ? 1 : 0) : t
      if (v === last) return
      last = v
      el.dataset.on = v > 0 ? '1' : '0'
      el.style.visibility = v > 0 ? '' : 'hidden'
      tl?.progress(v)
    }
    gsap.ticker.add(tick)
    tick()
    return () => {
      gsap.ticker.remove(tick)
      tl?.kill()
      split.revert()
    }
  }, [range[0], range[1], fade]) // eslint-disable-line react-hooks/exhaustive-deps

  return createElement(
    as,
    { ref: root, className: `reveal ${className ?? ''}` },
    line ? <span className="reveal__line" aria-hidden="true" /> : null,
    <span className="reveal__text">{children}</span>,
  )
}
