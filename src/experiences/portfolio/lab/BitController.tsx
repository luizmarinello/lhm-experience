import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CircleGeometry, Color, MathUtils, Mesh, MeshBasicMaterial, TorusGeometry, Vector3 } from 'three'
import { coarsePointer, reducedMotion } from '../../../core/env'
import { invalidate } from '../../../core/loop'
import { scroll } from '../../../core/scroll'
import { audio } from '../../../core/audio'
import { cursor } from '../../../engine/ui/Cursor'
import { hud } from '../../../engine/ui/Hud'
import { BELT_SPAN, PALETTE, PLATFORM_WALK_R, SCENES, STATIONS, type SceneId, type StationId } from '../config'
import { bot, freeClick, uiBusy } from './Bot'
import { U } from './shared'
import { nav, openStation, story } from './story'

// Pilotagem do BIT. Teclado: WASD/setas relativos à câmera, Shift corre,
// F/Enter abre a estação ao alcance, Esc volta ao tour. Clique/toque no piso:
// anda até o ponto. No tour, o BIT vai sozinho ao ponto de apresentação da
// cena. Escreve a câmera de perseguição em nav.camPos/camTarget (o Director usa).
// Câmera no explore: arrastar (mouse ou dedo) orbita, roda aproxima/afasta,
// Q/E giram, C recentraliza. Enquanto explora, a página não rola (Lenis parado).

const BODY = 0.3 // raio do corpo do BIT
const WALK = 1.6, RUN = 2.6, TOUR = 1.3 // m/s
const CAM_DIST = 3.4, CAM_H = 2.1 // atrás e acima do BIT (padrão)
const PITCH0 = Math.atan2(CAM_H - 0.55, CAM_DIST) // ≈ 24° de elevação
const DIST_MIN = 1.6, DIST_MAX = 8
const PITCH_MIN = 0.1, PITCH_MAX = 1.25 // rad acima do horizonte
const MANUAL_HOLD = 3 // s sem auto-seguir depois que o visitante mexe na câmera

// Ponto de apresentação por cena: perto da estação da cena, fora das colisões
// (folga ≥ 0,39 m) e dentro do enquadramento do tour; contato = centro.
const SPOTS: Record<SceneId, [number, number]> = {
  awakening: [0.2, 1.1],
  system: [0.3, -1.3],
  identity: [-0.9, 0.8],
  capabilities: [-0.8, 2.2],
  project: [-0.7, -0.2], // ao lado, fora da linha câmera→rack
  contact: [0, 0],
}
// Altura do aviso do HUD acima de cada estação
const TOP: Record<StationId, number> = { desk: 1.35, ai: 1.9, rack: 2.15, arm: 1.75, belt: 1.0 }
const ST = (Object.keys(STATIONS) as StationId[]).map((k) => {
  const s = STATIONS[k]
  return { k, x: s.pos[0], z: s.pos[2], r: s.radius, scene: s.scene, label: s.label, top: new Vector3(s.pos[0], TOP[k], s.pos[2]) }
})
// a esteira é comprida: além do círculo central, uma fileira de círculos ao longo dela
{
  const b = STATIONS.belt
  for (let x = BELT_SPAN[0] + 0.35; x <= BELT_SPAN[1] - 0.35; x += 0.7) {
    if (Math.abs(x - b.pos[0]) < 0.3) continue
    ST.push({ k: 'belt', x, z: b.pos[2], r: 0.45, scene: b.scene, label: b.label, top: new Vector3(x, TOP.belt, b.pos[2]) })
  }
}

const keys = { f: false, b: false, l: false, r: false, run: false, turnL: false, turnR: false }
const CODES: Record<string, keyof typeof keys> = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b',
  KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyQ: 'turnL', KeyE: 'turnR',
}
const MOVE_KEYS = new Set<keyof typeof keys>(['f', 'b', 'l', 'r'])

const target = new Vector3()
let hasTarget = false
let stuck = 0 // s parado tentando chegar
const want = new Vector3() // velocidade desejada
const fwd = new Vector3()
const prev = new Vector3()
let camYaw = 0
let camPitch = PITCH0
let camDist = CAM_DIST
let pull = 0 // quanto a colisão encurta o braço da câmera: entra rápido, sai devagar
let manualUntil = 0 // U.uTime até quando a câmera respeita o ajuste manual
const drag = { id: -1, x: 0, y: 0, moved: 0, button: 0 }
let lastMode = nav.mode
let anchor = 0 // scroll.progress ao entrar no explore
let shown: StationId | '' = '' // estação cujo aviso nós pusemos no HUD

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const dampAngle = (a: number, b: number, l: number, dt: number) => a + wrap(b - a) * (1 - Math.exp(-l * dt))

