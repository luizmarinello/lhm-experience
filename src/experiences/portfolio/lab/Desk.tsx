import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  Group,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  LatheGeometry,
  MeshPhysicalMaterial,
  Object3D,
  PointLight,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  type Material,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { rng } from '../../../engine/random'
import { PALETTE } from '../config'
import { U, type Materials } from './shared'
import { activeCap, cap, sceneT, sceneW } from './story'

// Estação de trabalho: mesa, monitor curvo com um editor de código "vivo",
// teclado, mouse, luminária (com luz real), planta, caneca e cadeira.

/** Curva uma geometria em torno do eixo Y (monitor curvo, côncavo para +z). */
function bend(g: BufferGeometry, R: number) {
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i)
    const a = x / R
    const r = R - z
    p.setXYZ(i, r * Math.sin(a), p.getY(i), R - r * Math.cos(a))
  }
  g.computeVertexNormals()
  return g
}

// Tela do monitor: canvas redesenhado só quando o conteúdo muda.
// Três layouts: 'editor' (código + terminal pequeno), 'terminal' (cena
// IDENTITY: tela cheia, o whoami é digitado no ritmo do scroll) e 'ui'
// (capacidade FRONTEND: a interface de um app).
const CODE: [string, string][][] = [
  [['@Service', '#e0468f']],
  [['public class ', '#c792ea'], ['TicketService', '#ffb347'], [' {', '#d8d2e0']],
  [['  private final ', '#c792ea'], ['TicketRepository', '#ffb347'], [' repo;', '#d8d2e0']],
  [['  private final ', '#c792ea'], ['SocketHub', '#ffb347'], [' live;', '#d8d2e0']],
  [['', '#fff']],
  [['  @Transactional', '#e0468f']],
  [['  public ', '#c792ea'], ['Ticket ', '#ffb347'], ['open', '#7fd6b4'], ['(NewTicket req) {', '#d8d2e0']],
  [['    var t = repo.save(', '#d8d2e0'], ['Ticket', '#ffb347'], ['.from(req));', '#d8d2e0']],
  [['    live.broadcast(', '#d8d2e0'], ['"ticket.created"', '#a5d6a7'], [', t);', '#d8d2e0']],
  [['    workflows.trigger(t);  ', '#d8d2e0'], ['// automação', '#6f6880']],
  [['    return ', '#c792ea'], ['t;', '#d8d2e0']],
  [['  }', '#d8d2e0']],
  [['}', '#d8d2e0']],
]
const FILES = ['▾ src', '  ▾ ticket', '    TicketService.java', '    TicketController.java', '  ▾ realtime', '    SocketHub.java', '  ▾ automation', '    Workflow.java', '  ▾ ai', '    Assistant.java', '▸ web', '▸ docker']

// Terminal da identidade: [texto, cor, tamanho da fonte em px]
export const WHOAMI: [string, string, number][] = [
  ['luiz@lab ~ $ whoami', '#8f879c', 40],
  ['Luiz Henrique Marinello', '#ffffff', 96],
  ['Software Developer', '#ff9c6b', 58],
  ['luiz@lab ~ $ cat focus.txt', '#8f879c', 40],
  ['backend · apis · automation · ai', '#e6e0ee', 44],
]
export const WHOAMI_CHARS = WHOAMI.reduce((n, l) => n + l[0].length, 0)

type Layout = 'editor' | 'terminal' | 'ui'

export class Screen {
  readonly texture: CanvasTexture
  private g: CanvasRenderingContext2D
  private key = ''
  private last = -1
  // layout desenhado em 2048×768 lógicos, rasterizado a 75% (1536×576):
  // cada atualização sobe 3,5 MB para a GPU em vez de 6,3 MB.
  private W = 2048
  private H = 768
  constructor(scale = 0.75) {
    const c = document.createElement('canvas')
    c.width = Math.round(this.W * scale); c.height = Math.round(this.H * scale)
    this.g = c.getContext('2d')!
    this.g.setTransform(scale, 0, 0, scale, 0, 0)
    this.texture = new CanvasTexture(c)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.anisotropy = 8
    this.draw('editor', 0, 0, true)
  }

