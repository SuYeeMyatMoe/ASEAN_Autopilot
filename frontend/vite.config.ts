import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: {
    // The globe (three.js) and world outlines are lazy chunks loaded only where used.
    chunkSizeWarningLimit: 2200,
  },
})
