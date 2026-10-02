import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { createRequire } from 'node:module'

// dist/kit.css: the tokens and the UI kit in one stylesheet, for pages that a plugin serves itself and for plugins that style a shadow root

const ROOT = path.resolve(__dirname, '../..')
const require = createRequire(import.meta.url)

describe('the stylesheet of the UI kit (kit.css)', () => {
  it('is emitted at the build, with the tokens of both themes and the compiled kit', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const plugin = require(path.join(ROOT, 'vite.utils.js')).getInstance().kitStylesheetPlugin()
    expect(plugin.apply).toBe('build')
    const emitted = []
    plugin.generateBundle.call({ emitFile: (file) => emitted.push(file) })
    expect(emitted).toHaveLength(1)
    expect(emitted[0].fileName).toBe('kit.css')
    expect(emitted[0].source).toMatch(/:root\[data-theme=["']dark["']\]/)
    expect(emitted[0].source).toContain('--cms-primary')
    expect(emitted[0].source).toContain('.cms-link')
    expect(emitted[0].source).toContain('.cms-col-lg-12')
    // the classes the admin shares with plugins (card, page, icon button, ...) are in it too, so a standalone page has them
    for (const name of ['.cms-card {', '.cms-page {', '.cms-icon-btn {', '.cms-check {', '.cms-empty {', '.cms-chip {']) {
      expect(emitted[0].source, name).toContain(name)
    }
    vi.restoreAllMocks()
  })
})
