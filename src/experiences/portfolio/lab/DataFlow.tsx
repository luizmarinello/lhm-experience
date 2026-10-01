import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  TubeGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { reducedMotion } from '../../../core/env'
import { PALETTE, PLATFORM_WALK_R, STATIONS, type StationId } from '../config'
import { patch, U, type Materials } from './shared'
import { activeCap, cap, sceneW } from './story'

// Rede de dados no piso: cabos ligam as estações em circuito
// (rack → IA → mesa → esteira → braço → rack). Cada cabo tem um canal de luz
// no dorso com pulsos no sentido do fluxo, e pacotes (contas de luz) correm
// por dentro. Os cabos rack ↔ mesa já existem em Rack.tsx (não duplicar).

const Y = 0.015 // eixo do cabo, encostado no piso
// onde o cabo some sob o corpo da estação (mesa e esteira têm ponto fixo em port())
const PORT_R = { ai: 0.3, rack: 0.18, arm: 0.2 }
const LANES = [-0.03, 0.03] // dois fios por ligação, lado a lado
const RADII = [0.015, 0.012] // fio grosso escuro + fio fino (coral em algumas ligações)
const MAX_PACKETS = 60
const SAMPLES = 128 // amostras por cabo, uniformes no comprimento
const PKT_SPEED = 1.6 // m por unidade do relógio do fluxo

// via: [t ao longo de a→b, desvio lateral em m (+ = para fora do centro)].
// Rotas conferidas no mapa: não cruzam estações, cadeira, bancadas do braço
// nem os cabos rack → mesa.
const LINKS: { a: StationId; b: StationId; via: [number, number][]; coral: boolean }[] = [
  { a: 'rack', b: 'ai', via: [[-0.15, 0.7], [0.25, 1.0], [0.7, 0.6]], coral: true }, // por trás do rack
  { a: 'ai', b: 'desk', via: [[0.35, 0.35], [0.75, 0.3]], coral: false },
  { a: 'arm', b: 'rack', via: [[0.25, 0.55], [0.7, 0.35]], coral: true }, // por fora da bancada do braço
  { a: 'belt', b: 'arm', via: [[0.3, 0.25], [0.7, 0.3]], coral: false },
  { a: 'desk', b: 'belt', via: [[0.3, 0.55], [0.7, 0.5]], coral: true }, // contorna a cadeira
]

const at = (id: StationId) => new Vector3(STATIONS[id].pos[0], Y, STATIONS[id].pos[2])

/** Ponto no espaço local da estação (com o giro dela) → mundo. */
function local(id: StationId, x: number, z: number) {
  const s = STATIONS[id], c = Math.cos(s.rot), n = Math.sin(s.rot)
  return new Vector3(s.pos[0] + x * c + z * n, Y, s.pos[2] - x * n + z * c)
}

/** Entrada do cabo: pé de perna da mesa mais próximo, pé do arco da esteira, ou sob o corpo das outras estações. */
function port(id: StationId, toward: Vector3) {
  if (id === 'desk') {
    return [local(id, 0.85, -0.2), local(id, 0.85, 0.2), local(id, -0.85, -0.2), local(id, -0.85, 0.2)]
      .reduce((p, q) => (p.distanceTo(toward) < q.distanceTo(toward) ? p : q))
  }
  // sob a lona o piso fica à vista; o pé do arco-scanner (z −0,37, 0,16 × 0,04 m em Belt.tsx) esconde a ponta
  if (id === 'belt') return local(id, 0, -0.37)
  const c = at(id)
  return toward.clone().sub(c).setLength(PORT_R[id]).add(c)
}

