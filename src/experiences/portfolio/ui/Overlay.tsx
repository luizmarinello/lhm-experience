import gsap from 'gsap'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { audio } from '../../../core/audio'
import { coarsePointer } from '../../../core/env'
import { scrollToProgress } from '../../../core/scroll'
import { window01 } from '../../../engine/tracks'
import { Reveal } from '../../../engine/ui/Reveal'
import { CAPABILITIES, CONTACT, SCENES, STATIONS } from '../config'
import { belladesk } from '../data/belladesk'
import { nav, story } from '../lab/story'
import { StationLabel } from './StationLabel'

// Camada de texto das cenas (DOM real, por cima do canvas). Cada bloco só
// existe para o leitor/teclado dentro da sua faixa do scroll (inert fora).

/** Mostra/oculta um bloco numa faixa do scroll, com `inert` fora dela. */
function Range({ range, className, children, label }: { range: [number, number]; className: string; children: ReactNode; label?: string }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current!
    let last = -1
    const tick = () => {
      const w = window01(story.p, range[0], range[1], 2.5)
      if (Math.abs(w - last) < 0.005) return
      last = w
      el.style.opacity = w.toFixed(3)
      el.style.setProperty('--w', w.toFixed(3))
      const on = w > 0.5
      el.toggleAttribute('inert', !on)
      el.style.visibility = w > 0 ? '' : 'hidden'
    }
    gsap.ticker.add(tick)
    tick()
    return () => gsap.ticker.remove(tick)
  }, [range[0], range[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section ref={ref} className={className} aria-label={label}>
      {children}
    </section>
  )
}

function useNavMode() {
  const [mode, setMode] = useState(nav.mode)
  useEffect(() => {
    const tick = () => { if (nav.mode !== mode) setMode(nav.mode) }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [mode])
  return mode
}

const top = (k: keyof typeof STATIONS, h: number): [number, number, number] => {
  const p = STATIONS[k].pos
  return [p[0], p[1] + h, p[2]]
}
const at = (id: string) => SCENES.find((s) => s.id === id)!

export function Overlay({ onExplore, interactive3d = true }: { onExplore: () => void; interactive3d?: boolean }) {
  const mode = useNavMode()
  return (
    <div className="overlay">
      {/* 01 — dica discreta: o mundo é pilotável */}
      {interactive3d && (
        <Range range={[0, 9]} className="hint hint--bit" label="Controls">
          <p>{coarsePointer ? 'TAP THE FLOOR TO MOVE BIT' : 'DRIVE BIT · WASD OR CLICK THE FLOOR · DRAG TO LOOK AROUND'}</p>
        </Range>
      )}

      {/* 02 — o sistema */}
      <div className="block block--system">
        <Reveal as="h2" range={[17, 29]}>SOFTWARE · AUTOMATION · AI</Reveal>
      </div>
      {interactive3d && (
        <>
          <StationLabel at={top('desk', 1.75)} range={[17, 29]} index="01">SOFTWARE</StationLabel>
          <StationLabel at={top('arm', 1.75)} range={[17, 29]} index="02">AUTOMATION</StationLabel>
          <StationLabel at={top('ai', 2.15)} range={[17, 29]} index="03">AI</StationLabel>
        </>
      )}

      {/* 03 — identidade (legível no DOM; o monitor digita o mesmo) */}
      <Range range={[37, 44]} className="block block--identity" label="Identity">
        <p className="kicker">03 / IDENTITY</p>
        <h2 className="id-name">Luiz Henrique Marinello</h2>
        <p className="id-role">SOFTWARE DEVELOPER — BRAZIL</p>
      </Range>

      {/* 04 — capacidades: os cubos e rótulos estão no 3D; lista para leitores de tela */}
      <Range range={[46, 66]} className="sr-only" label="Capabilities">
        <ul>
          {CAPABILITIES.map((c) => <li key={c.id}>{c.id}: {c.line}</li>)}
        </ul>
      </Range>

      {/* 05 — o projeto */}
      <Range range={[71, 84]} className="block block--project" label="Project">
        <p className="kicker">05 / PROJECT ARTIFACT</p>
        <h2 className="pj-title">{belladesk.title}</h2>
        <p className="pj-kicker">{belladesk.kicker}</p>
        <p className="pj-summary">{belladesk.summary}</p>
        <p className="pj-note">{belladesk.note}</p>
        <button className="btn" onClick={() => { audio.open(); onExplore() }} data-cursor="EXPLORE">
          EXPLORE PROJECT <span aria-hidden="true">→</span>
        </button>
      </Range>

      {/* 06 — contato */}
      <Range range={[91, 101]} className="block block--contact" label="Contact">
        <h2 className="ct-title">Not just what I build —<br />what can be built.</h2>
        <ul className="ct-links">
          {CONTACT.map((c) => (
            <li key={c.id}>
              <a href={c.href} target="_blank" rel="noreferrer" data-cursor={c.label} onPointerDown={() => audio.open()}>{c.label} <span aria-hidden="true">↗</span></a>
            </li>
          ))}
        </ul>
        <p className="ct-proof">Built entirely in code — React · three.js · GLSL. No downloaded 3D models.</p>
        <button className="btn btn--ghost" onClick={() => { audio.back(); scrollToProgress(at('awakening').at / 100) }} data-cursor="REPLAY">↺ REPLAY</button>
      </Range>

      {mode === 'explore' && (
        <div className="hint hint--explore" role="status">
          <p>{coarsePointer ? 'DRAG · ORBIT   ·   TAP THE FLOOR · MOVE' : 'DRAG · ORBIT   ·   WHEEL · ZOOM   ·   Q / E · TURN   ·   C · RECENTER'}</p>
          <button className="hint__back" onClick={() => { audio.back(); nav.mode = 'tour' }} data-cursor="TOUR">
            {coarsePointer ? '← TOUR' : 'ESC · BACK TO TOUR'}
          </button>
        </div>
      )}
    </div>
  )
}
