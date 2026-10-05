import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// The phone layout (one column, the navigation in a drawer) starts at the same screens in the stylesheets and in the code that decides how the navigation is shown.

const ROOT = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  if (entry.isDirectory()) return entry.name === '.plugins' ? [] : walk(full)
  return /\.(vue|scss)$/.test(entry.name) ? [full] : []
})

const scssQuery = (name) => new RegExp(`\\$${name}:\\s*'([^']+)'`).exec(read('src/assets/scss/variables.scss'))[1]

describe('the phone layout', () => {
  it('is a screen under 768px wide, or a phone on its side: a touch screen under 500px high', () => {
    expect(scssQuery('phone-query')).toBe('(max-width: 767.98px), (pointer: coarse) and (max-height: 500px)')
  })

  it('is the same query in the stylesheets and in App.vue, which decides how the navigation is shown', () => {
    const code = /export const PHONE_QUERY = '([^']+)'/.exec(read('src/utils/phoneLayout.js'))[1]
    expect(code).toBe(scssQuery('phone-query'))
    expect(read('src/components/App.vue')).toContain('const DRAWER_QUERY = PHONE_QUERY')
  })

  it('is written once: no stylesheet spells its width out again', () => {
    const spelled = walk(path.join(ROOT, 'src'))
      .filter((file) => !file.endsWith('variables.scss'))
      // (the table of the design page scrolls sideways when it is narrow: that is about its width, not about the layout)
      .filter((file) => !file.endsWith('DesignSystem.vue'))
      .filter((file) => /@media\s*\(max-width:\s*767\.98px\)/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file).replace(/\\/g, '/'))
    expect(spelled, 'use @media #{$phone-query} (from variables.scss)').toEqual([])
  })
})
