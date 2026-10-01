import gsap from 'gsap'
import { useCallback, useEffect, useRef, useState } from 'react'
import { hasWebGL2 } from '../../core/env'
import { listenPointer } from '../../core/pointer'
import { scroll, startScroll, updateScroll } from '../../core/scroll'
import { Stage } from '../../engine/Stage'
import { Chrome, type ChromeScene } from '../../engine/ui/Chrome'
import { Cursor } from '../../engine/ui/Cursor'
import { Hud } from '../../engine/ui/Hud'
import { QUALITY, SCENES, STORY_VH } from './config'
import { belladesk } from './data/belladesk'
import { updateStory } from './lab/story'
import { World } from './lab/World'
import './styles.css'
import { Overlay } from './ui/Overlay'
import { ProjectPanel } from './ui/ProjectPanel'

// Portfólio: o laboratório. Uma timeline única (scroll) com 6 cenas; o
// visitante também pode pilotar o BIT. /experience/belladesk abre direto
// no artefato do projeto, com o painel EXPLORE PROJECT.
const CHROME_SCENES: ChromeScene[] = SCENES.map((s) => ({ id: s.id, name: s.name, from: s.from, at: s.at }))
const project = SCENES.find((s) => s.id === 'project')!

export default function Portfolio({ route }: { route: string }) {
  const story = useRef<HTMLElement>(null)
  const [gl] = useState(hasWebGL2)
  const [lost, setLost] = useState(false)
  const [panel, setPanel] = useState(false)

  useEffect(() => {
    document.title = 'Luiz Henrique Marinello — Software Developer'
    const a = listenPointer()
    const b = startScroll(story.current!)
    // link direto para o projeto: pula para a cena e abre o tour do artefato
    let t = 0
    if (route === belladesk.slug) {
      const max = document.documentElement.scrollHeight - innerHeight
      scroll.lenis?.scrollTo((project.at / 100) * max, { immediate: true })
      t = window.setTimeout(() => setPanel(true), 1200)
    }
    return () => { a(); b(); clearTimeout(t) }
  }, [route])

  // sem WebGL não há loop 3D: a página mesma avança a narrativa (os textos dependem dela)
  const webgl = gl && !lost
  useEffect(() => {
    if (webgl) return
    const tick = (_t: number, dms: number) => { updateScroll(Math.min(dms / 1000, 0.05), 30); updateStory() }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [webgl])

  const openPanel = useCallback(() => setPanel(true), [])
  const closePanel = useCallback(() => setPanel(false), [])

  return (
    <div className={webgl ? 'exp' : 'exp exp--flat'}>
      {webgl && (
        <Stage tiers={QUALITY} shadows onContextLost={() => setLost(true)}>
          <World />
        </Stage>
      )}
      <Hud />
      <Overlay onExplore={openPanel} interactive3d={webgl} />
      <ProjectPanel open={panel} onClose={closePanel} />
      <Chrome brand={['LHM', 'SOFTWARE']} scenes={CHROME_SCENES} hintUntil={6} />
      <Cursor />
      <main ref={story} className="story" style={{ height: `${STORY_VH}vh` }}>
        <h1 className="sr-only">Luiz Henrique Marinello — Software Developer</h1>
      </main>
    </div>
  )
}