  /** typed: caracteres já digitados no terminal; t: tempo (s). Redesenha no máximo 20x/s. */
  update(layout: Layout, typed: number, t: number) {
    // editor (visto de longe): estático, com mipmaps (texto nítido à distância)
    // terminal/ui (vistos de perto, atualizam sempre): sem mipmaps, upload barato
    const live = layout !== 'editor'
    const blink = live ? Math.floor(t * 2) % 2 : 0
    const tick = layout === 'ui' ? Math.floor(t * 8) : 0
    const key = layout + '|' + typed + '|' + blink + '|' + tick
    if (key === this.key || t - this.last < 0.05) return
    this.key = key
    this.last = t
    this.draw(layout, typed, t, blink === 0)
    this.texture.generateMipmaps = !live
    this.texture.minFilter = live ? LinearFilter : LinearMipmapLinearFilter
    this.texture.needsUpdate = true
  }

  private bar(title: string) {
    const g = this.g
    g.fillStyle = '#1e1b26'; g.fillRect(0, 0, this.W, 54)
    ;['#ff6f59', '#ffb347', '#7fd6b4'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(34 + i * 30, 27, 9, 0, 7); g.fill() })
    g.font = '500 24px "JetBrains Mono", monospace'; g.fillStyle = '#8f879c'
    g.fillText(title, 150, 35)
  }

  private draw(layout: Layout, typed: number, t: number, cursorOn: boolean) {
    const { g, W, H } = this
    g.fillStyle = '#15131b'; g.fillRect(0, 0, W, H)
    if (layout === 'terminal') {
      this.bar('luiz@lab — zsh')
      let left = typed
      let y = 70
      for (const [txt, col, size] of WHOAMI) {
        const shown = txt.slice(0, Math.max(0, left))
        left -= txt.length
        y += size * 1.12 // linha de base: espaço proporcional ao tamanho da fonte
        g.font = (size > 50 ? '700 ' : '400 ') + size + 'px "JetBrains Mono", monospace'
        g.fillStyle = col
        g.fillText(shown, 110, y)
        if (left < 0 && left > -txt.length - 1 && cursorOn) {
          g.fillStyle = '#7fd6b4'
          g.fillRect(110 + g.measureText(shown).width + 6, y - size * 0.78, size * 0.5, size * 0.9)
        }
        y += size * 0.38
        if (left < 0) break
      }
      if (typed >= WHOAMI_CHARS && cursorOn) { g.fillStyle = '#7fd6b4'; g.fillRect(110, y + 8, 22, 40) }
      return
    }
    if (layout === 'ui') {
      this.bar('ops.app — interface')
      g.fillStyle = '#f4efea'; g.fillRect(0, 54, W, H - 54)
      g.fillStyle = '#2c2a31'; g.fillRect(0, 54, 300, H - 54)
      g.font = '500 26px "Inter Tight", sans-serif'
      ;['Inbox', 'Requests', 'Equipment', 'Messages', 'Automations'].forEach((n, i) => {
        const on = i === Math.floor(t * 0.8) % 5
        if (on) { g.fillStyle = '#ff6f59'; g.fillRect(0, 96 + i * 66, 6, 46) }
        g.fillStyle = on ? '#ffffff' : '#a59fb0'; g.fillText(n, 44, 128 + i * 66)
      })
      for (let i = 0; i < 6; i++) {
        const y = 110 + i * 92
        const hl = i === Math.floor(t * 1.6) % 6
        g.fillStyle = hl ? '#ffe2d8' : '#ffffff'; g.fillRect(350, y, 1000, 72)
        g.fillStyle = ['#ff6f59', '#ffb347', '#7fd6b4', '#e0468f'][i % 4]; g.beginPath(); g.arc(392, y + 36, 14, 0, 7); g.fill()
        g.fillStyle = '#d9d1cb'; g.fillRect(430, y + 22, 380 - (i * 37) % 160, 12); g.fillRect(430, y + 44, 240 + (i * 53) % 200, 10)
      }
      g.fillStyle = '#ffffff'; g.fillRect(1400, 110, 590, 520)
      for (let i = 0; i < 9; i++) {
        const h = 60 + ((Math.sin(t * 1.5 + i) + 1) / 2) * 300
        g.fillStyle = i % 3 === 0 ? '#ff6f59' : '#f1c9bd'
        g.fillRect(1440 + i * 60, 600 - h, 36, h)
      }
      return
    }
    this.bar('lab / BellaDeskApplication.java')
    g.fillStyle = '#1a1822'; g.fillRect(0, 54, 330, H - 54)
    g.font = '400 22px "JetBrains Mono", monospace'
    FILES.forEach((f, i) => { g.fillStyle = i === 2 ? '#ff9c6b' : '#7b7488'; g.fillText(f, 22, 100 + i * 38) })
    g.font = '400 27px "JetBrains Mono", monospace'
    CODE.forEach((line, i) => {
      let x = 420
      g.fillStyle = '#4c465a'; g.fillText(String(i + 1).padStart(2, ' '), 360, 110 + i * 40)
      for (const [txt, col] of line) { g.fillStyle = col; g.fillText(txt, x, 110 + i * 40); x += g.measureText(txt).width }
    })
    g.fillStyle = '#100e15'; g.fillRect(1380, 54, W - 1380, H - 54)
    g.font = '400 25px "JetBrains Mono", monospace'
    g.fillStyle = '#7fd6b4'; g.fillText('luiz@lab ~ $ ' + (cursorOn ? '▍' : ''), 1410, 112)
  }

  dispose() { this.texture.dispose() }
}

