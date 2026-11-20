import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The app as a Domicile desktop shell: one ES module whose `Shell` export Domicile calls.
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist-shell',
    lib: { entry: 'src/domicile/shell.tsx', formats: ['es'], fileName: () => 'shell.js' },
  },
})