// Curvas (só matemática; a geometria nasce no componente). Os dois fios de
// cada ligação seguem a curva central deslocados pela normal local e se
// juntam nas pontas, como um feixe entrando no mesmo furo. A ordem dos
// pontos (a → b) é o sentido do fluxo.
const WIRES = LINKS.flatMap((L) => {
  const A = at(L.a), B = at(L.b)
  const N = new Vector3(A.z - B.z, 0, B.x - A.x).normalize()
  if (N.dot(A.clone().add(B)) < 0) N.negate()
  const via = L.via.map(([t, o]) => A.clone().lerp(B, t).addScaledVector(N, o))
  const core = new CatmullRomCurve3([port(L.a, via[0]), ...via, port(L.b, via[via.length - 1])])
  const len = core.getLength(), S = 24
  return LANES.map((lane, i) => {
    const pts = core.getSpacedPoints(S).map((p, k) => {
      const t = core.getTangentAt(k / S)
      const taper = Math.min(1, ((Math.min(k, S - k) / S) * len) / 0.35)
      return p.add(new Vector3(-t.z, 0, t.x).multiplyScalar(lane * taper))
    })
    return { link: L, curve: new CatmullRomCurve3(pts), r: RADII[i], coral: L.coral && i === 1 }
  })
})

/** Ponto médio de cada ligação, no piso (para rótulos). */
export const FLOW_ANCHORS = LINKS.map((L, i) => ({ id: `${L.a}-${L.b}`, from: L.a, to: L.b, pos: WIRES[i * 2].curve.getPointAt(0.5) }))

// conferência em dev: avisa se um ajuste em STATIONS fizer um cabo invadir outra estação
if (import.meta.env.DEV) {
  for (const { link: L, curve } of WIRES) {
    const hit = curve.getSpacedPoints(64).find((p) => Math.hypot(p.x, p.z) > PLATFORM_WALK_R
      || (Object.keys(STATIONS) as StationId[]).some((id) => id !== L.a && id !== L.b && p.distanceTo(at(id)) < STATIONS[id].radius))
    if (hit) console.warn(`DataFlow: cabo ${L.a} → ${L.b} invade outra estação em`, hit)
  }
}

// Canal de dados: faixa no dorso do cabo; pulsos com cauda correm no sentido
// do fluxo (uv.x reescalado para metros). Uniformes compartilhados pelos dois materiais.
const flow = { uFlow: { value: 0 }, uFlowT: { value: 0 }, uFlowCol: { value: new Color() } }
const CHANNEL = {
  uniforms: flow,
  vertexHead: 'varying float vAlong; varying float vTop;',
  vertexBody: 'vAlong = uv.x; vTop = normalize(mat3(modelMatrix) * objectNormal).y;',
  fragmentHead: 'uniform float uFlow; uniform float uFlowT; uniform vec3 uFlowCol; varying float vAlong; varying float vTop;',
  fragmentEmissive: /* glsl */ `
    float lane = smoothstep(-0.1, 0.85, vTop);
    float pulse = pow(fract(vAlong * 0.9 - uFlowT), 8.0);
    totalEmissiveRadiance += uFlowCol * lane * (0.06 + pulse) * uFlow;
  `,
}

const o = new Object3D()
const tan = new Vector3()
const UP = new Vector3(0, 1, 0)
const col = new Color()
const WARM = new Color(PALETTE.keyLight)
const CORAL = new Color(PALETTE.coral)
const st = { i: 0, a: 0, t: 0 } // intensidade, acento (APIs), relógio do fluxo

