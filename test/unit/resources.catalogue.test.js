const fs = require('fs')
const path = require('path')
const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

// resources/ is a catalogue of field types, not a sample project: every input type the admin UI can render must appear
// there, and every resource must load in a real CMS.

const ROOT = path.resolve(__dirname, '../..')
const RESOURCES = path.join(ROOT, 'resources')
const load = (dir) => fs.readdirSync(dir)
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ name: file.replace(/\.js$/, ''), def: require(path.join(dir, file)) }))

// The input types are the keys of typeMapper in the frontend (`group` is internal, not a schema input)
const supportedInputs = () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/FormService.js'), 'utf8')
  const body = source.slice(source.indexOf('const typeMapper = {'), source.indexOf('_.each(typeMapper'))
  return [...body.matchAll(/^ {2}([a-z]+): \{/gm)].map((m) => m[1]).filter((name) => name !== 'group')
}

const resources = load(RESOURCES)
const paragraphs = load(path.join(RESOURCES, 'paragraphs'))
const fieldsOf = (list) => list.flatMap(({ def }) => def.schema)

describe('resources catalogue', () => {
  it('covers every input type of the admin UI', () => {
    const used = new Set(fieldsOf([...resources, ...paragraphs]).map((field) => field.input))
    const missing = supportedInputs().filter((input) => !used.has(input))
    expect(missing, 'add these input types to the catalogue').to.deep.equal([])
  })

  it('uses only input types the admin UI knows', () => {
    const known = new Set(supportedInputs())
    const unknown = fieldsOf([...resources, ...paragraphs]).map((field) => field.input).filter((input) => !known.has(input))
    expect([...new Set(unknown)]).to.deep.equal([])
  })

  it('shows required, unique, localised and not localised variations for the text types', () => {
    const strings = resources.find((r) => r.name === 'text_strings').def.schema
    expect(strings.some((f) => f.required)).to.equal(true)
    expect(strings.some((f) => f.unique)).to.equal(true)
    expect(strings.some((f) => f.localised === false)).to.equal(true)
    expect(strings.some((f) => f.localised === undefined)).to.equal(true)
    expect(strings.some((f) => f.options && f.options.readonly)).to.equal(true)
    expect(strings.some((f) => f.options && f.options.disabled)).to.equal(true)
    expect(strings.some((f) => f.options && f.options.hint)).to.equal(true)
    expect(strings.some((f) => f.options && f.options.regex)).to.equal(true)
  })

  it('gives every field a label and a hint', () => {
    const missing = []
    for (const { name, def } of [...resources, ...paragraphs]) {
      for (const field of def.schema) {
        if (!field.label) missing.push(`${name}.${field.field} has no label`)
        if (!(field.options && field.options.hint)) missing.push(`${name}.${field.field} has no hint`)
      }
    }
    expect(missing).to.deep.equal([])
  })

  it('has unique field names inside each resource and paragraph', () => {
    for (const { name, def } of [...resources, ...paragraphs]) {
      const names = def.schema.map((field) => field.field)
      expect(new Set(names).size, `${name} repeats a field name`).to.equal(names.length)
    }
  })

  it('only points sources and paragraph types at things that exist', () => {
    const resourceNames = new Set(resources.map((r) => r.name))
    const paragraphNames = new Set(paragraphs.map((p) => p.name))
    for (const { name, def } of [...resources, ...paragraphs]) {
      for (const field of def.schema) {
        if (typeof field.source === 'string') expect(resourceNames.has(field.source), `${name}.${field.field} source`).to.equal(true)
        for (const type of (field.options && field.options.types) || []) {
          expect(paragraphNames.has(type), `${name}.${field.field} paragraph type ${type}`).to.equal(true)
        }
      }
    }
  })

  describe('in a running CMS', () => {
    let app
    before(async () => { app = await startApp({ resources: RESOURCES }) })
    after(async () => { await app.close() })

    it('loads every resource and paragraph type', () => {
      for (const { name } of resources) expect(app.cms._resources, name).to.have.property(name)
      for (const { name } of paragraphs) expect(app.cms._paragraphs, name).to.have.property(name)
    })

    it('accepts a record with required fields in a resource of each family', async () => {
      const cases = {
        text_strings: { name: { enUS: 'A', zhCN: '甲' }, uniqueCode: 'U1' },
        numbers: { name: 'n', requiredNumber: 3, boundedInteger: 5 },
        dates: { name: 'd', requiredDate: '2026-01-01', requiredTime: '10:00:00', requiredDatetime: '2026-01-01 10:00:00' },
        choice_boolean: { name: 'b', requiredFlag: true },
        media_images: { name: 'i', cover: [] }
      }
      for (const [resource, body] of Object.entries(cases)) {
        const res = await request(app.url).post(`/api/${resource}`).auth(...ADMIN).send(body)
        expect(res.status, `${resource}: ${JSON.stringify(res.body)}`).to.be.oneOf([200, 201])
      }
    })
  })
})
