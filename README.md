# LHM / Software — o laboratório

Portfólio-experiência de **Luiz Henrique Marinello**: um laboratório 3D flutuante que o visitante percorre pelo scroll, ou pilotando o robô BIT. Todo o 3D é gerado em código, sem modelos baixados: os objetos são procedurais e a luz de estúdio vem de `RoomEnvironment`.

Stack: Vite · React 19 · TypeScript · three.js r186 · React Three Fiber 9 · GSAP (ScrollTrigger, SplitText) · Lenis.

## Rodar

```bash
npm install
npx vite --port 5291      # a porta 5178 é usada por outro projeto
npm run build             # tsc + vite build + rotas estáticas (scripts/postbuild.mjs)
npm run preview
```

### Parâmetros de URL para testar

| Parâmetro | Efeito |
|---|---|
| `?q=high`, `?q=medium`, `?q=low` | força o nível de qualidade (o padrão é detectar e rebaixar se o FPS cair) |
| `?reduced` | simula `prefers-reduced-motion` |
| `?nogl` | simula um navegador sem WebGL (fallback em DOM) |

## A narrativa

Uma única timeline, de 0% a 100% do scroll, com 6 cenas definidas em `src/experiences/portfolio/config.ts` (`SCENES`):

1. **Awakening:** o laboratório vivo e a dica para pilotar o BIT.
2. **System:** vista de cima; SOFTWARE, AUTOMATION e AI presos às estações; dados correndo pelos cabos.
3. **Identity:** a câmera entra no monitor e o terminal digita `whoami` no ritmo do scroll.
4. **Capabilities:** 8 cubos passam pelo scanner da esteira, e cada um faz o laboratório reagir (`CAPABILITIES.reacts`).
5. **Project:** o rack do BellaDesk se abre em camadas; **EXPLORE PROJECT** abre o tour (`/experience/belladesk`).
6. **Contact:** os links da lista `CONTACT` (os itens com `href` vazio não aparecem) e o botão para recomeçar.

Pilotar: **WASD** ou setas (Shift corre), clique ou toque no piso, **E** para abrir a estação próxima, **Esc** para voltar ao tour. Rolar a página também volta ao tour.

## Estrutura

```
src/
  core/        estado fora do React: scroll (Lenis + ScrollTrigger), ponteiro, loop único
               (teto de FPS, modo sob demanda, rebaixa qualidade), ambiente, áudio opt-in
  engine/      Stage (Canvas), trilhas de keyframes (path/num), rótulos presos ao 3D,
               ui/ (moldura 01/06, cursor, HUD diegético, texto que nasce de uma linha)
  experiences/
    registry.ts      cada pasta com index.tsx vira /experience/<pasta>/
    aliases.json     rotas que abrem dentro de outra experiência (belladesk → portfolio)
    portfolio/
      config.ts      cenas, câmera, estações, capacidades, contato, qualidade por nível
      data/          projetos exibidos como artefato (belladesk.ts)
      lab/           a cena 3D: estações, BIT, esteira, rack, fluxo de dados, pós-processamento
      ui/            textos das cenas, rótulos das estações, painel EXPLORE PROJECT
```

## Como estender

- **Trocar ou adicionar o projeto do rack:** crie um arquivo em `data/` no formato de `belladesk.ts`, com camadas de baixo para cima e as paradas do tour.
- **Nova experiência (empresa, produto, campanha):** crie `src/experiences/<slug>/index.tsx`. Ela já fica disponível em `/experience/<slug>/`, e o build gera a página estática.
- **Ajustar ritmo e câmera:** tudo fica em `config.ts`: faixas das cenas, chaves de câmera, `STORY_VH` (comprimento do scroll) e paleta.

## Publicação (GitHub Pages)

`npm run build` copia o `index.html` para `dist/experience/<slug>/` e para o `404.html`, então as rotas respondem 200 sem servidor. Num site de usuário, `base` fica `'/'` (em `vite.config.ts`); numa página de projeto, use `'/<repo>/'`.

## Regras de conteúdo

- **BellaDesk:** aparece só como arquitetura. Sem o nome da empresa, sem telas e sem dados reais, e o módulo de IA aparece como *not enabled in production*.
- **Certificações:** nenhuma é anunciada. A AWS está em andamento.
- **Contato:** e-mail e LinkedIn ficam vazios até serem definidos.
