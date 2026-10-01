const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const { execFile } = require('child_process')
const request = require('supertest')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')

const adminPlugin = path.resolve(__dirname, '..', '..', 'lib', 'plugins', 'admin')

describe('admin plugin start-up (unit)', () => {
  describe('project package.json', () => {
    let emptyDir
    before(async () => { emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'embed-cms-nopkg-')) })
    after(async () => { await fs.remove(emptyDir) })

    it('loads in a folder that has no package.json', async () => {
      // the module used to require <cwd>/package.json when it loads: the cms command crashed in an empty folder
      const { code, stderr } = await new Promise(resolve => {
        execFile(process.execPath, ['-e', `require(${JSON.stringify(adminPlugin)})`], { cwd: emptyDir }, (error, stdout, stderr) => {
          resolve({ code: error ? error.code : 0, stderr })
        })
      })
      expect(stderr).to.not.include('Cannot find module')
      expect(code).to.equal(0)
    })
  })

  describe('admin page without authentication', () => {
    let app, dist
    before(async () => {
      dist = await fs.mkdtemp(path.join(os.tmpdir(), 'embed-cms-dist-'))
      await fs.writeFile(path.join(dist, 'index.html'), '<title>__TITLE__</title><script>window.type = "__TYPE__"</script>')
      app = await startApp({ disableJwtLogin: true, disableAuthentication: true })
      app.cms.$admin.distPath = dist
    })
    after(async () => {
      await app.close()
      await fs.remove(dist)
    })

    it('serves the admin page with its placeholders filled', async () => {
      const res = await request(app.url).get('/admin/').timeout({ response: 3000 })
      expect(res.status).to.equal(200)
      expect(res.text).to.not.include('__TITLE__')
      expect(res.text).to.include('<title>Embed CMS</title>')
      expect(res.text).to.include('window.type = "index"')
    })
    it('redirects /admin to /admin/', async () => {
      const res = await request(app.url).get('/admin').redirects(0)
      expect(res.status).to.equal(301)
      expect(res.headers.location).to.equal('/admin/')
    })
  })

  describe('admin app that is not built', () => {
    let app, emptyDist, rejections
    const onRejection = (reason) => rejections.push(reason)

    before(async () => {
      emptyDist = await fs.mkdtemp(path.join(os.tmpdir(), 'embed-cms-nodist-'))
      app = await startApp({ disableAuthentication: true })
      // as if `npm run build` was never run
      app.cms.$admin.distPath = emptyDist
    })
    after(async () => {
      await app.close()
      await fs.remove(emptyDist)
    })
    beforeEach(() => {
      rejections = []
      process.on('unhandledRejection', onRejection)
    })
    afterEach(() => {
      process.removeListener('unhandledRejection', onRejection)
      delete process.env.VITE_DEV_MODE
    })

    it('answers 503 telling to build the admin, without an unhandled rejection', async () => {
      const res = await request(app.url).get('/admin/').timeout({ response: 3000 })
      await new Promise(resolve => setImmediate(resolve))
      expect(res.status).to.equal(503)
      expect(res.text).to.include('npm run build')
      expect(rejections).to.have.length(0)
    })

    it('answers 503 in dev mode when the dev server does not answer', async () => {
      process.env.VITE_DEV_MODE = 'true'
      // nothing listens on the dev server port of the tests (config.port + 10000): the request to it fails
      const res = await request(app.url).get('/admin/js/main.js').timeout({ response: 3000 })
      await new Promise(resolve => setImmediate(resolve))
      expect(res.status).to.equal(503)
      expect(rejections).to.have.length(0)
    })
  })
})
