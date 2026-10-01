import { useEffect, type RefObject } from 'react'
import { Vector3, type Camera } from 'three'

// Rótulos DOM presos a pontos 3D (HUD diegético). O texto continua no DOM
// (selecionável, lido por leitor de tela); só a posição vem do 3D.
// Uma passada por frame, escrevendo apenas `transform` — nada de layout no loop.
interface Anchor {
  el: HTMLElement
  pos: Vector3
}

const anchors = new Set<Anchor>()
const v = new Vector3()

export function useAnchor(ref: RefObject<HTMLElement | null>, pos: Vector3) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const a = { el, pos }
    anchors.add(a)
    return () => { anchors.delete(a) }
  }, [ref, pos])
}

export function updateAnchors(camera: Camera, w: number, h: number) {
  for (const a of anchors) {
    if (a.el.dataset.on !== '1') continue // só a cena ativa paga o custo
    v.copy(a.pos).project(camera)
    const behind = v.z > 1
    const x = (v.x * 0.5 + 0.5) * w
    const y = (-v.y * 0.5 + 0.5) * h
    a.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    a.el.style.visibility = behind ? 'hidden' : ''
  }
}