function leafGeometry() {
  const s = new Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(0.05, 0.08, 0.06, 0.2, 0, 0.3)
  s.bezierCurveTo(-0.06, 0.2, -0.05, 0.08, 0, 0)
  const g = new ShapeGeometry(s, 8)
  // arqueia a folha para trás (curvatura natural)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    p.setZ(i, -y * y * 1.3 - Math.abs(p.getX(i)) * 0.4)
  }
  g.computeVertexNormals()
  return g
}

export function Desk({ m, position, rotation = 0 }: { m: Materials; position: [number, number, number]; rotation?: number }) {
  const parts = useMemo(() => {
    const display = new Screen()
    const screen = new MeshPhysicalMaterial({ color: new Color('#000000'), emissive: new Color('#ffffff'), emissiveMap: display.texture, emissiveIntensity: 1.05, roughness: 0.15, clearcoat: 1 })
    const R = 1.9
    const screenGeo = bend(new BoxGeometry(1.22, 0.46, 0.004, 64, 1, 1), R)
    const bezel = bend(new BoxGeometry(1.26, 0.5, 0.028, 64, 1, 1), R)

    // teclado: teclas instanciadas
    const keys = new InstancedMesh(new RoundedBoxGeometry(0.026, 0.012, 0.026, 2, 0.004), m.plastic, 4 * 14)
    const accentKeys = new Set([0, 13, 41, 55])
    const o = new Object3D()
    const col = new Color()
    let k = 0
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 14; i++) {
        o.position.set(-0.2 + i * 0.03 + (row % 2) * 0.008, 0.019, -0.045 + row * 0.03)
        o.updateMatrix()
        keys.setMatrixAt(k, o.matrix)
        keys.setColorAt(k, col.set(accentKeys.has(k) ? PALETTE.coral : '#ffffff'))
        k++
      }
    }
    keys.castShadow = true

    // folhas da planta em roseta
    const leaf = leafGeometry()
    const leaves = new InstancedMesh(leaf, m.leaf, 16)
    const r = rng(8)
    for (let i = 0; i < 16; i++) {
      o.position.set(0, 0.13, 0)
      o.rotation.set(-0.25 - r() * 0.5, (i / 16) * Math.PI * 2 + r() * 0.3, 0, 'YXZ')
      o.scale.setScalar(0.7 + r() * 0.6)
      o.updateMatrix()
      leaves.setMatrixAt(i, o.matrix)
    }
    leaves.castShadow = true

    const potGeo = new LatheGeometry([new Vector2(0, 0), new Vector2(0.075, 0), new Vector2(0.09, 0.02), new Vector2(0.1, 0.14), new Vector2(0.095, 0.145), new Vector2(0.085, 0.13), new Vector2(0, 0.13)], 32)
    const mugGeo = new LatheGeometry([new Vector2(0, 0), new Vector2(0.04, 0), new Vector2(0.043, 0.01), new Vector2(0.043, 0.1), new Vector2(0.039, 0.1), new Vector2(0.037, 0.012), new Vector2(0, 0.012)], 32)

    const lampLight = new PointLight(new Color('#ffcf9a'), 1.4, 2.2, 1.6)
    lampLight.castShadow = false
    const bulb = new MeshPhysicalMaterial({ color: new Color('#000'), emissive: new Color('#ffe2b8'), emissiveIntensity: 3 })

    return {
      display, screen, screenGeo, bezel, keys, leaves, leaf, potGeo, mugGeo, lampLight, bulb,
      top: new RoundedBoxGeometry(1.9, 0.045, 0.82, 4, 0.018),
      leg: new RoundedBoxGeometry(0.05, 0.72, 0.7, 2, 0.02),
      bar: new RoundedBoxGeometry(1.6, 0.04, 0.04, 2, 0.015),
      standNeck: new RoundedBoxGeometry(0.06, 0.3, 0.03, 2, 0.012),
      standBase: new RoundedBoxGeometry(0.3, 0.012, 0.18, 2, 0.006),
      kbBase: new RoundedBoxGeometry(0.46, 0.02, 0.15, 3, 0.008),
      mouse: new SphereGeometry(1, 24, 16).scale(0.032, 0.016, 0.05),
      pad: new RoundedBoxGeometry(0.62, 0.004, 0.3, 2, 0.002),
      soil: new CylinderGeometry(0.085, 0.085, 0.01, 24),
      handle: new TorusGeometry(0.026, 0.007, 8, 20, Math.PI),
      lampBase: new CylinderGeometry(0.07, 0.08, 0.02, 32),
      lampArm: new CylinderGeometry(0.008, 0.008, 0.38, 10),
      lampHead: new LatheGeometry([new Vector2(0.02, 0), new Vector2(0.075, -0.06), new Vector2(0.08, -0.075), new Vector2(0.075, -0.075)], 32),
      bulbGeo: new SphereGeometry(0.03, 16, 12),
      seat: new RoundedBoxGeometry(0.5, 0.08, 0.48, 3, 0.035),
      back: new RoundedBoxGeometry(0.46, 0.55, 0.06, 3, 0.03),
      gas: new CylinderGeometry(0.025, 0.03, 0.42, 16),
      spoke: new RoundedBoxGeometry(0.3, 0.03, 0.04, 2, 0.012),
      caster: new SphereGeometry(0.028, 12, 8),
    }
  }, [m])

  useEffect(() => () => {
    Object.values(parts).forEach((p) => {
      if (p && typeof p === 'object' && 'dispose' in p) (p as { dispose: () => void }).dispose()
    })
  }, [parts])

  // tela: identidade digita o whoami no ritmo do scroll; FRONTEND mostra a interface
  useFrame(() => {
    const idW = sceneW('identity', 2)
    const typed = Math.round(Math.min(1, sceneT('identity') / 0.62) * WHOAMI_CHARS)
    const ui = activeCap() === 'FRONTEND' && cap.weight > 0.5
    parts.display.update(ui ? 'ui' : idW > 0.3 ? 'terminal' : 'editor', typed, U.uTime.value)
    // a cadeira rola para o lado quando a câmera chega ao monitor (não tapa a tela)
    const c = chair.current
    if (c) {
      const k = sceneW('identity', 4)
      const e = k * k * (3 - 2 * k)
      c.position.set(0.05 + 0.95 * e, 0, 0.78 + 0.25 * e)
      c.rotation.y = Math.PI + 0.35 + 1.1 * e
    }
  })
  const chair = useRef<Group>(null)

  const H = 0.75
  const M = m as Materials & Record<string, Material>
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* mesa */}
      <mesh geometry={parts.top} material={M.wood} position={[0, H, 0]} castShadow receiveShadow />
      <mesh geometry={parts.leg} material={M.graphite} position={[-0.85, H / 2, 0]} castShadow />
      <mesh geometry={parts.leg} material={M.graphite} position={[0.85, H / 2, 0]} castShadow />
      <mesh geometry={parts.bar} material={M.graphite} position={[0, 0.2, -0.25]} castShadow />
      <mesh geometry={parts.pad} material={M.rubber} position={[0.05, H + 0.024, 0.16]} receiveShadow />

      {/* monitor curvo */}
      <group position={[0, H + 0.38, -0.22]}>
        <mesh geometry={parts.bezel} material={M.graphite} castShadow position={[0, 0, -0.016]} />
        <mesh geometry={parts.screenGeo} material={parts.screen} />
      </group>
      <mesh geometry={parts.standNeck} material={M.metal} position={[0, H + 0.17, -0.26]} castShadow />
      <mesh geometry={parts.standBase} material={M.metal} position={[0, H + 0.028, -0.22]} castShadow />

      {/* teclado e mouse */}
      <group position={[-0.05, H + 0.022, 0.16]}>
        <mesh geometry={parts.kbBase} material={M.graphite} castShadow />
        <primitive object={parts.keys} />
      </group>
      <mesh geometry={parts.mouse} material={M.plastic} position={[0.3, H + 0.04, 0.18]} castShadow />

      {/* luminária articulada com luz de verdade */}
      <group position={[-0.86, H + 0.02, 0.02]} rotation={[0, -0.9, 0]}>
        <mesh geometry={parts.lampBase} material={M.graphite} castShadow />
        <mesh geometry={parts.lampArm} material={M.metal} position={[0.05, 0.18, 0]} rotation={[0, 0, -0.28]} castShadow />
        <mesh geometry={parts.lampArm} material={M.metal} position={[0.19, 0.4, 0.02]} rotation={[0, 0, -1.1]} castShadow />
        <group position={[0.34, 0.44, 0.03]} rotation={[0, 0, -0.5]}>
          <mesh geometry={parts.lampHead} material={M.coral} castShadow />
          <mesh geometry={parts.bulbGeo} material={parts.bulb} position={[0, -0.05, 0]} />
          <primitive object={parts.lampLight} position={[0, -0.09, 0]} />
        </group>
      </group>

      {/* planta e caneca */}
      <group position={[0.74, H + 0.022, -0.2]}>
        <mesh geometry={parts.potGeo} material={M.ceramic} castShadow receiveShadow />
        <mesh geometry={parts.soil} material={M.soil} position={[0, 0.128, 0]} />
        <primitive object={parts.leaves} />
      </group>
      <group position={[0.55, H + 0.022, 0.12]}>
        <mesh geometry={parts.mugGeo} material={M.coral} castShadow />
        <mesh geometry={parts.handle} material={M.coral} position={[0.043, 0.055, 0]} rotation={[0, 0, -Math.PI / 2]} />
      </group>

      {/* cadeira */}
      <group ref={chair} position={[0.05, 0, 0.78]} rotation={[0, Math.PI + 0.35, 0]}>
        <mesh geometry={parts.seat} material={M.graphite} position={[0, 0.48, 0]} castShadow />
        <mesh geometry={parts.back} material={M.graphite} position={[0, 0.85, 0.24]} rotation={[-0.12, 0, 0]} castShadow />
        <mesh geometry={parts.gas} material={M.metal} position={[0, 0.25, 0]} castShadow />
        {[0, 1, 2, 3, 4].map((i) => (
          <group key={i} rotation={[0, (i / 5) * Math.PI * 2, 0]}>
            <mesh geometry={parts.spoke} material={M.graphite} position={[0.15, 0.06, 0]} castShadow />
            <mesh geometry={parts.caster} material={M.rubber} position={[0.29, 0.028, 0]} />
          </group>
        ))}
      </group>
    </group>
  )
}

