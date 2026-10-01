import { Color, MeshPhysicalMaterial, Vector3, type Material, type WebGLProgramParametersWithUniforms } from 'three'
import { PALETTE } from '../config'

// Estado de frame compartilhado pelo laboratório (atualizado pelo Director).
export const U = {
  uTime: { value: 0 },
  uPointer: { value: new Vector3(0, -99, 0) }, // ponteiro projetado no piso
  uPointerNdc: { value: new Vector3() }, // ponteiro suavizado em NDC
  uEnergy: { value: 0 }, // 0→1: o laboratório "liga" no boot
}

// Biblioteca de materiais físicos (IBL do RoomEnvironment + luz de estúdio).
// Criados uma vez; os componentes só referenciam.
export function createMaterials() {
  const c = (h: string) => new Color(h)
  return {
    plastic: new MeshPhysicalMaterial({ color: c(PALETTE.plastic), roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18 }),
    matte: new MeshPhysicalMaterial({ color: c('#ece6e1'), roughness: 0.62 }),
    graphite: new MeshPhysicalMaterial({ color: c(PALETTE.graphite), roughness: 0.42, metalness: 0.25, clearcoat: 0.3 }),
    metal: new MeshPhysicalMaterial({ color: c(PALETTE.metal), roughness: 0.28, metalness: 1 }),
    darkMetal: new MeshPhysicalMaterial({ color: c('#55505c'), roughness: 0.35, metalness: 1 }),
    wood: new MeshPhysicalMaterial({ color: c(PALETTE.wood), roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
    coral: new MeshPhysicalMaterial({ color: c(PALETTE.coral), roughness: 0.35, clearcoat: 0.6 }),
    magenta: new MeshPhysicalMaterial({ color: c(PALETTE.magenta), roughness: 0.35, clearcoat: 0.6 }),
    amber: new MeshPhysicalMaterial({ color: c(PALETTE.amber), roughness: 0.4, clearcoat: 0.5 }),
    rubber: new MeshPhysicalMaterial({ color: c('#3a3640'), roughness: 0.85 }),
    glass: new MeshPhysicalMaterial({ color: c('#ffffff'), roughness: 0.06, transmission: 1, thickness: 0.02, ior: 1.45, metalness: 0 }),
    leaf: new MeshPhysicalMaterial({ color: c('#6f9a5a'), roughness: 0.55, sheen: 0.6, sheenColor: c('#b9e39a'), side: 2 }),
    soil: new MeshPhysicalMaterial({ color: c('#5b4436'), roughness: 1 }),
    ceramic: new MeshPhysicalMaterial({ color: c('#e9e1d8'), roughness: 0.25, clearcoat: 1 }),
  }
}
export type Materials = ReturnType<typeof createMaterials>

interface Patch {
  uniforms?: Record<string, { value: unknown }>
  vertexHead?: string
  vertexBody?: string // depois de #include <begin_vertex>
  normalBody?: string // depois de #include <beginnormal_vertex>
  fragmentHead?: string
  fragmentColor?: string // depois de #include <color_fragment>
  fragmentEmissive?: string // depois de #include <emissivemap_fragment>
}

/** Injeta GLSL num material do three (mantém luz, sombra, IBL e névoa). */
export function patch<M extends Material>(mat: M, p: Patch, key: string): M {
  mat.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
    Object.assign(s.uniforms, U, p.uniforms)
    const head = 'uniform float uTime; uniform vec3 uPointer; uniform vec3 uPointerNdc; uniform float uEnergy;\n'
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${head}${p.vertexHead ?? ''}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${p.normalBody ?? ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${p.vertexBody ?? ''}`)
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${head}${p.fragmentHead ?? ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${p.fragmentColor ?? ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${p.fragmentEmissive ?? ''}`)
  }
  mat.customProgramCacheKey = () => key
  return mat
}

// Ruído 3D (simplex, Ashima/Stefan Gustavson, domínio público/MIT) para formas orgânicas.
export const SNOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`
