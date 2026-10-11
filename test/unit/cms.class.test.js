const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const { expect } = require('chai')
const CMS = require('../../index')

const SECRET = 'a-long-enough-secret-for-tests-1234'

describe('CMS class (unit)', () => {
  let root
  let built = []

  // the minimum of plugins so constructing a CMS has no side effects
  const quiet = () => ({
    disableREST: true,
    disableAdmin: true,
    disableReplication: true,
    importFromRemote: false,
    syslog: undefined,
    auth: { secret: SECRET }
  })
  const build = (extra = {}, files = {}) => {
    const resources = path.join(root, 'resources')
    fs.ensureDirSync(resources)
    for (const [file, content] of Object.entries(files)) {
      fs.outputFileSync(path.join(resources, file), content)
    }
    const cms = new CMS({
      resources,
      data: path.join(root, 'data'),
      config: path.join(root, 'cms.json'),
      mid: '11111111',
      autoload: true,
      ...quiet(),
      ...extra
    })
    built.push(cms)
    return cms
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-class-'))
  })
  afterEach(async () => {
    // close the stores before their folder disappears, or a pending write fails with ENOENT
    for (const cms of built) await cms._closeDatabase()
    built = []
    await fs.remove(root)
  })

  describe('configuration', () => {
    it('writes a config file with the defaults when none exists', () => {
      build()
      const written = fs.readJsonSync(path.join(root, 'cms.json'))
      expect(written).to.include({ mid: '11111111', disableREST: true })
      expect(written).to.have.property('auth')
      expect(written).to.have.property('wsRecordUpdates')
    })
    it('lets constructor options win over the config file, and keeps file-only values', () => {
      fs.writeJsonSync(path.join(root, 'cms.json'), { mid: 'fromfile1', toolbarTitle: 'From file', disableREST: true })
      const cms = build({ mid: 'fromopts1' })
      expect(cms.options.mid).to.equal('fromopts1')
      expect(cms.options.toolbarTitle).to.equal('From file')
    })
    it('creates the resources and data folders', () => {
      build()
      expect(fs.existsSync(path.join(root, 'resources'))).to.equal(true)
      expect(fs.existsSync(path.join(root, 'data'))).to.equal(true)
    })
    it('does not leave options.config behind', () => {
      const cms = build()
      expect(cms.options).to.not.have.property('config')
    })
  })

  describe('authentication secret', () => {
    it('refuses to start without a secret', () => {
      expect(() => build({ auth: {} })).to.throw(/secret is missing/)
    })
    it('refuses a secret that is too short', () => {
      expect(() => build({ auth: { secret: 'short' } })).to.throw(/isn't long enough/)
    })
    it('accepts a long secret', () => {
      expect(() => build()).to.not.throw()
    })
    it('does not require a secret when both jwt login and authentication are disabled', () => {
      expect(() => build({ auth: {}, disableJwtLogin: true, disableAuthentication: true })).to.not.throw()
    })
  })

  describe('plugins', () => {
    const plugins = (extra) => build(extra).usedPlugins
    it('loads only what the flags ask for', () => {
      expect(plugins()).to.deep.equal([])
      expect(plugins({ disableREST: false })).to.deep.equal(['rest'])
    })
    it('maps every flag to its plugin', function () {
      // every plugin is loaded: slow on a WSL mount (the xlsx plugin alone takes 8s there), instant on a native disk
      this.timeout(60000)
      const all = plugins({ disableREST: false, disableAdmin: false, disableReplication: false, importFromRemote: true, import: {}, sync: {}, xlsx: true, anonymousRead: ['x'] })
      expect(all).to.have.members(['rest', 'import', 'importFromRemote', 'admin', 'replicator', 'sync', 'xlsx', 'anonymousRead'])
    })
  })

  describe('resources', () => {
    const simple = 'module.exports = { schema: [{ field: \'name\', input: \'string\' }] }'
    // the internal _users/_groups/_settings resources always exist
    const userResources = (cms) => cms._resourceNames.filter(name => !name.startsWith('_'))

    it('autoloads the resources found in the folder', () => {
      const cms = build({}, { 'things.js': simple, 'others.js': simple })
      expect(userResources(cms)).to.have.members(['things', 'others'])
    })
    it('does not autoload when autoload is off', () => {
      const cms = build({ autoload: false }, { 'things.js': simple })
      expect(userResources(cms)).to.deep.equal([])
    })
    it('resource(name) returns the same instance every time', () => {
      const cms = build({}, { 'things.js': simple })
      expect(cms.resource('things')).to.equal(cms.resource('things'))
    })
    it('registers a resource defined in code', () => {
      const cms = build()
      cms.resource('code', { schema: [{ field: 'title', input: 'string' }] })
      expect(cms._resourceNames).to.include('code')
      expect(cms._resources.code.options.schema[0].field).to.equal('title')
    })
    it('offers every group of a nested group for an icon, the ones inside named from the top down', () => {
      const cms = build()
      cms.resource('posts', { group: ['Content', { enUS: 'Blog' }, 'Private'], schema: [{ field: 'title', input: 'string' }] })
      cms.resource('pages', { group: [{ enUS: 'Site', zhCN: '站点' }], schema: [{ field: 'title', input: 'string' }] })
      expect(cms._menuGroupNames).to.include.members(['Content', 'Content / Blog', 'Content / Blog / Private', 'Site'])
      expect(cms._menuGroupNames).to.not.include('Blog')
    })
    it('makes fields localised when the resource has locales, unless a field says otherwise', () => {
      const cms = build({}, {
        'l.js': 'module.exports = { locales: [\'en\', \'fr\'], schema: [{ field: \'a\', input: \'string\' }, { field: \'b\', input: \'string\', localised: false }] }',
        'n.js': 'module.exports = { schema: [{ field: \'a\', input: \'string\' }] }'
      })
      const [a, b] = cms._resources.l.options.schema
      expect([a.localised, b.localised]).to.deep.equal([true, false])
      expect(cms._resources.n.options.schema[0].localised).to.equal(false)
    })
    it('records which fields are attachments', () => {
      const cms = build({}, { 'f.js': 'module.exports = { schema: [{ field: \'photo\', input: \'image\' }, { field: \'doc\', input: \'file\' }, { field: \'name\', input: \'string\' }] }' })
      expect(cms._resources.f.options._attachments).to.have.members(['photo', 'doc'])
      expect(Object.keys(cms._attachmentFields.f)).to.have.length(2)
    })
    it('records a crop image field and an image map field as attachment fields, in a resource and in a block', () => {
      const cms = build({}, {
        'f.js': 'module.exports = { schema: [{ field: \'avatar\', input: \'cropimage\' }, { field: \'plan\', input: \'imagemap\' }, { field: \'blocks\', input: \'paragraph\', options: { types: [\'hero\'] } }] }',
        'paragraphs/hero.js': 'module.exports = { schema: [{ field: \'banner\', input: \'cropimage\' }] }'
      })
      const found = Object.keys(cms._attachmentFields.f).join(' ')
      expect(Object.keys(cms._attachmentFields.f)).to.have.length(3)
      expect(found).to.include('avatar')
      expect(found).to.include('plan')
      expect(found).to.include('banner')
    })
    it('records relations only to resources that exist', () => {
      const cms = build({}, {
        'cities.js': 'module.exports = { schema: [{ field: \'key\', input: \'string\', unique: true }] }',
        'people.js': 'module.exports = { schema: [{ field: \'city\', input: \'select\', source: \'cities\' }, { field: \'ghost\', input: \'select\', source: \'nowhere\' }] }'
      })
      const keys = Object.keys(cms._relations.people)
      expect(keys).to.have.length(1)
      expect(keys[0]).to.match(/^city/)
    })
    it('api() gives a wrapper around each resource', () => {
      const cms = build({}, { 'things.js': simple })
      const api = cms.api()
      expect(api('things')).to.have.property('_resource', cms.resource('things'))
    })
  })

  describe('paragraphs', () => {
    const files = {
      'cities.js': 'module.exports = { schema: [{ field: \'key\', input: \'string\', unique: true }] }',
      'pages.js': 'module.exports = { schema: [{ field: \'blocks\', input: \'paragraph\', options: { types: [\'outer\'] } }] }',
      'paragraphs/outer.js': 'module.exports = { schema: [{ field: \'inner\', input: \'paragraph\', options: { types: [\'inner\'] } }, { field: \'banner\', input: \'image\' }] }',
      'paragraphs/inner.js': 'module.exports = { schema: [{ field: \'city\', input: \'select\', source: \'cities\' }, { field: \'photo\', input: \'image\' }] }'
    }
    const paths = (map) => Object.keys(map || {})

    it('registers built-in settings paragraphs', () => {
      const cms = build({}, files)
      expect(cms._paragraphs).to.include.keys(['_settingsLink', '_settingsLinkGroup'])
    })
    it('finds attachments in a paragraph and in a nested paragraph', () => {
      const cms = build({}, files)
      const found = paths(cms._attachmentFields.pages).join(' ')
      expect(found).to.include('banner')
      expect(found).to.include('photo')
    })
    it('finds relations in a paragraph nested inside another paragraph', () => {
      const cms = build({}, files)
      expect(paths(cms._relations.pages).join(' ')).to.include('city')
    })
  })

  describe('lifecycle', () => {
    it('broadcast does nothing when record updates are not enabled', () => {
      const cms = build({ wsRecordUpdates: false })
      expect(() => cms.broadcast({ action: 'x' })).to.not.throw()
    })
    it('bootstrap runs the bootstrap functions in order and calls back', async () => {
      const cms = build()
      const order = []
      cms.bootstrapFunctions.push(async (cb) => { order.push('a'); cb() })
      cms.bootstrapFunctions.push(async (cb) => { order.push('b'); cb() })
      await cms.bootstrap()
      expect(order).to.deep.equal(['a', 'b'])
    })
    it('bootstrap rejects when a bootstrap function fails', async () => {
      const cms = build()
      cms.bootstrapFunctions.push(async (cb) => cb(new Error('boom')))
      let error
      try { await cms.bootstrap() } catch (e) { error = e }
      expect(error).to.have.property('message', 'boom')
    })
    it('closes every resource database', async () => {
      const cms = build({}, { 'things.js': 'module.exports = { schema: [{ field: \'name\', input: \'string\' }] }' })
      await cms.bootstrap()
      await cms._closeDatabase()
      expect(cms._resources.things.json._db._closing).to.equal(true)
    })

    describe('shutdown', () => {
      // what the handler does, with the exit and the closing of the databases put in the place of the real ones
      const run = async (...args) => {
        const cms = build()
        let closed = 0
        // the real closing comes back in the finally, so that the cleanup of the test closes the stores before it removes their folder
        const realClose = cms._closeDatabase
        cms._closeDatabase = async () => { closed++ }
        const realExit = process.exit
        const exited = new Promise((resolve) => { process.exit = (code) => resolve(code) })
        try {
          const handler = cms.shutdown('TEST')
          handler(...args)
          handler(...args)
          return { code: await exited, closed }
        } finally {
          process.exit = realExit
          cms._closeDatabase = realClose
        }
      }
      it('exits with 0 for a signal, which process.on gives the handler as its name', async () => {
        expect(await run('SIGTERM')).to.deep.equal({ code: 0, closed: 1 })
      })
      it('exits with 0 when it is called with nothing', async () => {
        expect(await run()).to.deep.equal({ code: 0, closed: 1 })
      })
      it('exits with 1 for an error, and closes the databases once however many times it is called', async () => {
        expect(await run(new Error('boom'))).to.deep.equal({ code: 1, closed: 1 })
      })
    })
  })
})
