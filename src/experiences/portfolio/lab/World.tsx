import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { useEffect, useMemo, useRef } from 'react'
import {
  NeutralToneMapping,
  Color,
  DirectionalLight,
  MathUtils,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type PerspectiveCamera,
} from 'three'
import { reducedMotion } from '../../../core/env'
import { pointer, updatePointer } from '../../../core/pointer'
import { useRuntime } from '../../../core/runtime'
import { scroll, updateScroll } from '../../../core/scroll'
import { num, path } from '../../../engine/tracks'
import { CAMERA, PALETTE, QUALITY, STATIONS } from '../config'
import { AICore } from './AICore'
import { Backdrop } from './Backdrop'
import { BitController } from './BitController'
import { Belt } from './Belt'
import { Bot } from './Bot'
import { CloudPads } from './CloudPads'
import { DataFlow } from './DataFlow'
import { Desk } from './Desk'
import { Platform } from './Platform'
import { focus, Post } from './Post'
import { Rack } from './Rack'
import { RobotArm } from './RobotArm'
import { createMaterials, U } from './shared'
import { nav, updateStory } from './story'

const pos = [0, 0, 0]
const tgt = [0, 0, 0]
const vPos = new Vector3()
const vTgt = new Vector3()
const floor = new Plane(new Vector3(0, 1, 0), 0)
const ray = new Raycaster()
const ndc = new Vector2()
const hit = new Vector3()
const ePos = new Vector3()
const eTgt = new Vector3()

function Director() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const par = useRef({ yaw: 0, pitch: 0, explore: 0 })

  useEffect(() => {
    camera.near = 0.05
    camera.far = 400
    camera.updateProjectionMatrix()
    if (reducedMotion) U.uEnergy.value = 1
    else gsap.to(U.uEnergy, { value: 1, duration: 2.4, ease: 'power2.out', delay: 0.2 })
    // pré-compila os shaders de TODOS os objetos (inclusive os que só aparecem
    // mais adiante, como as etiquetas do rack e as nuvens) durante a abertura,
    // em paralelo; senão cada um compila na primeira vez que aparece e trava o scroll
    const t = setTimeout(() => { gl.compileAsync(scene, camera).catch(() => {}) }, 400)
    return () => clearTimeout(t)
  }, [camera, gl, scene])

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05)
    updateScroll(dt, reducedMotion ? 30 : 6)
    updatePointer(dt, reducedMotion ? 30 : 4)
    updateStory()
    const p = scroll.smooth * 100
    U.uTime.value = state.clock.elapsedTime
    U.uPointerNdc.value.set(pointer.sx, pointer.sy, pointer.active ? 1 : 0)

    // caminho contínuo: a câmera atravessa as chaves sem frear (só para nas 'hold')
    path(CAMERA.pos, p, pos)
    path(CAMERA.target, p, tgt)
    const k = reducedMotion ? 0 : 1
    par.current.yaw = MathUtils.damp(par.current.yaw, -pointer.sx * 0.08 * k, 2.2, dt)
    par.current.pitch = MathUtils.damp(par.current.pitch, pointer.sy * 0.05 * k, 2.2, dt)
    vTgt.set(tgt[0], tgt[1], tgt[2])
    vPos.set(pos[0], pos[1], pos[2]).sub(vTgt)
    // tela estreita (retrato): recua a câmera para caber a mesma composição
    const aspect = size.width / Math.max(1, size.height)
    if (aspect < 1.25) vPos.multiplyScalar(Math.min(2.4, Math.pow(1.25 / aspect, 0.85)))
    vPos.applyAxisAngle(camera.up, par.current.yaw)
    const r = vPos.length()
    vPos.y += par.current.pitch * r * 0.5
    vPos.setLength(r).add(vTgt)
    vPos.y += Math.sin(state.clock.elapsedTime * 0.35) * 0.02 * k
    // modo explorar: mistura suave da câmera do tour com a câmera que segue o BIT
    const P = par.current
    P.explore = MathUtils.damp(P.explore, nav.mode === 'explore' ? 1 : 0, 2.6, dt)
    if (P.explore > 0.001) {
      ePos.copy(nav.camPos)
      eTgt.copy(nav.camTarget)
      vPos.lerp(ePos, P.explore)
      vTgt.lerp(eTgt, P.explore)
    }
    camera.position.copy(vPos)
    camera.lookAt(vTgt)
    camera.updateMatrixWorld() // o raio do ponteiro (abaixo) usa a câmera deste quadro
    const fov = num(CAMERA.fov, p) + (aspect < 1 ? 6 : 0)
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix() }
    focus.distance = camera.position.distanceTo(vTgt)

    ndc.set(pointer.sx, pointer.sy)
    ray.setFromCamera(ndc, camera)
    if (ray.ray.intersectPlane(floor, hit)) U.uPointer.value.copy(hit)
  })
  return null
}

export function World() {
  const tier = useRuntime('tier')
  const q = QUALITY[tier]
  const gl = useThree((s) => s.gl)
  const m = useMemo(() => createMaterials(), [])

  const lights = useMemo(() => {
    const key = new DirectionalLight(new Color(PALETTE.keyLight), 4.2)
    key.position.set(-5.5, 7.5, 1.8) // da esquerda: sombras visíveis, caindo para a direita
    key.shadow.camera.left = -6.5
    key.shadow.camera.right = 6.5
    key.shadow.camera.top = 6.5
    key.shadow.camera.bottom = -6.5
    key.shadow.camera.near = 2
    key.shadow.camera.far = 24
    key.shadow.bias = -0.0003
    key.shadow.normalBias = 0.02
    // contraluz uniforme (sem mancha no piso): contorna silhuetas em coral
    const rim = new DirectionalLight(new Color(PALETTE.backLight), 1.4)
    rim.position.set(2, 4, -8)
    return { key, rim }
  }, [])

  useEffect(() => {
    gl.toneMapping = NeutralToneMapping
    gl.toneMappingExposure = 0.95
    lights.key.castShadow = q.shadows > 0
    lights.key.shadow.mapSize.set(q.shadows || 512, q.shadows || 512)
    lights.key.shadow.map?.dispose()
    lights.key.shadow.map = null
  }, [gl, lights, q.shadows])

  useEffect(() => () => {
    Object.values(m).forEach((mat) => mat.dispose())
    lights.key.dispose()
    lights.rim.dispose()
  }, [m, lights])

  return (
    <>
      <Director />
      <primitive object={lights.key} />
      <primitive object={lights.key.target} />
      <primitive object={lights.rim} />
      <primitive object={lights.rim.target} />
      <hemisphereLight args={[PALETTE.fillLight, '#e8b9a8', 0.2]} />
      <Backdrop />
      <Platform />
      <Desk m={m} position={STATIONS.desk.pos} rotation={STATIONS.desk.rot} />
      <AICore m={m} position={STATIONS.ai.pos} detail={q.aiDetail} />
      <Rack m={m} position={STATIONS.rack.pos} rotation={STATIONS.rack.rot} cableTo={STATIONS.desk.pos} />
      <RobotArm m={m} position={STATIONS.arm.pos} rotation={STATIONS.arm.rot} />
      <DataFlow m={m} />
      <Belt m={m} />
      <CloudPads m={m} />
      <Bot m={m} />
      <BitController />
      <Post q={q} />
    </>
  )
}
