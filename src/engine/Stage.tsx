import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, type ReactNode } from 'react'
import { lowerTier, reducedMotion, type Tier } from '../core/env'
import { invalidate, loop, startLoop } from '../core/loop'
import { runtime, setRuntime, useRuntime } from '../core/runtime'

// Palco único: um Canvas fixo atrás do DOM, desenhado pelo loop do GSAP.
// DPR e teto de FPS por nível; o governador rebaixa o nível se o FPS cair.
export interface TierSettings {
  dpr: number
  maxFps: number
}

interface Props {
  tiers: Record<Tier, TierSettings>
  children: ReactNode
  onContextLost?: () => void
  shadows?: boolean
}

function Governor({ tiers }: { tiers: Props['tiers'] }) {
  const setDpr = useThree((s) => s.setDpr)
  const tier = useRuntime('tier')

  useEffect(() => {
    const t = tiers[tier]
    setDpr(Math.min(devicePixelRatio, t.dpr))
    loop.maxFps = t.maxFps
    invalidate()
  }, [tier, tiers, setDpr])

  useEffect(() => {
    loop.demand = reducedMotion
    return startLoop(() => {
      if (runtime.tier === 'low') return false
      setRuntime({ tier: lowerTier(runtime.tier) })
      return true
    })
  }, [])

  return null
}

export function Stage({ tiers, children, onContextLost, shadows = false }: Props) {
  const tier = useRuntime('tier')
  return (
    <Canvas
      className="stage"
      aria-hidden="true"
      frameloop="never"
      shadows={shadows ? 'percentage' : false}
      dpr={Math.min(devicePixelRatio, tiers[tier].dpr)}
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 35, near: 0.1, far: 200, position: [0, 0, 12] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          onContextLost?.()
        })
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
      eventSource={document.documentElement}
      eventPrefix="client"
    >
      <Governor tiers={tiers} />
      {children}
    </Canvas>
  )
}
