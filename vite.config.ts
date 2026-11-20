import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type PluginOption } from 'vite'

// Optional machine-local plugins (git-ignored), e.g. serving local files to embed in dev.
const localFile = fileURLToPath(new URL('./vite.local.ts', import.meta.url))
const local: PluginOption[] = existsSync(localFile) ? (await import(/* @vite-ignore */ localFile)).default : []

// https://vite.dev/config/
export default defineConfig({
  // Served by GitHub Pages as a project site under bandukwala.me/<repo name>/.
  base: '/compositional-window-management/',
  plugins: [react(), ...local],
})