// Destino de clique: empurra para fora das estações (com a folga do desvio)
// e para dentro do piso, senão o BIT ficaria rodando um alvo inalcançável.
// (Atrás do braço, na borda, sobra um bolsão sem saída: lá o BIT encosta e
// desiste pelo `stuck` do useFrame.)
function clampTarget(v: Vector3) {
  for (const s of ST) {
    const dx = v.x - s.x, dz = v.z - s.z, d = Math.hypot(dx, dz), min = s.r + BODY + 0.3
    if (d >= min) continue
    if (d < 1e-4) v.set(s.x + min, 0, s.z)
    else v.set(s.x + (dx / d) * min, 0, s.z + (dz / d) * min)
  }
  const R = PLATFORM_WALK_R - 0.05, r = Math.hypot(v.x, v.z)
  if (r > R) v.multiplyScalar(R / r)
  v.y = 0
}

// Chegada suave (desacelera no último 0,9 m) contornando estações pela
// tangente. O lado do contorno é escolhido uma vez por estação (para onde o
// destino puxa) e mantido, senão o BIT hesita. Na borda do piso o lado de fora
// não tem saída (atrás do braço): aí troca de lado, uma vez só por destino,
// para um alvo inalcançável não virar vaivém entre os dois cantos.
const sides = ST.map(() => 0) // lado do contorno por estação (±1; 0 = livre)
let flipped = false, goalX = NaN, goalZ = NaN
function arrive(tx: number, tz: number, max: number): boolean {
  if (tx !== goalX || tz !== goalZ) { goalX = tx; goalZ = tz; sides.fill(0); flipped = false }
  const dx = tx - bot.pos.x, dz = tz - bot.pos.z, d = Math.hypot(dx, dz)
  if (d < 0.05) { want.set(0, 0, 0); return true }
  const sp = max * Math.min(1, d / 0.9)
  want.set((dx / d) * sp, 0, (dz / d) * sp)
  const edge = Math.hypot(bot.pos.x, bot.pos.z) > PLATFORM_WALK_R - 0.35
  for (let i = 0; i < ST.length; i++) {
    const s = ST[i]
    const ox = bot.pos.x - s.x, oz = bot.pos.z - s.z, od = Math.hypot(ox, oz)
    if (od < 1e-5) continue // no centro (só por teleporte): a colisão resolve
    const nx = ox / od, nz = oz / od
    // perto do destino vai reto (a colisão resolve); longe da estação, livre
    if (d < 0.7 || od > s.r + BODY + 0.25 || want.x * nx + want.z * nz >= 0) { sides[i] = 0; continue }
    if (!sides[i]) sides[i] = want.z * nx - want.x * nz >= 0 ? 1 : -1
    if (edge && !flipped && (nx * bot.pos.z - nz * bot.pos.x) * sides[i] > 0) { sides[i] = -sides[i]; flipped = true }
    want.set(-nz * sides[i] * sp, 0, nx * sides[i] * sp)
  }
  return false
}

// Colisão: fora de cada estação e dentro do piso, empurrando pela normal.
function collide() {
  const p = bot.pos
  for (let it = 0; it < 2; it++) {
    for (const s of ST) {
      const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), min = s.r + BODY
      if (d >= min) continue
      if (d < 1e-5) { p.x = s.x + min; continue } // no centro exato: sai por +x
      p.x = s.x + (dx / d) * min
      p.z = s.z + (dz / d) * min
    }
    const r = Math.hypot(p.x, p.z)
    if (r > PLATFORM_WALK_R) p.multiplyScalar(PLATFORM_WALK_R / r)
  }
}

