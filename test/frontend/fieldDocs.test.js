import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import FormService from '@s/FormService'

// Guards the field documentation: one page per input type and no broken screenshot link.

const DOCS = path.resolve(__dirname, '../../docs/reference/fields')
// group is an internal type used to nest dotted keys, it is never declared in a schema
const inputTypes = Object.keys(FormService.typeMapper).filter((type) => type !== 'group')
const pages = fs.readdirSync(DOCS).filter((name) => name.endsWith('.md'))

describe('field documentation', () => {
  it.each(inputTypes)('has a page for the "%s" input type', (type) => {
    expect(fs.existsSync(path.join(DOCS, `${type}.md`))).toBe(true)
  })

  it('links every type page from docs/reference/FIELDS.md', () => {
    const index = fs.readFileSync(path.resolve(DOCS, '../FIELDS.md'), 'utf8')
    for (const type of inputTypes) {
      expect(index).toContain(`fields/${type}.md`)
    }
  })

  it.each(pages)('%s only links to images that exist', (page) => {
    const text = fs.readFileSync(path.join(DOCS, page), 'utf8')
    const links = [...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) => match[1]).filter((link) => !/^(https?:)?\/\//.test(link))
    for (const link of links) {
      expect(fs.existsSync(path.resolve(DOCS, link)), `${page} -> ${link}`).toBe(true)
    }
  })
})
