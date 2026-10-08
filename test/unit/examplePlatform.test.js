const fs = require('fs')
const os = require('os')
const path = require('path')
const { Readable } = require('stream')
const express = require('express')
const _ = require('lodash')
const request = require('supertest')
const { expect } = require('chai')
const CMS = require('../../')
const platform = require('../../docs/examples/platform/platform')
const accounts = require('../../docs/examples/platform/accounts')
const catalog = require('../../docs/examples/platform/catalog')
const createMedia = require('../../docs/examples/platform/media')
const { securityHeaders, Limiter, csrfToken, csrfValid, localPath } = require('../../docs/examples/platform/security')
const { startApp, ADMIN } = require('../helpers/app')

// The docs platform of docs/examples/platform: a public site that has no route of the CMS; products with versions and pages, public or for members; files that follow the page;
// a sign-in of its own; a support form.

const EXAMPLE = path.resolve(__dirname, '../../docs/examples/platform')
const SECRET = 'a-secret-of-the-tests-that-is-long-enough'

describe('the example docs platform (unit)', () => {
  let app, web, cms
  const products = () => cms.api()('products')
  const versions = () => cms.api()('versions')
  const pages = () => cms.api()('pages')
  const members = () => cms.api()('members')
  const messages = () => cms.api()('messages')

  // supertest opens a port for each request: a dropped first packet (see docs/contributing/TESTING.md) is tried again
  const retry = async (make) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await make()
      } catch (error) {
        if (attempt >= 3) {
          throw error
        }
      }
    }
  }
  const get = (url, headers = {}) => retry(() => {
    const test = request(web).get(url)
    Object.entries(headers).forEach(([name, value]) => test.set(name, value))
    return test
  })
  const tokenOf = (res) => (res.text.match(/name="_csrf" value="([^"]+)"/) || [])[1]
  const cookiesOf = (res) => res.headers['set-cookie'] || []
  /** @returns {Promise<object>} a browser that has signed in with the member of the tests */
  async function signedIn (site = web, email = 'ada@example.com', password = 'a long password', next = '/account') {
    const agent = request.agent(site)
    const page = await retry(() => agent.get('/login'))
    const res = await retry(() => agent.post('/login').type('form').send({ _csrf: tokenOf(page), email, password, next }))
    expect(res.status, res.text).to.equal(303)
    return agent
  }
  /** @returns {Promise<object>} the product, the version and the page of a key `product/version/page` */
  async function find (key) {
    const [product, version, page] = key.split('/')
    const foundProduct = await products().find({ slug: product })
    const foundVersion = await versions().find({ key: `${product}/${version}` })
    return { product: foundProduct, version: foundVersion, page: page ? await pages().find({ key }) : undefined }
  }

  before(async () => {
    app = await startApp({ resources: path.join(EXAMPLE, 'resources') })
    cms = app.cms
    await new CMS.ContentLoader(cms).load(path.join(EXAMPLE, 'content.json'))
    // the site comes first: it puts the hook on the members that makes a hash of a password
    web = platform(cms, { secret: SECRET, cache: false }).app
    await members().create({ name: 'Ada Reader', email: ' Ada@Example.com ', password: 'a long password', active: true })
    await members().create({ name: 'Old Member', email: 'old@example.com', password: 'another long password', active: false })
  })
  after(async () => {
    await app.close()
  })

  describe('its content', () => {
    it('is loaded from content.json: products, versions, pages with their diagrams and PDFs, a product for members, a draft', async () => {
      expect((await products().list({})).length).to.equal(3)
      expect((await versions().list({})).length).to.equal(5)
      expect((await pages().list({})).length).to.equal(12)
      const sso = await pages().find({ key: 'tidewater/3.0/single-sign-on' })
      expect(sso.membersOnly).to.equal(true)
      expect(sso._attachments.map((file) => [file._name, file._contentType]).sort()).to.deep.equal([['diagram', 'image/jpeg'], ['download', 'application/pdf']])
      expect((await products().find({ slug: 'lighthouse' })).membersOnly).to.equal(true)
      expect((await versions().find({ key: 'tidewater/3.1-draft' })).published).to.equal(false)
    })

    it('follows the relations: a version points to its product, a page to its version', async () => {
      const { product, version, page } = await find('tidewater/3.0/install')
      expect(version.product).to.equal(product._id)
      expect(page.version).to.equal(version._id)
    })

    it('is not made again when it is loaded again', async () => {
      const report = await new CMS.ContentLoader(cms).load(path.join(EXAMPLE, 'content.json'))
      expect(report).to.include({ created: 0, updated: 0 })
    })
  })

  describe('the members', () => {
    // (the record as it is kept, with its hash: only the sign-in reads it so)
    const kept = (query) => accounts.stored(cms, query)

    it('are stored with a hash and never with the password: the hook turns what an editor types into passwordHash', async () => {
      const ada = await kept({ name: 'Ada Reader' })
      expect(ada.password).to.equal('')
      expect(ada.passwordHash).to.match(/^scrypt\$[\w+/=]+\$[\w+/=]+$/)
      expect(JSON.stringify(ada)).to.not.include('a long password')
    })

    it('have their email trimmed and in lower case, so that the sign-in finds them whatever was typed', async () => {
      expect((await members().find({ name: 'Ada Reader' })).email).to.equal('ada@example.com')
    })

    it('change their password when an editor types a new one, and keep it when the box is left empty', async () => {
      const created = await members().create({ name: 'Temp', email: 'temp@example.com', password: 'first password 1', active: true })
      const first = (await kept(created._id)).passwordHash
      await members().update(created._id, { name: 'Temp Two', password: '' })
      expect((await kept(created._id)).passwordHash).to.equal(first)
      await members().update(created._id, { password: 'second password 2' })
      const changed = (await kept(created._id)).passwordHash
      expect(changed).to.not.equal(first)
      expect(await accounts.verifyPassword('second password 2', changed)).to.equal(true)
      expect(await accounts.verifyPassword('first password 1', changed)).to.equal(false)
      await members().remove(created._id)
    })

    describe('and their secrets', () => {
      const secret = (record) => Object.keys(record).filter((key) => ['password', 'passwordHash'].includes(key))

      it('are in no answer of the CMS: not a find, a list, a create or an update', async () => {
        const ada = await members().find({ name: 'Ada Reader' })
        expect(secret(ada)).to.deep.equal([])
        expect(secret(await members().find(ada._id))).to.deep.equal([])
        expect((await members().list({})).filter((record) => secret(record).length)).to.deep.equal([])
        const created = await members().create({ name: 'Brief', email: 'brief@example.com', password: 'a brief password', active: true })
        expect(secret(created)).to.deep.equal([])
        expect(secret(await members().update(created._id, { password: 'another brief password' }))).to.deep.equal([])
        expect(JSON.stringify(created)).to.not.include('brief password')
        await members().remove(created._id)
      })

      it('are in no answer of the REST API either, to the administrator who asks', async () => {
        const rest = express()
        rest.use(cms.express())
        const list = await retry(() => request(rest).get('/api/members').auth(...ADMIN))
        expect(list.status).to.equal(200)
        expect(list.body.length).to.be.above(1)
        expect(JSON.stringify(list.body)).to.not.match(/passwordHash|scrypt\$/)
        const ada = list.body.find((record) => record.name === 'Ada Reader')
        const one = await retry(() => request(rest).get(`/api/members/${ada._id}`).auth(...ADMIN))
        expect(one.status).to.equal(200)
        expect(JSON.stringify(one.body)).to.not.match(/passwordHash|scrypt\$/)
      })

      it('cannot be written from outside: a hash in the data is dropped, and a record sent back without its hash does not lose it', async () => {
        const created = await members().create({ name: 'Guarded', email: 'guarded@example.com', password: 'a guarded password', active: true })
        const first = (await kept(created._id)).passwordHash
        const planted = await accounts.hashPassword('planted')
        await members().update(created._id, { passwordHash: planted })
        expect((await kept(created._id)).passwordHash).to.equal(first)
        await members().update(created._id, { passwordHash: '', password: '', name: 'Guarded Too' })
        expect((await kept(created._id)).passwordHash).to.equal(first)
        expect(await accounts.signIn(cms, 'guarded@example.com', 'a guarded password')).to.include({ name: 'Guarded Too' })
        expect(await accounts.signIn(cms, 'guarded@example.com', 'planted')).to.equal(null)
        const made = await members().create({ name: 'Planted', email: 'planted@example.com', passwordHash: planted, active: true })
        expect((await kept(made._id)).passwordHash).to.equal(undefined)
        await members().remove(created._id)
        await members().remove(made._id)
      })

      it('are read by the sign-in alone, even while another request reads the same member', async () => {
        const [member, plain, again] = await Promise.all([accounts.stored(cms, { name: 'Ada Reader' }), members().find({ name: 'Ada Reader' }), accounts.signIn(cms, 'ada@example.com', 'a long password')])
        expect(member.passwordHash).to.be.a('string')
        expect(secret(plain)).to.deep.equal([])
        expect(again.name).to.equal('Ada Reader')
        // and what the sign-in read is not kept anywhere that a later call can see
        expect(secret(await members().find({ name: 'Ada Reader' }))).to.deep.equal([])
      })

      it('are not given away by a hook that fails: the answer is an error, not a half-hidden record', async () => {
        const hostile = { toString () { throw new Error('no text') } }
        let error
        try {
          await members().create({ name: 'Hostile', email: 'hostile@example.com', password: hostile, active: true })
        } catch (caught) {
          error = caught
        }
        expect(error).to.be.an('error')
        expect(await members().exists({ email: 'hostile@example.com' })).to.equal(false)
      })
    })
  })

  describe('what the site does not show of the CMS', () => {
    it('has no /admin and no /api: they are not found, whatever the method', async () => {
      for (const url of ['/api/pages', '/api/members', '/api/pages/anything/attachments/x', '/admin', '/admin/login', '/api']) {
        const res = await get(url)
        expect(res.status, url).to.equal(404)
        expect(res.text, url).to.include('Page not found')
      }
      const written = await retry(() => request(web).post('/api/pages').send({ title: { enUS: 'x' } }))
      expect(written.status).to.equal(404)
      expect((await pages().list({})).length).to.equal(12)
    })

    it('does not rely on the CMS to refuse: the CMS itself answers an anonymous visitor with 401, nothing is open with anonymousRead', async () => {
      const bare = express()
      bare.use(cms.express())
      const res = await retry(() => request(bare).get('/api/pages'))
      expect(res.status).to.equal(401)
    })

    it('says nothing of how it is built', async () => {
      const res = await get('/')
      expect(res.headers).to.not.have.property('x-powered-by')
      expect(res.headers['content-security-policy']).to.include('default-src \'self\'')
      expect(res.headers['content-security-policy']).to.include('frame-ancestors \'none\'')
      expect(res.headers['x-content-type-options']).to.equal('nosniff')
      expect(res.headers['x-frame-options']).to.equal('DENY')
      expect(res.headers['referrer-policy']).to.equal('same-origin')
    })
  })

  describe('the products', () => {
    it('lists the published products in order, with the one for members marked, and what is not published is not there', async () => {
      const res = await get('/')
      expect(res.status).to.equal(200)
      expect([...res.text.matchAll(/<h2>(?:<a [^>]*>)?([^<]+)/g)].map((match) => match[1].trim())).to.deep.equal(['Tidewater', 'Anchor CLI', 'Lighthouse Enterprise'])
      expect(res.text.match(/class="tag">Members/g)).to.have.length(1)
      expect(res.text).to.include('href="/tidewater/latest/"')
      expect(res.text).to.include('Current version: 3.0')
      // the summary of a product for members is public; nothing of its versions or its pages is
      expect(res.text).to.include('Monitoring and alerts for a fleet')
      expect(res.text).to.not.include('What Lighthouse watches')
    })

    it('sets no cookie on a page everyone sees, so that a cache may keep it', async () => {
      expect(cookiesOf(await get('/'))).to.deep.equal([])
      expect(cookiesOf(await get('/tidewater/3.0/install'))).to.deep.equal([])
    })

    it('shows a product that has no published version, without a link', async () => {
      const empty = await products().create({ name: 'Empty Product', slug: 'empty-product', summary: 'Nothing yet.', published: true })
      const res = await get('/')
      expect(res.text).to.include('Empty Product')
      expect(res.text).to.not.include('href="/empty-product/latest/"')
      expect((await get('/empty-product/latest/')).status).to.equal(404)
      expect((await get('/empty-product/latest/install')).status).to.equal(404)
      expect((await get('/empty-product/1.0')).status).to.equal(404)
      await products().remove(empty._id)
    })

    it('does not show a product that is not published, nor its versions and pages', async () => {
      const ghost = await products().create({ name: 'Ghost Product', slug: 'ghost', published: false })
      const version = await versions().create({ key: 'ghost/1.0', product: ghost._id, slug: '1.0', current: true, published: true })
      await pages().create({ key: 'ghost/1.0/boo', version: version._id, slug: 'boo', title: { enUS: 'Boo' }, published: true })
      expect((await get('/')).text).to.not.include('Ghost Product')
      for (const url of ['/ghost', '/ghost/latest/', '/ghost/1.0', '/ghost/1.0/boo']) {
        expect((await get(url)).status, url).to.equal(404)
      }
      await pages().remove((await pages().find({ key: 'ghost/1.0/boo' }))._id)
      await versions().remove(version._id)
      await products().remove(ghost._id)
    })
  })

  describe('the addresses of the versions', () => {
    const where = async (url) => {
      const res = await get(url)
      return [res.status, res.headers.location]
    }

    it('sends a product to its current version, with "latest"', async () => {
      expect(await where('/tidewater')).to.deep.equal([302, '/tidewater/latest/'])
      expect(await where('/tidewater/latest/')).to.deep.equal([302, '/tidewater/3.0'])
      expect(await where('/tidewater/latest/install')).to.deep.equal([302, '/tidewater/3.0/install'])
      // the slug of a product is the one the editor wrote: another case is another address, which is not there
      expect(await where('/Tidewater/latest/install')).to.deep.equal([404, undefined])
    })

    it('sends a version to its first page, and says 404 for a version with none', async () => {
      expect(await where('/tidewater/3.0')).to.deep.equal([302, '/tidewater/3.0/install'])
      expect(await where('/tidewater/2.x')).to.deep.equal([302, '/tidewater/2.x/install'])
      const bare = await versions().create({ key: 'tidewater/0.1', product: (await products().find({ slug: 'tidewater' }))._id, slug: '0.1', published: true })
      expect((await get('/tidewater/0.1')).status).to.equal(404)
      await versions().remove(bare._id)
    })

    it('goes to the first version when none is marked as current', async () => {
      const { version } = await find('anchor/1.0')
      await versions().update(version._id, { current: false })
      expect(await where('/anchor/latest/usage')).to.deep.equal([302, '/anchor/1.0/usage'])
      await versions().update(version._id, { current: true })
    })

    it('does not show a version that is not published: not the version, not its pages', async () => {
      for (const url of ['/tidewater/3.1-draft', '/tidewater/3.1-draft/install']) {
        expect((await get(url)).status, url).to.equal(404)
      }
    })

    it('answers 404 for what is not there, whatever the part of the address', async () => {
      for (const url of ['/nothing', '/tidewater/9.9', '/tidewater/9.9/install', '/tidewater/3.0/nope', '/tidewater/latest/nope/more', '/tidewater/3.0/install/extra']) {
        const res = await get(url)
        expect(res.status === 404 || (res.status === 302 && (await get(res.headers.location)).status === 404), url).to.equal(true)
      }
    })
  })

  describe('a page', () => {
    it('shows its text, the menu of its version with the groups, and what is selected', async () => {
      const res = await get('/tidewater/3.0/install')
      expect(res.status).to.equal(200)
      expect(res.text).to.include('<h1>Install Tidewater</h1>')
      expect(res.text).to.include('tidewater status')
      expect([...res.text.matchAll(/<h3>(.*?)<\/h3>/g)].map((match) => match[1])).to.deep.equal(['Getting started', 'Using Tidewater', 'For teams'])
      expect([...res.text.matchAll(/<li><a href="(\/tidewater\/3\.0\/[^"]+)"/g)].map((match) => match[1])).to.deep.equal(['install', 'first-sync', 'configuration', 'troubleshooting', 'single-sign-on', 'audit-log'].map((slug) => `/tidewater/3.0/${slug}`))
      expect(res.text).to.include('href="/tidewater/3.0/install" aria-current="page" class="selected"')
      // the pages for members are in the menu, marked: their titles are public
      expect(res.text.match(/class="tag small">Members/g)).to.have.length(2)
      // a page that is not published is not in the menu
      expect(res.text).to.not.include('Hidden page')
    })

    it('offers the other versions, on the same page when they have it and at their start when not', async () => {
      const install = await get('/tidewater/3.0/install')
      expect(install.text).to.include('href="/tidewater/3.0/install" aria-current="true" class="selected">3.0 (current)')
      expect(install.text).to.include('href="/tidewater/2.x/install">2.x')
      expect(install.text).to.not.include('3.1-draft')
      expect((await get('/tidewater/3.0/troubleshooting')).text).to.include('href="/tidewater/2.x">2.x')
    })

    it('says that an old version is old, and where the current one is; the current one says nothing', async () => {
      const old = await get('/tidewater/2.x/install')
      expect(old.status).to.equal(200)
      expect(old.text).to.include('This is the documentation of version 2.x, which is old.')
      expect(old.text).to.include('<a href="/tidewater/3.0">Go to 3.0</a>')
      expect(old.text).to.include('./tidewater start')
      expect((await get('/tidewater/3.0/install')).text).to.not.include('which is old')
    })

    it('has its diagram at several widths and its PDF when it has them, and a way to report a problem', async () => {
      const install = await get('/tidewater/3.0/install')
      expect(install.text).to.include('src="/figures/tidewater/3.0/install?w=800"')
      expect(install.text).to.include('/figures/tidewater/3.0/install?w=480 480w, /figures/tidewater/3.0/install?w=800 800w, /figures/tidewater/3.0/install?w=1200 1200w')
      expect(install.text).to.not.include('Download as PDF')
      expect(install.text).to.include('href="/support?page=%2Ftidewater%2F3.0%2Finstall"')
      const sync = await get('/tidewater/3.0/first-sync')
      expect(sync.text).to.include('href="/pdf/tidewater/3.0/first-sync"')
      expect(sync.text).to.not.include('<img class="diagram"')
    })

    it('answers 304 to a browser that has the page, and shows an edit of the page at once', async () => {
      const first = await get('/tidewater/3.0/troubleshooting')
      const etag = first.headers.etag
      expect(etag).to.be.a('string')
      expect((await get('/tidewater/3.0/troubleshooting', { 'If-None-Match': etag })).status).to.equal(304)
      const record = await pages().find({ key: 'tidewater/3.0/troubleshooting' })
      await pages().update(record._id, { summary: { enUS: 'A new summary of the page.' } })
      expect((await get('/tidewater/3.0/troubleshooting')).text).to.include('A new summary of the page.')
      await pages().update(record._id, { summary: record.summary })
    })

    it('shows at once what changes in another page, in a version, or in a product: the menu, the switcher, the name', async () => {
      const sync = await pages().find({ key: 'tidewater/3.0/first-sync' })
      await pages().update(sync._id, { title: { enUS: 'A renamed first sync' } })
      expect((await get('/tidewater/3.0/install')).text).to.include('A renamed first sync')
      await pages().update(sync._id, { title: sync.title })
      const { version } = await find('tidewater/2.x')
      await versions().update(version._id, { published: false })
      expect((await get('/tidewater/3.0/install')).text).to.not.include('2.x')
      await versions().update(version._id, { published: true })
      const product = await products().find({ slug: 'tidewater' })
      await products().update(product._id, { name: 'Tidewater Renamed' })
      expect((await get('/tidewater/3.0/install')).text).to.include('Tidewater Renamed')
      expect((await get('/')).text).to.include('Tidewater Renamed')
      await products().update(product._id, { name: 'Tidewater' })
    })

    it('is not shown when it is not published, and is not in the menu', async () => {
      const { version } = await find('tidewater/3.0')
      const hidden = await pages().create({ key: 'tidewater/3.0/hidden', version: version._id, slug: 'hidden', group: 'Getting started', order: 9, title: { enUS: 'Hidden page' }, body: { enUS: '<p>secret words</p>' }, published: false })
      expect((await get('/tidewater/3.0/hidden')).status).to.equal(404)
      expect((await get('/tidewater/3.0/install')).text).to.not.include('Hidden page')
      await pages().update(hidden._id, { published: true })
      expect((await get('/tidewater/3.0/hidden')).text).to.include('secret words')
      expect((await get('/tidewater/3.0/install')).text).to.include('Hidden page')
      await pages().remove(hidden._id)
    })

    it('puts a page that has no group, or a group of its own, in the menu', async () => {
      const { version } = await find('tidewater/3.0')
      const loose = await pages().create({ key: 'tidewater/3.0/loose', version: version._id, slug: 'loose', order: 8, title: { enUS: 'Loose page' }, published: true })
      const res = await get('/tidewater/3.0/loose')
      expect(res.status).to.equal(200)
      expect(res.text).to.include('Loose page')
      await pages().remove(loose._id)
    })

    it('escapes what an editor wrote in a title and a name, and prints the text as the HTML it is', async () => {
      const { version } = await find('tidewater/3.0')
      const odd = await pages().create({ key: 'tidewater/3.0/odd', version: version._id, slug: 'odd', order: 7, title: { enUS: '<script>alert(1)</script> & co' }, summary: { enUS: '"quoted"' }, body: { enUS: '<p>real <b>html</b></p>' }, published: true })
      const res = await get('/tidewater/3.0/odd')
      expect(res.text).to.include('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co')
      expect(res.text).to.not.include('<script>alert(1)')
      expect(res.text).to.include('<p>real <b>html</b></p>')
      await pages().remove(odd._id)
    })
  })

  describe('a page for members, in a product that is public', () => {
    it('gives a visitor who is not signed in its title, its summary and a way in, and nothing of the text', async () => {
      const res = await get('/tidewater/3.0/single-sign-on')
      expect(res.status).to.equal(401)
      expect(res.text).to.include('Single sign-on setup')
      expect(res.text).to.include('Let your team sign in with the account they already have.')
      expect(res.text).to.include('href="/login?next=%2Ftidewater%2F3.0%2Fsingle-sign-on"')
      expect(res.text).to.not.include('SAML')
      expect(res.text).to.not.include('identity provider')
      expect(res.text).to.not.include('/figures/')
      expect(res.text).to.not.include('/pdf/')
      expect(res.headers['cache-control']).to.equal('private, no-store')
    })

    it('gives a member all of it, in the menu of its version, kept nowhere', async () => {
      const agent = await signedIn(web, 'ada@example.com', 'a long password', '/tidewater/3.0/single-sign-on')
      const res = await retry(() => agent.get('/tidewater/3.0/single-sign-on'))
      expect(res.status).to.equal(200)
      expect(res.text).to.include('SAML')
      expect(res.text).to.include('you are signed in as Ada Reader')
      expect(res.text).to.include('aria-current="page" class="selected">Single sign-on setup')
      expect(res.text).to.include('/figures/tidewater/3.0/single-sign-on?w=800')
      expect(res.text).to.include('/pdf/tidewater/3.0/single-sign-on')
      expect(res.headers['cache-control']).to.equal('private, no-store')
    })

    it('is out of reach at once for a member who is made inactive, whatever session is open', async () => {
      const temp = await members().create({ name: 'Short Stay', email: 'short@example.com', password: 'short stay pass', active: true })
      const agent = await signedIn(web, 'short@example.com', 'short stay pass')
      expect((await retry(() => agent.get('/tidewater/3.0/audit-log'))).status).to.equal(200)
      await members().update(temp._id, { active: false })
      expect((await retry(() => agent.get('/tidewater/3.0/audit-log'))).status).to.equal(401)
      expect((await retry(() => agent.get('/pdf/tidewater/3.0/single-sign-on'))).status).to.equal(404)
      await members().remove(temp._id)
      expect((await retry(() => agent.get('/account'))).status).to.equal(303)
    })

    it('is a page that was public, kept, and is for members from the moment an editor says so', async () => {
      expect((await get('/tidewater/3.0/troubleshooting')).text).to.include('tidewater status')
      const record = await pages().find({ key: 'tidewater/3.0/troubleshooting' })
      await pages().update(record._id, { membersOnly: true })
      const res = await get('/tidewater/3.0/troubleshooting')
      expect(res.status).to.equal(401)
      expect(res.text).to.not.include('tidewater status')
      await pages().update(record._id, { membersOnly: false })
      expect((await get('/tidewater/3.0/troubleshooting')).status).to.equal(200)
    })

    it('does not keep the text of a page that became for members between the two reads of one request', async () => {
      const record = await pages().find({ key: 'tidewater/3.0/troubleshooting' })
      let reads = 0
      let racing = true
      pages().before('find', async (context) => {
        if (racing && _.get(context, 'params.query.slug') === 'troubleshooting' && ++reads === 2) {
          // an editor ticks "Members only" after the route read the page as public, before the kept page reads it
          await pages().update(record._id, { membersOnly: true })
        }
        context.next()
      })
      try {
        const res = await get('/tidewater/3.0/troubleshooting')
        expect(res.status).to.equal(404)
        expect(res.text).to.not.include('tidewater status')
      } finally {
        racing = false
        await pages().update(record._id, { membersOnly: false })
      }
      expect((await get('/tidewater/3.0/troubleshooting')).text).to.include('tidewater status')
    })
  })

  describe('a product for members', () => {
    // the answer to a visitor, without the part that names the address it came from
    const body = (res) => res.text.replace(/next=[^"]+/g, 'next=')

    it('shows nothing of itself to a visitor who is not signed in: not a version, not a page, not whether they exist', async () => {
      const answers = []
      for (const url of ['/lighthouse', '/lighthouse/latest/', '/lighthouse/latest/overview', '/lighthouse/1.0', '/lighthouse/1.0/overview', '/lighthouse/1.0/nothing', '/lighthouse/9.9/overview', '/lighthouse/9.9/x']) {
        const res = await get(url)
        expect(res.status, url).to.equal(401)
        expect(res.text, url).to.include('Lighthouse Enterprise')
        expect(res.text, url).to.include('Monitoring and alerts for a fleet')
        expect(res.text, url).to.not.include('What Lighthouse watches')
        expect(res.text, url).to.not.include('API keys')
        expect(res.headers['cache-control'], url).to.equal('private, no-store')
        answers.push(body(res))
      }
      expect(new Set(answers).size).to.equal(1)
    })

    it('shows itself to a member: the product goes to its current version, then to its first page', async () => {
      const agent = await signedIn()
      const hop = async (url) => {
        const res = await retry(() => agent.get(url))
        return [res.status, res.headers.location]
      }
      expect(await hop('/lighthouse')).to.deep.equal([302, '/lighthouse/latest/'])
      expect(await hop('/lighthouse/latest/')).to.deep.equal([302, '/lighthouse/1.0'])
      expect(await hop('/lighthouse/1.0')).to.deep.equal([302, '/lighthouse/1.0/overview'])
      const page = await retry(() => agent.get('/lighthouse/1.0/overview'))
      expect(page.status).to.equal(200)
      expect(page.text).to.include('What Lighthouse watches')
      expect(page.text).to.include('API keys')
      expect(page.headers['cache-control']).to.equal('private, no-store')
      expect((await retry(() => agent.get('/lighthouse/1.0/nothing'))).status).to.equal(404)
    })

    it('has its files for a member only: not found otherwise, private and never kept', async () => {
      for (const url of ['/figures/lighthouse/1.0/overview', '/pdf/lighthouse/1.0/api-keys']) {
        expect((await get(url)).status, url).to.equal(404)
      }
      const agent = await signedIn()
      const figure = await retry(() => agent.get('/figures/lighthouse/1.0/overview?w=480'))
      expect(figure.status).to.equal(200)
      expect(figure.headers['cache-control']).to.equal('private, no-store')
      const pdf = await retry(() => agent.get('/pdf/lighthouse/1.0/api-keys'))
      expect(pdf.status).to.equal(200)
      expect(pdf.headers['cache-control']).to.equal('private, no-store')
    })

    it('is a public product from the moment an editor says so, and for members again when they say so', async () => {
      const lighthouse = await products().find({ slug: 'lighthouse' })
      await products().update(lighthouse._id, { membersOnly: false })
      expect((await get('/lighthouse/1.0/overview')).status).to.equal(200)
      await products().update(lighthouse._id, { membersOnly: true })
      expect((await get('/lighthouse/1.0/overview')).status).to.equal(401)
    })
  })

  describe('the files of the pages', () => {
    it('diagrams are sent resized, for everyone, when the page is public', async () => {
      const small = await get('/figures/tidewater/3.0/install?w=480')
      const large = await get('/figures/tidewater/3.0/install?w=1200')
      expect(small.status).to.equal(200)
      expect(small.headers['content-type']).to.equal('image/jpeg')
      expect(small.headers['cache-control']).to.equal('public, max-age=86400')
      expect(small.headers['content-disposition']).to.match(/^inline; filename="tidewater-3\.0-install\.jpg"/)
      expect(large.body.length).to.be.above(small.body.length)
      expect((await get('/figures/tidewater/3.0/install')).status).to.equal(200)
    })

    it('diagrams answer 304 without opening the file to a browser that has them', async () => {
      const first = await get('/figures/tidewater/3.0/install?w=800')
      expect(first.headers.etag).to.match(/^"[\w-]+-800"$/)
      const again = await get('/figures/tidewater/3.0/install?w=800', { 'If-None-Match': first.headers.etag })
      expect(again.status).to.equal(304)
      expect(again.body).to.deep.equal({})
    })

    it('diagrams are sent in the widths of the list only', async () => {
      for (const w of ['100', '0', '-5', 'abc', '800.5', '480px', '800;1']) {
        const res = await get(`/figures/tidewater/3.0/install?w=${encodeURIComponent(w)}`)
        expect(res.status, w).to.equal(400)
        expect(res.text).to.equal('w is one of 480, 800, 1200')
      }
    })

    it('are not found for a page that has none, a draft, or an address that is not there', async () => {
      for (const url of ['/figures/tidewater/3.0/troubleshooting', '/figures/tidewater/3.1-draft/install', '/figures/tidewater/3.0/nope', '/figures/tidewater/9.9/install', '/figures/nothing/3.0/install', '/pdf/tidewater/3.0/troubleshooting', '/pdf/tidewater/3.1-draft/install', '/pdf/nothing/3.0/x']) {
        expect((await get(url)).status, url).to.equal(404)
      }
    })

    it('of a page for members are not found for a visitor, and are sent to a member for that member only', async () => {
      expect((await get('/figures/tidewater/3.0/single-sign-on?w=480')).status).to.equal(404)
      expect((await get('/pdf/tidewater/3.0/single-sign-on')).status).to.equal(404)
      const agent = await signedIn()
      const figure = await retry(() => agent.get('/figures/tidewater/3.0/single-sign-on?w=480'))
      expect(figure.status).to.equal(200)
      expect(figure.headers['cache-control']).to.equal('private, no-store')
      expect(figure.headers['content-type']).to.equal('image/jpeg')
      const pdf = await retry(() => agent.get('/pdf/tidewater/3.0/single-sign-on'))
      expect(pdf.status).to.equal(200)
      expect(pdf.headers['cache-control']).to.equal('private, no-store')
      expect(pdf.body.slice(0, 5).toString()).to.equal('%PDF-')
    })

    it('PDFs of a public page are downloaded by anyone, with the name they were uploaded with', async () => {
      const res = await get('/pdf/tidewater/3.0/first-sync')
      expect(res.status).to.equal(200)
      expect(res.headers['content-type']).to.equal('application/pdf')
      expect(res.headers['content-disposition']).to.match(/^attachment; filename="tidewater-3\.0-first-sync\.pdf"; filename\*=UTF-8''tidewater-3\.0-first-sync\.pdf$/)
      expect(res.headers['cache-control']).to.equal('public, max-age=3600')
      expect(res.body.slice(0, 5).toString()).to.equal('%PDF-')
    })

    it('are not a way around the rule: a file of a page that is not published, or of a version that is not, is not found', async () => {
      const record = await pages().find({ key: 'tidewater/3.0/first-sync' })
      await pages().update(record._id, { published: false })
      expect((await get('/pdf/tidewater/3.0/first-sync')).status).to.equal(404)
      await pages().update(record._id, { published: true })
      expect((await get('/pdf/tidewater/3.0/first-sync')).status).to.equal(200)
    })
  })

  describe('the search', () => {
    const titles = (res) => [...res.text.matchAll(/class="entry">\s*<a href="[^"]*">([^<]*)<\/a>/g)].map((match) => match[1])

    it('finds a page by its title, its summary or its text, in any case, in every version', async () => {
      const install = await get('/search?q=INSTALL')
      expect(titles(install)).to.deep.equal(['Install Tidewater', 'Install Tidewater'])
      expect(install.text).to.include('Tidewater 3.0')
      expect(install.text).to.include('Tidewater 2.x')
      expect(install.text).to.not.include('3.1-draft')
      expect(titles(await get('/search?q=six+words'))).to.deep.equal(['Your first sync'])
      expect(titles(await get('/search?q=pauseOnBattery'))).to.deep.equal(['Configuration reference'])
    })

    it('says so when nothing is found, and asks for a word when there is none', async () => {
      expect((await get('/search?q=zzzzzz')).text).to.include('No page matches “zzzzzz”')
      expect((await get('/search')).text).to.include('Type a word')
      expect((await get('/search?q=%20%20')).text).to.include('Type a word')
    })

    it('finds a page for members by its title and its summary, which everyone may read, and never by what it says', async () => {
      expect(titles(await get('/search?q=single+sign'))).to.deep.equal(['Single sign-on setup'])
      expect((await get('/search?q=single+sign')).text).to.include('class="tag">Members')
      expect((await get('/search?q=identity+provider')).text).to.include('No page matches')
    })

    it('finds nothing of a product for members for a visitor, and finds it for a member, in the text too', async () => {
      for (const q of ['lighthouse', 'queue', 'fleet', 'revoke']) {
        const res = await get(`/search?q=${q}`)
        expect(res.text, q).to.include('No page matches')
        expect(res.text, q).to.not.include('What Lighthouse watches')
      }
      const agent = await signedIn()
      expect(titles(await retry(() => agent.get('/search?q=queue')))).to.deep.equal(['What Lighthouse watches'])
      expect(titles(await retry(() => agent.get('/search?q=revoke')))).to.deep.equal(['API keys'])
      expect(titles(await retry(() => agent.get('/search?q=identity+provider')))).to.deep.equal(['Single sign-on setup'])
    })

    it('takes what is typed as letters, not as a pattern, and escapes it on the page', async () => {
      for (const q of ['(', '[a-', '.*', 'a{9999999}', '\\']) {
        expect((await get(`/search?q=${encodeURIComponent(q)}`)).status, q).to.equal(200)
      }
      const res = await get('/search?q=%3Cb%3Ex')
      expect(res.text).to.include('&lt;b&gt;x')
      expect(res.text).to.not.include('<b>x')
    })

    it('reads a list or an object as nothing, and cuts a long word', async () => {
      expect((await get('/search?q=a&q=b')).text).to.include('Type a word')
      expect((await get('/search?q[x]=y')).text).to.include('Type a word')
      expect((await get(`/search?q=${'a'.repeat(5000)}`)).status).to.equal(200)
    })

    it('is made for each request and kept nowhere', async () => {
      expect((await get('/search?q=install')).headers['cache-control']).to.not.match(/public/)
    })

    it('has nothing to search when no product may be read', async () => {
      const all = await products().list({})
      for (const product of all) {
        await products().update(product._id, { published: false })
      }
      expect((await get('/search?q=install')).text).to.include('No page matches')
      for (const product of all) {
        await products().update(product._id, { published: true })
      }
    })
  })

  describe('the addresses of the platform', () => {
    // a hook that refuses answers an error of the CMS ({ code, message }): the call is made, and what it said is kept
    const refused = async (work) => {
      try {
        await work()
      } catch (error) {
        return error
      }
      return null
    }

    it('are not given to a product: a slug that is a part of the platform is refused, in any case', async () => {
      for (const slug of [...catalog.RESERVED, 'LOGIN', 'Search', 'PDF']) {
        const error = await refused(() => products().create({ name: 'Taken', slug, published: true }))
        expect(error, slug).to.include({ code: 400 })
        expect(error.message, slug).to.include('is an address of the platform')
      }
      expect(await products().exists({ name: 'Taken' })).to.equal(false)
    })

    it('are not given to a product by an update either', async () => {
      const made = await products().create({ name: 'Plain', slug: 'plain', published: true })
      const error = await refused(() => products().update(made._id, { slug: 'account' }))
      expect(error).to.include({ code: 400 })
      expect((await products().find(made._id)).slug).to.equal('plain')
      await products().remove(made._id)
    })

    it('keep "latest" for the current version: no version is called so', async () => {
      const product = await products().find({ slug: 'anchor' })
      for (const slug of ['latest', 'Latest']) {
        const error = await refused(() => versions().create({ key: `anchor/${slug}`, product: product._id, slug, published: true }))
        expect(error, slug).to.include({ code: 400 })
        expect(error.message).to.include('"latest" always goes to the current version')
      }
    })

    it('leave the other names free', async () => {
      const made = await products().create({ name: 'Free', slug: 'my-product', published: true })
      const version = await versions().create({ key: 'my-product/2.0', product: made._id, slug: '2.0', published: true })
      expect(await products().exists({ slug: 'my-product' })).to.equal(true)
      await versions().remove(version._id)
      await products().remove(made._id)
    })

    it('do not get in the way of a write that has no slug: that is for the CMS to judge', async () => {
      const made = await products().create({ name: 'No slug', published: true })
      expect(made.name).to.equal('No slug')
      await products().remove(made._id)
    })
  })

  describe('the page of members', () => {
    it('lists the products for members and the pages for members of the public products, and nothing else', async () => {
      const agent = await signedIn()
      const res = await retry(() => agent.get('/account'))
      expect(res.status).to.equal(200)
      expect(res.text).to.include('Welcome, Ada Reader')
      expect(res.text).to.include('Lighthouse Enterprise')
      expect(res.text).to.include('Single sign-on setup')
      expect(res.text).to.include('Audit log export')
      expect(res.text).to.not.include('Install Tidewater')
      expect(res.text).to.not.include('What Lighthouse watches')
      expect(res.headers['cache-control']).to.equal('private, no-store')
    })

    it('has no list of products when none is for members', async () => {
      const lighthouse = await products().find({ slug: 'lighthouse' })
      await products().update(lighthouse._id, { membersOnly: false })
      const agent = await signedIn()
      expect((await retry(() => agent.get('/account'))).text).to.not.include('<h2>Products</h2>')
      await products().update(lighthouse._id, { membersOnly: true })
    })

    it('has no page for members when there are none in the public products', async () => {
      const marked = await pages().list({ membersOnly: true })
      for (const page of marked) {
        await pages().update(page._id, { membersOnly: false })
      }
      const agent = await signedIn()
      expect((await retry(() => agent.get('/account'))).text).to.include('There is no page for members in the public products yet')
      for (const page of marked) {
        await pages().update(page._id, { membersOnly: true })
      }
    })
  })

  describe('signing in', () => {
    it('shows a form with a token, and a cookie that JavaScript cannot read', async () => {
      const res = await get('/login?next=%2Ftidewater%2F3.0%2Faudit-log')
      expect(res.status).to.equal(200)
      expect(tokenOf(res)).to.have.length.above(20)
      expect(res.text).to.include('name="next" value="/tidewater/3.0/audit-log"')
      const cookie = cookiesOf(res).find((item) => item.startsWith('docshelf.sid='))
      expect(cookie).to.match(/HttpOnly/)
      expect(cookie).to.match(/SameSite=Lax/)
      expect(cookie).to.not.match(/Secure/)
      expect(res.headers['cache-control']).to.equal('private, no-store')
    })

    it('refuses a form without the token of the session, or with another one', async () => {
      const agent = request.agent(web)
      await retry(() => agent.get('/login'))
      for (const _csrf of [undefined, '', 'nope', 'x'.repeat(32)]) {
        const res = await retry(() => agent.post('/login').type('form').send({ _csrf, email: 'ada@example.com', password: 'a long password' }))
        expect(res.status, String(_csrf)).to.equal(403)
        expect(res.text).to.include('This form has expired')
      }
      expect((await retry(() => request(web).post('/login').type('form').send({ email: 'ada@example.com', password: 'a long password' }))).status).to.equal(403)
    })

    it('signs in a member and goes where the visitor was going', async () => {
      const agent = request.agent(web)
      const page = await retry(() => agent.get('/login'))
      const res = await retry(() => agent.post('/login').type('form').send({ _csrf: tokenOf(page), email: 'ADA@example.com ', password: 'a long password', next: '/tidewater/3.0/audit-log' }))
      expect(res.status).to.equal(303)
      expect(res.headers.location).to.equal('/tidewater/3.0/audit-log')
      expect((await retry(() => agent.get('/tidewater/3.0/audit-log'))).status).to.equal(200)
    })

    it('begins a new session at the sign-in, so that what was in the old one is not kept (session fixation)', async () => {
      const agent = request.agent(web)
      const page = await retry(() => agent.get('/login'))
      const before = cookiesOf(page).find((item) => item.startsWith('docshelf.sid=')).split(';')[0]
      const res = await retry(() => agent.post('/login').type('form').send({ _csrf: tokenOf(page), email: 'ada@example.com', password: 'a long password' }))
      const after = cookiesOf(res).find((item) => item.startsWith('docshelf.sid=')).split(';')[0]
      expect(after).to.not.equal(before)
      const old = await retry(() => request(web).get('/account').set('Cookie', before))
      expect(old.status).to.equal(303)
    })

    it('answers the same to an unknown email, a wrong password, an inactive member and no password', async () => {
      const answers = []
      for (const body of [
        { email: 'nobody@example.com', password: 'a long password' },
        { email: 'ada@example.com', password: 'not the password' },
        { email: 'old@example.com', password: 'another long password' },
        { email: 'ada@example.com' },
        { email: { $ne: '' }, password: { $ne: '' } },
        { email: ['ada@example.com', 'ada@example.com'], password: ['a long password', 'a long password'] }
      ]) {
        const agent = request.agent(web)
        const page = await retry(() => agent.get('/login'))
        const res = await retry(() => agent.post('/login').type('form').send({ _csrf: tokenOf(page), ...body }))
        expect(res.status, JSON.stringify(body)).to.equal(401)
        answers.push(res.text.match(/class="alert" role="alert">(.*?)<\/p>/)[1])
        expect(cookiesOf(res).some((item) => item.startsWith('docshelf.sid=') && /Expires=Thu, 01 Jan 1970/.test(item))).to.equal(false)
      }
      expect(new Set(answers).size).to.equal(1)
      expect(answers[0]).to.equal('The email or the password is wrong.')
    })

    it('keeps the email in the form after a mistake, and escapes it', async () => {
      const agent = request.agent(web)
      const page = await retry(() => agent.get('/login'))
      const res = await retry(() => agent.post('/login').type('form').send({ _csrf: tokenOf(page), email: '"><script>x</script>', password: 'x' }))
      expect(res.text).to.not.include('<script>x')
      expect(res.text).to.include('&quot;&gt;&lt;script&gt;')
    })

    it('goes to a page of the site and never to another address after the sign-in', async () => {
      for (const [next, expected] of [
        ['https://evil.example/', '/account'],
        ['//evil.example/', '/account'],
        ['/\\evil.example/', '/account'],
        ['javascript:alert(1)', '/account'],
        ['/tidewater/3.0/audit-log', '/tidewater/3.0/audit-log']
      ]) {
        const agent = await signedIn(web, 'ada@example.com', 'a long password', next)
        const res = await retry(() => agent.get('/login'))
        expect(res.status).to.equal(200)
        const again = request.agent(web)
        const page = await retry(() => again.get('/login'))
        const done = await retry(() => again.post('/login').type('form').send({ _csrf: tokenOf(page), email: 'ada@example.com', password: 'a long password', next }))
        expect(done.headers.location, next).to.equal(expected)
      }
    })

    it('sends a visitor to the sign-in from the page of members, and back afterwards', async () => {
      const res = await get('/account')
      expect(res.status).to.equal(303)
      expect(res.headers.location).to.equal('/login?next=%2Faccount')
    })

    it('ends the session at the sign-out, and refuses a sign-out that has no token', async () => {
      const agent = await signedIn()
      const account = await retry(() => agent.get('/account'))
      expect((await retry(() => agent.post('/logout').type('form').send({}))).status).to.equal(403)
      expect((await retry(() => agent.get('/account'))).status).to.equal(200)
      const out = await retry(() => agent.post('/logout').type('form').send({ _csrf: tokenOf(account) }))
      expect(out.status).to.equal(303)
      expect(out.headers.location).to.equal('/')
      expect((await retry(() => agent.get('/account'))).status).to.equal(303)
    })

    it('counts the attempts of an address and an email, answers 429 with when to come back, and forgets them at a good sign-in', async () => {
      let now = 1000
      const site = platform(cms, { secret: SECRET, cache: false, limits: { login: { limit: 3, windowMs: 60000, now: () => now } } }).app
      const attempt = async (agent, password) => {
        const page = await retry(() => agent.get('/login'))
        return retry(() => agent.post('/login').type('form').send({ _csrf: tokenOf(page), email: 'ada@example.com', password }))
      }
      const agent = request.agent(site)
      for (let index = 0; index < 3; index++) {
        expect((await attempt(agent, 'wrong')).status).to.equal(401)
      }
      const blocked = await attempt(agent, 'a long password')
      expect(blocked.status).to.equal(429)
      expect(blocked.headers['retry-after']).to.equal('60')
      expect(blocked.text).to.include('Too many attempts')
      // another email is another count; the window ends with time
      const other = await retry(async () => {
        const page = await agent.get('/login')
        return agent.post('/login').type('form').send({ _csrf: tokenOf(page), email: 'old@example.com', password: 'x' })
      })
      expect(other.status).to.equal(401)
      now += 61000
      expect((await attempt(agent, 'a long password')).status).to.equal(303)
    })
  })

  describe('the support form', () => {
    const send = async (body, agent = request.agent(web)) => {
      const page = await retry(() => agent.get('/support'))
      return retry(() => agent.post('/support').type('form').send({ _csrf: tokenOf(page), ...body }))
    }
    const valid = { name: 'Grace Hopper', email: 'grace@example.com', text: 'The guide on syncing is missing a step.' }

    it('shows the form with a token', async () => {
      const res = await get('/support')
      expect(res.status).to.equal(200)
      expect(tokenOf(res)).to.have.length.above(20)
      expect(res.text).to.include('name="website"')
    })

    it('keeps a message in the CMS for the editors, and thanks the visitor', async () => {
      const before = (await messages().list({})).length
      const res = await send(valid)
      expect(res.status).to.equal(303)
      expect(res.headers.location).to.equal('/support/thanks')
      const all = await messages().list({})
      expect(all.length).to.equal(before + 1)
      expect(all.find((message) => message.email === 'grace@example.com')).to.include({ name: 'Grace Hopper', text: valid.text, handled: false })
      expect((await get('/support/thanks')).text).to.include('Thank you')
    })

    it('says what is wrong, keeps what was typed, and makes no record', async () => {
      const before = (await messages().list({})).length
      const res = await send({ name: '', email: 'not an email', text: 'short' })
      expect(res.status).to.equal(422)
      expect(res.text).to.include('Please tell us your name.')
      expect(res.text).to.include('Please give an email address we can answer to.')
      expect(res.text).to.include('at least ten letters')
      expect(res.text).to.include('value="not an email"')
      expect((await messages().list({})).length).to.equal(before)
    })

    it('escapes what was typed, in the form again and in the record an editor reads', async () => {
      const res = await send({ name: '<script>alert(1)</script>', email: 'x', text: '"><img src=x onerror=alert(1)>' })
      expect(res.status).to.equal(422)
      expect(res.text).to.not.include('<script>alert')
      expect(res.text).to.not.include('<img src=x')
      expect(res.text).to.include('&lt;script&gt;')
    })

    it('reads a list or an object as nothing, and cuts what is too long', async () => {
      const bad = await send({ 'name[]': 'a', email: valid.email, text: valid.text })
      expect(bad.status).to.equal(422)
      const long = await send({ name: 'n'.repeat(500), email: valid.email, text: 't'.repeat(9000) })
      expect(long.status).to.equal(303)
      const stored = (await messages().list({})).find((message) => message.name.startsWith('nnnn'))
      expect(stored.name).to.have.length(100)
      expect(stored.text).to.have.length(3000)
    })

    it('refuses a form without the token of the session', async () => {
      const before = (await messages().list({})).length
      const res = await retry(() => request(web).post('/support').type('form').send(valid))
      expect(res.status).to.equal(403)
      expect(res.text).to.include('This form has expired')
      expect((await messages().list({})).length).to.equal(before)
    })

    it('thanks a program that fills the hidden box, and keeps nothing of it', async () => {
      const before = (await messages().list({})).length
      const res = await send({ ...valid, website: 'http://spam.example' })
      expect(res.status).to.equal(303)
      expect(res.headers.location).to.equal('/support/thanks')
      expect((await messages().list({})).length).to.equal(before)
    })

    it('takes a few messages from one address and then answers 429, until the window is over', async () => {
      let now = 5000
      const site = platform(cms, { secret: SECRET, cache: false, limits: { support: { limit: 2, windowMs: 3600000, now: () => now } } }).app
      const agent = request.agent(site)
      expect((await send(valid, agent)).status).to.equal(303)
      expect((await send(valid, agent)).status).to.equal(303)
      const third = await send(valid, agent)
      expect(third.status).to.equal(429)
      expect(third.headers['retry-after']).to.equal('3600')
      expect(third.text).to.include('Too many messages')
      now += 3600001
      expect((await send(valid, agent)).status).to.equal(303)
    })

    it('counts the address that the proxy says, when it is told to trust it', async () => {
      const site = platform(cms, { secret: SECRET, cache: false, trustProxy: 1, limits: { support: { limit: 1, windowMs: 3600000 } } }).app
      const asked = async (address) => {
        const agent = request.agent(site)
        const page = await retry(() => agent.get('/support'))
        return retry(() => agent.post('/support').set('X-Forwarded-For', address).type('form').send({ _csrf: tokenOf(page), ...valid }))
      }
      expect((await asked('203.0.113.1')).status).to.equal(303)
      expect((await asked('203.0.113.1')).status).to.equal(429)
      expect((await asked('203.0.113.2')).status).to.equal(303)
    })
  })

  describe('the support form, from a page', () => {
    const valid = { name: 'Grace Hopper', email: 'grace@example.com', text: 'The page on syncing is missing a step.' }
    const send = async (query, body) => {
      const agent = request.agent(platform(cms, { secret: SECRET, cache: false }).app)
      const page = await retry(() => agent.get(`/support${query}`))
      return { page, res: await retry(() => agent.post('/support').type('form').send({ _csrf: tokenOf(page), ...valid, ...body })) }
    }

    it('shows the page it was opened from, and keeps it with the message', async () => {
      const { page, res } = await send('?page=%2Ftidewater%2F3.0%2Finstall', { page: '/tidewater/3.0/install' })
      expect(page.text).to.include('About the page <code>/tidewater/3.0/install</code>')
      expect(page.text).to.include('name="page" value="/tidewater/3.0/install"')
      expect(res.status).to.equal(303)
      const stored = (await messages().list({})).find((message) => message.email === 'grace@example.com' && message.page === '/tidewater/3.0/install')
      expect(stored).to.include({ name: 'Grace Hopper', handled: false })
    })

    it('keeps no page when there is none, or when it is not a path of this site', async () => {
      for (const bad of ['', '//evil.example/x', '/\\evil.example', 'https://evil.example/', 'javascript:alert(1)', '/a\r\nb', `/${'x'.repeat(250)}`, ['/a', '/b']]) {
        const { page, res } = await send('', { page: bad })
        expect(page.text).to.not.include('About the page')
        expect(res.status, String(bad)).to.equal(303)
      }
      const stored = (await messages().list({})).filter((message) => message.email === 'grace@example.com' && message.page !== '/tidewater/3.0/install')
      expect(stored.length).to.be.above(0)
      expect(stored.every((message) => !message.page)).to.equal(true)
    })

    it('escapes the page it shows, and shows it again after a mistake', async () => {
      const agent = request.agent(platform(cms, { secret: SECRET, cache: false }).app)
      const page = await retry(() => agent.get('/support?page=%2F%22%3E%3Cscript%3Ex%3C%2Fscript%3E'))
      expect(page.text).to.not.include('<script>x')
      expect(page.text).to.include('&quot;&gt;&lt;script&gt;')
      const again = await retry(() => agent.post('/support').type('form').send({ _csrf: tokenOf(page), name: '', email: '', text: '', page: '/tidewater/3.0/install' }))
      expect(again.status).to.equal(422)
      expect(again.text).to.include('About the page <code>/tidewater/3.0/install</code>')
    })
  })

  describe('when the CMS or a template fails', () => {
    let failing = null
    const GENERIC = 'We could not show this page'
    before(() => {
      // each call is made to fail, one at a time, by the name of the test
      for (const [resource, event] of [['products', 'list'], ['products', 'find'], ['versions', 'list'], ['versions', 'find'], ['pages', 'list'], ['pages', 'find'], ['pages', 'findAttachment'], ['members', 'find'], ['messages', 'create']]) {
        cms.api()(resource).before(event, (context) => (failing === `${resource}.${event}` ? context.error(new Error('the secret detail of the failure')) : context.next()))
      }
    })
    afterEach(() => {
      failing = null
    })

    /** the answer is a 500 with the page that says nothing of the cause */
    const generic = (res) => {
      expect(res.status).to.equal(500)
      expect(res.text).to.include(GENERIC)
      expect(res.text).to.not.include('secret detail')
    }

    it('answers the home page, the search and the page of members with the page of an error when the products cannot be read', async () => {
      const agent = await signedIn()
      failing = 'products.list'
      generic(await get('/'))
      generic(await get('/search?q=install'))
      generic(await retry(() => agent.get('/account')))
    })

    it('answers every address of a product with the page of an error when the product cannot be read', async () => {
      failing = 'products.find'
      for (const url of ['/tidewater', '/tidewater/latest/install', '/tidewater/3.0', '/tidewater/3.0/install', '/figures/tidewater/3.0/install', '/pdf/tidewater/3.0/first-sync']) {
        generic(await get(url))
      }
    })

    it('answers with the page of an error when the versions cannot be read', async () => {
      const urls = {
        find: ['/tidewater/3.0', '/tidewater/3.0/install', '/figures/tidewater/3.0/install', '/pdf/tidewater/3.0/first-sync'],
        list: ['/', '/tidewater/latest/install', '/tidewater/3.0/install', '/search?q=install']
      }
      for (const event of ['find', 'list']) {
        failing = `versions.${event}`
        for (const url of urls[event]) {
          generic(await get(url))
        }
      }
    })

    it('answers with the page of an error when the pages cannot be read', async () => {
      const urls = {
        find: ['/tidewater/3.0/install', '/tidewater/3.0/single-sign-on', '/tidewater/latest/install', '/figures/tidewater/3.0/install', '/pdf/tidewater/3.0/first-sync'],
        list: ['/tidewater/3.0', '/tidewater/3.0/install', '/search?q=install']
      }
      for (const event of ['find', 'list']) {
        failing = `pages.${event}`
        for (const url of urls[event]) {
          const res = await get(url)
          // an address that goes elsewhere before it reads a page is not a failure
          expect(res.status === 500 || res.status === 302, `${event} ${url}`).to.equal(true)
          if (res.status === 500) {
            generic(res)
          }
        }
      }
    })

    it('answers a diagram and a PDF with the page of an error when the file cannot be read', async () => {
      failing = 'pages.findAttachment'
      for (const url of ['/figures/tidewater/3.0/install?w=1200', '/pdf/tidewater/3.0/first-sync']) {
        generic(await get(url))
      }
    })

    it('answers every page of a signed-in member with the page of an error when the member cannot be read, and the sign-in too', async () => {
      const agent = await signedIn()
      const other = request.agent(web)
      const page = await retry(() => other.get('/login'))
      failing = 'members.find'
      generic(await retry(() => agent.get('/')))
      generic(await retry(() => other.post('/login').type('form').send({ _csrf: tokenOf(page), email: 'ada@example.com', password: 'a long password' })))
    })

    it('answers the support form with the page of an error when the message cannot be kept', async () => {
      const agent = request.agent(platform(cms, { secret: SECRET, cache: false }).app)
      const page = await retry(() => agent.get('/support'))
      failing = 'messages.create'
      generic(await retry(() => agent.post('/support').type('form').send({ _csrf: tokenOf(page), name: 'Grace', email: 'grace@example.com', text: 'A message that cannot be kept.' })))
    })

    it('answers each page that is made for the visitor with the page of an error when its template fails', async () => {
      const { app: site, pages: helper } = platform(cms, { secret: SECRET, cache: false })
      const agent = await signedIn(site)
      const render = helper.render.bind(helper)
      const broken = new Set(['login', 'account', 'support', 'locked', 'page'])
      helper.render = (name, data) => (broken.has(name) ? Promise.reject(new Error('the secret detail of the failure')) : render(name, data))
      for (const url of ['/login', '/support']) {
        generic(await retry(() => request(site).get(url)))
      }
      generic(await retry(() => agent.get('/account')))
      generic(await retry(() => agent.get('/tidewater/3.0/audit-log')))
      generic(await retry(() => request(site).get('/tidewater/3.0/audit-log')))
      generic(await retry(() => request(site).get('/lighthouse')))
      const anonymous = request.agent(site)
      const page = await retry(() => anonymous.get('/login').catch(() => ({ text: '' })))
      generic(await retry(() => anonymous.post('/login').type('form').send({ email: 'x@example.com', password: 'x', _csrf: tokenOf(page) || 'x' })))
      generic(await retry(() => anonymous.post('/support').type('form').send({ name: '', email: '', text: '' })))
    })

    it('says "Something went wrong" in plain text when even the page of an error cannot be made, and not a word of the stack', async () => {
      const { app: site, pages: helper } = platform(cms, { secret: SECRET, cache: false })
      helper.render = () => Promise.reject(new Error('the secret detail of the failure'))
      const res = await retry(() => request(site).get('/login'))
      expect(res.status).to.equal(500)
      expect(res.headers['content-type']).to.match(/^text\/plain/)
      expect(res.text).to.equal('Something went wrong')
    })

    it('leaves an answer that is already being sent to Express, which closes it', () => {
      const failure = new Error('on the way')
      let passed
      platform.lastResort(failure, {}, { headersSent: true }, (error) => { passed = error })
      expect(passed).to.equal(failure)
    })
  })

  describe('the edges', () => {
    it('sends a file that has no name and no type as it is: a stream of bytes, named for its field', async () => {
      const { page } = await find('tidewater/3.0/troubleshooting')
      await pages().createAttachment(page._id, { name: 'download', stream: Readable.from([Buffer.from('some bytes')]), fields: {} })
      const res = await get('/pdf/tidewater/3.0/troubleshooting')
      expect(res.status).to.equal(200)
      expect(res.headers['content-type']).to.match(/^application\/octet-stream/)
      expect(res.headers['content-disposition']).to.match(/^attachment; filename="[\w.-]+"/)
      expect(res.body.toString()).to.equal('some bytes')
      const record = await pages().find(page._id)
      await pages().removeAttachment(page._id, record._attachments[0]._id)
    })
  })

  describe('the site with its own options', () => {
    it('sends the cookie over HTTPS only, and sends none over plain HTTP, when it is told it is served over HTTPS', async () => {
      // behind a proxy that ends the HTTPS (trustProxy), the proxy says which it was
      const site = platform(cms, { secret: SECRET, cache: false, secureCookies: true, trustProxy: 1 }).app
      const secure = await retry(() => request(site).get('/login').set('X-Forwarded-Proto', 'https'))
      expect(cookiesOf(secure).find((item) => item.startsWith('docshelf.sid='))).to.match(/; Secure/)
      expect(cookiesOf(await retry(() => request(site).get('/login').set('X-Forwarded-Proto', 'http')))).to.deep.equal([])
    })

    it('keeps its pages in a folder when it is given one, and reads its templates from the folder it is given', async () => {
      const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-platform-'))
      try {
        const views = path.join(folder, 'views')
        fs.cpSync(path.join(EXAMPLE, 'views'), views, { recursive: true })
        fs.writeFileSync(path.join(views, 'thanks.html'), 'Merci {{siteName}}')
        const site = platform(cms, { secret: SECRET, cache: path.join(folder, 'kept'), views }).app
        const res = await retry(() => request(site).get('/support/thanks'))
        expect(res.text).to.equal('Merci Docshelf')
        expect(fs.readdirSync(path.join(folder, 'kept')).length).to.be.above(0)
      } finally {
        fs.rmSync(folder, { recursive: true, force: true })
      }
    })

    it('makes a secret of its own when it is not given one', async () => {
      const site = platform(cms, { cache: false }).app
      expect((await retry(() => request(site).get('/login'))).status).to.equal(200)
    })
  })

  describe('the pieces', () => {
    describe('security.js', () => {
      it('Limiter lets a key hit up to its limit, says when to come back, and starts again after the window', () => {
        let now = 0
        const limiter = new Limiter({ limit: 2, windowMs: 10000, now: () => now })
        expect(limiter.hit('a')).to.deep.equal({ allowed: true, retryAfter: 10 })
        now = 4000
        expect(limiter.hit('a')).to.deep.equal({ allowed: true, retryAfter: 6 })
        expect(limiter.hit('a')).to.deep.equal({ allowed: false, retryAfter: 6 })
        expect(limiter.hit('b').allowed).to.equal(true)
        now = 10001
        expect(limiter.hit('a')).to.deep.equal({ allowed: true, retryAfter: 10 })
      })

      it('Limiter forgets a key on reset', () => {
        const limiter = new Limiter({ limit: 1, windowMs: 10000 })
        limiter.hit('a')
        expect(limiter.hit('a').allowed).to.equal(false)
        limiter.reset('a')
        expect(limiter.hit('a').allowed).to.equal(true)
        limiter.reset('never seen')
      })

      it('Limiter keeps a bounded number of keys: the windows that are over go first, then the oldest', () => {
        let now = 0
        const limiter = new Limiter({ limit: 1, windowMs: 1000, maxKeys: 3, now: () => now })
        limiter.hit('a')
        limiter.hit('b')
        now = 500
        limiter.hit('c')
        expect(limiter.keys.size).to.equal(3)
        now = 1200
        limiter.hit('d')
        expect([...limiter.keys.keys()]).to.deep.equal(['c', 'd'])
        limiter.hit('e')
        limiter.hit('f')
        expect(limiter.keys.size).to.be.at.most(3)
        expect(limiter.keys.has('c')).to.equal(false)
        expect(limiter.keys.has('d')).to.equal(true)
      })

      it('csrfToken makes one token for a session and keeps it, and csrfValid compares it with the form', () => {
        const req = { session: {}, body: {} }
        const token = csrfToken(req)
        expect(token).to.have.length.above(20)
        expect(csrfToken(req)).to.equal(token)
        expect(csrfValid({ session: { csrf: token }, body: { _csrf: token } })).to.equal(true)
        // the last character is one of 64 and could already be the one written here: change it to another
        expect(csrfValid({ session: { csrf: token }, body: { _csrf: `${token.slice(0, -1)}${token.endsWith('x') ? 'y' : 'x'}` } })).to.equal(false)
        expect(csrfValid({ session: { csrf: token }, body: { _csrf: token.slice(1) } })).to.equal(false)
        expect(csrfValid({ session: { csrf: token }, body: {} })).to.equal(false)
        expect(csrfValid({ session: { csrf: token } })).to.equal(false)
        expect(csrfValid({ session: {}, body: { _csrf: token } })).to.equal(false)
        expect(csrfValid({ body: { _csrf: token } })).to.equal(false)
        expect(csrfValid({ session: { csrf: token }, body: { _csrf: [token] } })).to.equal(false)
      })

      it('localPath keeps a path of the site and sends anything else to the page of members', () => {
        expect(localPath('/docs/x?y=1#z')).to.equal('/docs/x?y=1#z')
        expect(localPath('/')).to.equal('/')
        for (const value of ['//evil.example', '/\\evil.example', 'https://evil.example', 'evil', '', undefined, null, 5, ['/a'], '/a\r\nSet-Cookie: x=1', '/a\nb']) {
          expect(localPath(value), String(value)).to.equal('/account')
        }
      })

      it('securityHeaders sets its headers and goes on', () => {
        const headers = {}
        let called = false
        securityHeaders()({}, { set: (values) => Object.assign(headers, values) }, () => { called = true })
        expect(called).to.equal(true)
        expect(Object.keys(headers).sort()).to.deep.equal(['Content-Security-Policy', 'Cross-Origin-Resource-Policy', 'Referrer-Policy', 'X-Content-Type-Options', 'X-Frame-Options'])
      })
    })

    describe('accounts.js', () => {
      it('hashPassword makes a different hash each time, and verifyPassword knows its own', async () => {
        const one = await accounts.hashPassword('secret')
        const two = await accounts.hashPassword('secret')
        expect(one).to.not.equal(two)
        expect(await accounts.verifyPassword('secret', one)).to.equal(true)
        expect(await accounts.verifyPassword('secret', two)).to.equal(true)
        expect(await accounts.verifyPassword('Secret', one)).to.equal(false)
        expect(await accounts.verifyPassword('', one)).to.equal(false)
      })

      it('verifyPassword refuses what is not a hash of its own, without failing', async () => {
        for (const stored of [undefined, null, '', 'plain', 'scrypt$', 'scrypt$a', 'scrypt$a$', 'bcrypt$a$b', 'scrypt$a$b$c', 5]) {
          expect(await accounts.verifyPassword('secret', stored), String(stored)).to.equal(false)
        }
      })

      it('signIn gives the member for the right password, whatever the case of the email, and nothing otherwise', async () => {
        expect((await accounts.signIn(cms, 'ADA@example.com', 'a long password')).name).to.equal('Ada Reader')
        expect(await accounts.signIn(cms, 'ada@example.com', 'wrong')).to.equal(null)
        expect(await accounts.signIn(cms, 'nobody@example.com', 'a long password')).to.equal(null)
        expect(await accounts.signIn(cms, 'old@example.com', 'another long password')).to.equal(null)
        expect(await accounts.signIn(cms)).to.equal(null)
      })

      it('signIn refuses a member that has no password hash, whatever is typed', async () => {
        const bare = await cms.api()('members').create({ name: 'No Hash', email: 'nohash@example.com', active: true })
        for (const password of ['', 'nobody', 'undefined', 'scrypt$a$b']) {
          expect(await accounts.signIn(cms, 'nohash@example.com', password), password).to.equal(null)
        }
        await cms.api()('members').remove(bare._id)
      })

      it('current gives an active member by its id, and nothing for the others', async () => {
        const ada = await members().find({ name: 'Ada Reader' })
        const old = await members().find({ name: 'Old Member' })
        expect((await accounts.current(cms, ada._id)).name).to.equal('Ada Reader')
        expect(await accounts.current(cms, old._id)).to.equal(null)
        expect(await accounts.current(cms, 'not-an-id')).to.equal(null)
        expect(await accounts.current(cms, undefined)).to.equal(null)
        expect(await accounts.current(cms, '')).to.equal(null)
      })
    })

    describe('media.js and the helpers of the site', () => {
      it('dispositionName gives a plain name and the real one', () => {
        expect(createMedia.dispositionName('guide.pdf')).to.equal('filename="guide.pdf"; filename*=UTF-8\'\'guide.pdf')
        expect(createMedia.dispositionName('指南 (v2).pdf')).to.equal('filename="__ _v2_.pdf"; filename*=UTF-8\'\'%E6%8C%87%E5%8D%97%20%28v2%29.pdf')
        expect(createMedia.dispositionName('a"b\r\nc.pdf')).to.not.match(/[\r\n]/)
        expect(createMedia.dispositionName('a"b.pdf')).to.include('filename="a_b.pdf"')
        expect(createMedia.dispositionName('it\'s*.pdf')).to.include('filename*=UTF-8\'\'it%27s%2A.pdf')
      })

      it('describePage gives a page its addresses and what it has', () => {
        const product = { slug: 'my product', membersOnly: false }
        const version = { slug: '3.0' }
        const shown = platform.describe(product, version, { slug: 'a b', title: { enUS: 'T' }, summary: { enUS: 'S' }, membersOnly: 1, _attachments: [{ _name: 'diagram' }] })
        expect(shown).to.include({ title: 'T', summary: 'S', membersOnly: true, href: '/my%20product/3.0/a%20b', hasDiagram: true, hasDownload: false })
        expect(shown.diagram).to.equal('/figures/my%20product/3.0/a%20b?w=800')
        expect(shown.srcset).to.equal('/figures/my%20product/3.0/a%20b?w=480 480w, /figures/my%20product/3.0/a%20b?w=800 800w, /figures/my%20product/3.0/a%20b?w=1200 1200w')
        expect(shown.download).to.equal('/pdf/my%20product/3.0/a%20b')
        expect(shown.report).to.equal('/support?page=%2Fmy%2520product%2F3.0%2Fa%2520b')
        expect(platform.describe({ slug: 'p', membersOnly: true }, version, { slug: 'x' })).to.include({ title: '', summary: '', membersOnly: true, hasDiagram: false })
      })

      it('pagePath keeps a path of the site and nothing else', () => {
        expect(platform.pagePath('/tidewater/3.0/install')).to.equal('/tidewater/3.0/install')
        for (const value of ['', undefined, null, 5, ['/a'], '//evil.example', '/\\evil.example', 'https://evil.example', 'evil', '/a\nb', `/${'x'.repeat(250)}`]) {
          expect(platform.pagePath(value), String(value)).to.equal('')
        }
      })

      it('canRead lets a member read everything, and a visitor what is public in a public product', () => {
        expect(catalog.canRead({ name: 'Ada' }, { membersOnly: true }, { membersOnly: true })).to.equal(true)
        expect(catalog.canRead(null, { membersOnly: false }, { membersOnly: false })).to.equal(true)
        expect(catalog.canRead(null, { membersOnly: false })).to.equal(true)
        expect(catalog.canRead(null, { membersOnly: true }, { membersOnly: false })).to.equal(false)
        expect(catalog.canRead(null, { membersOnly: false }, { membersOnly: true })).to.equal(false)
        expect(catalog.canRead(null, { membersOnly: true })).to.equal(false)
        expect(catalog.text({ title: { enUS: 'T' } }, 'title')).to.equal('T')
        expect(catalog.text({}, 'title')).to.equal('')
      })

      it('readMessage cleans what was typed and lists what is wrong', () => {
        expect(platform.readMessage({ name: ' Ada ', email: ' a@b.co ', text: ' a few words here ' })).to.deep.equal({ values: { name: 'Ada', email: 'a@b.co', text: 'a few words here' }, errors: [] })
        expect(platform.readMessage({}).errors).to.have.length(3)
        expect(platform.readMessage({ name: ['x'], email: { a: 1 }, text: 5 }).errors).to.have.length(3)
        expect(platform.readMessage({ name: 'n', email: 'a@b', text: 'long enough text' }).errors).to.deep.equal(['Please give an email address we can answer to.'])
      })
    })
  })})