export function DataFlow({ m }: { m: Materials }) {
  const parts = useMemo(() => {
    const dark = patch(m.rubber.clone(), CHANNEL, 'flow-cable')
    dark.roughness = 0.6
    const coral = patch(m.coral.clone(), CHANNEL, 'flow-cable')
    const lens = WIRES.map(({ curve }) => curve.getLength())
    const tubes = WIRES.map(({ curve, r }, w) => {
      const g = new TubeGeometry(curve, Math.ceil(lens[w] * 40), r, 10, false)
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * lens[w] + w * 0.37) // metros + defasagem por fio
      return g
    })
    // uma malha por material: 2 draw calls em vez de 10 (cor, sombra e GTAO)
    const pick = (c: boolean) => tubes.filter((_, w) => WIRES[w].coral === c)
    const darkGeo = mergeGeometries(pick(false))!, coralGeo = mergeGeometries(pick(true))!
    tubes.forEach((g) => g.dispose())

    // pacotes: ~1 a cada 0,65 m; amostras uniformes no comprimento para andar sem alocar
    const samples = WIRES.map(({ curve }) => new Float32Array(curve.getSpacedPoints(SAMPLES).flatMap((p) => p.toArray())))
    const pk: { w: number; phase: number; rank: number; speed: number }[] = []
    WIRES.forEach((_, w) => {
      const n = Math.max(2, Math.round(lens[w] / 0.65))
      for (let j = 0; j < n && pk.length < MAX_PACKETS; j++) {
        const k = pk.length
        pk.push({ w, phase: (j + 0.35 * ((k * 0.754877) % 1)) / n, rank: (k * 0.618034) % 1, speed: 0.9 + 0.25 * ((w * 0.618034) % 1) })
      }
    })
    const pktMat = new MeshBasicMaterial({ toneMapped: false })
    const packets = new InstancedMesh(new CapsuleGeometry(0.019, 0.06, 4, 10), pktMat, pk.length)
    packets.instanceMatrix.setUsage(DynamicDrawUsage)
    packets.frustumCulled = false // instâncias espalhadas pela plataforma inteira
    return { dark, coral, darkGeo, coralGeo, lens, samples, pk, pktMat, packets }
  }, [m])

  useEffect(() => () => {
    parts.dark.dispose(); parts.coral.dispose(); parts.darkGeo.dispose(); parts.coralGeo.dispose()
    parts.packets.geometry.dispose(); parts.pktMat.dispose(); parts.packets.dispose()
  }, [parts])

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05)
    const id = activeCap()
    const apis = id === 'APIs' ? cap.weight : 0
    const full = id === 'FULL STACK' ? cap.weight : 0
    // baixo sempre; alto no SYSTEM; médio no FULL STACK; máximo, mais rápido e coral em APIs
    const target = Math.max(0.15, sceneW('system') * 0.7, full * 0.45, apis) * U.uEnergy.value
    st.i = MathUtils.damp(st.i, target, 2.5, dt)
    st.a = MathUtils.damp(st.a, apis, 2.5, dt)
    if (!reducedMotion) st.t += dt * (0.35 + st.i * 0.5 + st.a * 0.9)

    col.copy(WARM).lerp(CORAL, st.a)
    flow.uFlow.value = st.i * 3.2
    flow.uFlowT.value = st.t
    flow.uFlowCol.value.copy(col)
    parts.pktMat.color.copy(col).multiplyScalar(1.5 + st.i * 2.5)

    const density = (0.3 + 0.7 * st.i) * U.uEnergy.value // fração de pacotes visíveis (nenhum antes do boot)
    const { pk, lens, samples, packets } = parts
    for (let k = 0; k < pk.length; k++) {
      const p = pk[k], len = lens[p.w], s = samples[p.w]
      const u = (p.phase + (st.t * PKT_SPEED * p.speed) / len) % 1
      const f = u * SAMPLES, i = Math.min(SAMPLES - 1, Math.floor(f)), r = f - i
      const a = i * 3, b = a + 3
      o.position.set(s[a] + (s[b] - s[a]) * r, s[a + 1] + (s[b + 1] - s[a + 1]) * r, s[a + 2] + (s[b + 2] - s[a + 2]) * r)
      tan.set(s[b] - s[a], s[b + 1] - s[a + 1], s[b + 2] - s[a + 2]).normalize()
      o.quaternion.setFromUnitVectors(UP, tan)
      const edge = Math.min(u, 1 - u) * len // nasce e some dentro das estações
      o.scale.setScalar(MathUtils.clamp((density - p.rank) * 6, 0, 1) * Math.min(1, edge / 0.25))
      o.updateMatrix()
      packets.setMatrixAt(k, o.matrix)
    }
    packets.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <mesh geometry={parts.darkGeo} material={parts.dark} castShadow receiveShadow />
      <mesh geometry={parts.coralGeo} material={parts.coral} castShadow receiveShadow />
      <primitive object={parts.packets} />
    </group>
  )
}
