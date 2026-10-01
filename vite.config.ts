import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Site de usuário no GitHub Pages = base '/'. Em project page, trocar por '/<repo>/'.
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
})
