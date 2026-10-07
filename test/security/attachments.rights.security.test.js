const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN, createUser } = require('../helpers/app')
const { isAttachmentRequest } = require('../../lib/plugins/rest/middleware/authorize')

// Which right a request needs is decided by the route that matched, and never by the text of the address. A group that may only add files to a resource
// (`attachments`) must not be able to write or delete the records through a query string that contains `/attachments`.
describe('security regressions (rights of the attachments)', () => {
  let app
  let filesOnly
  let updaterOnly
  let record
  let file
  const as = (user) => (test) => test.auth(user.username, user.password)
  const admin = (test) => test.auth(...ADMIN)
  const api = (path) => request(app.url).get(path)

  const makeGroup = (name, rights) => app.cms.$authentication.groups.create({ name, read: [], create: [], update: [], remove: [], attachments: [], ...rights })

  before(async () => {
    app = await startApp()
    filesOnly = await createUser(app, { group: (await makeGroup('files-only', { attachments: ['articles'] }))._id })
    updaterOnly = await createUser(app, { group: (await makeGroup('updater-only', { update: ['articles'] }))._id })
  })
  after(async () => {
    await app.close()
  })

  /** A record with a file, made by the administrator: what the group must not be able to read, change or delete. */
  beforeEach(async () => {
    record = (await admin(request(app.url).post('/api/articles')).send({ title: 'before' })).body
    file = (await admin(request(app.url).post(`/api/articles/${record._id}/attachments`)).field('_filename', 'man.jpg').attach('image', './test/fixtures/man.jpg', { contentType: 'image/jpeg' })).body
    expect(file._id, 'the file of the administrator').to.be.a('string')
  })

  const title = async () => (await admin(request(app.url).get(`/api/articles/${record._id}`))).body.title
  const exists = async () => (await admin(request(app.url).get(`/api/articles/${record._id}`))).status === 200

  describe('a group that has only the right to add files', () => {
    it('cannot read the record, the list or the file', async () => {
      for (const path of [`/api/articles/${record._id}`, '/api/articles', `/api/articles/${record._id}/attachments/${file._id}`, `/api/articles/${record._id}/attachments/${file._id}?resize=50xauto`, `/api/articles/file/${file._id}`]) {
        expect((await as(filesOnly)(api(path))).status, path).to.equal(401)
      }
    })

    it('cannot create, update or delete a record', async () => {
      expect((await as(filesOnly)(request(app.url).post('/api/articles')).send({ title: 'x' })).status).to.equal(401)
      expect((await as(filesOnly)(request(app.url).put(`/api/articles/${record._id}`)).send({ title: 'changed' })).status).to.equal(401)
      expect((await as(filesOnly)(request(app.url).delete(`/api/articles/${record._id}`))).status).to.equal(401)
      expect(await title()).to.equal('before')
    })

    it('cannot write or delete a record with /attachments in the query string, however it is spelled', async () => {
      for (const query of ['?x=/attachments', '?/attachments', '?x=/attachments/', '?x=%2Fattachments', '?x=a/attachments/b', '?attachments=1&x=/attachments']) {
        expect((await as(filesOnly)(request(app.url).put(`/api/articles/${record._id}${query}`)).send({ title: 'changed' })).status, `PUT ${query}`).to.equal(401)
        expect((await as(filesOnly)(request(app.url).post(`/api/articles${query}`)).send({ title: 'planted' })).status, `POST ${query}`).to.equal(401)
        expect((await as(filesOnly)(request(app.url).delete(`/api/articles/${record._id}${query}`))).status, `DELETE ${query}`).to.equal(401)
      }
      expect(await title()).to.equal('before')
      expect(await exists()).to.equal(true)
      expect((await admin(request(app.url).get('/api/articles'))).body.some((one) => one.title === 'planted')).to.equal(false)
    })

    it('still does its work: adds a file, changes the metadata of a file, deletes a file', async () => {
      const added = await as(filesOnly)(request(app.url).post(`/api/articles/${record._id}/attachments`)).field('_filename', 'second.jpg').attach('image', './test/fixtures/man.jpg', { contentType: 'image/jpeg' })
      expect(added.status).to.equal(200)
      expect((await as(filesOnly)(request(app.url).put(`/api/articles/${record._id}/attachments/${file._id}`)).send({ _name: 'image' })).status).to.equal(200)
      expect((await as(filesOnly)(request(app.url).delete(`/api/articles/${record._id}/attachments/${file._id}`))).status).to.equal(200)
      expect((await as(filesOnly)(request(app.url).post('/api/articles/attachments/crop-suggestion?aspect=1:1')).attach('image', './test/fixtures/man.jpg', { contentType: 'image/jpeg' })).status).to.equal(200)
    })
  })

  describe('a group that may update records but has no right on files', () => {
    it('updates a record, even when the address says /attachments in its query string', async () => {
      expect((await as(updaterOnly)(request(app.url).put(`/api/articles/${record._id}?x=/attachments`)).send({ title: 'by the updater' })).status).to.equal(200)
      expect(await title()).to.equal('by the updater')
    })

    it('cannot add, change or delete a file', async () => {
      expect((await as(updaterOnly)(request(app.url).post(`/api/articles/${record._id}/attachments`)).field('_filename', 'x.jpg').attach('image', './test/fixtures/man.jpg', { contentType: 'image/jpeg' })).status).to.equal(401)
      expect((await as(updaterOnly)(request(app.url).put(`/api/articles/${record._id}/attachments/${file._id}`)).send({ _name: 'image' })).status).to.equal(401)
      expect((await as(updaterOnly)(request(app.url).delete(`/api/articles/${record._id}/attachments/${file._id}`))).status).to.equal(401)
    })
  })

  describe('who made a record', () => {
    it('is written by the CMS and never taken from the request, with or without /attachments in the address', async () => {
      for (const query of ['', '?x=/attachments']) {
        const created = await admin(request(app.url).post(`/api/articles${query}`)).send({ title: 'forged', _createdBy: 'someone~else' })
        expect(created.status).to.equal(200)
        expect(created.body._createdBy, query).to.not.equal('someone~else')
        expect(created.body._createdBy, query).to.match(/~/)
      }
    })
  })

  describe('the files of a record', () => {
    it('are not taken from the data of a new record: a record cannot point at the file of another', async () => {
      const pointing = await admin(request(app.url).post('/api/articles')).send({ title: 'pointing', _attachments: [{ _id: file._id, _name: 'image', _contentType: 'text/html' }] })
      expect(pointing.status).to.equal(200)
      const stored = (await admin(request(app.url).get(`/api/articles/${pointing.body._id}`))).body
      expect(stored._attachments || []).to.deep.equal([])
      // and removing it leaves the file of the other record where it is
      expect((await admin(request(app.url).delete(`/api/articles/${pointing.body._id}`))).status).to.equal(200)
      const download = await admin(request(app.url).get(`/api/articles/${record._id}/attachments/${file._id}`))
      expect(download.status).to.equal(200)
      expect(download.headers['content-type']).to.match(/^image\/jpeg/)
    })
  })

  describe('isAttachmentRequest', () => {
    const route = (path, originalUrl = path) => ({ route: { path }, originalUrl })

    it('is true for the routes of the attachments of a record', () => {
      for (const path of [
        '/:resource([\\w-_]+)/:id([\\w-_]+)/attachments',
        '/:resource([\\w-_]+)/:id([\\w-_]+)/attachments/:aid([\\w-_]+)',
        '/:resource([\\w-_]+)/:id([\\w-_]+)/attachments/:aid([\\w-_]+).:ext([\\w-_]+)?/cropped',
        '/:resource([\\w-_]+)/attachments/crop-suggestion'
      ]) {
        expect(isAttachmentRequest(route(path)), path).to.equal(true)
      }
    })

    it('is false for the routes of the records, and for the file by id, whatever the address says', () => {
      for (const path of ['/:resource([\\w-_]+)', '/:resource([\\w-_]+)/:id([\\w-_]+)', '/:resource([\\w-_]+)/file/:aid([\\w-_]+)']) {
        expect(isAttachmentRequest(route(path, '/api/articles/x?y=/attachments')), path).to.equal(false)
        expect(isAttachmentRequest(route(path, '/api/attachments/attachments')), path).to.equal(false)
      }
    })

    it('reads the path of the address, without its query, when there is no route', () => {
      expect(isAttachmentRequest({ originalUrl: '/api/articles/x/attachments' })).to.equal(true)
      expect(isAttachmentRequest({ originalUrl: '/api/articles/x/attachments/y?z=1' })).to.equal(true)
      expect(isAttachmentRequest({ originalUrl: '/api/articles/x?y=/attachments' })).to.equal(false)
      expect(isAttachmentRequest({ originalUrl: '/api/articles/x/attachmentsfoo' })).to.equal(false)
      expect(isAttachmentRequest({})).to.equal(false)
      expect(isAttachmentRequest(undefined)).to.equal(false)
    })
  })
})
