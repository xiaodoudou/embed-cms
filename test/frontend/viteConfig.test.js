import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

// Building the admin when embed-cms is a dependency: the plugins folder of the project is optional, the bundled
// src/.plugins stands in for it, and the @p alias must follow whichever was chosen.

const ROOT = path.resolve(__dirname, '../..')
const require = createRequire(import.meta.url)

let tmp
let utils
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-vite-'))
  fs.mkdirSync(path.join(tmp, 'src/.plugins/js'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'src/.plugins/js/main.js'), '')
  utils = require(path.join(ROOT, 'vite.utils.js')).getInstance()
  // the instance as it would be inside <project>/node_modules/embed-cms, pointed at the temporary folder
  utils.isInNodeModules = true
  utils.plugins = {
    toBuild: path.join(tmp, 'src/plugins'),
    source: path.join(tmp, 'project/embed-cms/plugins'),
    fallback: path.join(tmp, 'src/.plugins')
  }
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('vite build as a dependency', () => {
  it('falls back to the bundled plugins when the project has no embed-cms/plugins folder', () => {
    utils.createPluginsSymlink()
    expect(utils.plugins.source).toBe(path.join(tmp, 'src/.plugins'))
    expect(fs.realpathSync(utils.plugins.toBuild)).toBe(fs.realpathSync(path.join(tmp, 'src/.plugins')))
  })

  it('replaces a symlink left by an earlier build whose target has gone', () => {
    fs.symlinkSync(path.join(tmp, 'project/embed-cms/plugins'), utils.plugins.toBuild)
    expect(() => utils.createPluginsSymlink()).not.toThrow()
    expect(fs.existsSync(path.join(utils.plugins.toBuild, 'js/main.js'))).toBe(true)
  })

  it('uses the project folder when there is one', () => {
    fs.mkdirSync(path.join(tmp, 'project/embed-cms/plugins/js'), { recursive: true })
    utils.createPluginsSymlink()
    expect(utils.plugins.source).toBe(path.join(tmp, 'project/embed-cms/plugins'))
  })

  it('points the @p alias at the folder the symlink step settled on', () => {
    const config = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8')
    expect(config).toMatch(/'@p': viteUtils\.plugins\.source,/)
    expect(config).not.toContain("'../../embed-cms/plugins'")
  })
})
