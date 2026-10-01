// Leitura única do ambiente: preferências do usuário e capacidade do aparelho.
// Nada aqui depende de React; é lido no boot e consultado por todos.

export type Tier = 'high' | 'medium' | 'low'

const q = new URLSearchParams(location.search)

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('reduced')
export const coarsePointer = matchMedia('(pointer: coarse)').matches
export const isMobile = coarsePointer && Math.min(screen.width, screen.height) < 820

export function hasWebGL2(): boolean {
  if (q.has('nogl')) return false
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    const ok = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return ok
  } catch {
    return false
  }
}

// Palpite inicial sem rede. O FpsGovernor (loop.ts) só rebaixa depois, nunca sobe.
export function initialTier(): Tier {
  const forced = q.get('q')
  if (forced === 'high' || forced === 'medium' || forced === 'low') return forced
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  if (mem <= 2 || cores <= 2) return 'low'
  if (isMobile || cores <= 4 || mem <= 4) return 'medium'
  return 'high'
}

export const lowerTier = (t: Tier): Tier => (t === 'high' ? 'medium' : 'low')
