import gsap from 'gsap'
import { useEffect, useRef } from 'react'
import { MathUtils } from 'three'
import { coarsePointer } from '../../core/env'
import { pointer } from '../../core/pointer'

// Cursor: um quadrado vazado que segue o ponteiro com damping. Sobre algo
// interativo, vira quatro cantos de seleção encaixados no alvo (como num CAD),
// com um microrrótulo. Objetos 3D pedem o mesmo estado via `cursor.label`.
export const cursor = { label: '' as string }

export function Cursor() {
  const el = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (coarsePointer) return
    const node = el.current!
    let target: Element | null = null
    const s = { x: innerWidth / 2, y: innerHeight / 2, w: 8, h: 8 }

    const over = (e: PointerEvent) => {
      target = (e.target as Element).closest?.('[data-cursor], a, button') ?? null
    }
    document.addEventListener('pointerover', over, { passive: true })
    document.documentElement.classList.add('has-cursor')

    let lastText = ''
    const tick = (_t: number, dms: number) => {
      const dt = Math.min(dms / 1000, 0.05)
      let x = pointer.px, y = pointer.py, w = 8, h = 8
      let text = cursor.label
      if (target && target.isConnected) {
        const r = target.getBoundingClientRect()
        x = r.left + r.width / 2
        y = r.top + r.height / 2
        w = r.width + 14
        h = r.height + 10
        text = (target as HTMLElement).dataset.cursor ?? ''
      } else if (text) {
        w = h = 30
      }
      s.x = MathUtils.damp(s.x, x, 18, dt)
      s.y = MathUtils.damp(s.y, y, 18, dt)
      s.w = MathUtils.damp(s.w, w, 14, dt)
      s.h = MathUtils.damp(s.h, h, 14, dt)
      node.style.transform = `translate3d(${(s.x - s.w / 2).toFixed(1)}px, ${(s.y - s.h / 2).toFixed(1)}px, 0)`
      node.style.width = `${s.w.toFixed(1)}px`
      node.style.height = `${s.h.toFixed(1)}px`
      node.classList.toggle('is-target', w > 8)
      node.style.opacity = pointer.active ? '1' : '0'
      if (text !== lastText) {
        lastText = text
        label.current!.textContent = text
      }
    }
    gsap.ticker.add(tick)
    return () => {
      gsap.ticker.remove(tick)
      document.removeEventListener('pointerover', over)
      document.documentElement.classList.remove('has-cursor')
    }
  }, [])

  if (coarsePointer) return null
  return (
    <div className="cursor" ref={el} aria-hidden="true">
      <i /><i /><i /><i />
      <span className="cursor__label" ref={label} />
    </div>
  )
}
