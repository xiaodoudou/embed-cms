const fs = require('fs')
const os = require('os')
const path = require('path')
const express = require('express')
const request = require('supertest')
const { expect } = require('chai')
const CMS = require('../../')
const site = require('../../docs/examples/site/site')
const { startApp } = require('../helpers/app')

// PageHelper: Mustache pages from the content of the CMS, with the templates read at the start, and kept pages that are made again when a template, or a record they read, changes.

const EXAMPLE = path.resolve(__dirname, '../../docs/examples/site')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('PageHelper (unit)', () => {
  let app, api, folder, views
  const articles = () => api('articles')
  const record = (slug, extra = {}) => ({ title: { enUS: `Title of ${slug}` }, slug, body: { enUS: `<p>Body of ${slug}</p>` }, published: true, ...extra })

  before(async () => {
    app = await startApp({ resources: path.join(EXAMPLE, 'resources') })
    api = app.cms.api()
  })
  after(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // the templates are copied: a test changes them without touching the example
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-pages-'))
    views = path.join(folder, 'views')
    fs.cpSync(path.join(EXAMPLE, 'views'), views, { recursive: true })
    for (const existing of await articles().list({})) {
      await articles().remove(existing._id)
    }
  })
  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true })
  })

  /** A web application with the example site and what it needs: the helper and the routes. `loads` counts how often the articles are read. */
  const build = (options = {}) => {
    const built = site(app.cms, { views, ...options })
    const web = express()
    web.use(built.router)
    return { ...built, web }
  }
  /** Changes a template file the way an editor does, with a date later than the one it had */
  const edit = (name, change) => {
    const file = path.join(views, name)
    fs.writeFileSync(file, change(fs.readFileSync(file, 'utf8')))
    const later = new Date(Date.now() + 5000)
    fs.utimesSync(file, later, later)
  }
  /** Counts the times the loader of a route runs, by wrapping `cms.api` */
  const countReads = () => {
    const original = app.cms.api
    const state = { reads: 0 }
    app.cms.api = () => {
      const real = original.call(app.cms)
      return (name, ...rest) => {
        const wrapper = real(name, ...rest)
        return new Proxy(wrapper, { get: (target, property) => (property === 'list' ? (...args) => { state.reads++; return target.list(...args) } : target[property]) })
      }
    }
    state.restore = () => { app.cms.api = original }
    return state
  }

  describe('the start', () => {
    const helper = (templates, extra = {}) => new CMS.PageHelper({ cms: app.cms, templates, ...extra })

    it('needs the cms and templates', () => {
      expect(() => new CMS.PageHelper({ templates: { a: { source: 'a' } } })).to.throw('needs the cms')
      expect(() => new CMS.PageHelper({ cms: app.cms })).to.throw('needs its templates')
      expect(() => new CMS.PageHelper({ cms: app.cms, templates: {} })).to.throw('needs its templates')
    })

    it('reads every template, so the names are the ones to use', () => {
      const pages = site(app.cms, { views }).pages
      expect(pages.names()).to.have.members(['header', 'footer', 'card', 'home', 'articles', 'article', 'notfound', 'error'])
      expect(pages.has('home')).to.equal(true)
      expect(pages.has('nope')).to.equal(false)
    })

    it('refuses a file that cannot be read, naming the template', () => {
      expect(() => helper({ home: path.join(folder, 'missing.html') })).to.throw('Template "home": cannot read')
    })

    it('refuses a template that does not parse, naming it', () => {
      expect(() => helper({ home: { source: '{{#open}}never closed' } })).to.throw('Template "home":')
    })

    it('refuses a partial that is not in the list, naming both', () => {
      expect(() => helper({ home: { source: '{{> cardd}}' } })).to.throw('Template "home" includes "cardd", which is not in templates')
    })

    it('finds the partials inside sections too', () => {
      expect(() => helper({ home: { source: '{{#items}}{{> cardd}}{{/items}}' } })).to.throw('"cardd"')
    })

    it('refuses a template name that could leave the folder or is not a name', () => {
      expect(() => helper({ '../x': { source: 'x' } })).to.throw('not a name')
      expect(() => helper({ 'a b': { source: 'x' } })).to.throw('not a name')
    })

    it('wants a path or a source for each template', () => {
      expect(() => helper({ home: 5 })).to.throw('give the path of its file, or { source }')
    })

    it('refuses a notFound or an error template that is not in the list', () => {
      expect(() => helper({ home: { source: 'x' } }, { notFound: 'nope' })).to.throw('The notFound template "nope"')
      expect(() => helper({ home: { source: 'x' } }, { error: 'nope' })).to.throw('The error template "nope"')
    })

    it('refuses a route whose template is not in the list, when the route is made', () => {
      expect(() => helper({ home: { source: 'x' } }).route('nope')).to.throw('Template "nope" is not in templates')
    })
  })

  describe('render', () => {
    const pages = (templates, extra = {}) => new CMS.PageHelper({ cms: app.cms, templates, ...extra })

    it('fills a template with the data, escaping what is printed with two braces', async () => {
      const html = await pages({ t: { source: '<p>{{name}}</p>' } }).render('t', { name: '<b>x</b>' })
      expect(html).to.equal('<p>&lt;b&gt;x&lt;/b&gt;</p>')
    })

    it('prints raw what is printed with three braces', async () => {
      expect(await pages({ t: { source: '{{{html}}}' } }).render('t', { html: '<b>x</b>' })).to.equal('<b>x</b>')
    })

    it('includes the partials by name, with the data of the page', async () => {
      const helper = pages({ page: { source: '{{> top}}{{#items}}{{> row}}{{/items}}' }, top: { source: '<h1>{{title}}</h1>' }, row: { source: '<li>{{name}}</li>' } })
      expect(await helper.render('page', { title: 'T', items: [{ name: 'a' }, { name: 'b' }] })).to.equal('<h1>T</h1><li>a</li><li>b</li>')
    })

    it('gives every page the locals, under the data of the page', async () => {
      const helper = pages({ t: { source: '{{site}}/{{who}}' } }, { locals: { site: 'S', who: 'locals' } })
      expect(await helper.render('t', { who: 'page' })).to.equal('S/page')
    })

    it('does not run what is in the data: a template cannot run code', async () => {
      expect(await pages({ t: { source: '{{x}}' } }).render('t', { x: '{{> secret}}' })).to.equal('{{&gt; secret}}')
    })

    it('says when the template is not in the list', async () => {
      let message
      await pages({ t: { source: 'x' } }).render('nope').catch((error) => { message = error.message })
      expect(message).to.include('"nope" is not in templates')
    })

    it('uses the changed file of a template, once its date is later', async () => {
      const helper = site(app.cms, { views }).pages
      expect(await helper.render('card', { slug: 's', name: 'N', day: 'D' })).to.include('<h2>N</h2>')
      edit('card.html', (text) => text.replace('<h2>{{name}}</h2>', '<h3>{{name}}</h3>'))
      expect(await helper.render('card', { slug: 's', name: 'N', day: 'D' })).to.include('<h3>N</h3>')
    })

    it('keeps the last text of a template whose file is gone', async () => {
      const helper = site(app.cms, { views }).pages
      fs.rmSync(path.join(views, 'card.html'))
      expect(await helper.render('card', { slug: 's', name: 'N', day: 'D' })).to.include('<h2>N</h2>')
    })

    it('refuses a changed file that does not parse, and goes on with the last text until it is mended', async () => {
      const helper = site(app.cms, { views }).pages
      edit('card.html', (text) => `${text}{{#open}}`)
      let message
      await helper.render('card', { slug: 's', name: 'N', day: 'D' }).catch((error) => { message = error.message })
      expect(message).to.include('Template "card":')
      edit('card.html', (text) => text.replace('{{#open}}', ''))
      expect(await helper.render('card', { slug: 's', name: 'N', day: 'D' })).to.include('<h2>N</h2>')
    })
  })

  describe('a route', () => {
    it('renders the root template with the data of its loader', async () => {
      await articles().create(record('hello'))
      const { web } = build()
      const res = await request(web).get('/')
      expect(res.status).to.equal(200)
      expect(res.headers['content-type']).to.include('text/html')
      expect(res.text).to.include('<title>Latest · My blog</title>')
      expect(res.text).to.include('<h2>Title of hello</h2>')
      expect(res.text).to.include('href="/articles/hello"')
    })

    it('shows the empty case of a section', async () => {
      const res = await request(build().web).get('/')
      expect(res.text).to.include('No articles yet.')
    })

    it('shows an article with its rich text printed as it is', async () => {
      await articles().create(record('hello'))
      const res = await request(build().web).get('/articles/hello')
      expect(res.status).to.equal(200)
      expect(res.text).to.include('<h1>Title of hello</h1>')
      expect(res.text).to.include('<p>Body of hello</p>')
    })

    it('escapes the text of a record', async () => {
      await articles().create(record('x', { title: { enUS: '<script>alert(1)</script>' } }))
      const res = await request(build().web).get('/articles/x')
      expect(res.text).to.not.include('<script>alert(1)</script>')
      expect(res.text).to.include('&lt;script&gt;')
    })

    it('answers the 404 template when the loader says not found, with the status and the address', async () => {
      const res = await request(build().web).get('/articles/missing')
      expect(res.status).to.equal(404)
      expect(res.text).to.include('<h1>Page not found</h1>')
      expect(res.text).to.include('<code>/articles/missing</code>')
      expect(res.headers['cache-control']).to.equal('no-cache')
    })

    it('does not show an article that is not published', async () => {
      await articles().create(record('draft', { published: false }))
      expect((await request(build().web).get('/articles/draft')).status).to.equal(404)
    })

    it('answers the 404 template for an address no route answers (notFoundHandler)', async () => {
      const res = await request(build().web).get('/nowhere/at/all')
      expect(res.status).to.equal(404)
      expect(res.text).to.include('<h1>Page not found</h1>')
      expect(res.text).to.include('/nowhere/at/all')
    })

    it('answers plain text for a 404 when the helper has no 404 template', async () => {
      const pages = new CMS.PageHelper({ cms: app.cms, templates: { home: { source: 'x' } } })
      const web = express()
      web.get('/', pages.route('home', ({ notFound }) => notFound()))
      web.use(pages.notFoundHandler())
      for (const url of ['/', '/other']) {
        const res = await request(web).get(url)
        expect(res.status).to.equal(404)
        expect(res.text).to.equal('Not found')
      }
    })

    describe('errors', () => {
      const failing = (error, extra = {}) => {
        const pages = site(app.cms, { views, pages: extra }).pages
        const web = express()
        web.get('/boom', pages.route('home', () => { throw error }))
        web.use(pages.notFoundHandler())
        web.use(pages.errorHandler())
        return web
      }
      let log
      beforeEach(() => { log = console.error; console.error = () => {} })
      afterEach(() => { console.error = log })

      it('answers the error template with a 500, and not what the error says', async () => {
        const res = await request(failing(new Error('database password is hunter2'))).get('/boom')
        expect(res.status).to.equal(500)
        expect(res.text).to.include('<h1>Something went wrong</h1>')
        expect(res.text).to.include('We could not show this page')
        expect(res.text).to.not.include('hunter2')
        expect(res.headers['cache-control']).to.equal('no-store')
      })

      it('shows the message of an error that says it may be shown, with its status', async () => {
        const error = Object.assign(new Error('That page number is not valid'), { status: 400, expose: true })
        const res = await request(failing(error)).get('/boom')
        expect(res.status).to.equal(400)
        expect(res.text).to.include('<h1>Request refused</h1>')
        expect(res.text).to.include('That page number is not valid')
      })

      it('does not show the message of an error that does not say so', async () => {
        const res = await request(failing(Object.assign(new Error('internal detail'), { status: 400 }))).get('/boom')
        expect(res.status).to.equal(400)
        expect(res.text).to.not.include('internal detail')
      })

      it('answers an error of a middleware that comes before the routes, with errorHandler', async () => {
        const pages = site(app.cms, { views }).pages
        const web = express()
        web.use(() => { throw new Error('early') })
        web.use(pages.errorHandler())
        const res = await request(web).get('/')
        expect(res.status).to.equal(500)
        expect(res.text).to.include('<h1>Something went wrong</h1>')
      })

      it('lets Express answer when there is no error template', async () => {
        const pages = new CMS.PageHelper({ cms: app.cms, templates: { home: { source: 'x' } } })
        const web = express()
        web.get('/', pages.route('home', () => { throw new Error('no template for this') }))
        web.use((error, req, res, _next) => res.status(502).send(`express: ${error.message}`))
        const res = await request(web).get('/')
        expect(res.status).to.equal(502)
        expect(res.text).to.equal('express: no template for this')
      })

      it('lets Express answer when the error template fails too', async () => {
        const pages = new CMS.PageHelper({ cms: app.cms, templates: { home: { source: 'x' }, error: { source: '{{ok}}' } }, error: 'error' })
        pages.render = async () => { throw new Error('the template broke') }
        const web = express()
        web.get('/', pages.route('home', () => { throw new Error('first') }))
        web.use((error, req, res, _next) => res.status(502).send(`express: ${error.message}`))
        expect((await request(web).get('/')).text).to.equal('express: first')
      })

      it('says what a loader that returns nothing forgot', async () => {
        const pages = site(app.cms, { views }).pages
        const web = express()
        web.get('/', pages.route('home', () => undefined))
        web.use(pages.errorHandler())
        const res = await request(web).get('/')
        expect(res.status).to.equal(500)
        expect(res.text).to.include('Something went wrong')
      })
    })
  })

  describe('the kept pages (memory)', () => {
    it('does not run the loader again while nothing changed', async () => {
      await articles().create(record('hello'))
      const reads = countReads()
      try {
        const { web } = build()
        await request(web).get('/')
        const first = reads.reads
        expect(first).to.be.greaterThan(0)
        for (let i = 0; i < 3; i++) {
          await request(web).get('/')
        }
        expect(reads.reads).to.equal(first)
      } finally {
        reads.restore()
      }
    })

    it('makes the page again after a record it read was updated', async () => {
      const created = await articles().create(record('hello'))
      const { web } = build()
      expect((await request(web).get('/')).text).to.include('Title of hello')
      await articles().update(created._id, { title: { enUS: 'A new title' } })
      const res = await request(web).get('/')
      expect(res.text).to.include('A new title')
      expect(res.text).to.not.include('Title of hello')
    })

    it('makes the page again after a record was created or removed', async () => {
      const { web } = build()
      expect((await request(web).get('/')).text).to.include('No articles yet.')
      const created = await articles().create(record('first'))
      expect((await request(web).get('/')).text).to.include('Title of first')
      await articles().remove(created._id)
      expect((await request(web).get('/')).text).to.include('No articles yet.')
    })

    it('keeps the pages that did not read the resource that changed', async () => {
      await articles().create(record('hello'))
      const reads = countReads()
      try {
        const pages = new CMS.PageHelper({ cms: app.cms, templates: { t: { source: '{{x}}' } } })
        const web = express()
        let runs = 0
        web.get('/other', pages.route('t', async ({ api }) => { runs++; await api('authors').list({}); return { x: 'authors' } }))
        await request(web).get('/other')
        await articles().update((await articles().find({ slug: 'hello' }))._id, { published: false })
        await request(web).get('/other')
        expect(runs).to.equal(1)
      } finally {
        reads.restore()
      }
    })

    it('makes the pages that include a template again when that template changes, and no other', async () => {
      await articles().create(record('hello'))
      const { web } = build()
      expect((await request(web).get('/')).text).to.include('<h2>Title of hello</h2>')
      expect((await request(web).get('/articles/hello')).text).to.include('<h1>Title of hello</h1>')
      const reads = countReads()
      try {
        edit('card.html', (text) => text.replace('<h2>{{name}}</h2>', '<h3 class="new">{{name}}</h3>'))
        const home = await request(web).get('/')
        expect(home.text).to.include('<h3 class="new">Title of hello</h3>')
        const afterHome = reads.reads
        // the article page does not include the card: it is not made again
        await request(web).get('/articles/hello')
        expect(reads.reads).to.equal(afterHome)
      } finally {
        reads.restore()
      }
    })

    it('makes the page again when the template of its root changes', async () => {
      await articles().create(record('hello'))
      const { web } = build()
      await request(web).get('/articles/hello')
      edit('article.html', (text) => text.replace('<article>', '<article class="changed">'))
      expect((await request(web).get('/articles/hello')).text).to.include('<article class="changed">')
    })

    it('makes the page again when it is older than maxAge', async () => {
      await articles().create(record('hello'))
      const reads = countReads()
      try {
        const { web } = build({ pages: { maxAge: 0.05 } })
        await request(web).get('/')
        const first = reads.reads
        await request(web).get('/')
        expect(reads.reads).to.equal(first)
        await sleep(90)
        await request(web).get('/')
        expect(reads.reads).to.be.greaterThan(first)
      } finally {
        reads.restore()
      }
    })

    it('does not look at the files and the records again before `revalidate` seconds have passed', async () => {
      const created = await articles().create(record('hello'))
      const { web } = build({ pages: { revalidate: 60 } })
      await request(web).get('/')
      await articles().update(created._id, { title: { enUS: 'Changed' } })
      expect((await request(web).get('/')).text).to.include('Title of hello')
    })

    it('makes a page once when many ask for it at the same time', async () => {
      await articles().create(record('hello'))
      const pages = new CMS.PageHelper({ cms: app.cms, templates: { t: { source: '{{x}}' } } })
      const web = express()
      let runs = 0
      web.get('/', pages.route('t', async () => { runs++; await sleep(50); return { x: 'once' } }))
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => request(web).get('/')))
      expect(results.map((res) => res.text)).to.deep.equal(['once', 'once', 'once', 'once', 'once'])
      expect(runs).to.equal(1)
    })

    it('makes a page for each address, and ignores the query unless the route says it changes the page', async () => {
      for (let i = 0; i < 7; i++) {
        await articles().create(record(`a${i}`))
      }
      const { web, pages } = build()
      const first = await request(web).get('/articles?page=0')
      const second = await request(web).get('/articles?page=1')
      expect(first.text).to.not.equal(second.text)
      expect(first.text).to.include('Older →')
      expect(second.text).to.include('← Newer')
      // a query parameter the route does not know is not part of the page: one made page for ?x=1 and ?x=2
      const reads = countReads()
      try {
        await request(web).get('/articles?page=0&x=1')
        await request(web).get('/articles?page=0&x=2')
        expect(reads.reads).to.equal(0)
      } finally {
        reads.restore()
      }
      expect(await pages.store.pages.size).to.equal(2)
    })

    it('does not keep a page whose route says cache: false', async () => {
      const pages = new CMS.PageHelper({ cms: app.cms, templates: { t: { source: '{{n}}' } } })
      const web = express()
      let runs = 0
      web.get('/', pages.route('t', () => ({ n: ++runs }), { cache: false }))
      expect((await request(web).get('/')).text).to.equal('1')
      expect((await request(web).get('/')).text).to.equal('2')
    })

    it('does not keep any page with cache: false for the helper', async () => {
      const pages = new CMS.PageHelper({ cms: app.cms, templates: { t: { source: '{{n}}' } }, cache: false })
      const web = express()
      let runs = 0
      web.get('/', pages.route('t', () => ({ n: ++runs })))
      await request(web).get('/')
      expect((await request(web).get('/')).text).to.equal('2')
    })

    it('does not keep the page of a request that is not a GET or a HEAD', async () => {
      const pages = new CMS.PageHelper({ cms: app.cms, templates: { t: { source: '{{n}}' } } })
      const web = express()
      let runs = 0
      web.post('/', pages.route('t', () => ({ n: ++runs })))
      await request(web).post('/')
      expect((await request(web).post('/')).text).to.equal('2')
    })

    it('does not keep a 404, and does not keep a page for every address that is asked', async () => {
      const { web, pages } = build()
      await request(web).get('/articles/a')
      await request(web).get('/articles/b')
      expect(pages.store.pages.size).to.equal(0)
    })

    it('keeps no more pages than maxPages, the least asked for going first', async () => {
      const pages = new CMS.PageHelper({ cms: app.cms, templates: { t: { source: '{{path}}' } }, maxPages: 2 })
      const web = express()
      web.get('/:name', pages.route('t', ({ req }) => ({ path: req.path })))
      for (const name of ['a', 'b', 'a', 'c']) {
        await request(web).get(`/${name}`)
      }
      const kept = [...pages.store.pages.values()].map((page) => page.html)
      expect(kept).to.have.members(['/a', '/c'])
    })

    it('can be told a resource changed, or to forget every page', async () => {
      await articles().create(record('hello'))
      const reads = countReads()
      try {
        const { web, pages } = build()
        await request(web).get('/')
        const first = reads.reads
        pages.invalidate('articles')
        await request(web).get('/')
        expect(reads.reads).to.be.greaterThan(first)
        const second = reads.reads
        await request(web).get('/')
        expect(reads.reads).to.equal(second)
        expect(await pages.clear()).to.equal(1)
        await request(web).get('/')
        expect(reads.reads).to.be.greaterThan(second)
      } finally {
        reads.restore()
      }
    })

    it('refuses a loader that answers by itself on a page that is kept', async () => {
      const pages = new CMS.PageHelper({ cms: app.cms, templates: { t: { source: 'x' } } })
      const web = express()
      let said
      web.get('/', pages.route('t', ({ res }) => { res.send('mine'); return {} }))
      web.use((error, _req, _res, _next) => { said = error.message })
      const res = await request(web).get('/')
      expect(res.text).to.equal('mine')
      expect(said).to.include('answered the request itself')
    })

    it('lets the loader answer by itself when the page is not kept', async () => {
      const pages = new CMS.PageHelper({ cms: app.cms, templates: { t: { source: 'x' } } })
      const web = express()
      web.get('/go', pages.route('t', ({ res }) => { res.redirect('/elsewhere'); return {} }, { cache: false }))
      const res = await request(web).get('/go')
      expect(res.status).to.equal(302)
      expect(res.headers.location).to.equal('/elsewhere')
    })
  })

  describe('the kept pages (a folder)', () => {
    let cache
    beforeEach(() => { cache = path.join(folder, 'cache') })

    it('writes the page and what it was made of', async () => {
      await articles().create(record('hello'))
      await request(build({ cache }).web).get('/articles/hello')
      const files = fs.readdirSync(cache)
      const html = files.find((name) => name.endsWith('.html'))
      const meta = files.find((name) => name.endsWith('.json'))
      expect(html).to.match(/^articles_hello\.[0-9a-f]{16}\.html$/)
      expect(fs.readFileSync(path.join(cache, html), 'utf8')).to.include('Title of hello')
      const made = JSON.parse(fs.readFileSync(path.join(cache, meta), 'utf8'))
      expect(made.template).to.equal('article')
      expect(made.templates).to.have.all.keys('article', 'header', 'footer')
      expect(made.resources).to.have.property('articles')
      expect(made.generatedAt).to.be.a('number')
    })

    it('keeps no file apart from the pages: no temporary file is left', async () => {
      await articles().create(record('hello'))
      await request(build({ cache }).web).get('/articles/hello')
      expect(fs.readdirSync(cache).filter((name) => name.endsWith('.tmp'))).to.deep.equal([])
    })

    it('sends the same page after a restart without running the loader', async () => {
      await articles().create(record('hello'))
      await request(build({ cache }).web).get('/articles/hello')
      const reads = countReads()
      try {
        // a new helper on the same folder: what a restart does
        const res = await request(build({ cache }).web).get('/articles/hello')
        expect(res.text).to.include('Title of hello')
        // (the records are read once, to know their update time: not the loader of the page)
        expect(reads.reads).to.equal(1)
      } finally {
        reads.restore()
      }
    })

    it('makes the page again after a restart when a record it read was updated while the server was down', async () => {
      const created = await articles().create(record('hello'))
      await request(build({ cache }).web).get('/articles/hello')
      await sleep(5)
      await articles().update(created._id, { title: { enUS: 'Changed meanwhile' } })
      const res = await request(build({ cache }).web).get('/articles/hello')
      expect(res.text).to.include('Changed meanwhile')
    })

    it('makes the page again after a restart when a template changed while the server was down', async () => {
      await articles().create(record('hello'))
      await request(build({ cache }).web).get('/articles/hello')
      edit('article.html', (text) => text.replace('<article>', '<article class="edited">'))
      expect((await request(build({ cache }).web).get('/articles/hello')).text).to.include('<article class="edited">')
    })

    it('makes the page again when its file is damaged or gone', async () => {
      await articles().create(record('hello'))
      const { web } = build({ cache })
      await request(web).get('/articles/hello')
      for (const name of fs.readdirSync(cache)) {
        if (name.endsWith('.json')) {
          fs.writeFileSync(path.join(cache, name), '{ not json')
        }
      }
      expect((await request(web).get('/articles/hello')).text).to.include('Title of hello')
      fs.readdirSync(cache).filter((name) => name.endsWith('.html')).forEach((name) => fs.rmSync(path.join(cache, name)))
      expect((await request(web).get('/articles/hello')).text).to.include('Title of hello')
    })

    it('deletes the pages it wrote, and only those, with clear()', async () => {
      await articles().create(record('hello'))
      const { web, pages } = build({ cache })
      await request(web).get('/')
      await request(web).get('/articles/hello')
      fs.writeFileSync(path.join(cache, 'mine.txt'), 'not a page')
      expect(await pages.clear()).to.equal(2)
      expect(fs.readdirSync(cache)).to.deep.equal(['mine.txt'])
    })

    it('makes the folder', () => {
      const deep = path.join(folder, 'a', 'b', 'cache')
      build({ cache: deep })
      expect(fs.existsSync(deep)).to.equal(true)
    })

    it('does not let an address name a file outside the folder', async () => {
      const pages = new CMS.PageHelper({ cms: app.cms, templates: { t: { source: 'x' } }, cache })
      const web = express()
      web.get(/.*/, pages.route('t', () => ({})))
      await request(web).get('/..%2F..%2F..%2Fetc%2Fpasswd')
      await request(web).get('/%2e%2e/%2e%2e/x')
      expect(fs.readdirSync(cache).every((name) => /^[\w-]+\.[0-9a-f]{16}\.(html|json)$/.test(name))).to.equal(true)
      expect(fs.readdirSync(folder)).to.have.members(['views', 'cache'])
    })
  })

  describe('the response', () => {
    it('says the browser must ask again, and answers 304 when it has the page', async () => {
      await articles().create(record('hello'))
      const { web } = build()
      const first = await request(web).get('/articles/hello')
      expect(first.headers['cache-control']).to.equal('no-cache')
      expect(first.headers.etag).to.be.a('string')
      const second = await request(web).get('/articles/hello').set('If-None-Match', first.headers.etag)
      expect(second.status).to.equal(304)
    })

    it('gives another page when the content changed, with another ETag', async () => {
      const created = await articles().create(record('hello'))
      const { web } = build()
      const first = await request(web).get('/articles/hello')
      await articles().update(created._id, { title: { enUS: 'Changed' } })
      const second = await request(web).get('/articles/hello').set('If-None-Match', first.headers.etag)
      expect(second.status).to.equal(200)
      expect(second.headers.etag).to.not.equal(first.headers.etag)
    })

    it('answers HEAD like GET, without a body', async () => {
      await articles().create(record('hello'))
      const res = await request(build().web).head('/articles/hello')
      expect(res.status).to.equal(200)
      expect(res.text).to.equal(undefined)
    })

    it('takes the headers of the route over its own', async () => {
      const pages = new CMS.PageHelper({ cms: app.cms, templates: { t: { source: 'x' } } })
      const web = express()
      web.get('/', pages.route('t', { headers: { 'Cache-Control': 'public, max-age=60', 'X-Page': 'yes' } }))
      const res = await request(web).get('/')
      expect(res.headers['cache-control']).to.equal('public, max-age=60')
      expect(res.headers['x-page']).to.equal('yes')
    })

    it('serves a page without a loader: a page of text', async () => {
      const pages = new CMS.PageHelper({ cms: app.cms, templates: { about: { source: '<p>{{who}}</p>' } }, locals: { who: 'us' } })
      const web = express()
      web.get('/about', pages.route('about'))
      expect((await request(web).get('/about')).text).to.equal('<p>us</p>')
    })
  })
})
