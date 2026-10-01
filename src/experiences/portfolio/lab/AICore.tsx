import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  PointLight,
  TorusGeometry,
  Vector3,
} from 'three'
import { PALETTE } from '../config'
import { patch, SNOISE, U, type Materials } from './shared'
import { activeCap, cap, sceneW } from './story'

// A escultura de IA: uma forma orgânica e iridescente que "pensa" (ondula
// com ruído), se estica na direção do cursor e tinge o piso com luz colorida.
const Y = new Vector3(0, 1, 0)
const D = /* glsl */ `
uniform vec3 uAim;
uniform float uAimAmt;
varying float vN;
float field(vec3 n) {
  float t = uTime * 0.22;
  float a = snoise(n * 1.05 + vec3(0.0, t, 0.0)) * 0.16;
  a += snoise(n * 2.2 - vec3(t * 1.3)) * 0.035;
  a += smoothstep(0.55, 1.0, dot(n, uAim)) * uAimAmt; // estende-se ao cursor
  return a;
}
vec3 Dp(vec3 p) { vec3 n = normalize(p); return n * (1.0 + field(n)); }
`

export function AICore({ m, position, detail }: { m: Materials; position: [number, number, number]; detail: number }) {
  const group = useRef<Group>(null)
  const blob = useRef<Group>(null)
  const parts = useMemo(() => {
    const aim = { value: new Vector3(0, 0, 1) }
    const aimAmt = { value: 0 }
    const mat = patch(
      new MeshPhysicalMaterial({
        color: new Color('#ffd6e6'),
        roughness: 0.06,
        envMapIntensity: 2.4,
        metalness: 0,
        transmission: 0.92,
        thickness: 0.9,
        ior: 1.35,
        attenuationColor: new Color(PALETTE.magenta),
        attenuationDistance: 0.9,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        iridescence: 1,
        iridescenceIOR: 1.55,
        iridescenceThicknessRange: [180, 720],
        sheen: 0.5,
        sheenColor: new Color('#ffd0a8'),
        emissive: new Color(PALETTE.magenta),
        emissiveIntensity: 0.06,
      }),
      {
        uniforms: { uAim: aim, uAimAmt: aimAmt },
        vertexHead: SNOISE + D,
        normalBody: /* glsl */ `
          vec3 aiN0 = normalize(position);
          vec3 aiT = normalize(cross(aiN0, abs(aiN0.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vec3 aiB = cross(aiN0, aiT);
          float e = 0.012;
          vec3 aiP = Dp(position);
          vec3 aiP1 = Dp(position + aiT * e);
          vec3 aiP2 = Dp(position + aiB * e);
          objectNormal = normalize(cross(aiP1 - aiP, aiP2 - aiP));
          vN = field(aiN0);
        `,
        vertexBody: 'transformed = aiP;',
        fragmentHead: 'varying float vN;',
        fragmentColor: /* glsl */ `
          vec3 cA = vec3(1.0, 0.62, 0.82);
          vec3 cB = vec3(1.0, 0.78, 0.6);
          vec3 cC = vec3(1.0, 0.95, 0.9);
          float k = clamp(vN * 2.2 + 0.5, 0.0, 1.0);
          diffuseColor.rgb = mix(cA, mix(cB, cC, smoothstep(0.6, 1.0, k)), k);
        `,
      },
      'ai-core',
    )
    const geo = new IcosahedronGeometry(1, detail)
    const glow = new PointLight(new Color(PALETTE.magenta), 2.5, 4, 1.8)
    const ring = new TorusGeometry(0.78, 0.012, 12, 160)
    const ring2 = new TorusGeometry(0.92, 0.006, 8, 160)
    const pedestal = new CylinderGeometry(0.34, 0.42, 0.5, 48)
    const cap = new CylinderGeometry(0.36, 0.36, 0.03, 48)
    const capGlow = new MeshBasicMaterial({ color: new Color(PALETTE.amber).multiplyScalar(1.8), toneMapped: false })
    const sat = new InstancedMesh(new IcosahedronGeometry(0.025, 2), m.ceramic, 9)
    return { mat, geo, glow, ring, ring2, pedestal, cap, capGlow, sat, aim, aimAmt, o: new Object3D(), tmp: new Vector3() }
  }, [m, detail])

  useEffect(() => () => {
    parts.mat.dispose(); parts.geo.dispose(); parts.ring.dispose(); parts.ring2.dispose()
    parts.pedestal.dispose(); parts.cap.dispose(); parts.capGlow.dispose(); parts.sat.geometry.dispose(); parts.sat.dispose(); parts.glow.dispose()
  }, [parts])

  const boost = useRef(0)
  useFrame((_, dt) => {
    const t = U.uTime.value
    const b = blob.current
    const g = group.current
    if (!b || !g) return
    // reação: cena SYSTEM (leve), capacidade AI (forte), FULL STACK (média)
    const c = activeCap()
    const want = Math.max(sceneW('system') * 0.45, c === 'AI' ? cap.weight : 0, c === 'FULL STACK' ? 0.4 * cap.weight : 0)
    boost.current += (want - boost.current) * (1 - Math.exp(-3 * dt))
    const k = boost.current
    b.scale.setScalar(1 + 0.2 * k)
    parts.mat.emissiveIntensity = 0.06 + 0.35 * k
    b.position.y = 1.32 + Math.sin(t * 0.9) * 0.05
    b.rotation.y = t * 0.12
    // direção do cursor no espaço do objeto (a forma "olha" para ele)
    parts.tmp.set(U.uPointerNdc.value.x * 2.2, 0.4 + U.uPointerNdc.value.y * 1.4, 2.4).normalize()
    parts.tmp.applyAxisAngle(Y, -b.rotation.y)
    parts.aim.value.lerp(parts.tmp, 1 - Math.exp(-3 * dt)).normalize()
    parts.aimAmt.value += ((U.uPointerNdc.value.z > 0 ? 0.16 : 0.05) + k * 0.12 - parts.aimAmt.value) * (1 - Math.exp(-2 * dt))
    g.children[0].rotation.set(1.2 + Math.sin(t * 0.3) * 0.1, t * (0.35 + k * 1.2), 0)
    g.children[1].rotation.set(1.9, -t * 0.22, 0.4)
    for (let i = 0; i < 9; i++) {
      const a = t * (0.4 + i * 0.05) + i * 0.7
      parts.o.position.set(Math.cos(a) * (1.05 + (i % 3) * 0.12), 1.32 + Math.sin(a * 1.7 + i) * 0.35, Math.sin(a) * (1.05 + (i % 3) * 0.12))
      parts.o.scale.setScalar(0.7 + (i % 4) * 0.25)
      parts.o.updateMatrix()
      parts.sat.setMatrixAt(i, parts.o.matrix)
    }
    parts.sat.instanceMatrix.needsUpdate = true
    parts.glow.intensity = 2.2 + Math.sin(t * 1.3) * 0.6 + k * 4
  })

  return (
    <group position={position} ref={group}>
      <mesh geometry={parts.ring} material={m.metal} position={[0, 1.32, 0]} castShadow />
      <mesh geometry={parts.ring2} material={m.coral} position={[0, 1.32, 0]} />
      <group ref={blob}>
        <mesh geometry={parts.geo} material={parts.mat} scale={0.5} castShadow />
      </group>
      <primitive object={parts.sat} />
      <mesh geometry={parts.pedestal} material={m.graphite} position={[0, 0.25, 0]} castShadow receiveShadow />
      <mesh geometry={parts.cap} material={parts.capGlow} position={[0, 0.51, 0]} />
      <primitive object={parts.glow} position={[0, 1.3, 0.2]} />
    </group>
  )
}
