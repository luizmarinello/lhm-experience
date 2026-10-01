import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { reducedMotion } from '../../../core/env'
import { cursor } from '../../../engine/ui/Cursor'
import { PALETTE } from '../config'
import { U, type Materials } from './shared'
import { audio } from '../../../core/audio'
import { nav, openStation } from './story'

// BIT, o robô-guia: flutua, pisca, olha para o cursor e pode ser pilotado
// (BitController escreve o movimento em `bot`; aqui só se desenha).
export const bot = {
  pos: new Vector3(0.2, 0, 1.1),
  vel: new Vector3(), // m/s no piso
  heading: -0.6, // giro em Y (0 = olhando para +z)
  speed: 0, // m/s
  boost: 0, // 0..1: correndo (Shift)
}

// Os eventos vêm do documento inteiro: clique em UI do DOM sobre o canvas
// (botão, link, painel) ou com diálogo modal aberto (painel do projeto, que
// usa as setas) não é do BIT.
export const uiBusy = () => !!document.querySelector('[aria-modal="true"]')
export const freeClick = (e: ThreeEvent<MouseEvent>) => {
  const el = e.nativeEvent.target
  return !uiBusy() && !(el instanceof Element && el.closest('a, button, input, textarea, select, label, [data-cursor], [role="dialog"]'))
}

const CORAL = new Color(PALETTE.coral)

export function Bot({ m }: { m: Materials }) {
  const root = useRef<Group>(null)
  const head = useRef<Group>(null)
  const eyes = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const hover = useRef(false)
  const parts = useMemo(() => {
    const visor = new MeshPhysicalMaterial({ color: new Color('#15131b'), roughness: 0.08, clearcoat: 1, metalness: 0.2 })
    const eye = new MeshBasicMaterial({ color: new Color(PALETTE.mint).multiplyScalar(2.4), toneMapped: false })
    const thruster = new MeshBasicMaterial({ color: CORAL.clone().multiplyScalar(2.2), toneMapped: false })
    const light = new PointLight(new Color(PALETTE.coral), 0.5, 0.9, 1.8)
    return {
      visor, eye, thruster, light,
      body: new CapsuleGeometry(0.17, 0.14, 10, 32),
      head: new RoundedBoxGeometry(0.4, 0.28, 0.32, 5, 0.1),
      visorGeo: new RoundedBoxGeometry(0.32, 0.17, 0.06, 4, 0.05),
      eyeGeo: new CapsuleGeometry(0.022, 0.04, 6, 12),
      ear: new CylinderGeometry(0.05, 0.05, 0.05, 24),
      antenna: new CylinderGeometry(0.006, 0.006, 0.14, 8),
      tip: new SphereGeometry(0.022, 16, 12),
      arm: new CapsuleGeometry(0.035, 0.12, 6, 12),
      ring: new TorusGeometry(0.11, 0.012, 10, 48),
    }
  }, [])

  useEffect(() => {
    root.current!.rotation.order = 'YXZ' // inclinação no eixo do próprio corpo
    return () => {
      Object.values(parts).forEach((p) => (p as { dispose?: () => void }).dispose?.())
      if (hover.current) cursor.label = ''
    }
  }, [parts])

  const look = useRef({ yaw: 0, pitch: 0, lean: 0, blink: 0, next: 2 })
  useFrame((_, dt) => {
    const t = U.uTime.value
    const r = root.current, h = head.current, e = eyes.current
    if (!r || !h || !e) return
    const k = reducedMotion ? 0 : 1
    const L = look.current
    r.position.set(bot.pos.x, 0.34 + Math.sin(t * 2.1) * 0.035 * k, bot.pos.z)
    r.rotation.y = bot.heading
    L.lean = MathUtils.damp(L.lean, Math.min(bot.speed, 2.6) * 0.1, 6, dt)
    r.rotation.x = L.lean
    r.rotation.z = Math.sin(t * 1.3) * 0.03 * k
    // cabeça: andando, olha para onde vai (entra na curva antes do corpo);
    // parado, segue o cursor com atraso orgânico
    const w = Math.min(1, bot.speed / 0.35)
    const turn = Math.atan2(bot.vel.x, bot.vel.z) - bot.heading
    const moveYaw = MathUtils.clamp(Math.atan2(Math.sin(turn), Math.cos(turn)) * 1.5, -0.7, 0.7)
    const ptrYaw = MathUtils.clamp(U.uPointerNdc.value.x * 0.9, -0.8, 0.8)
    const ptrPitch = MathUtils.clamp(-U.uPointerNdc.value.y * 0.35, -0.3, 0.35)
    L.yaw = MathUtils.damp(L.yaw, MathUtils.lerp(ptrYaw, moveYaw, w), 4, dt)
    L.pitch = MathUtils.damp(L.pitch, MathUtils.lerp(ptrPitch, 0.12, w), 4, dt)
    h.rotation.set(L.pitch, L.yaw, 0)
    e.position.x = L.yaw * 0.025
    // piscar
    L.next -= dt
    if (L.next <= 0) { L.blink = 1; L.next = 2.5 + Math.random() * 3 }
    L.blink = Math.max(0, L.blink - dt * 7)
    e.scale.y = 1 - Math.sin(L.blink * Math.PI) * 0.9
    // turbo: propulsor e antena acendem mais forte
    const B = bot.boost
    parts.thruster.color.copy(CORAL).multiplyScalar(2.2 + B * 2.6)
    parts.light.intensity = 0.45 + Math.sin(t * 6) * 0.08 * k + B * 1.4
    ring.current!.scale.setScalar(1 + B * 0.3)
    if (hover.current) cursor.label = nav.near ? 'OPEN' : 'DRIVE'
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || !freeClick(e)) return // arrasto (orbitar a câmera) não é clique
    e.stopPropagation()
    if (nav.near) { audio.open(); openStation(nav.near) }
    else nav.mode = 'explore'
  }

  return (
    <group
      ref={root}
      onClick={onClick}
      onPointerOver={(e) => { e.stopPropagation(); hover.current = true }}
      onPointerOut={() => { if (hover.current) cursor.label = ''; hover.current = false }}
    >
      <mesh geometry={parts.body} material={m.plastic} castShadow />
      <mesh geometry={parts.arm} material={m.plastic} position={[-0.2, -0.02, 0]} rotation={[0.2, 0, 0.35]} castShadow />
      <mesh geometry={parts.arm} material={m.plastic} position={[0.2, -0.02, 0]} rotation={[-0.1, 0, -0.35]} castShadow />
      <group ref={head} position={[0, 0.33, 0]}>
        <mesh geometry={parts.head} material={m.plastic} castShadow />
        <mesh geometry={parts.visorGeo} material={parts.visor} position={[0, 0, 0.14]} />
        <group ref={eyes} position={[0, 0.005, 0.175]}>
          <mesh geometry={parts.eyeGeo} material={parts.eye} position={[-0.06, 0, 0]} />
          <mesh geometry={parts.eyeGeo} material={parts.eye} position={[0.06, 0, 0]} />
        </group>
        <mesh geometry={parts.ear} material={m.coral} position={[-0.215, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
        <mesh geometry={parts.ear} material={m.coral} position={[0.215, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
        <mesh geometry={parts.antenna} material={m.metal} position={[0.08, 0.2, 0]} />
        <mesh geometry={parts.tip} material={parts.thruster} position={[0.08, 0.28, 0]} />
      </group>
      <mesh ref={ring} geometry={parts.ring} material={parts.thruster} position={[0, -0.27, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <primitive object={parts.light} position={[0, -0.32, 0]} />
    </group>
  )
}
