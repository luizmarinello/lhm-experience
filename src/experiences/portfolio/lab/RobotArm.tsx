import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CylinderGeometry, Group, SphereGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { reducedMotion } from '../../../core/env'
import type { Materials } from './shared'
import { activeCap, cap } from './story'

// Braço robótico (automação): leva um bloco de A para B e de volta, sozinho,
// para sempre. Ângulos das poses vêm de cinemática inversa de 2 elos
// (ombro 0,62 m, antebraço + garra 0,64 m; bases a 0,93 m do eixo).
type Pose = [number, number, number, number] // giro da base, ombro, cotovelo, garra (0 aberta, 1 fechada)
const A = -1.0, B = 1.0 // giro da base até cada bancada (atan2(±0,78, 0,5))
const DOWN: [number, number] = [0.977, -0.113] // garra na altura do bloco (y = 0,45)
const UP: [number, number] = [0.661, -0.121] // bloco erguido 0,3 m
const POSES: Pose[] = [
  [A, ...UP, 0], [A, ...DOWN, 0], [A, ...DOWN, 1], [A, ...UP, 1],
  [B, ...UP, 1], [B, ...DOWN, 1], [B, ...DOWN, 0], [B, ...UP, 0],
  [B, ...DOWN, 0], [B, ...DOWN, 1], [B, ...UP, 1], [A, ...UP, 1],
  [A, ...DOWN, 1], [A, ...DOWN, 0], [A, ...UP, 0], [A, ...UP, 0],
]
const STEP = 0.85 // s por pose
const PAD_X = 0.78, PAD_Z = 0.5, PAD_H = 0.4

const ease = (x: number) => x * x * (3 - 2 * x)

export function RobotArm({ m, position, rotation = 0 }: { m: Materials; position: [number, number, number]; rotation?: number }) {
  const base = useRef<Group>(null)
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const fingerL = useRef<Group>(null)
  const fingerR = useRef<Group>(null)
  const held = useRef<Group>(null)
  const loose = useRef<Group>(null)
  const parts = useMemo(() => ({
    pedestal: new CylinderGeometry(0.26, 0.32, 0.42, 40),
    turret: new CylinderGeometry(0.2, 0.22, 0.14, 40),
    joint: new SphereGeometry(0.1, 24, 16),
    upper: new RoundedBoxGeometry(0.13, 0.62, 0.13, 3, 0.05),
    fore: new RoundedBoxGeometry(0.1, 0.52, 0.1, 3, 0.04),
    wrist: new CylinderGeometry(0.06, 0.06, 0.08, 24),
    finger: new RoundedBoxGeometry(0.025, 0.1, 0.05, 2, 0.01),
    pad: new CylinderGeometry(0.15, 0.17, PAD_H, 32),
    cube: new RoundedBoxGeometry(0.1, 0.1, 0.1, 3, 0.02),
  }), [])
  useEffect(() => () => Object.values(parts).forEach((g) => g.dispose()), [parts])

  // fase acumulada: a velocidade muda sem saltos (AUTOMATION acelera o ciclo)
  const phase = useRef(0)
  useFrame((_, dt) => {
    const c = activeCap()
    const speed = reducedMotion ? 0.35 : 1 + (c === 'AUTOMATION' ? 1.6 * cap.weight : c === 'FULL STACK' ? 0.5 * cap.weight : 0)
    phase.current += Math.min(dt, 0.05) * speed / STEP
    const t = phase.current
    const i = Math.floor(t) % POSES.length
    const a = POSES[i], b = POSES[(i + 1) % POSES.length]
    const k = ease(t - Math.floor(t))
    const p = a.map((v, j) => v + (b[j] - v) * k) as Pose
    if (!base.current || !shoulder.current || !elbow.current) return
    base.current.rotation.y = p[0]
    shoulder.current.rotation.x = p[1]
    elbow.current.rotation.x = p[2]
    const g = 0.036 - p[3] * 0.022
    fingerL.current!.position.x = -g
    fingerR.current!.position.x = g
    // o bloco está na garra (fechada) ou parado na bancada onde foi solto
    const inHand = p[3] > 0.5
    held.current!.visible = inHand
    loose.current!.visible = !inHand
    loose.current!.position.x = i >= 6 && i <= 8 ? PAD_X : -PAD_X
  })

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={parts.pedestal} material={m.graphite} position={[0, 0.21, 0]} castShadow receiveShadow />
      <mesh geometry={parts.pad} material={m.matte} position={[-PAD_X, PAD_H / 2, PAD_Z]} castShadow receiveShadow />
      <mesh geometry={parts.pad} material={m.matte} position={[PAD_X, PAD_H / 2, PAD_Z]} castShadow receiveShadow />
      <group ref={loose} position={[-PAD_X, PAD_H + 0.05, PAD_Z]}>
        <mesh geometry={parts.cube} material={m.amber} castShadow />
      </group>
      <group ref={base} position={[0, 0.49, 0]}>
        <mesh geometry={parts.turret} material={m.plastic} castShadow />
        <group ref={shoulder} position={[0, 0.1, 0]}>
          <mesh geometry={parts.joint} material={m.coral} castShadow />
          <mesh geometry={parts.upper} material={m.plastic} position={[0, 0.31, 0]} castShadow />
          <group ref={elbow} position={[0, 0.62, 0]}>
            <mesh geometry={parts.joint} material={m.coral} scale={0.8} castShadow />
            <group rotation={[Math.PI / 2, 0, 0]}>
              <mesh geometry={parts.fore} material={m.plastic} position={[0, 0.26, 0]} castShadow />
              <group position={[0, 0.54, 0]}>
                <mesh geometry={parts.wrist} material={m.metal} castShadow />
                <group ref={fingerL} position={[-0.036, 0.08, 0]}><mesh geometry={parts.finger} material={m.graphite} castShadow /></group>
                <group ref={fingerR} position={[0.036, 0.08, 0]}><mesh geometry={parts.finger} material={m.graphite} castShadow /></group>
                <group ref={held} position={[0, 0.1, 0]}><mesh geometry={parts.cube} material={m.amber} castShadow /></group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
