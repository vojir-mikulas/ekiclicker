import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// https://vite.dev/config/
// V devu běží hra na Vite (:5173) a backend na :3000. Požadavky na /api
// proxujeme na backend, takže klient může volat relativní /api/* jako v produkci
// (kde stejný Node server servíruje i statický build).

// ---- Verze buildu ----
// Jedinečná pro každý build (díky timestampu). Klient si ji „zapeče" přes define
// (__APP_VERSION__) a v běhu ji porovnává s /version.json, které servíruje statika.
// Když se liší → na server byla nasazena nová várka → ukaž banner „načti stránku".
const pkgVersion = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version
let gitSha = 'dev'
try {
  gitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim() || 'dev'
} catch {
  /* mimo git repozitář — necháme 'dev' */
}
const BUILD_VERSION = `${pkgVersion}+${gitSha}.${Date.now().toString(36)}`

// Vlastní plugin: do buildu vloží /version.json se STEJNOU verzí, jakou má klient.
// Čerstvě načtený klient tak má shodu (žádný banner); po novém nasazení server
// servíruje novější verzi a staré otevřené karty rozdíl zachytí.
function versionManifest() {
  return {
    name: 'eki-version-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: BUILD_VERSION, builtAt: new Date().toISOString() }),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), versionManifest()],
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
