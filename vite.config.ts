import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served by GitHub Pages as a project site under bandukwala.me/<repo name>/.
  base: '/compositional-window-management/',
  plugins: [react()],
})
