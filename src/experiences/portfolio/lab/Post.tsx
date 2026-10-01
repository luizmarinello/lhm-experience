import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { HalfFloatType, Vector2, WebGLRenderTarget, type PerspectiveCamera } from 'three'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { updateAnchors } from '../../../engine/anchors'
import type { Quality } from '../config'

// Pós-processamento (o "acabamento de câmera"): MSAA no alvo de render,
// oclusão de ambiente (GTAO), bloom só nas luzes fortes, profundidade de
// campo e, por último, tone mapping + sRGB. Cada efeito liga por nível.
export const focus = { distance: 9 }

export function Post({ q }: { q: Quality }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const fx = useMemo(() => {
    const rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 }) // o GTAO tem G-buffer próprio: MSAA aqui não o afeta
    const composer = new EffectComposer(gl, rt)
    composer.addPass(new RenderPass(scene, camera))
    let gtao: GTAOPass | null = null
    if (q.ao) {
      gtao = new GTAOPass(scene, camera, 1, 1)
      gtao.blendIntensity = 0.85
      gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 })
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 })
      composer.addPass(gtao)
    }
    let bloom: UnrealBloomPass | null = null
    if (q.bloom) {
      bloom = new UnrealBloomPass(new Vector2(1, 1), 0.18, 0.35, 1.6) // só luzes/telas (emissivos > 1,6), nunca o piso
      composer.addPass(bloom)
    }
    let bokeh: BokehPass | null = null
    if (q.dof) {
      bokeh = new BokehPass(scene, camera, { focus: 9, aperture: 0.0005, maxblur: 0.004 })
      composer.addPass(bokeh)
    }
    composer.addPass(new OutputPass())
    return { composer, gtao, bloom, bokeh, rt }
  }, [gl, scene, camera, q.ao, q.bloom, q.dof])

  useEffect(() => {
    fx.composer.setPixelRatio(dpr)
    fx.composer.setSize(size.width, size.height)
  }, [fx, size.width, size.height, dpr])

  useEffect(() => () => {
    fx.composer.dispose()
    fx.gtao?.dispose()
    fx.bloom?.dispose()
    fx.bokeh?.dispose()
    fx.rt.dispose()
  }, [fx])

  // prioridade 1: assume o render (o R3F deixa de desenhar sozinho)
  useFrame((_, dt) => {
    // rótulos DOM projetados depois de todos os useFrame (cubos, lâminas e câmera
    // já no lugar); o lookAt só grava o quaternion, então atualiza as matrizes antes
    camera.updateMatrixWorld()
    updateAnchors(camera, size.width, size.height)
    if (fx.bokeh) {
      const u = (fx.bokeh.uniforms as Record<string, { value: number }>)
      u.focus.value = focus.distance
    }
    fx.composer.render(dt)
  }, 1)

  return null
}
