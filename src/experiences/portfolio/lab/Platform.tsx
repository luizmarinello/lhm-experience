import { useEffect, useMemo } from 'react'
import { Color, LatheGeometry, MeshBasicMaterial, MeshPhysicalMaterial, TorusGeometry, Vector2 } from 'three'
import { PALETTE } from '../config'
import { patch } from './shared'

// Plataforma flutuante: disco com borda arredondada, piso acetinado que
// reflete o estúdio, sulco com fita de luz coral e base que afina para baixo.
export const PLATFORM_R = 4.8

function profile() {
  const R = PLATFORM_R
  const pts: Vector2[] = [new Vector2(0, 0)]
  // topo plano → borda arredondada → saia inclinada → fundo estreito
  pts.push(new Vector2(R - 0.12, 0))
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2)
    pts.push(new Vector2(R - 0.12 + Math.sin(a) * 0.12, -0.12 + Math.cos(a) * 0.12))
  }
  pts.push(new Vector2(R, -0.26))
  pts.push(new Vector2(R - 0.18, -0.34)) // sulco da fita de luz
  pts.push(new Vector2(R - 0.18, -0.4))
  pts.push(new Vector2(R - 0.05, -0.46))
  pts.push(new Vector2(R * 0.72, -1.05))
  pts.push(new Vector2(R * 0.3, -1.45))
  pts.push(new Vector2(0, -1.5))
  return pts.reverse()
}

export function Platform() {
  const parts = useMemo(() => {
    const geo = new LatheGeometry(profile(), 128)
    const mat = patch(
      new MeshPhysicalMaterial({ color: new Color(PALETTE.floor), roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
      {
        vertexHead: 'varying vec3 vP;',
        vertexBody: 'vP = position;',
        fragmentHead: 'varying vec3 vP;',
        fragmentColor: /* glsl */ `
          float r = length(vP.xz);
          float top = step(-0.001, vP.y);
          // incrustações finas em anéis (piso de laboratório), bem sutis
          float rx = r / 0.9;
          float ring = (1.0 - smoothstep(0.002, 0.012, abs(fract(rx + 0.5) - 0.5))) * (1.0 - smoothstep(0.005, 0.015, fwidth(rx))) * top * step(r, ${(PLATFORM_R - 0.3).toFixed(2)});
          diffuseColor.rgb *= 1.0 - ring * 0.07;
          // saia inferior mais escura e quente
          float under = 1.0 - smoothstep(-0.5, -0.3, vP.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.62, 0.62), under * 0.6);
        `,
      },
      'platform',
    )
    const strip = new TorusGeometry(PLATFORM_R - 0.16, 0.022, 8, 180).rotateX(Math.PI / 2).translate(0, -0.37, 0)
    const stripMat = new MeshBasicMaterial({ color: new Color(PALETTE.coral).multiplyScalar(2.4), toneMapped: false })
    return { geo, mat, strip, stripMat }
  }, [])

  useEffect(() => () => {
    parts.geo.dispose(); parts.mat.dispose(); parts.strip.dispose(); parts.stripMat.dispose()
  }, [parts])

  return (
    <group>
      <mesh geometry={parts.geo} material={parts.mat} receiveShadow castShadow />
      <mesh geometry={parts.strip} material={parts.stripMat} />
    </group>
  )
}
