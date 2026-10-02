import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as sass from 'sass'
import { PUBLIC_TOKENS, publicTokenNames } from '../../src/styles/publicTokens.js'

// Guards what plugins rely on: the public tokens exist, the kit classes written in the docs exist, and the colours of the kit are
// readable in both themes. (The rule that the kit only uses tokens is part of designSystem.test.js, which reads every style file.)

const SRC = path.resolve(__dirname, '../../src')
const TOKENS = fs.readFileSync(path.join(SRC, 'styles/tokens.scss'), 'utf8')
const lightStart = TOKENS.indexOf('/* ---- Light palette')
const darkStart = TOKENS.indexOf('/* ---- Dark palette')
const LIGHT = TOKENS.slice(lightStart, darkStart)
const DARK = TOKENS.slice(darkStart)
const SHARED = TOKENS.slice(0, lightStart)

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  if (entry.isDirectory()) {
    return entry.name === 'plugins' || entry.name === '.plugins' ? [] : walk(full)
  }
  return /\.(vue|scss|css)$/.test(entry.name) ? [full] : []
})

describe('the public tokens', () => {
  const has = (block, name) => new RegExp(`${name}\\s*:`).test(block)

  it('are all defined', () => {
    const missing = publicTokenNames().filter((name) => !has(TOKENS, name))
    expect(missing).toEqual([])
  })

  it('have a colour for the light and for the dark palette when they are colours', () => {
    const missing = []
    for (const group of PUBLIC_TOKENS.filter((item) => item.colour)) {
      for (const [name] of group.tokens) {
        if (!has(LIGHT, name) && !has(SHARED, name)) {
          missing.push(`${name} (light)`)
        }
        if (!has(DARK, name) && !has(SHARED, name)) {
          missing.push(`${name} (dark)`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('have a description', () => {
    const empty = PUBLIC_TOKENS.flatMap((group) => group.tokens).filter(([, description]) => !description)
    expect(empty).toEqual([])
  })
})

describe('the UI kit', () => {
  // the kit is SCSS (its loops make the families of classes): look at what it compiles to, next to the classes the admin already had
  const KIT = sass.compile(path.join(SRC, 'styles/kit.scss')).css
  const styles = walk(SRC).filter((file) => !file.endsWith('kit.scss')).map((file) => fs.readFileSync(file, 'utf8')).join('\n') + KIT

  const classesOf = (file) => [...fs.readFileSync(path.resolve(__dirname, '../../docs', file), 'utf8').matchAll(/`(cms-[a-z0-9-]+)`/g)].map((match) => match[1])

  it('defines every class its documentation names', () => {
    const named = [...new Set(classesOf('extending/PLUGIN_UI_KIT.md'))]
    const missing = named.filter((name) => !new RegExp(`\\.${name}(?![a-z0-9-])`).test(styles))
    expect(missing).toEqual([])
  })

  it('is plain CSS, not a layer: the element rules of base.scss (ul, li, a) would beat a layer', () => {
    expect(KIT).not.toMatch(/@layer/)
    expect(KIT).toMatch(/\.cms-link \{/)
  })

  it('has the generated families: spacing steps and the 12 columns at three widths', () => {
    for (const step of [1, 2, 3, 4, 5, 6, 8, 10, 12]) {
      for (const prefix of ['p', 'm', 'gap']) {
        expect(KIT, `.cms-${prefix}-${step}`).toContain(`.cms-${prefix}-${step} {`)
      }
    }
    for (const prefix of ['', 'md-', 'lg-']) {
      for (let column = 1; column <= 12; column++) {
        expect(KIT, `.cms-col-${prefix}${column}`).toContain(`.cms-col-${prefix}${column} {`)
      }
    }
  })
})

// WCAG contrast of text on the surfaces the kit puts it on, in both themes
describe('the colours of the kit', () => {
  const values = (block) => {
    const map = {}
    for (const match of block.matchAll(/(--cms-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      map[match[1]] = match[2].trim()
    }
    return map
  }
  const resolve = (map, value, depth = 0) => {
    const ref = /^var\((--cms-[a-z0-9-]+)\)$/.exec(value)
    return ref && depth < 5 ? resolve(map, map[ref[1]], depth + 1) : value
  }
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (high + 0.05) / (low + 0.05)
  }
  // text colour on the background it is drawn on; AA asks 4.5 for text
  const PAIRS = [
    ['--cms-text', '--cms-surface'],
    ['--cms-text', '--cms-surface-2'],
    ['--cms-text', '--cms-surface-3'],
    ['--cms-text', '--cms-bg'],
    ['--cms-text-muted', '--cms-surface'],
    ['--cms-text-muted', '--cms-surface-2'],
    ['--cms-primary', '--cms-surface'],
    ['--cms-primary', '--cms-primary-soft'],
    ['--cms-on-primary', '--cms-primary'],
    ['--cms-on-primary-soft', '--cms-primary-soft'],
    ['--cms-on-error', '--cms-error'],
    ['--cms-success', '--cms-success-soft'],
    ['--cms-warning', '--cms-warning-soft'],
    ['--cms-error', '--cms-error-soft'],
    ['--cms-text-inverse', '--cms-text']
  ]

  for (const [theme, block] of [['light', LIGHT], ['dark', DARK]]) {
    it(`reach AA contrast in the ${theme} theme`, () => {
      const map = { ...values(SHARED), ...values(block) }
      const low = []
      for (const [foreground, background] of PAIRS) {
        const fg = resolve(map, map[foreground])
        const bg = resolve(map, map[background])
        if (!/^#[0-9a-f]{6}$/i.test(fg || '') || !/^#[0-9a-f]{6}$/i.test(bg || '')) {
          continue
        }
        const ratio = contrast(fg, bg)
        if (ratio < 4.5) {
          low.push(`${foreground} on ${background}: ${ratio.toFixed(2)}`)
        }
      }
      expect(low).toEqual([])
    })
  }
})
