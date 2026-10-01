import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  Group,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Material,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { reducedMotion } from '../../../core/env'
import { cursor } from '../../../engine/ui/Cursor'
import { hud } from '../../../engine/ui/Hud'
import { PALETTE } from '../config'
import { belladesk, type ProjectLayer } from '../data/belladesk'
import { projectUI } from './projectUI'
import { patch, U, type Materials } from './shared'
import { activeCap, cap, nav, sceneT, sceneW } from './story'

// Rack de servidores = o artefato do BellaDesk. Fechado: gabinete com porta de
// vidro entreaberta, lâminas com LEDs piscando, cabos até a estação. Na cena
// PROJECT a porta abre e as 8 camadas do projeto saem do gabinete numa pilha
// explodida, com barramento de luz e pacotes de requisição/resposta.
const BLADES = 12
const LEDS = 6
const W = 0.66, H = 1.95, Dp = 0.72, T = 0.035
const LAYERS = belladesk.layers.slice(0, BLADES) // de baixo para cima: ocupam as lâminas 0..N-1
const N = LAYERS.length
const idx = (id: string, fb: number) => { const i = LAYERS.findIndex((l) => l.id === id); return i < 0 ? Math.min(fb, N - 1) : i }
const iData = idx('data', 0)
const iRt = idx('realtime', 3)
const iTop = idx('surface', N - 1) // topo do caminho da requisição
let iRail = N - 1 // o barramento vai até a última camada ligada (a IA em standby fica de fora)
while (iRail > 0 && LAYERS[iRail].standby) iRail--

const ACCENT = [PALETTE.amber, PALETTE.coral, PALETTE.amber, PALETTE.mint, PALETTE.mint, PALETTE.magenta, PALETTE.coral, PALETTE.magenta]
const accent = (i: number) => ACCENT[i % ACCENT.length]
const MINT = new Color(PALETTE.mint)
const CORAL = new Color(PALETTE.coral)

// Vista explodida: tudo é função pura de t = sceneT('project') (scrub reversível)
const slotY = (b: number) => 0.16 + b * 0.135
const Y0 = 0.27, GAP = 0.25 // pilha centrada em ~1,15 m: cabe no quadro da câmera da cena
const fwd = (i: number) => 0.68 + (i % 2) * 0.18 // não encosta na porta nem nas laterais
const yaw = (i: number) => (i % 2 ? 0.12 : -0.12)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const ease = (x: number) => x * x * (3 - 2 * x)
const fract = (x: number) => x - Math.floor(x)
const ledX = (l: number) => -W / 2 + 0.1 + l * 0.028
const LED_Z = Dp / 2 - 0.045
const RAIL_X = 0.31, RAIL_Z = 0.77 // barramento vertical ao lado da pilha
const PK = 12 // pacotes por sentido (24 no total)

const o = new Object3D()
const pk = new Object3D()
const tc = new Color()
const anchor = new Vector3()
const noHit = () => {}

/** Etiqueta da camada: nome + tecnologia (a IA em grafite, marcada STANDBY). */
function plateTexture(l: ProjectLayer, stripe: string) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 128
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  const draw = () => {
    const g = c.getContext('2d')!
    const off = !!l.standby
    g.fillStyle = off ? PALETTE.graphite : PALETTE.plastic; g.fillRect(0, 0, 512, 128)
    g.fillStyle = stripe; g.fillRect(0, 0, 12, 128)
    g.fillStyle = off ? '#cfc8d8' : PALETTE.graphite
    g.font = '700 48px "Inter Tight", system-ui, sans-serif'
    g.fillText(l.label, 36, 60, 456)
    g.fillStyle = off ? '#8f879c' : '#6f6880'
    g.font = '500 26px "JetBrains Mono", monospace'
    g.fillText(off ? `${l.tech} · STANDBY` : l.tech, 36, 104, 456)
    tex.needsUpdate = true
  }
  draw()
  // redesenha quando as fontes chegarem (load dispara o download, ready sozinho não)
  Promise.all([document.fonts.load('700 48px "Inter Tight"'), document.fonts.load('500 26px "JetBrains Mono"')]).then(draw).catch(() => {})
  return tex
}

