import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No GitHub Pages o site é uma "project page": luizmarinello.github.io/lhm-experience/.
// O build (e o preview dele) usa esse caminho; o dev server segue na raiz.
// Se um dia for para a raiz de um domínio (site de usuário ou domínio próprio), troque por '/'.
const PAGES_BASE = '/lhm-experience/'

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1300 },
}))
