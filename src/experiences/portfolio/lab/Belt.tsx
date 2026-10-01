import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  Path,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector3,
  type Mesh,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { reducedMotion } from '../../../core/env'
import { scrollToProgress } from '../../../core/scroll'
import { cursor } from '../../../engine/ui/Cursor'
import { hud } from '../../../engine/ui/Hud'
import { CAPABILITIES, PALETTE, SCENES, STATIONS } from '../config'
import { patch, U, type Materials } from './shared'
import { cap, nav, sceneT, story } from './story'

// Esteira de capacidades: 8 cubos andam sob um arco-scanner conforme o
// scroll. O deslocamento é função pura de story.p (scrub reversível) e cada
// cubo desacelera ao passar pelo scanner, onde fica em destaque.
const N = CAPABILITIES.length
const L = 4.4, HALF = L / 2 // comprimento (x local −2,2 → 2,2 = mundo −1,8 → 2,6)
const W = 0.5 // largura da lona
const TOP = 0.55 // altura do topo da lona
const S = 0.62 // espaçamento entre cubos
const C = 0.34 // aresta do cubo
const DWELL = 0.75 // 0 = movimento linear; perto de 1 = o cubo quase para sob o scanner
const ARCH_Y = 1.04 // face de baixo da viga do scanner
const ACCENTS = [PALETTE.coral, PALETTE.magenta, PALETTE.amber, PALETTE.mint]
const SCENE_I = SCENES.findIndex((s) => s.id === 'capabilities')
const SCENE = SCENES[SCENE_I]
const pad2 = (n: number) => String(n).padStart(2, '0')
const METAS = CAPABILITIES.map((_, i) => `${pad2(i + 1)} / ${pad2(N)}`)
const CORAL = new Color(PALETTE.coral)
const v = new Vector3()
const xs = new Float32Array(N)

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

/** Deslocamento da lona (m): função pura do scroll. Cubo k fica sob o scanner quando cap.active = k e cap.t = 0,5. */
function beltOffset() {
  const u = sceneT('capabilities') * N // = cap.active + cap.t dentro da cena; 0 antes, N depois
  const k = Math.min(N - 1, Math.floor(u))
  const t = u - k
  return (k + t + (DWELL * Math.sin(2 * Math.PI * t)) / (2 * Math.PI)) * S
}

const FONT_ID = '"Inter Tight", system-ui, sans-serif'
const FONT_MONO = '"JetBrains Mono", monospace'

/** Etiqueta do cubo (frente e topo): índice, nome em negrito e barra na cor de destaque. */
function drawLabel(c: HTMLCanvasElement, i: number) {
  const g = c.getContext('2d')!
  const { id } = CAPABILITIES[i]
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512)
  g.textAlign = 'left'; g.textBaseline = 'alphabetic'
  g.fillStyle = '#8a8494'; g.font = `500 34px ${FONT_MONO}`
  g.fillText(pad2(i + 1), 96, 140)
  // nomes com espaço quebram em duas linhas; a fonte encolhe para caber na face plana
  const words = id.split(' ')
  g.font = `800 100px ${FONT_ID}`
  const wide = Math.max(...words.map((w) => g.measureText(w).width))
  const size = Math.min(100, (100 * 320) / wide)
  g.font = `800 ${size.toFixed(0)}px ${FONT_ID}`
  g.fillStyle = PALETTE.graphite
  words.forEach((w, j) => g.fillText(w, 92, 330 - (words.length - 1 - j) * size * 0.92))
  g.fillStyle = ACCENTS[i % ACCENTS.length]
  g.beginPath(); g.roundRect(96, 372, 72, 14, 7); g.fill()
}

