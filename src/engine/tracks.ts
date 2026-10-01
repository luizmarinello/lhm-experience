// Trilhas de keyframes avaliadas como função pura do progresso (0–100).
// Pura = scrub para frente e para trás dá exatamente o mesmo estado.
// As cenas descrevem a coreografia como dados (config), nunca como código imperativo.

export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'hold'
export type Key<T> = [at: number, value: T, ease?: Ease]

const ease = (e: Ease | undefined, t: number) => {
  switch (e) {
    case 'linear': return t
    case 'in': return t * t * t
    case 'out': return 1 - (1 - t) ** 3
    case 'hold': return 0
    default: return t * t * (3 - 2 * t) // inOut (smoothstep)
  }
}

function locate<T>(keys: Key<T>[], p: number): [number, number] {
  if (p <= keys[0][0]) return [0, 0]
  const last = keys.length - 1
  if (p >= keys[last][0]) return [last, 0]
  let i = 0
  while (keys[i + 1][0] < p) i++
  const [a, , e] = keys[i + 1]
  const t = (p - keys[i][0]) / Math.max(1e-6, a - keys[i][0])
  return [i, ease(e, t)] // o ease da chave de destino rege o trecho que chega nela
}

export function num(keys: Key<number>[], p: number): number {
  const [i, t] = locate(keys, p)
  if (t === 0) return keys[i][1]
  return keys[i][1] + (keys[i + 1][1] - keys[i][1]) * t
}

// Tangente monotônica (PCHIP / Fritsch–Butland) no ponto entre as inclinações
// d0 (trecho anterior, duração h0) e d1 (trecho seguinte, duração h1): zero se
// a direção inverte; senão média harmônica ponderada. Nunca passa do ponto.
function slope(d0: number, d1: number, h0: number, h1: number) {
  if (d0 * d1 <= 0) return 0
  const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0
  return (w1 + w2) / (w1 / d0 + w2 / d1)
}

/**
 * Caminho suave (câmera): spline de Hermite cúbica monotônica por eixo.
 * A velocidade é contínua ao passar por cada chave — a câmera não freia em
 * cada ponto (o "anda e para" de `vec`) — e não ultrapassa as chaves vizinhas
 * (não mergulha no chão nem estufa para fora). Só para onde se pede: chaves
 * 'hold' (segmento parado) e as pontas do caminho têm tangente zero.
 */
export function path(keys: Key<ArrayLike<number>>[], p: number, out: number[]): number[] {
  const n = keys.length
  const dim = keys[0][1].length
  if (p <= keys[0][0] || n === 1) { for (let k = 0; k < dim; k++) out[k] = keys[0][1][k]; return out }
  if (p >= keys[n - 1][0]) { for (let k = 0; k < dim; k++) out[k] = keys[n - 1][1][k]; return out }
  let i = 0
  while (keys[i + 1][0] < p) i++
  const [t1, P1] = keys[i]
  const [t2, P2, e2] = keys[i + 1]
  if (e2 === 'hold') { for (let k = 0; k < dim; k++) out[k] = P1[k]; return out }
  const h = t2 - t1
  const s = (p - t1) / Math.max(1e-6, h)
  // tangente zero na ponta inicial/final e na borda de uma parada
  const stopIn = i === 0 || keys[i][2] === 'hold'
  const stopOut = i + 2 >= n || keys[i + 2][2] === 'hold'
  const k0 = stopIn ? null : keys[i - 1]
  const k3 = stopOut ? null : keys[i + 2]
  const s2 = s * s, s3 = s2 * s
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2
  for (let k = 0; k < dim; k++) {
    const d1 = (P2[k] - P1[k]) / Math.max(1e-6, h)
    const m1 = k0 ? slope((P1[k] - k0[1][k]) / Math.max(1e-6, t1 - k0[0]), d1, t1 - k0[0], h) * h : 0
    const m2 = k3 ? slope(d1, (k3[1][k] - P2[k]) / Math.max(1e-6, k3[0] - t2), h, k3[0] - t2) * h : 0
    out[k] = h00 * P1[k] + h10 * m1 + h01 * P2[k] + h11 * m2
  }
  return out
}

/** 0 fora de [from, to], 0→1 subindo no começo e 1→0 descendo no fim (janela suave). */
export function window01(p: number, from: number, to: number, fade = 2): number {
  if (p <= from - fade || p >= to + fade) return 0
  const up = Math.min(1, (p - (from - fade)) / fade)
  const down = Math.min(1, (to + fade - p) / fade)
  const x = Math.min(up, down)
  return x * x * (3 - 2 * x)
}
