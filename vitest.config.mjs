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
      '@a': src('assets')
    }
  },
  test: {
    environment: 'jsdom',
    include: ['test/frontend/**/*.test.js'],
    setupFiles: ['test/frontend/helpers/setup.js'],
    restoreMocks: true,
    // a few tests of overlays and focus (a dialog opens, a box is selected) depend on how soon jsdom gets to a timer, which on a machine with many cores busy at once is
    // sometimes later than the test waits: they fail one run in five and pass on their own. A failed test is run again, twice, before it counts as failed (the report says which ones were)
    retry: 2,
    // Vuetify and the code editor ship ESM with css imports: let vite process them
    server: { deps: { inline: ['vuetify', 'codemirror-editor-vue3'] } },
    css: false,
    // every test file runs in its own worker with its own jsdom, on purpose: a test can't leak globals, mocks or
    // component state into the next file. Said explicitly, and without the hint that suggests sharing the jsdom
    isolate: true,
    experimental: { diagnostics: { environment: false } }
  }
})
