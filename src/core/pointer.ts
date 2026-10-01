import { MathUtils } from 'three'
import { invalidate } from './loop'

// Estado do ponteiro fora do React. x/y em NDC (-1..1, y para cima).
// s* = suavizado (damping), v = velocidade suavizada em NDC/s.
export const pointer = {
  x: 0, y: 0,
  sx: 0, sy: 0,
  px: -1, py: -1, // pixels, para o cursor DOM
  v: 0,
  active: false,
  down: false,
}

let lastX = 0
let lastY = 0

export function listenPointer(): () => void {
  const move = (e: PointerEvent) => {
    pointer.px = e.clientX
    pointer.py = e.clientY
    pointer.x = (e.clientX / innerWidth) * 2 - 1
    pointer.y = -(e.clientY / innerHeight) * 2 + 1
    pointer.active = true
    invalidate(20)
  }
  const down = () => { pointer.down = true }
  const up = () => { pointer.down = false }
  const leave = () => { pointer.active = false }
  addEventListener('pointermove', move, { passive: true })
  addEventListener('pointerdown', down, { passive: true })
  addEventListener('pointerup', up, { passive: true })
  document.documentElement.addEventListener('pointerleave', leave)
  return () => {
    removeEventListener('pointermove', move)
    removeEventListener('pointerdown', down)
    removeEventListener('pointerup', up)
    document.documentElement.removeEventListener('pointerleave', leave)
  }
}

// Chamado uma vez por frame pelo loop.
export function updatePointer(dt: number, lambda = 5) {
  pointer.sx = MathUtils.damp(pointer.sx, pointer.x, lambda, dt)
  pointer.sy = MathUtils.damp(pointer.sy, pointer.y, lambda, dt)
  const inst = Math.hypot(pointer.sx - lastX, pointer.sy - lastY) / Math.max(dt, 1e-3)
  pointer.v = MathUtils.damp(pointer.v, inst, 8, dt)
  lastX = pointer.sx
  lastY = pointer.sy
}
