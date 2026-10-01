// GitHub Pages não reescreve rotas. Para /experience/<slug>/ responder 200,
// copiamos o index.html para cada experiência (pastas de src/experiences),
// para cada alias (src/experiences/aliases.json) e para o 404.html.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'

const slugs = readdirSync('src/experiences', { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`src/experiences/${d.name}/index.tsx`))
  .map((d) => d.name)
const aliases = Object.keys(JSON.parse(readFileSync('src/experiences/aliases.json', 'utf8')))
const routes = [...new Set([...slugs, ...aliases])]

for (const s of routes) {
  mkdirSync(`dist/experience/${s}`, { recursive: true })
  cpSync('dist/index.html', `dist/experience/${s}/index.html`)
}
cpSync('dist/index.html', 'dist/404.html')
console.log(`postbuild: ${routes.length} rota(s): ${routes.join(', ')}`)
