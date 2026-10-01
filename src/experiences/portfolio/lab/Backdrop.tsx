import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  BackSide,
  Color,
  Fog,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PMREMGenerator,
  ShaderMaterial,
  SphereGeometry,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { rng } from '../../../engine/random'
import { PALETTE } from '../config'
import { U } from './shared'

// Fundo: um "estúdio infinito" com gradiente quente e manchas de cor que
// respiram (o lado orgânico/colorido), orbes de bokeh flutuando e o
// RoomEnvironment como luz de ambiente/reflexos (IBL) — sem baixar HDRI.
const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`
const frag = /* glsl */ `
uniform vec3 uTop, uMid, uLow, uA, uB, uC;
uniform float uTime;
varying vec3 vDir;
float blob(vec3 d, vec3 c, float r) { return exp(-pow(distance(d, normalize(c)) / r, 2.0)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uLow, uMid, smoothstep(-0.35, 0.05, h));
  col = mix(col, uTop, smoothstep(0.0, 0.6, h));
  float t = uTime * 0.05;
  col = mix(col, uA, blob(d, vec3(-1.0, 0.15 + sin(t) * 0.1, -0.6), 0.55) * 0.55);
  col = mix(col, uB, blob(d, vec3(1.0, 0.05, -0.8 + cos(t * 0.8) * 0.15), 0.6) * 0.5);
  col = mix(col, uC, blob(d, vec3(0.2, 0.9, -0.4), 0.7) * 0.35);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export function Backdrop() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  const parts = useMemo(() => {
    const mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new Color(PALETTE.bgTop) },
        uMid: { value: new Color(PALETTE.bgMid) },
        uLow: { value: new Color(PALETTE.bgLow) },
        uA: { value: new Color('#f7a9c8') },
        uB: { value: new Color('#ffc58c') },
        uC: { value: new Color('#d9c7ff') },
        uTime: U.uTime,
      },
    })
    const geo = new SphereGeometry(200, 48, 24)

    // orbes de bokeh: esferas coloridas fora de foco ao redor da plataforma
    const r = rng(21)
    const n = 26
    const orbGeo = new IcosahedronGeometry(1, 3)
    const orbMat = new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.32, depthWrite: false })
    const orbs = new InstancedMesh(orbGeo, orbMat, n)
    const palette = [PALETTE.coral, PALETTE.magenta, PALETTE.amber, '#ffd3e4', '#ffe7c7']
    const seeds = Array.from({ length: n }, () => {
      const a = r() * Math.PI * 2
      const rad = 9 + r() * 16
      return { x: Math.cos(a) * rad, y: -2 + r() * 9, z: Math.sin(a) * rad - 4, s: 0.12 + r() * 0.35, ph: r() * 6.28 }
    })
    const c = new Color()
    seeds.forEach((_, i) => orbs.setColorAt(i, c.set(palette[i % palette.length]).multiplyScalar(1.15)))
    return { mat, geo, orbs, seeds, o: new Object3D() }
  }, [])

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.03).texture
    scene.environment = env
    scene.environmentIntensity = 0.32
    scene.fog = new Fog(new Color(PALETTE.fog), 30, 110)
    room.dispose()
    pmrem.dispose()
    return () => {
      env.dispose()
      scene.environment = null
      scene.fog = null
    }
  }, [gl, scene])

  useEffect(() => () => {
    parts.mat.dispose()
    parts.geo.dispose()
    parts.orbs.geometry.dispose()
    ;(parts.orbs.material as MeshBasicMaterial).dispose()
    parts.orbs.dispose()
  }, [parts])

  useFrame(() => {
    const t = U.uTime.value
    parts.seeds.forEach((s, i) => {
      parts.o.position.set(s.x + Math.sin(t * 0.1 + s.ph) * 0.8, s.y + Math.sin(t * 0.23 + s.ph) * 0.5, s.z)
      parts.o.scale.setScalar(s.s)
      parts.o.updateMatrix()
      parts.orbs.setMatrixAt(i, parts.o.matrix)
    })
    parts.orbs.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <mesh geometry={parts.geo} material={parts.mat} renderOrder={-10} frustumCulled={false} />
      <primitive object={parts.orbs} />
    </>
  )
}
