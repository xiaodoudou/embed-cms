import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = (folder) => path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src', folder)

// Same aliases as vite.config.js, without the plugin symlink side effects of vite.utils.js
export default defineConfig({
  plugins: [vue()],
  resolve: {
    // as in the app: an import may leave out the .vue
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue'],
    alias: {
      '@s': src('services'),
      '@u': src('utils'),
      '@c': src('components'),
      '@m': src('mixins'),
      '@f': src('filters'),
      '@a': src('assets'),
      '@v': src('views'),
      '@l': src('lib'),
      '@r': src('router')
    }
  },
  test: {
    environment: 'jsdom',
    include: ['test/frontend/**/*.test.js'],
    setupFiles: ['test/frontend/helpers/setup.js'],
    restoreMocks: true,
    // Vuetify and the code editor ship ESM with css imports: let vite process them
    server: { deps: { inline: ['vuetify', 'codemirror-editor-vue3'] } },
    css: false
  }
})
