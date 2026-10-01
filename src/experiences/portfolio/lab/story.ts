import { Vector3 } from 'three'
import { scroll, scrollToProgress } from '../../../core/scroll'
import { CAPABILITIES, SCENES, type SceneId } from '../config'

// Sistema de cenas do laboratório. Fonte única: o progresso do scroll
// (0–100, amortecido). Todo componente 3D lê daqui, em useFrame, sem React.
//
//   sceneT(id)  → progresso local 0..1 dentro da faixa [from, to] da cena
//   sceneW(id)  → peso 0..1 (entra/sai suave nas bordas); use para ligar efeitos
//   cap         → capacidade em destaque na cena CAPABILITIES (-1 = nenhuma)
//   nav         → modo de navegação: 'tour' (scroll) ou 'explore' (BIT pilotado)
//   openStation → leva o tour até a cena da estação (scroll suave)

export const story = {
  p: 0, // progresso amortecido 0–100 (atualizado pelo Director)
  scene: 0, // índice da cena atual
}

const byId = Object.fromEntries(SCENES.map((s, i) => [s.id, { ...s, i }])) as Record<SceneId, (typeof SCENES)[number] & { i: number }>

export function sceneT(id: SceneId): number {
  const s = byId[id]
  return Math.min(1, Math.max(0, (story.p - s.from) / (s.to - s.from)))
}

export function sceneW(id: SceneId, fade = 3): number {
  const s = byId[id]
  const p = story.p
  if (p <= s.from - fade || p >= s.to + fade) return 0
  const x = Math.min(1, (p - (s.from - fade)) / fade, (s.to + fade - p) / fade)
  return x * x * (3 - 2 * x)
}

// Capacidade em destaque: a cena CAPABILITIES é dividida em fatias iguais.
export const cap = {
  active: -1, // índice em CAPABILITIES
  t: 0, // 0..1 dentro da fatia da capacidade ativa
  weight: 0, // 0..1: quão "dentro" da cena de capacidades estamos
}

export function updateStory() {
  story.p = scroll.smooth * 100
  let i = 0
  while (i < SCENES.length - 1 && story.p >= SCENES[i + 1].from) i++
  story.scene = i
  const t = sceneT('capabilities')
  cap.weight = sceneW('capabilities')
  if (cap.weight <= 0) {
    cap.active = -1
    cap.t = 0
  } else {
    const n = CAPABILITIES.length
    const k = Math.min(n - 1, Math.floor(t * n))
    cap.active = k
    cap.t = t * n - k
  }
}

/** Nome da capacidade ativa (ou '' fora da cena). */
export const activeCap = () => (cap.active >= 0 ? CAPABILITIES[cap.active].id : '')

// Navegação: o BIT pilotado e o tour compartilham as mesmas estações.
export const nav = {
  mode: 'tour' as 'tour' | 'explore',
  near: '' as '' | SceneId, // estação ao alcance do BIT (para o aviso "abrir")
  camPos: new Vector3(), // câmera do modo explore (escrita pelo controle do BIT)
  camTarget: new Vector3(),
}

export function openStation(id: SceneId) {
  nav.mode = 'tour'
  scrollToProgress(byId[id].at / 100)
}

if (import.meta.env.DEV) Object.assign(window as object, { __story: story, __cap: cap, __nav: nav })
