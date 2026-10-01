import type { ComponentType } from 'react'
import aliases from './aliases.json'

// Cada pasta em src/experiences/<slug>/index.tsx é uma experiência, servida em
// /experience/<slug>/. Criar uma nova = criar a pasta; nada mais a registrar.
// aliases.json mapeia rotas que abrem DENTRO de outra experiência
// (ex.: /experience/belladesk = portfólio já no modo inspeção do projeto).
// O postbuild (scripts/postbuild.mjs) gera um index.html por slug e alias.
type ExperienceModule = { default: ComponentType<{ route: string }> }

const modules = import.meta.glob<ExperienceModule>('./*/index.tsx')

export const DEFAULT_SLUG = 'portfolio'
export const slugs = Object.keys(modules).map((k) => k.split('/')[1])

export function resolveExperience(pathname = location.pathname) {
  const base = import.meta.env.BASE_URL
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname
  const route = rest.match(/^experience\/([\w-]+)/)?.[1] ?? ''
  const target = (aliases as Record<string, string>)[route] ?? route
  const slug = slugs.includes(target) ? target : DEFAULT_SLUG
  return { slug, route, load: modules[`./${slug}/index.tsx`] }
}
