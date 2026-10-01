import { useEffect, useRef, useState } from 'react'
import './chrome.css'
import { audio } from '../../core/audio'
import type { Tier } from '../../core/env'
import { runtime, setRuntime, useRuntime } from '../../core/runtime'
import { scroll, scrollToProgress } from '../../core/scroll'
import gsap from 'gsap'

// Moldura mínima: marca, contador de cena (odômetro), régua de saltos,
// dica de scroll, qualidade e som. Faz parte do ambiente, não é navbar.
export interface ChromeScene {
  id: string
  name: string
  at: number // % onde a cena "repousa" (destino do salto)
  from: number // % onde a cena começa (para o contador)
}

interface Props {
  brand: [string, string]
  scenes: ChromeScene[]
  hintUntil?: number // % em que a dica de scroll some
}

const TIERS: (Tier | 'auto')[] = ['auto', 'high', 'medium', 'low']

export function Chrome({ brand, scenes, hintUntil = 5 }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState(0)
  const [quality, setQuality] = useState<Tier | 'auto'>('auto')
  const tier = useRuntime('tier')
  const sound = useRuntime('audio')

  // Um único ticker lê o progresso e escreve variáveis CSS; React só
  // re-renderiza quando a cena muda (6 vezes por visita).
  useEffect(() => {
    const el = root.current!
    let current = -1
    const tick = () => {
      const p = scroll.smooth * 100
      let i = 0
      while (i < scenes.length - 1 && p >= scenes[i + 1].from) i++
      if (i !== current) {
        const first = current < 0
        current = i
        setScene(i)
        if (!first) audio.scene(i) // não toca no primeiro quadro (ainda carregando)
      }
      el.style.setProperty('--p', (p / 100).toFixed(4))
      el.style.setProperty('--hint', String(Math.max(0, 1 - p / hintUntil)))
      audio.setIntensity(Math.abs(scroll.velocity) * 3)
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [scenes, hintUntil])

  const cycleQuality = () => {
    const next = TIERS[(TIERS.indexOf(quality) + 1) % TIERS.length]
    setQuality(next)
    if (next !== 'auto') setRuntime({ tier: next })
    audio.tick(1.2)
  }

  const toggleSound = async () => {
    if (runtime.audio) audio.disable()
    else await audio.enable()
    setRuntime({ audio: audio.enabled })
    audio.tick()
  }

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="chrome" ref={root}>
      <div className="chrome__corner chrome__tl">
        <span>{brand[0]}</span>
        <span className="chrome__slash">/</span>
        <span className="chrome__dim">{brand[1]}</span>
      </div>

      <nav className="chrome__corner chrome__tr" aria-label="Scenes">
        <div className="chrome__counter" aria-live="polite">
          <span className="odo" aria-hidden="true">
            <span className="odo__track" style={{ transform: `translateY(${-scene * 1.25}em)` }}>
              {scenes.map((_, i) => <span key={i}>{pad(i + 1)}</span>)}
            </span>
          </span>
          <span className="chrome__dim" aria-hidden="true"> / {pad(scenes.length)}</span>
          <span className="chrome__scene">{scenes[scene]?.name}</span>
        </div>
        <ol className="rail">
          {scenes.map((s, i) => (
            <li key={s.id}>
              <button
                className={i === scene ? 'rail__mark is-on' : 'rail__mark'}
                onClick={() => scrollToProgress(s.at / 100)}
                aria-label={`${pad(i + 1)} ${s.name}`}
                aria-current={i === scene ? 'step' : undefined}
                data-cursor={s.name}
              />
            </li>
          ))}
        </ol>
      </nav>

      <div className="chrome__corner chrome__bl chrome__hint" aria-hidden="true">
        <span className="hint__line" />
        <span>SCROLL TO EXPLORE</span>
      </div>

      <div className="chrome__corner chrome__br">
        <button onClick={cycleQuality} data-cursor="QUALITY" aria-label={`Quality: ${quality}${quality === 'auto' ? ` (${tier})` : ''}`}>
          QUALITY <span className="chrome__val">{quality === 'auto' ? `AUTO·${tier.toUpperCase()}` : quality.toUpperCase()}</span>
        </button>
        <button onClick={toggleSound} data-cursor="SOUND" aria-pressed={sound}>
          SOUND <span className="chrome__val">{sound ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      <div className="grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
    </div>
  )
}
