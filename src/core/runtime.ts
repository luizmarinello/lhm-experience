import { useSyncExternalStore } from 'react'
import { initialTier, type Tier } from './env'

// Estado raro (muda poucas vezes por sessão) que o React precisa enxergar.
// Estado de frame (scroll, ponteiro) fica em objetos mutáveis, fora daqui.
export const runtime = {
  tier: initialTier() as Tier,
  audio: false,
}

type Runtime = typeof runtime
const listeners = new Set<() => void>()

export function setRuntime(patch: Partial<Runtime>) {
  Object.assign(runtime, patch)
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function useRuntime<K extends keyof Runtime>(key: K): Runtime[K] {
  return useSyncExternalStore(subscribe, () => runtime[key])
}

if (import.meta.env.DEV) Object.assign(window as object, { __runtime: runtime })
