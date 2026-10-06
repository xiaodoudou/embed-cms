import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Guards the design system: the look is defined once in src/styles/tokens.scss (and the matching Vuetify palette in
// src/vuetify.js). Components must reference tokens, never hard-code colours or patch with !important.

const SRC = path.resolve(__dirname, '../../src')
const TOKENS = path.join(SRC, 'styles/tokens.scss')
const NOT_CHECKED_FOR_LITERALS = new Set([TOKENS, path.join(SRC, 'vuetify.js')])
// Legitimate colour data, not styling: the default value of the colour field
const ALLOWED_LITERALS = [/#000000FF/]
// !important is a patch. This number may only go down; lower it when you remove some.
const IMPORTANT_BASELINE = 59
// the reset of Vuetify 3 (ress.css), kept as it was: it is not our styling
const THIRD_PARTY = new Set([path.join(SRC, 'styles/reset.scss')])

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  if (entry.isDirectory()) {
    return entry.name === 'plugins' || entry.name === '.plugins' ? [] : walk(full)
  }
  return /\.(vue|scss|css|js)$/.test(entry.name) ? [full] : []
})

const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '')

const files = walk(SRC)
const read = (file) => stripComments(fs.readFileSync(file, 'utf8'))
const rel = (file) => path.relative(SRC, file).replace(/\\/g, '/')

describe('design system', () => {
  it('has no hard-coded colours outside the token files', () => {
    const literal = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|\bhsla?\(/g
    const offenders = []
    for (const file of files.filter((f) => !NOT_CHECKED_FOR_LITERALS.has(f))) {
      read(file).split('\n').forEach((line, index) => {
        const matches = line.match(literal)
        if (matches && !ALLOWED_LITERALS.some((allowed) => allowed.test(line))) {
          offenders.push(`${rel(file)}:${index + 1}  ${line.trim().slice(0, 90)}`)
        }
      })
    }
    expect(offenders, `use a token from src/styles/tokens.scss instead:\n${offenders.join('\n')}`).toEqual([])
  })

  it('does not add !important patches', () => {
    const counts = files.filter((file) => !THIRD_PARTY.has(file)).map((file) => [rel(file), (read(file).match(/!important/g) || []).length]).filter(([, n]) => n > 0)
    const total = counts.reduce((sum, [, n]) => sum + n, 0)
    const detail = counts.sort((a, b) => b[1] - a[1]).map(([f, n]) => `${n} ${f}`).join('\n')
    expect(total, `!important may only go down (baseline ${IMPORTANT_BASELINE}):\n${detail}`).toBeLessThanOrEqual(IMPORTANT_BASELINE)
  })

  it('only uses --cms-* variables that are defined', () => {
    const defined = new Set()
    for (const file of files) {
      for (const match of read(file).matchAll(/(--cms-[a-z0-9-]+)\s*:/g)) defined.add(match[1])
    }
    const missing = []
    for (const file of files) {
      for (const match of read(file).matchAll(/var\(\s*(--cms-[a-z0-9-]+)(?![a-z0-9#-])/g)) {
        if (!defined.has(match[1])) missing.push(`${rel(file)} uses ${match[1]}`)
      }
    }
    expect([...new Set(missing)], 'undefined design tokens (typo, or add them to tokens.scss)').toEqual([])
  })

  it('defines every colour token in both the light and the dark palette', () => {
    const css = fs.readFileSync(TOKENS, 'utf8')
    const darkStart = css.indexOf('/* ---- Dark palette')
    const lightStart = css.indexOf('/* ---- Light palette')
    expect(darkStart).toBeGreaterThan(lightStart)
    const names = (block) => new Set([...block.matchAll(/(--cms-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
    const light = names(css.slice(lightStart, darkStart))
    const dark = names(css.slice(darkStart))
    const missingInDark = [...light].filter((name) => !dark.has(name))
    expect(missingInDark, 'tokens defined for light but not for dark').toEqual([])
  })

  it('keeps the Vuetify palette in step with the tokens for the key colours', () => {
    const css = fs.readFileSync(TOKENS, 'utf8')
    const vuetify = fs.readFileSync(path.join(SRC, 'vuetify.js'), 'utf8')
    const value = (source, name) => new RegExp(`${name}:\\s*['"]?(#[0-9a-fA-F]{6})`).exec(source)?.[1]?.toLowerCase()
    const light = css.slice(css.indexOf('/* ---- Light palette'), css.indexOf('/* ---- Dark palette'))
    expect(value(vuetify, 'primary')).toBe(value(light, '--cms-primary'))
    expect(value(vuetify, '\'surface-2\'')).toBe(value(light, '--cms-surface-2'))
    expect(value(vuetify, 'background')).toBe(value(light, '--cms-bg'))
  })
})