// Passo de movimento: velocidade amortecida rumo a `want`, anda e colide. A
// velocidade final é o deslocamento real: encostado numa parede ela zera
// (sem "andar parado", e o `stuck` percebe alvos inalcançáveis).
function integrate(dt: number) {
  if (dt < 1e-4) return
  const v = bot.vel
  const acc = want.lengthSq() > v.lengthSq() ? 5 : 7 // freia mais rápido do que acelera
  v.x = MathUtils.damp(v.x, want.x, acc, dt)
  v.z = MathUtils.damp(v.z, want.z, acc, dt)
  prev.copy(bot.pos)
  bot.pos.addScaledVector(v, dt)
  collide()
  v.subVectors(bot.pos, prev).divideScalar(dt)
  bot.speed = Math.hypot(v.x, v.z)
}

// alvo livre para arrastar: nada de controles, links, rótulos clicáveis ou diálogos
const freeTarget = (t: EventTarget | null) =>
  !(t instanceof Element && t.closest('a, button, input, textarea, select, label, [data-cursor], [role="dialog"]'))

const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')

export function BitController() {
  const camera = useThree((s) => s.camera)
  const marker = useRef<Mesh>(null)
  const parts = useMemo(() => ({
    disc: new CircleGeometry(4.3, 64).rotateX(-Math.PI / 2),
    hidden: new MeshBasicMaterial({ visible: false }), // invisível, mas recebe o raio
    ring: new TorusGeometry(0.16, 0.012, 8, 48).rotateX(Math.PI / 2),
    glow: new MeshBasicMaterial({ color: new Color(PALETTE.mint).multiplyScalar(2.2), toneMapped: false }),
  }), [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || editable(e.target) || uiBusy()) return
      const k = CODES[e.code]
      if (k) {
        keys[k] = true
        invalidate(30) // modo sob demanda (reduced motion): teclado também pede quadros
        const turn = k === 'turnL' || k === 'turnR'
        if (MOVE_KEYS.has(k) || (turn && nav.mode === 'explore')) nav.mode = 'explore'
        if (turn) manualUntil = U.uTime.value + MANUAL_HOLD
        if (e.code.startsWith('Arrow')) e.preventDefault() // seta rolaria a página (e voltaria ao tour)
        return
      }
      // Enter num botão/link focado é do botão, não do BIT
      const onControl = e.target instanceof Element && !!e.target.closest('a, button')
      if (e.code === 'Escape') nav.mode = 'tour'
      else if (e.code === 'KeyC' && nav.mode === 'explore') { camYaw = bot.heading + Math.PI; camPitch = PITCH0; camDist = CAM_DIST; manualUntil = 0 }
      else if (nav.near && !e.repeat && (e.code === 'KeyF' || (e.key === 'Enter' && !onControl))) { audio.open(); openStation(nav.near) }
    }
    const up = (e: KeyboardEvent) => {
      const k = CODES[e.code]
      if (k) keys[k] = false
    }
    const reset = () => { for (const k in keys) keys[k as keyof typeof keys] = false }
    // roda no explore = zoom (a página está parada); fora dele, o scroll normal do tour
    const wheel = (e: WheelEvent) => {
      if (nav.mode !== 'explore' || uiBusy()) return
      e.preventDefault()
      camDist = MathUtils.clamp(camDist * Math.exp(e.deltaY * 0.0012), DIST_MIN, DIST_MAX)
      manualUntil = U.uTime.value + MANUAL_HOLD
      invalidate(30)
    }
    // arrastar orbita a câmera em volta do BIT. Mouse: arrastar em qualquer
    // modo entra no explore. Toque: só no explore (no tour o dedo rola a página).
    const pdown = (e: PointerEvent) => {
      if (uiBusy() || !freeTarget(e.target)) return
      if (e.pointerType === 'touch' && nav.mode !== 'explore') return
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return
      if (e.clientX > innerWidth - 18) return // barra de rolagem
      drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; drag.button = e.button
    }
    const pmove = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.x = e.clientX; drag.y = e.clientY
      drag.moved += Math.abs(dx) + Math.abs(dy)
      if (drag.moved < 6) return
      if (nav.mode !== 'explore') nav.mode = 'explore'
      camYaw -= dx * 0.0055
      camPitch = MathUtils.clamp(camPitch + dy * 0.0045, PITCH_MIN, PITCH_MAX)
      manualUntil = U.uTime.value + MANUAL_HOLD
      cursor.label = 'ORBIT'
      invalidate(20)
    }
    const pup = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return
      if (cursor.label === 'ORBIT') cursor.label = ''
      drag.id = -1
    }
    // botão direito arrastado não abre o menu de contexto
    const ctx = (e: MouseEvent) => { if (drag.button === 2 && drag.moved >= 6) e.preventDefault() }
    addEventListener('keydown', down)
    addEventListener('keyup', up)
    addEventListener('blur', reset)
    addEventListener('wheel', wheel, { passive: false })
    addEventListener('pointerdown', pdown)
    addEventListener('pointermove', pmove)
    addEventListener('pointerup', pup)
    addEventListener('pointercancel', pup)
    addEventListener('contextmenu', ctx)
    return () => {
      removeEventListener('keydown', down)
      removeEventListener('keyup', up)
      removeEventListener('blur', reset)
      removeEventListener('wheel', wheel)
      removeEventListener('pointerdown', pdown)
      removeEventListener('pointermove', pmove)
      removeEventListener('pointerup', pup)
      removeEventListener('pointercancel', pup)
      removeEventListener('contextmenu', ctx)
      reset()
      if (shown) hud.hide()
      shown = ''
      nav.near = ''
      Object.values(parts).forEach((p) => p.dispose())
    }
  }, [parts])

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05)
    const t = U.uTime.value
    // modo: rolar a página de verdade (roda, toque, barra) devolve ao tour
    if (nav.mode !== lastMode) {
      lastMode = nav.mode
      // entrou no explore com o scroll ainda andando (inércia do Lenis, salto
      // do openStation): para ali, senão a variação abaixo devolveria ao tour
      const l = scroll.lenis
      if (nav.mode === 'explore') l?.stop() // para a inércia e trava a página: a roda vira zoom
      else if (l?.isStopped && !uiBusy()) l.start()
      anchor = scroll.progress
    }
    if (nav.mode === 'explore' && Math.abs(scroll.progress - anchor) > 0.002) nav.mode = lastMode = 'tour'
    const explore = nav.mode === 'explore'
    if (!explore) hasTarget = false

    // velocidade desejada: teclado > clique > ponto do tour
    const ix = +keys.r - +keys.l, iz = +keys.f - +keys.b
    const max = keys.run ? RUN : WALK
    if (explore && (ix || iz)) {
      hasTarget = false
      camera.getWorldDirection(fwd)
      fwd.y = 0
      if (fwd.lengthSq() < 1e-6) fwd.set(-Math.sin(camYaw), 0, -Math.cos(camYaw)) // câmera a pino
      fwd.normalize()
      want.set(fwd.x * iz - fwd.z * ix, 0, fwd.z * iz + fwd.x * ix).normalize().multiplyScalar(max)
    } else if (explore && hasTarget) {
      if (arrive(target.x, target.z, max)) hasTarget = false
    } else if (!explore) {
      const s = SPOTS[SCENES[story.scene].id]
      arrive(s[0], s[1], TOUR)
    } else want.set(0, 0, 0)

    integrate(dt)
    if (bot.speed > 0.01 || ix || iz) invalidate(3) // enquanto o BIT anda, continua desenhando
    const v = bot.vel
    stuck = hasTarget && bot.speed < 0.05 ? stuck + dt : 0
    if (stuck > 0.4) hasTarget = false // encostou num alvo inalcançável
    bot.boost = MathUtils.damp(bot.boost, explore && keys.run && bot.speed > 0.3 ? 1 : 0, 6, dt)

    // direção: segue a velocidade; parado no tour, encara a câmera e olha em volta
    const az = Math.atan2(camera.position.x - bot.pos.x, camera.position.z - bot.pos.z)
    if (bot.speed > 0.08) bot.heading = dampAngle(bot.heading, Math.atan2(v.x, v.z), 7, dt)
    else if (!explore) {
      const idle = reducedMotion ? 0 : Math.sin(t * 0.37) * 0.35 + Math.sin(t * 1.13) * 0.08
      bot.heading = dampAngle(bot.heading, az + idle, 2.5, dt)
    }

    // câmera de perseguição. No tour acompanha o azimute da câmera atual (a
    // troca para o explore só muda distância/altura). No explore só gira para
    // trás do BIT quando ele anda "para dentro" da tela: andar de lado não gira
    // a câmera, senão o controle relativo à câmera viraria um círculo.
    if (!explore) { camYaw = az; camPitch = PITCH0; camDist = CAM_DIST }
    else {
      if (keys.turnL) camYaw += 1.9 * dt
      if (keys.turnR) camYaw -= 1.9 * dt
      // auto-seguir (gira para trás do BIT ao andar "para dentro" da tela) só
      // quando o visitante não mexeu na câmera nos últimos segundos
      if (bot.speed > 0.05 && t > manualUntil && drag.id < 0) {
        const ahead = -(v.x * Math.sin(camYaw) + v.z * Math.cos(camYaw)) / bot.speed
        camYaw = dampAngle(camYaw, bot.heading + Math.PI, 2.2 * Math.max(0, ahead), dt)
      }
    }
    // braço da câmera: encurta antes de estação mais alta que ela (rack, IA,
    // braço) e sobe para olhar por cima, senão atravessa a peça ou ela tapa o BIT
    const sx = Math.sin(camYaw), sz = Math.cos(camYaw)
    const camH = 0.55 + camDist * Math.sin(camPitch) // altura pedida
    const full = camDist * Math.cos(camPitch) // distância horizontal pedida
    let dist = full
    for (const s of ST) {
      if (s.top.y < camH - 0.5) continue
      const ox = bot.pos.x - s.x, oz = bot.pos.z - s.z, R = s.r + 0.2
      const b = ox * sx + oz * sz, h = b * b - (ox * ox + oz * oz - R * R)
      if (h <= 0) continue
      const hit = -b - Math.sqrt(h)
      if (hit > 0 && hit < dist) dist = Math.max(0.3, hit)
    }
    // arrastando: resposta firme (a câmera acompanha a mão); solta: suave
    const k = drag.id >= 0 && drag.moved >= 6 ? 12 : 5
    pull = MathUtils.damp(pull, full - dist, full - dist > pull ? 14 : 2.5, dt)
    const arm = Math.max(0.3, full - pull)
    nav.camPos.x = MathUtils.damp(nav.camPos.x, bot.pos.x + sx * arm, k, dt)
    nav.camPos.y = Math.max(0.6, MathUtils.damp(nav.camPos.y, camH + pull * 0.45, k, dt))
    nav.camPos.z = MathUtils.damp(nav.camPos.z, bot.pos.z + sz * arm, k, dt)
    nav.camTarget.x = MathUtils.damp(nav.camTarget.x, bot.pos.x, 8, dt)
    // de perto, o foco sobe do pé para o corpo do BIT
    nav.camTarget.y = 0.55 + 0.22 * (1 - (camDist - DIST_MIN) / (DIST_MAX - DIST_MIN))
    nav.camTarget.z = MathUtils.damp(nav.camTarget.z, bot.pos.z, 8, dt)

    // estação ao alcance (borda + 1 m) → aviso no HUD
    let near: (typeof ST)[number] | null = null
    if (explore) {
      let best = 1.0
      for (const s of ST) {
        const gap = Math.hypot(bot.pos.x - s.x, bot.pos.z - s.z) - s.r
        if (gap < best) { best = gap; near = s }
      }
    }
    nav.near = near ? near.scene : ''
    if ((near?.k ?? '') !== shown) {
      if (near) {
        if (coarsePointer) hud.show('TAP', 'OPEN ' + near.label, 'TAP BIT', near.top)
        else hud.show('[F]', 'OPEN ' + near.label, 'PRESS F · OR CLICK BIT', near.top)
      } else hud.hide()
      shown = near?.k ?? ''
    }

    // marcador do destino do clique
    const mk = marker.current!
    mk.visible = explore && hasTarget
    if (mk.visible) {
      mk.position.set(target.x, 0.012, target.z)
      mk.scale.setScalar(1 + (reducedMotion ? 0 : Math.sin(t * 6) * 0.15))
    }
  })

  const onFloor = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || !freeClick(e)) return // arrasto, UI do DOM ou painel modal
    e.stopPropagation()
    target.copy(e.point)
    clampTarget(target)
    hasTarget = true
    audio.tick()
    nav.mode = 'explore'
  }

  return (
    <>
      <mesh geometry={parts.disc} material={parts.hidden} position={[0, 0.002, 0]} onClick={onFloor} />
      <mesh ref={marker} geometry={parts.ring} material={parts.glow} visible={false} />
    </>
  )
}
