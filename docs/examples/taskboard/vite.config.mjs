// How the app is built (`vite build`, which server.js does on a first start) and how it is worked on (`npx vite` in this folder, over a CMS that runs on CMS_URL).
// In both the app and the CMS are one address for the browser: the cookie of the login, and the check of where a request comes from, need that.
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const target = process.env.CMS_URL || 'http://localhost:3000'

export default defineConfig({
  plugins: [vue()],
  server: {
    // the proxy keeps the Host of the page (no changeOrigin), so that a request still comes from "the same site" as far as the CMS can tell
    proxy: { '/api': target, '/admin': target, '/_updates': { target, ws: true } }
  },
  build: { outDir: 'dist', emptyOutDir: true }
})
