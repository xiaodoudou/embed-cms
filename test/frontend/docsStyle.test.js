import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { reflow, markdownFiles } = require('../docs/reflowMarkdown.js')

describe('reflow of the Markdown', () => {
  it('joins the lines of a paragraph and of a list item', () => {
    const text = 'One sentence\nthat goes on.\n\n- an item\n  that goes on\n- another\n'
    expect(reflow(text)).toBe('One sentence that goes on.\n\n- an item that goes on\n- another\n')
  })

  it('joins a quote, and keeps the hard breaks', () => {
    expect(reflow('> a quote\n> on two lines\n')).toBe('> a quote on two lines\n')
    expect(reflow('first  \nsecond\nthird\n')).toBe('first  \nsecond third\n')
  })

  it('leaves code, tables, headings and HTML as they are', () => {
    const text = '# Title\n\n```js\nconst a = 1\nconst b = 2\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<!-- note\nsecond -->\n'
    expect(reflow(text)).toBe(text)
  })

  it('keeps the line endings of the file', () => {
    expect(reflow('a\r\nb\r\n')).toBe('a b\r\n')
  })
})

describe('the Markdown of the project', () => {
  it('has one line per paragraph and per list item', () => {
    const wrapped = markdownFiles().filter((file) => reflow(fs.readFileSync(file, 'utf8')) !== fs.readFileSync(file, 'utf8'))
    expect(wrapped.map((file) => path.relative(process.cwd(), file)), 'run `npm run docs:reflow`').toEqual([])
  })

  it('only links to files and folders that exist', () => {
    const broken = []
    for (const file of markdownFiles()) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1]
        const local = decodeURI(target.split('#')[0])
        if (/^(https?:|mailto:)/.test(target) || !local) {
          continue
        }
        if (!fs.existsSync(path.resolve(path.dirname(file), local))) {
          broken.push(`${path.relative(process.cwd(), file)}: ${target}`)
        }
      }
    }
    expect(broken).toEqual([])
  })
})
