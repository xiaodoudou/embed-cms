const fs = require('fs')
const os = require('os')
const path = require('path')
const express = require('express')
const _ = require('lodash')
const request = require('supertest')
const { expect } = require('chai')
const CMS = require('../../')
const site = require('../../docs/examples/site/site')
const { startApp } = require('../helpers/app')

// The blog of docs/examples/site: the shortest site on embed-cms. Four articles loaded from its content.json, a home page, a list in pages, an article, a 404 and an error page, all made by the
// PageHelper from Mustache templates and kept until something they read changes. This is the base a change of the CMS must keep working.

const EXAMPLE = path.resolve(__dirname, '../../docs/examples/site')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('the example blog (unit)', () => {
  let app, web, built, listed, failing
  const articles = () => app.cms.api()('articles')
  // supertest opens a port for each request: a dropped first packet (see docs/contributing/TESTING.md) is tried again
  const get = async (url, headers = {}) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const test = request(web).get(url)
        Object.entries(headers).forEach(([name, value]) => test.set(name, value))
        return await test
      } catch (error) {
        if (attempt >= 3) {
          throw error
        }
      }
    }
  }
  const cards = (res) => [...res.text.matchAll(/<a class="card" href="\/articles\/([^"]+)">\s*<h2>(.*?)<\/h2>/g)].map((match) => ({ slug: match[1], name: match[2] }))
  /** @returns {Promise<Array<object>>} n published articles, the oldest first, a few milliseconds apart so that their order is the order they were made in */
  const makeMany = async (count, prefix) => {
    const made = []
    for (let index = 0; index < count; index++) {
      made.push(await articles().create({ slug: `${prefix}-${index}`, title: { enUS: `${prefix} ${index}` }, body: { enUS: '<p>text</p>' }, published: true }))
      await wait(3)
    }
    return made
  }
  const removeAll = (records) => Promise.all(records.map((record) => articles().remove(record._id)))

  before(async () => {
    app = await startApp({ resources: path.join(EXAMPLE, 'resources'), anonymousRead: ['articles'] })
    await new CMS.ContentLoader(app.cms).load(path.join(EXAMPLE, 'content.json'))
    // what the helper asks of the CMS is counted, and a call can be made to fail, as the tests need
    listed = 0
    articles().before('list', (context) => {
      // the loader of a route asks for the published articles; the helper's own check of what is old asks for something else
      if (_.get(context, 'params.query.published') === true) {
        listed++
      }
      return failing === 'list' ? context.error(new Error('the secret detail of the failure')) : context.next()
    })
    built = site(app.cms, { cache: false })
    web = express()
    // as server.js does: the CMS first, then the pages
    web.use(app.cms.express())
    web.use(built.router)
  })
  after(async () => {
    await app.close()
  })

  describe('its content', () => {
    it('is loaded from content.json: four articles, published', async () => {
      const all = await articles().list({})
      expect(all.map((article) => article.slug).sort()).to.deep.equal(['caching', 'release', 'templates', 'welcome'])
      expect(all.every((article) => article.published === true)).to.equal(true)
    })

    it('is not made again when it is loaded again', async () => {
      const report = await new CMS.ContentLoader(app.cms).load(path.join(EXAMPLE, 'content.json'))
      expect(report).to.include({ created: 0, updated: 0 })
    })
  })

  describe('the home page', () => {
    it('lists the articles, each with its title, its day and a link', async () => {
      const res = await get('/')
      expect(res.status).to.equal(200)
      expect(res.headers['content-type']).to.match(/^text\/html/)
      expect(res.text).to.include('<title>Latest · My blog</title>')
      expect(res.text).to.include('<h1>Latest articles</h1>')
      expect(cards(res).map((card) => card.slug).sort()).to.deep.equal(['caching', 'release', 'templates', 'welcome'])
      expect(res.text).to.match(/<small>\d{4}-\d{2}-\d{2}<\/small>/)
      expect(res.text).to.include('Welcome to the blog')
    })

    it('has the header with its links, the footer with the name of the site, and the stylesheet', async () => {
      const res = await get('/')
      expect(res.text).to.include('<nav><a href="/">Home</a> · <a href="/articles">All articles</a></nav>')
      expect(res.text).to.include('© My blog')
      expect(res.text).to.include('<link rel="stylesheet" href="/site.css">')
      expect(res.text).to.include('<html lang="en">')
      const css = await get('/site.css')
      expect(css.status).to.equal(200)
      expect(css.headers['content-type']).to.match(/^text\/css/)
    })

    it('sets no cookie, so that a cache may keep it', async () => {
      expect((await get('/')).headers['set-cookie']).to.equal(undefined)
    })

    it('does not list an article that is not published', async () => {
      const [draft] = await makeMany(1, 'draft')
      await articles().update(draft._id, { published: false })
      expect((await get('/')).text).to.not.include('draft 0')
      expect((await get('/articles')).text).to.not.include('draft 0')
      expect((await get(`/articles/${draft.slug}`)).status).to.equal(404)
      await removeAll([draft])
    })

    it('lists the newest first, and ten at most', async () => {
      const made = await makeMany(12, 'many')
      const names = cards(await get('/')).map((card) => card.name)
      expect(names).to.have.length(10)
      expect(names.slice(0, 3)).to.deep.equal(['many 11', 'many 10', 'many 9'])
      await removeAll(made)
    })

    it('says so when there is no article', async () => {
      const all = await articles().list({})
      for (const article of all) {
        await articles().update(article._id, { published: false })
      }
      expect((await get('/')).text).to.include('No articles yet.')
      for (const article of all) {
        await articles().update(article._id, { published: true })
      }
    })
  })

  describe('the list of all the articles', () => {
    let made
    before(async () => {
      made = await makeMany(7, 'paged')
    })
    after(async () => {
      await removeAll(made)
    })

    it('shows five a page, with the links to the older and to the newer ones', async () => {
      const first = await get('/articles')
      expect(first.status).to.equal(200)
      expect(first.text).to.include('<h1>All articles</h1>')
      expect(cards(first)).to.have.length(5)
      expect(first.text).to.include('href="/articles?page=1">Older →')
      expect(first.text).to.not.include('Newer')
      const second = await get('/articles?page=1')
      expect(cards(second)).to.have.length(5)
      expect(second.text).to.include('href="/articles?page=0">← Newer')
      expect(second.text).to.include('href="/articles?page=2">Older →')
      const last = await get('/articles?page=2')
      expect(cards(last)).to.have.length(1)
      expect(last.text).to.include('Newer')
      expect(last.text).to.not.include('Older')
    })

    it('takes a page that is not a number, or is below the first, for the first', async () => {
      const first = cards(await get('/articles')).map((card) => card.slug)
      for (const page of ['abc', '-3', '', '%00', '0x']) {
        expect(cards(await get(`/articles?page=${page}`)).map((card) => card.slug), page).to.deep.equal(first)
      }
    })

    it('shows an empty page, with the way back, past the last', async () => {
      const res = await get('/articles?page=40')
      expect(res.status).to.equal(200)
      expect(res.text).to.include('No articles on this page.')
      expect(res.text).to.include('href="/articles?page=39">← Newer')
    })

    it('keeps one page for each page of the list, and the same page for the parameters that change nothing', async () => {
      const plain = await get('/articles')
      const other = await get('/articles?utm_source=somewhere')
      expect(other.text).to.equal(plain.text)
      expect((await get('/articles?page=1')).text).to.not.equal(plain.text)
    })
  })

  describe('an article', () => {
    it('shows its title, its day and its text, and a way back', async () => {
      const res = await get('/articles/welcome')
      expect(res.status).to.equal(200)
      expect(res.text).to.include('<title>Welcome to the blog · My blog</title>')
      expect(res.text).to.include('<h1>Welcome to the blog</h1>')
      expect(res.text).to.match(/<small>\d{4}-\d{2}-\d{2}<\/small>/)
      expect(res.text).to.include('<strong>PageHelper</strong>')
      expect(res.text).to.include('<li>Articles an editor writes in the admin</li>')
      expect(res.text).to.include('<a href="/">← All articles</a>')
    })

    it('prints the title as text and the body as the HTML an editor wrote', async () => {
      const made = await articles().create({ slug: 'odd', title: { enUS: '<script>alert(1)</script> & "q"' }, body: { enUS: '<p>real <b>html</b></p>' }, published: true })
      const page = await get('/articles/odd')
      expect(page.text).to.not.include('<script>alert(1)')
      expect(page.text).to.include('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;')
      expect(page.text).to.include('<p>real <b>html</b></p>')
      expect((await get('/')).text).to.include('&lt;script&gt;')
      await articles().remove(made._id)
    })

    it('answers 404 for an article that is not there, with the page of a 404', async () => {
      for (const url of ['/articles/nothing', '/articles/..%2f..%2fetc%2fpasswd', '/articles/%00', '/articles/welcome/extra', `/articles/${'x'.repeat(2000)}`, '/articles/(.*)']) {
        const res = await get(url)
        expect(res.status, url).to.equal(404)
        expect(res.text, url).to.include('Page not found')
      }
    })

    it('does not mistake a pattern in the address for a pattern', async () => {
      const made = await articles().create({ slug: 'a.b', title: { enUS: 'Dotted' }, published: true })
      expect((await get('/articles/a.b')).status).to.equal(200)
      expect((await get('/articles/aXb')).status).to.equal(404)
      await articles().remove(made._id)
    })

    it('uses its slug as the name when it has no title, and shows an empty text', async () => {
      const made = await articles().create({ slug: 'untitled', published: true })
      const res = await get('/articles/untitled')
      expect(res.status).to.equal(200)
      expect(res.text).to.include('<h1>untitled</h1>')
      await articles().remove(made._id)
    })
  })

  describe('the page of a 404', () => {
    it('is the template of the site, with the address that was asked for, escaped', async () => {
      const res = await get('/nowhere')
      expect(res.status).to.equal(404)
      expect(res.text).to.include('<h1>Page not found</h1>')
      expect(res.text).to.include('<code>/nowhere</code>')
      expect(res.text).to.include('Back to the articles')
      expect(res.headers['cache-control']).to.equal('no-store')
      const odd = await get('/%3Cb%3E')
      expect(odd.text).to.not.include('<b>')
    })
  })

  describe('a failure', () => {
    afterEach(() => {
      failing = null
    })

    it('is shown as the page of an error that says nothing of it', async () => {
      failing = 'list'
      const res = await get('/')
      expect(res.status).to.equal(500)
      expect(res.text).to.include('We could not show this page')
      expect(res.text).to.not.include('secret detail')
    })

    it('does not stop the next request', async () => {
      expect((await get('/')).status).to.equal(200)
    })
  })

  describe('the kept pages', () => {
    let kept
    before(() => {
      kept = site(app.cms)
      web = express()
      web.use(app.cms.express())
      web.use(kept.router)
    })
    after(() => {
      web = express()
      web.use(app.cms.express())
      web.use(built.router)
    })

    it('are made once: the second visitor gets the page without the articles being read again', async () => {
      await get('/')
      const before = listed
      const again = await get('/')
      expect(again.status).to.equal(200)
      expect(listed).to.equal(before)
    })

    it('are made again when an article changes, and show the change', async () => {
      const welcome = await articles().find({ slug: 'welcome' })
      await get('/')
      const before = listed
      await articles().update(welcome._id, { title: { enUS: 'A new title' } })
      const res = await get('/')
      expect(res.text).to.include('A new title')
      expect(listed).to.be.above(before)
      await articles().update(welcome._id, { title: welcome.title })
    })

    it('are made again when an article is made or removed', async () => {
      await get('/')
      const made = await articles().create({ slug: 'fresh', title: { enUS: 'Fresh article' }, published: true })
      expect((await get('/')).text).to.include('Fresh article')
      await articles().remove(made._id)
      expect((await get('/')).text).to.not.include('Fresh article')
    })

    it('answer 304 to a browser that has them, and 200 again once the page has changed', async () => {
      const first = await get('/articles/templates')
      const etag = first.headers.etag
      expect(etag).to.be.a('string')
      expect((await get('/articles/templates', { 'If-None-Match': etag })).status).to.equal(304)
      const record = await articles().find({ slug: 'templates' })
      await articles().update(record._id, { title: { enUS: 'Changed' } })
      expect((await get('/articles/templates', { 'If-None-Match': etag })).status).to.equal(200)
      await articles().update(record._id, { title: record.title })
    })

    it('are kept in a folder, when the site is given one, and a new start finds them', async () => {
      const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-blog-'))
      try {
        const make = () => {
          const instance = site(app.cms, { cache: folder })
          const server = express()
          server.use(instance.router)
          return server
        }
        expect((await request(make()).get('/articles/caching')).status).to.equal(200)
        expect(fs.readdirSync(folder).some((name) => name.endsWith('.html'))).to.equal(true)
        const before = listed
        const restarted = await request(make()).get('/articles/caching')
        expect(restarted.status).to.equal(200)
        expect(restarted.text).to.include('A short guide to the kept pages')
        expect(listed).to.equal(before)
      } finally {
        fs.rmSync(folder, { recursive: true, force: true })
      }
    })

    it('are made again when a template file changes', async () => {
      const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-blog-views-'))
      try {
        const views = path.join(folder, 'views')
        fs.cpSync(path.join(EXAMPLE, 'views'), views, { recursive: true })
        const instance = site(app.cms, { views, cache: false })
        const server = express()
        server.use(instance.router)
        expect((await request(server).get('/')).text).to.include('<h1>Latest articles</h1>')
        const file = path.join(views, 'home.html')
        // a newer date on the file, whatever the clock of the disk
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Latest articles', 'The newest articles'))
        const later = new Date(Date.now() + 5000)
        fs.utimesSync(file, later, later)
        expect((await request(server).get('/')).text).to.include('<h1>The newest articles</h1>')
      } finally {
        fs.rmSync(folder, { recursive: true, force: true })
      }
    })
  })

  describe('the site as a module', () => {
    it('gives a router and the helper, and the name of the site to every page', () => {
      expect(_.isFunction(built.router)).to.equal(true)
      expect(built.pages.names().sort()).to.deep.equal(['article', 'articles', 'card', 'error', 'footer', 'header', 'home', 'notfound'])
    })

    it('takes more options for the helper', async () => {
      const named = site(app.cms, { cache: false, pages: { locals: { siteName: 'Another blog' } } })
      const server = express()
      server.use(named.router)
      expect((await request(server).get('/')).text).to.include('© Another blog')
    })
  })
})
