import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// V devu běží hra na Vite (:5173) a backend na :3000. Požadavky na /api
// proxujeme na backend, takže klient může volat relativní /api/* jako v produkci
// (kde stejný Node server servíruje i statický build).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