/** Tela do scanner: redesenhada só quando cap.active muda. */
function drawScreen(c: HTMLCanvasElement, k: number) {
  const g = c.getContext('2d')!
  const on = k >= 0
  g.fillStyle = '#15131b'; g.fillRect(0, 0, 1024, 384)
  g.textBaseline = 'alphabetic'
  g.fillStyle = on ? PALETTE.mint : '#5b5468'
  g.beginPath(); g.arc(62, 62, 9, 0, 7); g.fill()
  g.font = `500 30px ${FONT_MONO}`; g.textAlign = 'left'; g.fillStyle = '#8f879c'
  g.fillText('SCANNER', 86, 72)
  g.textAlign = 'right'; g.fillStyle = '#ffffff'; g.font = `500 34px ${FONT_MONO}`
  g.fillText(on ? METAS[k] : `-- / ${pad2(N)}`, 976, 72)
  const text = on ? CAPABILITIES[k].id : 'STANDBY'
  g.textAlign = 'left'; g.font = `800 120px ${FONT_ID}`
  const size = Math.min(120, (120 * 928) / g.measureText(text).width)
  g.font = `800 ${size.toFixed(0)}px ${FONT_ID}`
  g.fillStyle = on ? '#ffffff' : '#6f6880'
  g.fillText(text, 48, 238)
  // progresso: 8 segmentos, o ativo na cor de destaque
  const sw = (928 - 7 * 12) / N
  for (let i = 0; i < N; i++) {
    g.fillStyle = i === k ? ACCENTS[i % ACCENTS.length] : i < k ? '#5b5468' : '#2a2632'
    g.beginPath(); g.roundRect(48 + i * (sw + 12), 292, sw, 14, 7); g.fill()
  }
}

function canvasTex(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return { c, tex }
}

/** Quadrado arredondado centrado (contorno do halo sob o cubo ativo). */
function rrect<T extends Path>(p: T, h: number, r: number): T {
  p.moveTo(-h + r, -h)
  p.lineTo(h - r, -h); p.quadraticCurveTo(h, -h, h, -h + r)
  p.lineTo(h, h - r); p.quadraticCurveTo(h, h, h - r, h)
  p.lineTo(-h + r, h); p.quadraticCurveTo(-h, h, -h, h - r)
  p.lineTo(-h, -h + r); p.quadraticCurveTo(-h, -h, -h + r, -h)
  return p
}

/** Junta as 6 faces do cubo em 3 grupos (destaque +x · etiqueta +y/+z · plástico): metade dos draw calls. */
function regroup<T extends BufferGeometry>(geo: T): T {
  const gr = geo.groups.slice() // RoundedBox não é indexada: faixa do grupo = faixa de vértices
  const idx: number[] = []
  for (const i of [0, 2, 4, 1, 3, 5]) for (let j = gr[i].start; j < gr[i].start + gr[i].count; j++) idx.push(j)
  const a = gr[0].count, b = gr[2].count + gr[4].count
  geo.setIndex(idx)
  geo.clearGroups()
  geo.addGroup(0, a, 0); geo.addGroup(a, b, 1); geo.addGroup(a + b, idx.length - a - b, 2)
  return geo
}

