import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// A single self-contained ES module (React included) for apps without a bundler:
//   <script type="module" src="cwm-element.js"></script>
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    lib: {
      entry: 'src/index.ts',
      name: 'CwmElement',
      formats: ['es', 'iife'],
      // the iife works from file:// (no server, no modules), as arbor's prototypes are opened
      fileName: (format) => (format === 'es' ? 'cwm-element.js' : 'cwm-element.iife.js'),
    },
  },
})