export function Rack({ m, position, rotation = 0, cableTo }: { m: Materials; position: [number, number, number]; rotation?: number; cableTo?: [number, number, number] }) {
  const door = useRef<Group>(null)
  const blades = useRef<(Group | null)[]>([])
  const rings = useRef<Group>(null)
  const ringA = useRef<Mesh>(null)
  const ringB = useRef<Mesh>(null)
  const railL = useRef<Mesh>(null)
  const railR = useRef<Mesh>(null)
  const st = useMemo(() => ({
    t: -1, hover: -1, live: false, rate: 1, gain: 1, data: 0, flare: 0,
    hi: new Float32Array(N), dim: new Float32Array(N).fill(1), out: new Float32Array(N),
  }), [])

  const parts = useMemo(() => {
    const side = new RoundedBoxGeometry(T, H, Dp, 2, 0.012)
    const capGeo = new RoundedBoxGeometry(W, T, Dp, 2, 0.012)
    const back = new RoundedBoxGeometry(W, H, T, 2, 0.012)
    const doorGeo = new RoundedBoxGeometry(W - 0.02, H - 0.06, 0.012, 2, 0.005)
    const doorFrame = new RoundedBoxGeometry(0.02, H - 0.06, 0.03, 2, 0.008)
    const blade = new RoundedBoxGeometry(W - 0.1, 0.1, Dp - 0.12, 2, 0.01)
    const face = new RoundedBoxGeometry(W - 0.09, 0.105, 0.012, 2, 0.004)
    const rim = new BoxGeometry(W - 0.075, 0.117, 0.008) // aparece só como borda em volta da face
    const plate = new PlaneGeometry(0.34, 0.085)
    // grade frontal (ventilação) por shader, sem geometria extra
    const faceMat = patch(new MeshPhysicalMaterial({ color: new Color('#3b3742'), roughness: 0.4, metalness: 0.6 }), {
      vertexHead: 'varying vec2 vUvF;', vertexBody: 'vUvF = uv;',
      fragmentHead: 'varying vec2 vUvF;',
      // fendas filtradas pela derivada: de perto, nítidas; de longe, viram o cinza médio (sem moiré)
      fragmentColor: 'float f = vUvF.x * 64.0; float w = max(fwidth(f), 1e-4); float gx = 1.0 - smoothstep(0.225 - 0.5 * w, 0.225 + 0.5 * w, abs(fract(f - 0.275) - 0.5)); gx = mix(gx, 0.45, smoothstep(0.3, 0.7, w)); gx *= step(0.28, vUvF.y) * step(vUvF.y, 0.72) * step(0.3, vUvF.x); diffuseColor.rgb *= 1.0 - 0.55 * gx;',
    }, 'rack-face')

    // LEDs: piscam por instância no shader (processos rodando), sem CPU.
    // uLedT é uma fase acumulada (mudar a velocidade não dá salto); uLedGain = brilho.
    const uLedT = { value: 0 }
    const uLedGain = { value: 1 }
    const ledMat = patch(new MeshBasicMaterial({ toneMapped: false }), {
      uniforms: { uLedT, uLedGain },
      vertexHead: 'varying float vLed;',
      vertexBody: '#ifdef USE_INSTANCING\n vLed = float(gl_InstanceID);\n#endif',
      fragmentHead: 'uniform float uLedT; uniform float uLedGain; varying float vLed; float hl(float x){ return fract(sin(x * 91.7) * 43758.5); }',
      fragmentColor: 'float h = hl(floor(vLed + 0.5)); float on = step(0.45, fract(h * 17.0 + uLedT * (0.6 + h * 3.0))); diffuseColor.rgb *= mix(0.12, 1.0, on) * uLedGain;',
    }, 'rack-led')
    const leds = new InstancedMesh(new BoxGeometry(0.018, 0.012, 0.006), ledMat, BLADES * LEDS)
    leds.frustumCulled = false // as LEDs das camadas saem do gabinete
    const ledBase: Color[] = []
    const cols = [PALETTE.mint, PALETTE.mint, PALETTE.amber, PALETTE.mint, PALETTE.coral, '#ffffff']
    o.rotation.set(0, 0, 0)
    for (let b = 0; b < BLADES; b++) {
      for (let l = 0; l < LEDS; l++) {
        o.position.set(ledX(l), slotY(b), LED_Z)
        o.updateMatrix()
        leds.setMatrixAt(b * LEDS + l, o.matrix)
        const c = new Color(cols[(b + l) % cols.length]).multiplyScalar(2.2)
        ledBase.push(c)
        leds.setColorAt(b * LEDS + l, c)
      }
    }
    const crown = new RoundedBoxGeometry(W - 0.08, 0.02, 0.02, 2, 0.008)
    const crownMat = new MeshBasicMaterial({ color: new Color(PALETTE.mint).multiplyScalar(2), toneMapped: false })

    // camadas: etiqueta (textura própria) e borda luminosa por lâmina
    const plates = LAYERS.map((l, i) => plateTexture(l, accent(i)))
    const plateMats = plates.map((map) => new MeshBasicMaterial({ map, toneMapped: false }))
    const rimMats = LAYERS.map(() => new MeshBasicMaterial({ toneMapped: false }))
    const rimBase = LAYERS.map((_, i) => new Color(accent(i)))

    // vida da vista explodida: barramento, pacotes e anel do tempo real
    const railGeo = new BoxGeometry(0.008, 1, 0.008)
    const railDown = new MeshBasicMaterial({ toneMapped: false })
    const railUp = new MeshBasicMaterial({ toneMapped: false })
    const packetMat = new MeshBasicMaterial({ toneMapped: false })
    const packets = new InstancedMesh(new CapsuleGeometry(0.009, 0.03, 4, 8), packetMat, PK * 2)
    packets.frustumCulled = false
    for (let k = 0; k < PK * 2; k++) packets.setColorAt(k, tc.copy(k < PK ? CORAL : MINT).multiplyScalar(2.6))
    const ringGeo = new TorusGeometry(1, 0.014, 6, 96)
    const ringMat = () => new MeshBasicMaterial({ toneMapped: false, transparent: true, blending: AdditiveBlending, depthWrite: false })
    const ringMatA = ringMat(), ringMatB = ringMat()

    // cabos: saem da base do rack e serpenteiam pelo piso
    const tubes: TubeGeometry[] = []
    if (cableTo) {
      const start = new Vector3(0, 0.05, -Dp / 2 + 0.05)
      for (let i = 0; i < 3; i++) {
        const end = new Vector3(cableTo[0] - position[0] + i * 0.08, 0.02, cableTo[2] - position[2] + 0.2)
        const mid = start.clone().lerp(end, 0.5).add(new Vector3(0.3 - i * 0.2, 0, 0.6 + i * 0.15))
        const curve = new CatmullRomCurve3([start.clone().add(new Vector3(i * 0.08 - 0.08, 0, 0)), new Vector3(i * 0.06, 0.02, -Dp / 2 - 0.25), mid, end])
        tubes.push(new TubeGeometry(curve, 80, 0.012 + i * 0.003, 8))
      }
    }
    return {
      side, capGeo, back, doorGeo, doorFrame, blade, face, rim, plate, faceMat, uLedT, uLedGain, leds, ledBase, crown, crownMat,
      plates, plateMats, rimMats, rimBase, railGeo, railDown, railUp, packetMat, packets, ringGeo, ringMatA, ringMatB, tubes,
    }
  }, [cableTo, position])

  useEffect(() => {
    st.t = -1 // peças novas: reescreve as matrizes no próximo frame
    return () => {
      for (const p of Object.values(parts).flat()) {
        if (p instanceof InstancedMesh) { p.geometry.dispose(); (p.material as Material).dispose() }
        ;(p as { dispose?: () => void }).dispose?.()
      }
    }
  }, [parts, st])

  const clearHover = () => {
    st.hover = -1
    hud.hide()
    if (cursor.label === 'INSPECT') cursor.label = ''
  }
  // rótulo na borda direita da lâmina (reancorado enquanto ela se move)
  const showHud = (i: number) => {
    const g = blades.current[i]
    if (!g) return
    g.updateWorldMatrix(true, false)
    const L = LAYERS[i]
    hud.show(L.label, L.tech, L.line, anchor.set(0.3, 0, Dp / 2 - 0.06).applyMatrix4(g.matrixWorld))
  }
  useEffect(() => () => { if (st.hover >= 0) clearHover() }, [])

  // hover/clique nas lâminas-camada: só com a pilha aberta na cena PROJECT
  const enter = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    if (!st.live) return
    e.stopPropagation()
    if (st.hover === i) return
    st.hover = i
    cursor.label = 'INSPECT'
    showHud(i)
  }
  const leave = (i: number) => () => { if (st.hover === i) clearHover() }
  const pick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    if (!st.live) return
    e.stopPropagation()
    projectUI.select(LAYERS[i].id)
  }

  useFrame((_, dt) => {
    const P = parts
    const t = sceneT('project')
    const w = sceneW('project')
    const time = reducedMotion ? 0 : U.uTime.value
    const life = w * MathUtils.smoothstep(t, 0.4, 0.55)
    const B = blades.current

    // 1) abertura (porta 0→0,25; camadas 0,12→0,55, escalonadas de CIMA para baixo:
    // a de cima sobe primeiro e nunca é alcançada pela de baixo, sem interpenetração)
    if (t !== st.t) {
      st.t = t
      if (door.current) door.current.rotation.y = -0.55 - 1.45 * ease(clamp01(t / 0.25))
      for (let i = 0; i < N; i++) {
        const g = B[i]
        if (!g) continue
        const k = clamp01((t - 0.12 - (N - 1 - i) * 0.025) / 0.255)
        const kz = ease(clamp01(k / 0.5)) // primeiro desliza para fora...
        const ky = ease(clamp01((k - 0.3) / 0.7)) // ...depois abre o espaçamento
        st.out[i] = kz
        P.plateMats[i].visible = kz > 0.001 // fechado: sem etiqueta (visual original do rack)
        g.position.set(0, MathUtils.lerp(slotY(i), Y0 + i * GAP, ky), kz * fwd(i))
        g.rotation.y = ky * yaw(i)
        g.updateMatrix()
        o.rotation.set(0, g.rotation.y, 0)
        for (let l = 0; l < LEDS; l++) {
          o.position.set(ledX(l), 0, LED_Z).applyMatrix4(g.matrix)
          o.updateMatrix()
          P.leds.setMatrixAt(i * LEDS + l, o.matrix)
        }
      }
      P.leds.instanceMatrix.needsUpdate = true
      const g = B[iRt]
      if (g && rings.current) { rings.current.position.copy(g.position); rings.current.rotation.y = g.rotation.y }
      const y0 = B[0]?.position.y ?? 0, y1 = B[iRail]?.position.y ?? 0
      const L = railL.current, R = railR.current
      if (L && R) {
        L.position.y = R.position.y = (y0 + y1) / 2
        L.scale.y = R.scale.y = Math.max(0.001, y1 - y0)
      }
      if (st.hover >= 0) showHud(st.hover)
    }

    // 2) capacidades em destaque (amortecidas): BACKEND acelera os LEDs,
    // DATA acende o núcleo de dados, FULL STACK dá um brilho geral
    const c = activeCap(), cw = cap.weight
    st.rate = MathUtils.damp(st.rate, c === 'BACKEND' ? 1 + 3.5 * cw : 1, 3, dt)
    st.gain = MathUtils.damp(st.gain, 1 + (c === 'BACKEND' ? 1.2 * cw : 0) + (c === 'FULL STACK' ? 0.4 * cw : 0), 3, dt)
    st.data = MathUtils.damp(st.data, c === 'DATA' ? cw : 0, 3, dt)
    st.flare = MathUtils.damp(st.flare, c === 'FULL STACK' ? cw : 0, 3, dt)
    if (!reducedMotion) P.uLedT.value += dt * st.rate
    P.uLedGain.value = st.gain
    P.crownMat.color.copy(MINT).multiplyScalar(2 + st.flare * 1.6)

    // 3) destaque por camada: hover acende a borda e apaga as outras (~35%)
    st.live = w > 0.5 && t > 0.5 && nav.mode === 'tour' // no explore o rótulo é do BIT
    if (st.hover >= 0 && !st.live) clearHover()
    const breath = 0.5 + 0.5 * Math.sin(time * 1.1)
    for (let i = 0; i < N; i++) {
      const L = LAYERS[i]
      const on = st.live && (i === st.hover || (st.hover < 0 && L.id === projectUI.selected))
      st.hi[i] = MathUtils.damp(st.hi[i], on ? 1 : 0, 8, dt)
      st.dim[i] = MathUtils.damp(st.dim[i], st.hover >= 0 && i !== st.hover ? 0.35 : 1, 8, dt)
      const hi = st.hi[i], dim = st.dim[i]
      const data = i === iData ? st.data : 0
      const rim = dim * (life * (L.standby ? 0.15 + 0.55 * breath : 0.5) + hi * 2.5 + st.flare * 1.2 + data * 6)
      P.rimMats[i].visible = rim > 0.01
      P.rimMats[i].color.copy(P.rimBase[i]).multiplyScalar(rim)
      P.plateMats[i].color.setScalar(st.out[i] * dim * (0.92 + 0.35 * hi + 0.3 * data))
      const led = dim * (L.standby ? 0.15 : 1) * (1 + 1.5 * data)
      for (let l = 0; l < LEDS; l++) P.leds.setColorAt(i * LEDS + l, tc.copy(P.ledBase[i * LEDS + l]).multiplyScalar(led))
    }
    if (P.leds.instanceColor) P.leds.instanceColor.needsUpdate = true

    // 4) vida da vista explodida (só com a cena PROJECT ativa)
    const vis = life > 0.001
    P.packets.visible = vis
    if (railL.current) railL.current.visible = vis
    if (railR.current) railR.current.visible = vis
    if (rings.current) rings.current.visible = vis
    if (!vis) return
    P.railDown.color.copy(CORAL).multiplyScalar(1.5 * life)
    P.railUp.color.copy(MINT).multiplyScalar(1.5 * life)
    P.packetMat.color.setScalar(life)
    // requisição desce (interface → serviços → dados) à esquerda; resposta sobe à direita
    const yTop = B[iTop]?.position.y ?? 0, yBot = B[iData]?.position.y ?? 0
    for (let k = 0; k < PK * 2; k++) {
      const up = k >= PK
      const j = k % PK
      const s = fract(time * 0.18 + Math.floor(j / 3) * 0.25 + (j % 3) * 0.035 + (up ? 0.125 : 0))
      pk.position.set(up ? RAIL_X : -RAIL_X, up ? MathUtils.lerp(yBot, yTop, s) : MathUtils.lerp(yTop, yBot, s), RAIL_Z)
      pk.scale.setScalar(Math.min(1, s * 10, (1 - s) * 10))
      pk.updateMatrix()
      P.packets.setMatrixAt(k, pk.matrix)
    }
    P.packets.instanceMatrix.needsUpdate = true
    // tempo real: um anel sai da lâmina e outro chega (os dois sentidos)
    const a = fract(time * 0.45), b = fract(time * 0.45 + 0.5)
    const kRt = 2.2 * life * st.dim[iRt]
    ringA.current?.scale.set(0.42 * (1 + 0.6 * a), 0.45 * (1 + 0.6 * a), 1)
    ringB.current?.scale.set(0.42 * (1.6 - 0.6 * b), 0.45 * (1.6 - 0.6 * b), 1)
    P.ringMatA.color.copy(MINT).multiplyScalar(kRt * Math.sin(Math.PI * a))
    P.ringMatB.color.copy(MINT).multiplyScalar(kRt * Math.sin(Math.PI * b))
  })

  return (
    <group position={position}>
      <group position={[0, 0.02, 0]} rotation={[0, rotation, 0]}>
        <mesh geometry={parts.side} material={m.graphite} position={[-W / 2 + T / 2, H / 2, 0]} castShadow receiveShadow />
        <mesh geometry={parts.side} material={m.graphite} position={[W / 2 - T / 2, H / 2, 0]} castShadow receiveShadow />
        <mesh geometry={parts.capGeo} material={m.graphite} position={[0, H - T / 2, 0]} castShadow />
        <mesh geometry={parts.capGeo} material={m.graphite} position={[0, T / 2, 0]} />
        <mesh geometry={parts.back} material={m.graphite} position={[0, H / 2, -Dp / 2 + T / 2]} castShadow />
        {/* lâminas-camada (posição/giro escritos no useFrame) */}
        {LAYERS.map((L, i) => (
          <group key={L.id} ref={(g) => { blades.current[i] = g }} position={[0, slotY(i), 0]}
            onPointerOver={enter(i)} onPointerMove={enter(i)} onPointerOut={leave(i)} onClick={pick(i)}>
            <mesh geometry={parts.blade} material={m.darkMetal} castShadow receiveShadow />
            <mesh geometry={parts.rim} material={parts.rimMats[i]} position={[0, 0, Dp / 2 - 0.06]} />
            <mesh geometry={parts.face} material={parts.faceMat} position={[0, 0, Dp / 2 - 0.06]} />
            <mesh geometry={parts.plate} material={parts.plateMats[i]} position={[0.11, 0, Dp / 2 - 0.051]} />
          </group>
        ))}
        {/* lâminas comuns (ficam no gabinete) */}
        {Array.from({ length: BLADES - N }, (_, k) => (
          <group key={k} position={[0, slotY(N + k), 0]}>
            <mesh geometry={parts.blade} material={m.darkMetal} castShadow />
            <mesh geometry={parts.face} material={parts.faceMat} position={[0, 0, Dp / 2 - 0.06]} />
          </group>
        ))}
        <primitive object={parts.leds} />
        <mesh geometry={parts.crown} material={parts.crownMat} position={[0, H - 0.08, Dp / 2 - 0.02]} />
        {/* barramento e pacotes da vista explodida */}
        <mesh ref={railL} geometry={parts.railGeo} material={parts.railDown} position={[-RAIL_X, 0, RAIL_Z]} visible={false} />
        <mesh ref={railR} geometry={parts.railGeo} material={parts.railUp} position={[RAIL_X, 0, RAIL_Z]} visible={false} />
        <primitive object={parts.packets} />
        <group ref={rings} visible={false}>
          <mesh ref={ringA} geometry={parts.ringGeo} material={parts.ringMatA} rotation={[Math.PI / 2, 0, 0]} raycast={noHit} />
          <mesh ref={ringB} geometry={parts.ringGeo} material={parts.ringMatB} rotation={[Math.PI / 2, 0, 0]} raycast={noHit} />
        </group>
        {/* porta de vidro (dobradiça à esquerda): entreaberta, abre na cena PROJECT */}
        <group ref={door} position={[-W / 2 + 0.01, H / 2, Dp / 2 + 0.01]} rotation={[0, -0.55, 0]}>
          <mesh geometry={parts.doorGeo} material={m.glass} position={[W / 2 - 0.01, 0, 0]} />
          <mesh geometry={parts.doorFrame} material={m.graphite} position={[W - 0.02, 0, 0]} castShadow />
          <mesh geometry={parts.doorFrame} material={m.graphite} position={[0.01, 0, 0]} />
        </group>
      </group>
      {parts.tubes.map((g, i) => (
        <mesh key={i} geometry={g} material={i === 1 ? m.coral : m.rubber} castShadow receiveShadow />
      ))}
    </group>
  )
}
