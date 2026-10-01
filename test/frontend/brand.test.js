import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// This is a fork that continues its own approach: no trace of the former owner in the code, the docs or the package.

const ROOT = path.resolve(__dirname, '../..')
const FORMER = /imagination|xpkit|imag-sh-logger/i
const SKIP = new Set(['node_modules', 'dist', '.git', 'data', 'coverage', 'cached', 'logs'])
const TEXT = /\.(js|mjs|cjs|vue|json|md|css|scss|html|yml|yaml|txt)$|^LICENSE$/

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  if (entry.isDirectory()) {
    return SKIP.has(entry.name) || entry.name.startsWith('.tmp') ? [] : walk(full)
  }
  // LICENSE keeps the MIT notice of the code this version builds on, with its copyright line, as that license requires
  return TEXT.test(entry.name) && !['package-lock.json', 'brand.test.js', 'LICENSE'].includes(entry.name) ? [full] : []
})

describe('brand', () => {
  it('has no mention of the former owner in any text file of the project', () => {
    const offenders = walk(ROOT).filter((file) => FORMER.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
    expect(offenders).toEqual([])
  })
})
