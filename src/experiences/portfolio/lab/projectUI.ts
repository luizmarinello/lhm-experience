// Camada do projeto selecionada no rack (clique na lâmina). O painel DOM escuta.
export const projectUI = {
  selected: '' as string,
  listeners: new Set<() => void>(),
  select(id: string) {
    if (id === projectUI.selected) return
    projectUI.selected = id
    projectUI.listeners.forEach((f) => f())
  },
}
