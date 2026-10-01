import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { resolveExperience } from './experiences/registry'
import './styles/base.css'

// Só a experiência pedida é baixada (code splitting por rota).
const { load, route } = resolveExperience()
const Experience = lazy(load)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Experience route={route} />
    </Suspense>
  </StrictMode>,
)
