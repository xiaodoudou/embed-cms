const request = require('supertest')
const { expect } = require('chai')
const { duplicateMenuGroups } = require('../../lib/util/menuGroups')
const { startApp, ADMIN } = require('../helpers/app')

describe('menu icons in Settings (unit)', () => {
  describe('duplicateMenuGroups', () => {
    it('lists each repeated group once and ignores entries without a group', () => {
      expect(duplicateMenuGroups([{ group: 'CMS' }, { group: 'Text' }, { group: 'CMS' }, { group: 'CMS' }, {}])).to.deep.equal(['CMS'])
      expect(duplicateMenuGroups([{ group: 'CMS' }, { group: 'Text' }])).to.deep.equal([])
      expect(duplicateMenuGroups(undefined)).to.deep.equal([])
    })
  })

  describe('through the API', () => {
    let app
    before(async () => { app = await startApp() })
    after(async () => { await app.close() })

    const icon = (group) => ({ _type: '_settingsMenuGroup', group, icon: [] })

    it('offers the menu groups of the resources, and the System group of the plugins', () => {
      const field = app.cms._paragraphs._settingsMenuGroup.schema.find((f) => f.field === 'group')
      expect(field.source).to.include('System')
      expect(field.source).to.include('CMS')
    })

    it('refuses two icons for the same menu group', async () => {
      const res = await request(app.url).post('/api/_settings').auth(...ADMIN).send({ title: { enUS: 'x' }, menuGroups: [icon('CMS'), icon('CMS')] })
      expect(res.status).to.equal(400)
      expect(JSON.stringify(res.body)).to.contain('CMS')
    })

    it('accepts one icon per group, and refuses a duplicate added by an update', async () => {
      const created = await request(app.url).post('/api/_settings').auth(...ADMIN).send({ title: { enUS: 'x' }, menuGroups: [icon('CMS'), icon('System')] })
      expect(created.status).to.be.oneOf([200, 201])
      const update = await request(app.url).put(`/api/_settings/${created.body._id}`).auth(...ADMIN).send({ menuGroups: [icon('System'), icon('System')] })
      expect(update.status).to.equal(400)
    })
  })
})
