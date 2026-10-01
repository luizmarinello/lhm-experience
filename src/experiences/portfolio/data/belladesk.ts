// Projeto exibido como artefato (o rack que se abre em camadas).
// Trocar de projeto = escrever outro arquivo com este mesmo formato.
// Regras: sem nome da empresa, sem telas ou dados reais, e a IA aparece
// como módulo que existe mas NÃO está ligado em produção.

export interface ProjectLayer {
  id: string
  label: string // nome da camada (curto, maiúsculas)
  tech: string // tecnologias
  line: string // uma frase sobre o que faz
  standby?: boolean // camada que existe mas não roda em produção
}

export interface Project {
  slug: string
  title: string
  kicker: string
  summary: string
  note: string
  layers: ProjectLayer[] // de baixo (dados) para cima (interface)
  tour: { title: string; layers: string[] }[] // paradas do EXPLORE PROJECT
}

export const belladesk: Project = {
  slug: 'belladesk',
  title: 'BELLADESK',
  kicker: 'INTERNAL OPERATIONS PLATFORM',
  summary: 'Helpdesk, material requests, equipment control and team communication in one system.',
  note: 'ARCHITECTURE VIEW — NO REAL DATA',
  layers: [
    { id: 'data', label: 'DATA CORE', tech: 'PostgreSQL', line: 'Tickets, requests and equipment records.' },
    { id: 'services', label: 'SERVICES', tech: 'Java · Spring Boot', line: 'Helpdesk, materials, equipment and messages.' },
    { id: 'apis', label: 'INTERFACES', tech: 'REST APIs', line: 'Integrations with other company systems.' },
    { id: 'realtime', label: 'REALTIME', tech: 'WebSockets', line: 'Live updates, both directions.' },
    { id: 'automation', label: 'AUTOMATIONS', tech: 'Workflows', line: 'Requests routed and notified on their own.' },
    { id: 'surface', label: 'SURFACE', tech: 'React', line: 'The interface the team uses every day.' },
    { id: 'delivery', label: 'DELIVERY', tech: 'Docker · Git · CI/CD', line: 'Containerized, versioned, shipped by pipeline.' },
    { id: 'ai', label: 'AI MODULE', tech: 'LLM', line: 'Built as a module. Not enabled in production.', standby: true },
  ],
  tour: [
    { title: 'DATA', layers: ['data'] },
    { title: 'SERVICES & APIs', layers: ['services', 'apis'] },
    { title: 'REAL-TIME', layers: ['realtime', 'automation', 'surface'] },
    { title: 'DELIVERY', layers: ['delivery', 'ai'] },
  ],
}
