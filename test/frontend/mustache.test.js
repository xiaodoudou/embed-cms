import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import Mustache from 'mustache'

// mustache 3 and later ship an ES module with a default export only: `import * as Mustache` has no `render` there, which broke
// record names, select labels and subtitles in the browser (and nowhere in the build, which does not check member names).

const SRC = path.resolve(__dirname, '../../src')
const sources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  if (entry.isDirectory()) return sources(full)
  return /\.(js|vue)$/.test(entry.name) ? [full] : []
})

describe('mustache', () => {
  it('is imported as a default import everywhere', () => {
    const offenders = sources(SRC).filter((file) => /import\s+\*\s+as\s+Mustache\s+from\s+['"]mustache['"]/.test(fs.readFileSync(file, 'utf8')))
    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([])
  })

  it('renders a template through the default import', () => {
    expect(Mustache.render('{{ name }} ({{ group }})', { name: 'Alpha', group: 'A' })).toBe('Alpha (A)')
  })
})
