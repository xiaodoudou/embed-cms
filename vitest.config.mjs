import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = (folder) => path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src', folder)

// Same aliases as vite.config.js, without the plugin symlink side effects of vite.utils.js
export default defineConfig({
  resolve: {
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
    restoreMocks: true
  }
})
