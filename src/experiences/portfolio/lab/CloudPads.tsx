import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  MeshBasicMaterial,
  Vector3,
  type Mesh,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { reducedMotion } from '../../../core/env'
import { CAPABILITIES, PALETTE, STATIONS } from '../config'
import { patch, U, type Materials } from './shared'
import { cap, sceneT } from './story'

// Reação da capacidade CLOUD: três plataformas de vidro com mini-servidores
// saem do topo do rack e flutuam acima dele, ligadas por feixes de dados.
// FULL STACK mostra uma prévia parcial; nas demais capacidades, recolhem.
const RACK = STATIONS.rack.pos
const SRC = new Vector3(RACK[0], 2.0, RACK[2]) // topo do rack (Rack: 0,02 + 1,95)
const PADS: [number, number, number, number, number][] = [ // x, y, z (mundo), giro, escala
  [RACK[0] - 0.8, 2.4, RACK[2] + 0.35, 0.3, 1],
  [RACK[0] + 0.05, 2.75, RACK[2] - 0.3, -0.2, 1.15],
  [RACK[0] + 0.85, 2.35, RACK[2] + 0.4, -0.5, 0.9],
]
const UP = new Vector3(0, 1, 0)
const end = new Vector3()
const dir = new Vector3()

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
const N = CAPABILITIES.length
const I_FULL = CAPABILITIES.findIndex((c) => c.id === 'FULL STACK')
const I_CLOUD = CAPABILITIES.findIndex((c) => c.id === 'CLOUD')

// quão "dentro" da fatia i está u (bordas suaves; a primeira e a última ficam abertas para fora da cena)
const slice = (u: number, i: number) =>
  (i === 0 ? 1 : smooth((u - i) / 0.35)) * (i === N - 1 ? 1 : smooth((i + 1 - u) / 0.35))

/** Visibilidade 0..1, função pura do scroll: CLOUD = 1, FULL STACK = 0,45, demais = 0. */
function cloudVis() {
  const u = sceneT('capabilities') * N // = cap.active + cap.t dentro da cena
  return cap.weight * Math.max(slice(u, I_CLOUD), 0.45 * slice(u, I_FULL))
}

export function CloudPads({ m }: { m: Materials }) {
  const root = useRef<Group>(null)
  const pads = useRef<(Group | null)[]>([])
  const beams = useRef<(Mesh | null)[]>([])

  const parts = useMemo(() => {
    // feixe: pulsos de dados sobem do rack para os pads
    const uVis = { value: 0 }
    const beamMat = patch(new MeshBasicMaterial({ color: new Color(PALETTE.mint).multiplyScalar(2.2), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), {
      uniforms: { uVis },
      vertexHead: 'varying float vBy;', vertexBody: 'vBy = uv.y;',
      fragmentHead: 'varying float vBy; uniform float uVis;',
      fragmentColor: `float d = smoothstep(0.55, 1.0, fract(vBy * 7.0 - uTime * ${reducedMotion ? '0.0' : '1.2'})); diffuseColor.rgb *= uVis * (0.35 + 0.9 * d);`,
    }, 'cloud-beam')
    return {
      uVis, beamMat,
      led: new MeshBasicMaterial({ color: new Color(PALETTE.mint).multiplyScalar(2.4), toneMapped: false }),
      geo: {
        beam: new CylinderGeometry(0.006, 0.006, 1, 6, 1, true).translate(0, 0.5, 0),
        tray: new RoundedBoxGeometry(0.56, 0.035, 0.4, 3, 0.015),
        glass: new RoundedBoxGeometry(0.52, 0.05, 0.36, 3, 0.02),
        server: new RoundedBoxGeometry(0.13, 0.075, 0.18, 2, 0.015),
        led: new BoxGeometry(0.07, 0.008, 0.004),
        port: new CylinderGeometry(0.03, 0.03, 0.01, 20),
      },
    }
  }, [])

  useEffect(() => () => {
    Object.values(parts.geo).forEach((g) => g.dispose())
    parts.beamMat.dispose(); parts.led.dispose()
  }, [parts])

  useFrame(() => {
    const V = cloudVis()
    const r = root.current
    if (!r) return
    r.visible = V > 0.002
    if (!r.visible) return
    parts.uVis.value = Math.min(1, V * 1.6)
    const t = U.uTime.value
    for (let i = 0; i < PADS.length; i++) {
      const g = pads.current[i], b = beams.current[i]
      if (!g || !b) continue
      const s = smooth((V - i * 0.25) / 0.5) // escalonado: com 0,45 só o primeiro pad aparece inteiro
      g.visible = b.visible = s > 0.002
      if (!g.visible) continue
      const P = PADS[i] // x, y, z, giro, escala
      const fl = reducedMotion ? 0 : Math.sin(t * 0.9 + i * 2.1) * 0.035
      end.set(P[0], P[1] + fl, P[2])
      g.position.lerpVectors(SRC, end, s) // sai do topo do rack
      g.scale.setScalar(Math.max(s * P[4], 0.001))
      g.rotation.y = P[3] + (reducedMotion ? 0 : Math.sin(t * 0.4 + i) * 0.08)
      // feixe do topo do rack até a base do pad
      dir.copy(g.position).sub(SRC)
      const len = dir.length()
      b.position.copy(SRC)
      b.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1))
      b.scale.set(1, Math.max(len - 0.02 * s, 0.001), 1)
    }
  })

  const G = parts.geo
  return (
    <group ref={root}>
      {PADS.map((_, i) => (
        <group key={i}>
          <group ref={(g) => { pads.current[i] = g }}>
            <mesh geometry={G.tray} material={m.graphite} castShadow />
            <mesh geometry={G.glass} material={m.glass} position={[0, 0.035, 0]} />
            <mesh geometry={G.port} material={parts.led} position={[0, -0.022, 0]} />
            {[-0.155, 0, 0.155].map((sx, j) => (
              <group key={j} position={[sx, 0.0975, 0]}>
                <mesh geometry={G.server} material={j === 1 ? m.graphite : m.plastic} castShadow />
                <mesh geometry={G.led} material={parts.led} position={[0, 0.012, 0.092]} />
              </group>
            ))}
          </group>
          <mesh ref={(b) => { beams.current[i] = b }} geometry={G.beam} material={parts.beamMat} />
        </group>
      ))}
    </group>
  )
}