export function Belt({ m }: { m: Materials }) {
  const root = useRef<Group>(null)
  const groups = useRef<(Group | null)[]>([])
  const cubes = useRef<(Mesh | null)[]>([])
  const rings = useRef<(Mesh | null)[]>([])
  const last = useRef(-1)
  const shown = useRef(false)

  const parts = useMemo(() => {
    // lona: nervuras, travessas e bordas tracejadas em coral rolam com o deslocamento
    const off = { value: 0 }
    const beltMat = patch(new MeshPhysicalMaterial({ color: new Color('#3a3640'), roughness: 0.8 }), {
      uniforms: { uOff: off },
      vertexHead: 'varying vec3 vBp;', vertexBody: 'vBp = position;',
      fragmentHead: 'varying vec3 vBp; uniform float uOff;',
      fragmentColor: /* glsl */ `
        float sx = vBp.x - uOff;
        float rib = smoothstep(0.36, 0.5, abs(fract(sx / 0.055) - 0.5));
        diffuseColor.rgb *= 1.0 - 0.3 * rib;
        float cleat = smoothstep(0.46, 0.49, abs(fract(sx / ${(S / 2).toFixed(3)}) - 0.5));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.40, 0.44), cleat);
        float edge = step(${(W / 2 - 0.035).toFixed(3)}, abs(vBp.z)) * step(0.5, fract(sx / 0.12));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.16, 0.10), edge * 0.85);
      `,
    }, 'belt-rubber')

    // lâmina de luz do scanner (aditiva): pisca quando um cubo cruza o centro
    const flash = { value: 0 }
    const sheetMat = patch(new MeshBasicMaterial({ color: CORAL.clone().multiplyScalar(1.1), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }), {
      uniforms: { uFlash: flash },
      vertexHead: 'varying vec2 vUvS;', vertexBody: 'vUvS = uv;',
      fragmentHead: 'varying vec2 vUvS; uniform float uFlash;',
      fragmentColor: /* glsl */ `
        float e = smoothstep(0.0, 0.12, vUvS.x) * smoothstep(1.0, 0.88, vUvS.x);
        float l = 0.8 + 0.2 * sin(vUvS.y * 140.0 - uTime * ${reducedMotion ? '0.0' : '8.0'});
        diffuseColor.rgb *= uFlash * e * mix(1.0, 0.25, vUvS.y) * l;
      `,
    }, 'belt-sheet')
    const emitMat = new MeshBasicMaterial({ color: CORAL.clone().multiplyScalar(1.4), toneMapped: false })

    const screen = canvasTex(1024, 384)
    drawScreen(screen.c, -1)
    const screenMat = new MeshPhysicalMaterial({ color: new Color('#000000'), emissive: new Color('#ffffff'), emissiveMap: screen.tex, emissiveIntensity: 1, roughness: 0.15, clearcoat: 1 })

    // cubos: plástico + etiqueta (frente e topo) + uma face na cor de destaque (+x)
    const boxes = CAPABILITIES.map((_, i) => {
      const accent = new Color(ACCENTS[i % ACCENTS.length])
      const label = canvasTex(512, 512)
      drawLabel(label.c, i)
      const face = m.plastic.clone()
      face.map = label.tex
      const side = new MeshPhysicalMaterial({ color: accent, roughness: 0.35, clearcoat: 0.6, emissive: accent, emissiveIntensity: 0 })
      const glow = new MeshBasicMaterial({ color: accent.clone().multiplyScalar(2.4), transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
      // grupos do cubo (ver regroup): destaque, etiqueta, plástico
      return { label, face, side, glow, mats: [side, face, m.plastic] }
    })

    // roletes instanciados: as pontas aparecem como cabeças metálicas nas laterais
    const rollerCount = Math.round((L - 0.4) / 0.2) + 1
    const rollers = new InstancedMesh(new CylinderGeometry(0.022, 0.022, W + 0.11, 14).rotateX(Math.PI / 2), m.metal, rollerCount)
    const o = new Object3D()
    for (let i = 0; i < rollerCount; i++) {
      o.position.set(-HALF + 0.2 + i * 0.2, TOP - 0.05, 0)
      o.updateMatrix()
      rollers.setMatrixAt(i, o.matrix)
    }

    const halo = rrect(new Shape(), 0.235, 0.07)
    halo.holes.push(rrect(new Path(), 0.205, 0.05))

    return {
      off, flash, beltMat, sheetMat, emitMat, screen, screenMat, boxes, rollers,
      geo: {
        top: new BoxGeometry(L, 0.02, W),
        ret: new BoxGeometry(L, 0.012, W),
        wrap: new CylinderGeometry(0.06, 0.06, W, 32).rotateX(Math.PI / 2),
        drum: new CylinderGeometry(0.05, 0.05, W + 0.12, 32).rotateX(Math.PI / 2),
        rail: new RoundedBoxGeometry(L + 0.16, 0.13, 0.045, 3, 0.018),
        bumper: new RoundedBoxGeometry(0.08, 0.18, W + 0.17, 3, 0.035),
        leg: new RoundedBoxGeometry(0.055, TOP - 0.11, 0.055, 2, 0.015),
        foot: new CylinderGeometry(0.04, 0.045, 0.02, 20),
        cross: new RoundedBoxGeometry(0.035, 0.035, W + 0.055, 2, 0.012),
        motor: new RoundedBoxGeometry(0.32, 0.2, 0.3, 3, 0.05),
        badge: new CylinderGeometry(0.06, 0.06, 0.02, 32).rotateX(Math.PI / 2),
        post: new RoundedBoxGeometry(0.1, ARCH_Y + 0.08, 0.1, 3, 0.03),
        postFoot: new RoundedBoxGeometry(0.16, 0.04, 0.16, 2, 0.015),
        beam: new RoundedBoxGeometry(0.18, 0.15, 0.86, 3, 0.05),
        emitter: new BoxGeometry(0.016, 0.008, W + 0.08),
        laser: new BoxGeometry(0.01, 0.003, W),
        sheet: new PlaneGeometry(W + 0.06, ARCH_Y - TOP - 0.005).rotateY(Math.PI / 2),
        neck: new CylinderGeometry(0.025, 0.025, 0.07, 16),
        housing: new RoundedBoxGeometry(0.52, 0.22, 0.07, 3, 0.03),
        screen: new PlaneGeometry(0.46, 0.1725),
        cube: regroup(new RoundedBoxGeometry(C, C, C, 4, 0.05)),
        halo: new ShapeGeometry(halo, 4).rotateX(-Math.PI / 2),
      },
    }
  }, [m])

  useEffect(() => {
    // fontes do Google podem chegar depois do primeiro desenho: redesenha as etiquetas uma vez
    let dead = false
    Promise.all([document.fonts.load(`800 64px ${FONT_ID}`), document.fonts.load(`500 32px ${FONT_MONO}`)])
      .then(() => {
        if (dead) return
        parts.boxes.forEach((b, i) => { drawLabel(b.label.c, i); b.label.tex.needsUpdate = true })
        drawScreen(parts.screen.c, last.current); parts.screen.tex.needsUpdate = true
      })
      .catch(() => {})
    return () => {
      dead = true
      if (shown.current) { hud.hide(); shown.current = false }
      if (CAPABILITIES.some((c) => c.id === cursor.label)) cursor.label = ''
      Object.values(parts.geo).forEach((g) => g.dispose())
      parts.beltMat.dispose(); parts.sheetMat.dispose(); parts.emitMat.dispose()
      parts.screenMat.dispose(); parts.screen.tex.dispose()
      parts.rollers.geometry.dispose(); parts.rollers.dispose()
      parts.boxes.forEach((b) => { b.label.tex.dispose(); b.face.dispose(); b.side.dispose(); b.glow.dispose() })
    }
  }, [parts])

  useFrame(() => {
    const off = beltOffset()
    parts.off.value = off
    const t = U.uTime.value
    let pass = 0
    for (let k = 0; k < N; k++) {
      const x = off - (k + 0.5) * S
      xs[k] = x
      const g = groups.current[k], cube = cubes.current[k], ring = rings.current[k]
      if (!g || !cube || !ring) continue
      const ax = Math.abs(x)
      const e = smooth((HALF - 0.14 - ax) / 0.25) // nasce na ponta esquerda, some na direita
      g.visible = e > 0.001
      if (!g.visible) continue
      const near = smooth((0.34 - ax) / 0.29) * e // 1 = sob o scanner
      pass = Math.max(pass, Math.exp(-((x / 0.035) ** 2)) * e)
      g.position.x = x
      const bob = reducedMotion ? 0 : Math.sin(t * 2.2 + k) * 0.008 * near
      cube.scale.setScalar(Math.max(e, 0.001))
      cube.position.y = TOP + (C / 2) * e + 0.08 * near + bob
      cube.rotation.set(0.1 * near, -0.38 * near, 0) // mostra a face de destaque para a câmera
      const b = parts.boxes[k]
      b.side.emissiveIntensity = near * 1.3
      b.glow.opacity = near * 0.9
      ring.visible = near > 0.01
    }
    parts.flash.value = 0.12 + 0.25 * cap.weight + 1.6 * pass
    parts.emitMat.color.copy(CORAL).multiplyScalar(1.2 + 1.1 * pass)

    if (cap.active !== last.current) {
      last.current = cap.active
      drawScreen(parts.screen.c, cap.active)
      parts.screen.tex.needsUpdate = true
    }

    // rótulo diegético: só no tour, dentro da cena; esconde apenas se fomos nós que mostramos
    const r = root.current
    if (r && story.scene === SCENE_I && cap.active >= 0 && nav.mode === 'tour') {
      const k = cap.active
      v.set(xs[k], TOP + C + 0.1, C * 0.5)
      r.localToWorld(v)
      hud.show(CAPABILITIES[k].id, CAPABILITIES[k].line, METAS[k], v)
      shown.current = true
    } else if (shown.current) {
      hud.hide()
      shown.current = false
    }
  })

  // cubo escondido continua no raycast do R3F: ignora sem stopPropagation (o clique segue para o piso)
  const live = (k: number) => !!groups.current[k]?.visible
  const over = (k: number) => (e: ThreeEvent<PointerEvent>) => { if (!live(k)) return; e.stopPropagation(); cursor.label = CAPABILITIES[k].id }
  const out = (k: number) => () => { if (cursor.label === CAPABILITIES[k].id) cursor.label = '' }
  // clique leva o tour até o momento em que aquele cubo está sob o scanner
  const go = (k: number) => (e: ThreeEvent<MouseEvent>) => {
    if (!live(k)) return
    e.stopPropagation()
    nav.mode = 'tour'
    scrollToProgress((SCENE.from + ((k + 0.5) / N) * (SCENE.to - SCENE.from)) / 100)
  }

  const G = parts.geo
  const zr = W / 2 + 0.0275 // eixo das laterais
  return (
    <group ref={root} position={STATIONS.belt.pos} rotation={[0, STATIONS.belt.rot, 0]}>
      {/* lona: topo listrado, retorno por baixo e dobras nos tambores */}
      <mesh geometry={G.top} material={parts.beltMat} position={[0, TOP - 0.01, 0]} receiveShadow />
      <mesh geometry={G.ret} material={m.rubber} position={[0, TOP - 0.114, 0]} />
      {[-HALF, HALF].map((x) => (
        <group key={x} position={[x, TOP - 0.06, 0]}>
          <mesh geometry={G.wrap} material={m.rubber} castShadow />
          <mesh geometry={G.drum} material={m.metal} />
        </group>
      ))}
      <primitive object={parts.rollers} />

      {/* chassi grafite, para-choques de plástico, pernas e motor */}
      {[-zr, zr].map((z) => (
        <mesh key={z} geometry={G.rail} material={m.graphite} position={[0, TOP - 0.045, z]} castShadow receiveShadow />
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={G.bumper} material={m.plastic} position={[s * (HALF + 0.12), TOP - 0.045, 0]} castShadow receiveShadow />
      ))}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (HALF - 0.4), 0, 0]}>
          {[-zr, zr].map((z) => (
            <group key={z} position={[0, 0, z]}>
              <mesh geometry={G.leg} material={m.graphite} position={[0, (TOP - 0.11) / 2, 0]} castShadow />
              <mesh geometry={G.foot} material={m.metal} position={[0, 0.01, 0]} />
            </group>
          ))}
          <mesh geometry={G.cross} material={m.graphite} position={[0, 0.12, 0]} castShadow />
        </group>
      ))}
      <mesh geometry={G.motor} material={m.plastic} position={[-HALF + 0.95, 0.26, 0]} castShadow receiveShadow />
      <mesh geometry={G.badge} material={m.coral} position={[-HALF + 0.95, 0.26, 0.155]} />

      {/* arco-scanner */}
      {[-0.37, 0.37].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh geometry={G.post} material={m.graphite} position={[0, (ARCH_Y + 0.08) / 2, 0]} castShadow receiveShadow />
          <mesh geometry={G.postFoot} material={m.plastic} position={[0, 0.02, 0]} castShadow receiveShadow />
        </group>
      ))}
      <mesh geometry={G.beam} material={m.graphite} position={[0, ARCH_Y + 0.075, 0]} castShadow />
      <mesh geometry={G.emitter} material={parts.emitMat} position={[0, ARCH_Y - 0.004, 0]} />
      <mesh geometry={G.laser} material={parts.emitMat} position={[0, TOP + 0.0015, 0]} />
      <mesh geometry={G.sheet} material={parts.sheetMat} position={[0, (ARCH_Y + TOP) / 2, 0]} />
      <mesh geometry={G.neck} material={m.metal} position={[0, ARCH_Y + 0.18, 0]} />
      <group position={[0, ARCH_Y + 0.32, 0]}>
        <mesh geometry={G.housing} material={m.plastic} castShadow />
        <mesh geometry={G.screen} material={parts.screenMat} position={[0, 0, 0.0365]} />
      </group>

      {/* cubos de capacidade */}
      {parts.boxes.map((b, k) => (
        <group key={k} ref={(g) => { groups.current[k] = g }}>
          <mesh ref={(r) => { rings.current[k] = r }} geometry={G.halo} material={b.glow} position={[0, TOP + 0.003, 0]} />
          <mesh
            ref={(c) => { cubes.current[k] = c }}
            geometry={G.cube}
            material={b.mats}
            castShadow
            receiveShadow
            onPointerOver={over(k)}
            onPointerOut={out(k)}
            onClick={go(k)}
          />
        </group>
      ))}
    </group>
  )
}
