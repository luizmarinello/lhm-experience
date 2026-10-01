import { useEffect, useRef } from 'react'
import { audio } from '../../core/audio'
import { Vector3 } from 'three'
import { useAnchor } from '../anchors'

// Rótulo diegético único: segue um ponto 3D com linha-guia, e o texto
// "embaralha e resolve" ao aparecer. Objetos 3D chamam hud.show/hud.hide.
const pos = new Vector3()
let el: HTMLDivElement | null = null
let current = ''
let timer = 0

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·-'

function scramble(node: Element, text: string) {
  let frame = 0
  const total = 14
  const tick = () => {
    frame++
    const k = Math.floor((frame / total) * text.length)
    let out = text.slice(0, k)
    for (let i = k; i < text.length; i++) out += text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]
    node.textContent = out
    if (frame < total) timer = requestAnimationFrame(tick)
  }
  tick()
}

export const hud = {
  show(code: string, name: string, meta: string, at: Vector3) {
    pos.copy(at)
    if (!el) return
    el.dataset.on = '1'
    el.classList.add('is-on')
    const key = code + name
    if (key === current) return
    current = key
    audio.hover()
    cancelAnimationFrame(timer)
    const [a, b, c] = el.querySelectorAll('span')
    scramble(a, code)
    b.textContent = name
    c.textContent = meta
  },
  hide() {
    current = ''
    if (!el) return
    el.classList.remove('is-on')
    el.dataset.on = '0'
  },
}

export function Hud() {
  const ref = useRef<HTMLDivElement>(null)
  useAnchor(ref, pos)
  useEffect(() => {
    el = ref.current
    return () => { el = null }
  }, [])
  return (
    <div className="hud" ref={ref} aria-hidden="true" data-on="0">
      <i className="hud__leader" />
      <div className="hud__box">
        <span className="hud__code" />
        <span className="hud__name" />
        <span className="hud__meta" />
      </div>
    </div>
  )
}
