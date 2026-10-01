import type { Tier } from '../../core/env'
import type { Key } from '../../engine/tracks'

// Tudo o que se ajusta para iterar a direção fica aqui: paleta, luz,
// câmera, qualidade por nível. Posições em metros, narrativa em % do scroll.

// Paleta: estúdio claro e quente com cor orgânica (coral, magenta, âmbar).
export const PALETTE = {
  bgTop: '#d8cce0',
  bgMid: '#f0c9ba',
  bgLow: '#c98aa0',
  fog: '#eccbc9',
  floor: '#e7dcd5',
  rim: '#ff7a59',
  plastic: '#f7f4f0',
  graphite: '#2c2a31',
  metal: '#c9c4cc',
  wood: '#c69c77',
  coral: '#ff6f59',
  magenta: '#e0468f',
  amber: '#ffb347',
  mint: '#7fd6b4',
  screen: '#0f0e14',
  keyLight: '#fff1e2',
  fillLight: '#f3c6ff',
  backLight: '#ff9c6b',
}

export interface Quality {
  dpr: number
  maxFps: number
  shadows: number // resolução do shadow map (0 = sem)
  ao: boolean // oclusão de ambiente (GTAO)
  bloom: boolean
  dof: boolean
  aiDetail: number // subdivisões da escultura de IA
}

export const QUALITY: Record<Tier, Quality> = {
  high: { dpr: 1.5, maxFps: 120, shadows: 2048, ao: true, bloom: true, dof: false, aiDetail: 96 },
  medium: { dpr: 1.25, maxFps: 60, shadows: 1024, ao: true, bloom: true, dof: false, aiDetail: 64 },
  low: { dpr: 1, maxFps: 45, shadows: 1024, ao: false, bloom: false, dof: false, aiDetail: 32 },
}

// ---------------------------------------------------------------------------
// Narrativa: 6 cenas numa timeline única (0–100% do scroll).
// `at` = ponto de repouso da cena (destino dos saltos e do BIT).
export const SCENES = [
  { id: 'awakening', name: 'AWAKENING', from: 0, to: 14, at: 3 },
  { id: 'system', name: 'SYSTEM', from: 14, to: 30, at: 23 },
  { id: 'identity', name: 'IDENTITY', from: 30, to: 44, at: 38 },
  { id: 'capabilities', name: 'CAPABILITIES', from: 44, to: 66, at: 46 },
  { id: 'project', name: 'PROJECT', from: 66, to: 86, at: 77 },
  { id: 'contact', name: 'CONTACT', from: 86, to: 100, at: 99 },
] as const
export type SceneId = (typeof SCENES)[number]['id']
export const STORY_VH = 2000 // altura total do scroll: ~200 giros da roda do começo ao fim

// Estações do laboratório (posição no piso em metros, giro em radianos,
// raio de colisão para o BIT, cena que cada estação abre).
export const STATIONS = {
  desk: { pos: [-2.5, 0, -0.3] as [number, number, number], rot: 0.75, radius: 1.25, scene: 'identity' as SceneId, label: 'WORKSTATION' },
  ai: { pos: [-0.5, 0, -2.6] as [number, number, number], rot: 0, radius: 0.75, scene: 'system' as SceneId, label: 'AI CORE' },
  rack: { pos: [1.9, 0, -2.1] as [number, number, number], rot: -0.45, radius: 0.95, scene: 'project' as SceneId, label: 'BELLADESK' },
  arm: { pos: [2.9, 0, 0.7] as [number, number, number], rot: -1.9, radius: 1.0, scene: 'capabilities' as SceneId, label: 'AUTOMATION' },
  belt: { pos: [0.4, 0, 3.05] as [number, number, number], rot: 0, radius: 0.6, scene: 'capabilities' as SceneId, label: 'CAPABILITIES' },
}
export type StationId = keyof typeof STATIONS
export const PLATFORM_WALK_R = 4.25 // o BIT não sai deste raio
export const BELT_SPAN: [number, number] = [-1.8, 2.6] // x das pontas da esteira (colisão do BIT)

// Capacidades: cada uma é um cubo na esteira E um comportamento no laboratório.
// `reacts` diz qual parte do laboratório responde quando ela está em destaque.
export const CAPABILITIES = [
  { id: 'FULL STACK', line: 'From interface to database.', reacts: 'all' },
  { id: 'BACKEND', line: 'Java and Spring Boot services.', reacts: 'rack' },
  { id: 'FRONTEND', line: 'React and TypeScript interfaces.', reacts: 'monitor' },
  { id: 'APIs', line: 'REST and system integrations.', reacts: 'cables' },
  { id: 'DATA', line: 'PostgreSQL, modeling, queries.', reacts: 'rack-db' },
  { id: 'AUTOMATION', line: 'Processes that run themselves.', reacts: 'arm' },
  { id: 'AI', line: 'LLM features and assistants.', reacts: 'ai' },
  { id: 'CLOUD', line: 'Docker, CI/CD and deploys.', reacts: 'cloud' },
] as const

// Contato: itens com href vazio não aparecem (e-mail e LinkedIn pendentes).
export const CONTACT = [
  { id: 'github', label: 'GITHUB', href: 'https://github.com/luizmarinello' },
  { id: 'email', label: 'EMAIL', href: '' },
  { id: 'linkedin', label: 'LINKEDIN', href: '' },
].filter((c) => c.href)

// Câmera do tour (posição, alvo, fov) por % do scroll. Cada cena tem uma
// chegada e um repouso; entre cenas a câmera nunca corta.
export const CAMERA: { pos: Key<number[]>[]; target: Key<number[]>[]; fov: Key<number>[] } = {
  pos: [
    [0, [6.6, 3.3, 7.4]],
    [10, [5.6, 3.1, 6.4]],
    [18, [2.0, 6.8, 7.6], 'inOut'],
    [28, [-1.2, 7.4, 6.4]],
    [34, [-0.4, 2.3, 2.7], 'inOut'],
    [38, [-1.72, 1.17, 0.53], 'inOut'],
    [42, [-1.72, 1.17, 0.53], 'hold'],
    [47, [-0.8, 2.25, 6.5], 'inOut'],
    [64, [1.6, 2.25, 6.3], 'linear'],
    [70, [-0.1, 1.75, 2.3], 'inOut'],
    [84, [0.15, 1.6, 2.0]],
    [91, [0.8, 9.5, 6.4], 'inOut'],
    [100, [0.4, 12.5, 4.6]],
  ],
  target: [
    [0, [0, 0.9, -0.4]],
    [10, [0, 0.9, -0.5]],
    [18, [0, 0.5, -0.6], 'inOut'],
    [28, [0, 0.4, -0.7]],
    [34, [-2.3, 1.1, -0.4], 'inOut'],
    [38, [-2.65, 1.13, -0.46], 'inOut'],
    [42, [-2.65, 1.13, -0.46], 'hold'],
    [47, [-0.2, 0.55, 1.7], 'inOut'],
    [64, [1.0, 0.55, 1.7], 'linear'],
    [70, [1.6, 1.3, -1.5], 'inOut'],
    [84, [1.6, 1.25, -1.55]],
    [91, [0, 0.2, -0.4], 'inOut'],
    [100, [0, 0, -0.3]],
  ],
  fov: [
    [0, 30],
    [18, 38],
    [34, 34],
    [38, 36],
    [47, 40],
    [70, 42],
    [91, 34],
  ],
}
