import { useEffect, useRef, useState } from 'react'
import { scroll } from '../../../core/scroll'
import { belladesk } from '../data/belladesk'
import { projectUI } from '../lab/projectUI'

// EXPLORE PROJECT: tour guiado pelo artefato em 4 paradas, com teclado
// (← → Esc), foco gerenciado e rota própria (/experience/belladesk).
// Cada parada destaca a camada correspondente no rack 3D (projectUI).
const ROUTE = `${import.meta.env.BASE_URL}experience/${belladesk.slug}/`
const HOME = import.meta.env.BASE_URL

export function ProjectPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stop, setStop] = useState(0)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const opener = useRef<Element | null>(null)
  const layers = Object.fromEntries(belladesk.layers.map((l) => [l.id, l]))

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement
    scroll.lenis?.stop()
    if (location.pathname !== ROUTE) history.pushState({ project: true }, '', ROUTE)
    closeBtn.current?.focus()
    const onPop = () => onClose()
    addEventListener('popstate', onPop)
    return () => {
      removeEventListener('popstate', onPop)
      scroll.lenis?.start()
      projectUI.select('')
      if (location.pathname === ROUTE) history.replaceState(null, '', HOME)
      ;(opener.current as HTMLElement | null)?.focus?.()
    }
  }, [open, onClose])

  useEffect(() => {
    if (open) projectUI.select(belladesk.tour[stop].layers[0])
  }, [open, stop])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setStop((s) => Math.min(belladesk.tour.length - 1, s + 1))
      if (e.key === 'ArrowLeft') setStop((s) => Math.max(0, s - 1))
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const s = belladesk.tour[stop]
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div className="panel" role="dialog" aria-modal="true" aria-labelledby="pj-panel-title">
      <header className="panel__head">
        <p className="kicker">{belladesk.title} · {belladesk.note}</p>
        <button ref={closeBtn} className="btn btn--ghost" onClick={onClose} data-cursor="CLOSE">CLOSE ✕</button>
      </header>
      <p className="panel__count" aria-live="polite">{pad(stop + 1)} / {pad(belladesk.tour.length)}</p>
      <h2 id="pj-panel-title" className="panel__title">{s.title}</h2>
      <ul className="panel__layers">
        {s.layers.map((id) => {
          const l = layers[id]
          return (
            <li key={id} className={l.standby ? 'is-standby' : ''}>
              <button className="layer" onClick={() => projectUI.select(id)} data-cursor="FOCUS">
                <span className="layer__label">{l.label}</span>
                <span className="layer__tech">{l.tech}{l.standby ? ' · STANDBY' : ''}</span>
                <span className="layer__line">{l.line}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <nav className="panel__nav" aria-label="Project tour">
        <button className="btn btn--ghost" disabled={stop === 0} onClick={() => setStop(stop - 1)}>← PREV</button>
        <button className="btn" disabled={stop === belladesk.tour.length - 1} onClick={() => setStop(stop + 1)}>NEXT →</button>
      </nav>
    </div>
  )
}
