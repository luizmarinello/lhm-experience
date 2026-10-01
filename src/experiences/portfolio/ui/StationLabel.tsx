import gsap from 'gsap'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import { useAnchor } from '../../../engine/anchors'
import { window01 } from '../../../engine/tracks'
import { story } from '../lab/story'

// Rótulo DOM preso a um ponto 3D, visível numa faixa do scroll (em %).
// O texto é real (leitor de tela, seleção); só a posição vem do 3D.
interface Props {
  at: [number, number, number]
  range: [number, number]
  index?: string
  children: string
}

export function StationLabel({ at, range, index, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = useMemo(() => new Vector3(...at), [at])
  useAnchor(ref, pos)

  useEffect(() => {
    const el = ref.current!
    let last = -1
    const tick = () => {
      const w = window01(story.p, range[0], range[1], 2)
      if (Math.abs(w - last) < 0.01) return
      last = w
      el.dataset.on = w > 0 ? '1' : '0'
      el.style.opacity = w.toFixed(3)
      el.style.setProperty('--w', w.toFixed(3))
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [range[0], range[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="slabel" ref={ref} data-on="0">
      <i className="slabel__dot" />
      <i className="slabel__line" />
      <span className="slabel__text">
        {index && <span className="slabel__idx">{index}</span>}
        {children}
      </span>
    </div>
  )
}
