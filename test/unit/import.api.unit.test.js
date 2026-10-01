const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const express = require('express')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')
const ImportApi = require('../../lib-import/api')
const RemoteApi = require('../../lib-importFromRemote/api')

describe('import command api clients (unit)', () => {
  let server, host, calls

  before(async () => {
    calls = []
    const app = express()
    app.all('/*', (req, res) => {
      calls.push({ method: req.method, path: req.path, headers: req.headers })
      res.json([])
    })
    server = await new Promise(resolve => {
      const s = app.listen(0, () => resolve(s))
    })
    host = `localhost:${server.address().port}`
  })
  after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  })
  beforeEach(() => {
    calls.length = 0
  })

  describe('without a prefix', () => {
    it('cms-import calls /api/... (not /undefined/api/...)', async () => {
      const api = ImportApi({ host }, {})
      await api('cities').list({})
      await api('cities').resources()
      expect(calls.map(call => call.path)).to.deep.equal(['/api/cities', '/admin/resources'])
    })

    it('cms-import-remote calls /api/... (not /undefined/api/...)', async () => {
      const api = RemoteApi({ host })
      await api('cities').list({})
      expect(calls.map(call => call.path)).to.deep.equal(['/api/cities'])
    })
  })

  describe('with a prefix', () => {
    it('both put it before /api', async () => {
      await ImportApi({ host, prefix: '/cms' }, {})('cities').list({})
      await RemoteApi({ host, prefix: '/cms' })('cities').list({})
      expect(calls.map(call => call.path)).to.deep.equal(['/cms/api/cities', '/cms/api/cities'])
    })
  })

  describe('cms-import credentials', () => {
    it('are sent as a Basic Authorization header, not as username and password headers', async () => {
      const api = ImportApi({ host }, { username: 'importer', password: 'pass:with:colons' })
      await api('cities').list({})
      const [call] = calls
      expect(call.headers.authorization).to.equal(`Basic ${Buffer.from('importer:pass:with:colons').toString('base64')}`)
      expect(call.headers).to.not.have.property('username')
      expect(call.headers).to.not.have.property('password')
    })

    it('authHeaders sends nothing without credentials', () => {
      expect(ImportApi.authHeaders()).to.deep.equal({})
      expect(ImportApi.authHeaders({})).to.deep.equal({})
    })
  })
})

describe('cms-import api client against a CMS (unit)', () => {
  const run = (label, overrides) => {
    describe(label, () => {
      let app, api, file

      before(async () => {
        app = await startApp(overrides)
        api = ImportApi({ host: app.url.replace('http://', '') }, { username: ADMIN[0], password: ADMIN[1] })
        await api().login()
        file = path.join(os.tmpdir(), `cms-import-${process.pid}-${Date.now()}.txt`)
        await fs.writeFile(file, 'attachment content')
      })
      after(async () => {
        if (app) await app.close()
        if (file) await fs.remove(file)
      })

      it('reads the resources (a route behind the login)', async () => {
        const resources = await api().resources()
        expect(resources).to.be.an('array')
        expect(resources.map(r => r.title)).to.include('articles')
      })

      it('creates, lists and updates records', async () => {
        const created = await api('articles').create({ string: { enUS: 'from the import' } })
        expect(created).to.have.property('_id')
        const updated = await api('articles').update(created._id, { rate: 3 })
        expect(updated).to.have.property('rate', 3)
        const list = await api('articles').list({})
        expect(list.map(r => r._id)).to.include(created._id)
      })

      it('uploads an attachment', async () => {
        const created = await api('articles').create({ string: { enUS: 'with a file' } })
        await api('articles').createAttachment(created._id, 'file', file)
        const record = await app.cms.api()('articles').find(created._id)
        expect(record._attachments).to.have.length(1)
        expect(record._attachments[0]).to.have.property('_name', 'file')
        expect(record._attachments[0]).to.have.property('_size', 'attachment content'.length)
      })
    })
  }
  run('with the JWT login (default)', {})
  run('with Basic authentication', { disableJwtLogin: true })
})
