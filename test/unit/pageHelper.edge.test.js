const fs = require('fs')
const os = require('os')
const path = require('path')
const express = require('express')
const request = require('supertest')
const { expect } = require('chai')
const CMS = require('../../')
const logger = require('../../lib/logger')

// PageHelper at its edges: a CMS that fails, a cache folder that is gone, files that come and go, and every way a kept page can be old. The CMS is a small stand-in, so that each
// failure is made on purpose.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const EVENTS = ['create', 'update', 'remove', 'createAttachment', 'updateAttachment', 'removeAttachment']

/** A CMS that is only what the helper uses: `api()(name)` with `list` and the hooks. `lists[name]` gives the records; `calls` counts the reads. */
const fakeCms = (lists = {}) => {
  const hooks = []
  const calls = { list: 0 }
  const cms = {
    hooks,
    calls,
    lists,
    api: () => (name) => ({
      options: { name },
      before: () => {},
      after: (event, fn) => hooks.push({ name, event, fn }),
      list: async () => {
        calls.list++
        const list = cms.lists[name]
        return typeof list === 'function' ? list() : (list || [])
      }
    }),
    /** What the CMS does when a record of a resource changes: its after hooks run */
    change: (name) => hooks.filter((hook) => hook.name === name).forEach((hook) => hook.fn({ next: () => {} }))
  }
  return cms
}

describe('PageHelper at its edges (unit)', () => {
  let folder
  const file = (name, text) => {
    fs.writeFileSync(path.join(folder, name), text)
    return path.join(folder, name)
  }
  const later = (name) => {
    const when = new Date(Date.now() + 5000 + Math.floor(Math.random() * 1000) * 10)
    fs.utimesSync(path.join(folder, name), when, when)
  }
  const get = async (web, url, headers = {}) => {
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
  const site = (pages, mount) => {
    const web = express()
    mount(web, pages)
    web.use(pages.notFoundHandler())
    web.use(pages.errorHandler())
    return web
  }

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-pages-edge-'))
  })
  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true })
  })

  describe('the hooks', () => {
    it('are put on a resource once, for each thing that changes a record', async () => {
      const cms = fakeCms({ articles: [{ _updatedAt: 5 }] })
      const pages = new CMS.PageHelper({ cms, templates: { t: { source: 'x' } } })
      await pages.lastUpdated('articles')
      await pages.lastUpdated('articles')
      expect(cms.hooks.map((hook) => hook.event)).to.have.members(EVENTS)
      expect(cms.hooks.every((hook) => hook.name === 'articles')).to.equal(true)
      expect(cms.calls.list).to.equal(1)
    })

    it('make the pages that read the resource old when a record changes, and let the others be', async () => {
      const cms = fakeCms({ articles: [{ _updatedAt: 5 }], authors: [{ _updatedAt: 5 }] })
      const pages = new CMS.PageHelper({ cms, templates: { t: { source: '{{n}}' } } })
      const web = express()
      const runs = { a: 0, b: 0 }
      web.get('/a', pages.route('t', async ({ api }) => { await api('articles').list(); return { n: ++runs.a } }))
      web.get('/b', pages.route('t', async ({ api }) => { await api('authors').list(); return { n: ++runs.b } }))
      await get(web, '/a')
      await get(web, '/b')
      cms.change('articles')
      expect((await get(web, '/a')).text).to.equal('2')
      expect((await get(web, '/b')).text).to.equal('1')
    })

    it('go on counting when two changes come in the same millisecond', async () => {
      const cms = fakeCms({ articles: [] })
      const pages = new CMS.PageHelper({ cms, templates: { t: { source: 'x' } } })
      await pages.lastUpdated('articles')
      pages.touch('articles')
      const first = await pages.lastUpdated('articles')
      pages.touch('articles')
      const second = await pages.lastUpdated('articles')
      expect(second).to.be.greaterThan(first)
    })

    it('start from the latest update of the records, the creation date when a record was never updated', async () => {
      const cms = fakeCms({ articles: [{ _createdAt: 10 }, { _updatedAt: 40, _createdAt: 5 }, {}] })
      const pages = new CMS.PageHelper({ cms, templates: { t: { source: 'x' } } })
      expect(await pages.lastUpdated('articles')).to.equal(40)
    })
  })

  describe('the api of a loader', () => {
    it('is the api of the CMS: what is not a method comes back as it is, and hooks can be added', async () => {
      const cms = fakeCms({ articles: [] })
      const pages = new CMS.PageHelper({ cms, templates: { t: { source: '{{name}}' } } })
      const web = express()
      web.get('/', pages.route('t', ({ api }) => {
        const articles = api('articles')
        articles.after('create', () => {})
        return { name: articles.options.name }
      }))
      expect((await get(web, '/')).text).to.equal('articles')
      expect(cms.hooks.filter((hook) => hook.event === 'create')).to.have.length.of.at.least(1)
    })

    it('notes the resource of the first read only: a page depends on each resource once', async () => {
      const cms = fakeCms({ articles: [{ _updatedAt: 7 }] })
      const pages = new CMS.PageHelper({ cms, templates: { t: { source: 'x' } } })
      const web = express()
      web.get('/', pages.route('t', async ({ api }) => { await api('articles').list(); await api('articles').list(); return {} }))
      const cache = new Map()
      pages.store.set = async (key, url, html, meta) => cache.set(key, meta)
      await get(web, '/')
      expect([...cache.values()][0].resources).to.deep.equal({ articles: 7 })
    })
  })

  describe('a CMS that cannot be read', () => {
    it('gives the error to the error handler, and reads again at the next request', async () => {
      let broken = true
      const cms = fakeCms({ articles: () => { if (broken) { throw new Error('the store is locked') } return [{ _updatedAt: 1 }] } })
      const pages = new CMS.PageHelper({ cms, templates: { t: { source: 'ok' }, e: { source: 'error page' } }, error: 'e' })
      const web = site(pages, (app, helper) => app.get('/', helper.route('t', async ({ api }) => { await api('articles').list(); return {} })))
      const log = logger.error
      logger.error = () => {}
      try {
        expect((await get(web, '/')).status).to.equal(500)
        broken = false
        const res = await get(web, '/')
        expect(res.status).to.equal(200)
        expect(res.text).to.equal('ok')
      } finally {
        logger.error = log
      }
    })

    it('makes a kept page again when a resource it read cannot be read any more, and says why if that fails too', async () => {
      const cms = fakeCms({ articles: [{ _updatedAt: 1 }] })
      const pages = new CMS.PageHelper({ cms, templates: { t: { source: '{{n}}' }, e: { source: 'error page' } }, error: 'e' })
      let runs = 0
      const web = site(pages, (app, helper) => app.get('/', helper.route('t', async ({ api }) => { await api('articles').list(); return { n: ++runs } })))
      expect((await get(web, '/')).text).to.equal('1')
      // the resource is gone, and what is known of it is forgotten: it is read again, and fails
      cms.lists.articles = () => { throw new Error('gone') }
      pages.resources.clear()
      const log = logger.error
      logger.error = () => {}
      try {
        expect((await get(web, '/')).status).to.equal(500)
      } finally {
        logger.error = log
      }
      expect(runs).to.equal(1)
    })
  })

  describe('a kept page that is old, however it got old', () => {
    const disk = (extra = {}) => {
      const cache = path.join(folder, 'cache')
      const template = file('t.html', '{{n}}')
      const cms = fakeCms({ articles: [{ _updatedAt: 1 }] })
      const pages = new CMS.PageHelper({ cms, cache, templates: { t: template }, ...extra })
      let runs = 0
      const web = express()
      web.get('/', pages.route('t', async ({ api }) => { await api('articles').list(); return { n: ++runs } }))
      const meta = () => {
        const name = fs.readdirSync(cache).find((item) => item.endsWith('.json'))
        return { name: path.join(cache, name), data: JSON.parse(fs.readFileSync(path.join(cache, name), 'utf8')) }
      }
      const edit = (change) => {
        const { name, data } = meta()
        fs.writeFileSync(name, JSON.stringify(change(data)))
      }
      return { cms, pages, web, cache, edit, runs: () => runs }
    }

    it('is made again when the cache was written by another version', async () => {
      const { web, edit, runs } = disk()
      await get(web, '/')
      edit((meta) => ({ ...meta, version: 0 }))
      expect((await get(web, '/')).text).to.equal('2')
      expect(runs()).to.equal(2)
    })

    it('is made again when the key does not match the page (a file that is another page)', async () => {
      const { web, edit } = disk()
      await get(web, '/')
      edit((meta) => ({ ...meta, key: 'another page' }))
      expect((await get(web, '/')).text).to.equal('2')
    })

    it('is made again when the file of what it was made of is not valid', async () => {
      const { web, edit } = disk()
      await get(web, '/')
      const { name } = edit((meta) => meta) || {}
      for (const item of fs.readdirSync(path.join(folder, 'cache'))) {
        if (item.endsWith('.json')) {
          fs.writeFileSync(path.join(folder, 'cache', item), 'null')
        }
      }
      expect((await get(web, '/')).text).to.equal('2')
      expect(name).to.equal(undefined)
    })

    it('is made again when what it was made of is not complete: no list of templates, or none of resources', async () => {
      const { web, edit } = disk()
      await get(web, '/')
      edit((meta) => { const { templates: _templates, ...rest } = meta; return rest })
      expect((await get(web, '/')).text).to.equal('2')
      edit((meta) => { const { resources: _resources, ...rest } = meta; return rest })
      expect((await get(web, '/')).text).to.equal('3')
    })

    it('is made again when it names a template that is not in the list any more', async () => {
      const { web, edit } = disk()
      await get(web, '/')
      edit((meta) => ({ ...meta, templates: { ...meta.templates, gone: 1 } }))
      expect((await get(web, '/')).text).to.equal('2')
    })

    it('is made again when a template has another date in either direction', async () => {
      const { web } = disk()
      await get(web, '/')
      const target = path.join(folder, 't.html')
      const earlier = new Date(Date.now() - 100000)
      fs.utimesSync(target, earlier, earlier)
      expect((await get(web, '/')).text).to.equal('2')
    })

    it('is made again when a resource it read is not known by the page that was kept (a later date than the one it recorded)', async () => {
      const { web, cms, pages } = disk()
      await get(web, '/')
      cms.lists.articles = [{ _updatedAt: 99999999999999 }]
      pages.resources.clear()
      expect((await get(web, '/')).text).to.equal('2')
    })

    it('is kept for the age the route says, over the one of the helper', async () => {
      const { web } = disk({ maxAge: 3600 })
      const cms = fakeCms({})
      const pages = new CMS.PageHelper({ cms, templates: { t: { source: '{{n}}' } } })
      let runs = 0
      const own = express()
      own.get('/', pages.route('t', () => ({ n: ++runs }), { maxAge: 0.05 }))
      expect((await get(own, '/')).text).to.equal('1')
      expect((await get(own, '/')).text).to.equal('1')
      await sleep(90)
      expect((await get(own, '/')).text).to.equal('2')
      expect(web).to.be.a('function')
    })

    it('is not older for ever when the age is 0: it has no limit', async () => {
      const cms = fakeCms({})
      const pages = new CMS.PageHelper({ cms, templates: { t: { source: '{{n}}' } }, maxAge: 0 })
      let runs = 0
      const web = express()
      web.get('/', pages.route('t', () => ({ n: ++runs })))
      await get(web, '/')
      pages.store.pages.forEach((page) => { page.meta.generatedAt = 1 })
      expect((await get(web, '/')).text).to.equal('1')
    })

    it('is looked at again only after revalidate seconds, then for what changed', async () => {
      const cms = fakeCms({ articles: [{ _updatedAt: 1 }] })
      const target = file('t.html', 'old {{n}}')
      const pages = new CMS.PageHelper({ cms, templates: { t: target }, revalidate: 0.2 })
      let runs = 0
      const web = express()
      web.get('/', pages.route('t', () => ({ n: ++runs })))
      expect((await get(web, '/')).text).to.equal('old 1')
      file('t.html', 'new {{n}}')
      later('t.html')
      // (inside the window nobody looks at the file)
      expect((await get(web, '/')).text).to.equal('old 1')
      await sleep(260)
      expect((await get(web, '/')).text).to.equal('new 2')
    })

    it('is told apart by the query parameters of the route, in whatever order they come', async () => {
      const cms = fakeCms({})
      const pages = new CMS.PageHelper({ cms, templates: { t: { source: '{{n}}' } } })
      let runs = 0
      const web = express()
      web.get('/', pages.route('t', () => ({ n: ++runs }), { vary: ['b', 'a'] }))
      await get(web, '/?a=1&b=2')
      await get(web, '/?b=2&a=1')
      expect(runs).to.equal(1)
      await get(web, '/?a=1&b=3')
      expect(runs).to.equal(2)
      await get(web, '/?a=1')
      expect(runs).to.equal(3)
      // (and a parameter that is not named is not part of the page)
      await get(web, '/?a=1&utm=x')
      expect(runs).to.equal(3)
    })

    it('is sent again to a HEAD request, which does not run the loader', async () => {
      const cms = fakeCms({})
      const pages = new CMS.PageHelper({ cms, templates: { t: { source: '{{n}}' } } })
      let runs = 0
      const web = express()
      web.get('/', pages.route('t', () => ({ n: ++runs })))
      await get(web, '/')
      const res = await request(web).head('/')
      expect(res.status).to.equal(200)
      expect(runs).to.equal(1)
    })
  })

  describe('the cache folder', () => {
    it('is not needed to answer: a page is served when the folder is gone, and the log says it could not be written', async () => {
      const cache = path.join(folder, 'cache')
      const pages = new CMS.PageHelper({ cms: fakeCms({}), cache, templates: { t: { source: 'served' } } })
      fs.rmSync(cache, { recursive: true, force: true })
      const web = express()
      web.get('/', pages.route('t'))
      const warnings = []
      const warn = logger.warn
      logger.warn = (message) => warnings.push(message)
      try {
        const res = await get(web, '/')
        expect(res.status).to.equal(200)
        expect(res.text).to.equal('served')
      } finally {
        logger.warn = warn
      }
      expect(warnings.join('\n')).to.include('The page cache could not be written')
    })

    it('is the memory of the process when it is given as an empty text', () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), cache: '', templates: { t: { source: 'x' } } })
      expect(pages.store.pages).to.be.instanceOf(Map)
    })

    it('has nothing to clear when there is no cache', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), cache: false, templates: { t: { source: 'x' } } })
      expect(await pages.clear()).to.equal(0)
    })

    it('clears the pages in memory and says how many', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { t: { source: '{{p}}' } } })
      const web = express()
      web.get('/:p', pages.route('t', ({ params }) => ({ p: params.p })))
      await get(web, '/a')
      await get(web, '/b')
      expect(await pages.clear()).to.equal(2)
      expect(await pages.clear()).to.equal(0)
    })
  })

  describe('the templates', () => {
    it('are used once for a partial that is included twice, and a partial that includes itself ends', async () => {
      const pages = new CMS.PageHelper({
        cms: fakeCms({}),
        cache: path.join(folder, 'cache'),
        templates: { page: { source: '{{> row}}{{> row}}{{> tree}}' }, row: { source: '[{{n}}]' }, tree: { source: '{{#children}}({{> tree}}){{/children}}' } }
      })
      const web = express()
      // (a leaf has an empty list of its own: a key a context lacks is looked up in the one around it, which is how Mustache works)
      web.get('/', pages.route('page', () => ({ n: 1, children: [{ children: [{ children: [] }] }, { children: [] }] })))
      expect((await get(web, '/')).text).to.equal('[1][1](())()')
      const meta = JSON.parse(fs.readFileSync(path.join(folder, 'cache', fs.readdirSync(path.join(folder, 'cache')).find((name) => name.endsWith('.json'))), 'utf8'))
      expect(Object.keys(meta.templates).sort()).to.deep.equal(['page', 'row', 'tree'])
    })

    it('escape what is printed, and only what starts markup: an address stays readable', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { t: { source: '{{x}}' } } })
      expect(await pages.render('t', { x: '<a href="/p?x=1&y=2">it\'s `x`</a>' })).to.equal('&lt;a href=&quot;/p?x=1&amp;y=2&quot;&gt;it&#39;s &#96;x&#96;&lt;/a&gt;')
      expect(await pages.render('t', { x: '/articles/hello' })).to.equal('/articles/hello')
      expect(await pages.render('t', { x: 5 })).to.equal('5')
    })

    it('tell when the file of a template is gone once, and use it again when it comes back', async () => {
      const target = file('t.html', 'first')
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { t: target } })
      const warnings = []
      const warn = logger.warn
      logger.warn = (message) => warnings.push(message)
      try {
        fs.rmSync(target)
        expect(await pages.render('t')).to.equal('first')
        expect(await pages.render('t')).to.equal('first')
        expect(warnings.filter((message) => message.includes('cannot be read now'))).to.have.length(1)
        file('t.html', 'second')
        later('t.html')
        expect(await pages.render('t')).to.equal('second')
        fs.rmSync(target)
        await pages.render('t')
        expect(warnings.filter((message) => message.includes('cannot be read now'))).to.have.length(2)
      } finally {
        logger.warn = warn
      }
    })

    it('keep the last text when the changed file includes a partial that is not there', async () => {
      const target = file('t.html', 'good')
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { t: target } })
      file('t.html', '{{> nowhere}}')
      later('t.html')
      let message
      await pages.render('t').catch((error) => { message = error.message })
      expect(message).to.include('Template "t" includes "nowhere", which is not in templates')
      // (until it is mended, every request says so: the file is looked at again)
      let again
      await pages.render('t').catch((error) => { again = error.message })
      expect(again).to.equal(message)
      file('t.html', 'mended')
      later('t.html')
      expect(await pages.render('t')).to.equal('mended')
    })

    it('are looked up by their own name, not by what a path says', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { 'partials/card': { source: 'card' }, page: { source: '{{> partials/card}}!' } } })
      expect(await pages.render('page')).to.equal('card!')
      expect(pages.names().sort()).to.deep.equal(['page', 'partials/card'])
    })
  })

  describe('what a loader gives', () => {
    it('is refused when it is not an object, saying what it was', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { t: { source: 'x' } } })
      const web = express()
      web.get('/text', pages.route('t', () => 'a text'))
      web.get('/none', pages.route('t', () => undefined))
      web.get('/list', pages.route('t', () => [1, 2]))
      const failures = []
      web.use((error, req, res, _next) => { failures.push(error.message); res.status(500).end() })
      const log = logger.error
      logger.error = () => {}
      try {
        await get(web, '/text')
        await get(web, '/none')
        await get(web, '/list')
      } finally {
        logger.error = log
      }
      expect(failures[0]).to.include('gave something that is not an object')
      expect(failures[1]).to.include('gave nothing')
      expect(failures[2]).to.include('gave something that is not an object')
    })

    it('can answer by itself, when the page is not kept: the helper does nothing more', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { t: { source: 'never' } } })
      const web = express()
      web.get('/', pages.route('t', ({ res }) => { res.status(201).send('mine') }, { cache: false }))
      const res = await get(web, '/')
      expect(res.status).to.equal(201)
      expect(res.text).to.equal('mine')
    })

    it('can be a promise that is rejected with the status of the error', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { t: { source: 'x' }, e: { source: '{{status}}|{{title}}|{{message}}' } }, error: 'e' })
      const web = site(pages, (app, helper) => {
        app.get('/exposed', helper.route('t', async () => { throw Object.assign(new Error('That is not allowed'), { statusCode: 403, expose: true }) }))
        app.get('/hidden', helper.route('t', async () => { throw Object.assign(new Error('internal'), { status: 400 }) }))
        app.get('/odd', helper.route('t', async () => { throw Object.assign(new Error('weird'), { status: 99 }) }))
      })
      const log = logger.error
      logger.error = () => {}
      try {
        const exposed = await get(web, '/exposed')
        expect(exposed.status).to.equal(403)
        expect(exposed.text).to.equal('403|Request refused|That is not allowed')
        const hidden = await get(web, '/hidden')
        expect(hidden.status).to.equal(400)
        expect(hidden.text).to.equal('400|Request refused|')
        const odd = await get(web, '/odd')
        expect(odd.status).to.equal(500)
        expect(odd.text).to.equal('500|Something went wrong|')
      } finally {
        logger.error = log
      }
    })

    it('goes to Express when the answer was begun and then failed', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { t: { source: 'x' }, e: { source: 'error page' } }, error: 'e' })
      const web = express()
      let said
      web.get('/', pages.route('t', ({ res }) => { res.write('begun'); throw new Error('midway') }, { cache: false }))
      web.use((error, req, res, _next) => { said = error.message; res.end() })
      const log = logger.error
      logger.error = () => {}
      try {
        const res = await get(web, '/')
        expect(res.text).to.equal('begun')
      } finally {
        logger.error = log
      }
      expect(said).to.equal('midway')
    })
  })

  describe('404 and error pages', () => {
    const silent = async (work) => {
      const log = logger.error
      logger.error = () => {}
      try {
        return await work()
      } finally {
        logger.error = log
      }
    }

    it('give the error to Express when the 404 template itself fails', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { t: { source: 'x' }, nf: { source: '404' }, e: { source: 'error page' } }, notFound: 'nf', error: 'e' })
      const render = pages.render.bind(pages)
      pages.render = async (name, data) => { if (name === 'nf') { throw new Error('the 404 template broke') } return render(name, data) }
      const web = express()
      web.use(pages.notFoundHandler())
      web.use(pages.errorHandler())
      const res = await silent(() => get(web, '/anything'))
      // (it is the error template that answers the error of the 404 one)
      expect(res.status).to.equal(500)
      expect(res.text).to.equal('error page')
    })

    it('are sent with the right cache headers, whichever way they are reached', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { t: { source: 'x' }, nf: { source: '404' }, e: { source: 'error' } }, notFound: 'nf', error: 'e' })
      const web = site(pages, (app, helper) => {
        app.get('/route404', helper.route('t', ({ notFound }) => notFound()))
        app.get('/boom', helper.route('t', () => { throw new Error('boom') }))
      })
      await silent(async () => {
        expect((await get(web, '/route404')).headers['cache-control']).to.equal('no-cache')
        expect((await get(web, '/nowhere')).headers['cache-control']).to.equal('no-store')
        expect((await get(web, '/boom')).headers['cache-control']).to.equal('no-store')
      })
    })

    it('are never kept: asking for the same address twice runs the loader twice', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { t: { source: 'x' }, nf: { source: '404' } }, notFound: 'nf' })
      let runs = 0
      const web = express()
      web.get('/', pages.route('t', ({ notFound }) => { runs++; return notFound() }))
      await get(web, '/')
      await get(web, '/')
      expect(runs).to.equal(2)
    })

    it('are told the address that was asked for', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { nf: { source: '{{url}}' } }, notFound: 'nf' })
      const web = express()
      web.use(pages.notFoundHandler())
      expect((await get(web, '/a/b?c=d')).text).to.equal('/a/b')
    })

    it('are sent for a request that is not a GET too', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { nf: { source: 'missing' } }, notFound: 'nf' })
      const web = express()
      web.use(pages.notFoundHandler())
      const res = await request(web).post('/anything')
      expect(res.status).to.equal(404)
      expect(res.text).to.equal('missing')
    })
  })

  describe('many at once', () => {
    it('make a failing page once, give each the error, and make it again at the next request', async () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { t: { source: '{{n}}' }, e: { source: 'error page' } }, error: 'e' })
      let runs = 0
      let fail = true
      const web = site(pages, (app, helper) => app.get('/', helper.route('t', async () => { runs++; await sleep(40); if (fail) { throw new Error('first') } return { n: runs } })))
      const log = logger.error
      logger.error = () => {}
      try {
        const results = await Promise.all([1, 2, 3].map(() => get(web, '/')))
        expect(results.map((res) => res.status)).to.deep.equal([500, 500, 500])
        expect(runs).to.equal(1)
        fail = false
        expect((await get(web, '/')).text).to.equal('2')
      } finally {
        logger.error = log
      }
    })
  })

  describe('the start', () => {
    it('keeps what the options say: locals, ages and the names of the pages of a status', () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { a: { source: 'x' }, b: { source: 'y' } }, locals: { site: 'S' }, maxAge: 10, revalidate: 2, notFound: 'a', error: 'b' })
      expect(pages).to.include({ maxAge: 10, revalidate: 2, notFoundTemplate: 'a', errorTemplate: 'b' })
      expect(pages.locals).to.deep.equal({ site: 'S' })
    })

    it('has an hour of age, no waiting between checks and the memory by default', () => {
      const pages = new CMS.PageHelper({ cms: fakeCms({}), templates: { a: { source: 'x' } } })
      expect(pages).to.include({ maxAge: 3600, revalidate: 0 })
      expect(pages.locals).to.deep.equal({})
      expect(pages.store.max).to.equal(500)
    })

    it('refuses a template that is neither a path nor a source, whatever else it holds', () => {
      expect(() => new CMS.PageHelper({ cms: fakeCms({}), templates: { a: { source: 5 } } })).to.throw('give the path of its file, or { source }')
      expect(() => new CMS.PageHelper({ cms: fakeCms({}), templates: { a: null } })).to.throw('give the path of its file, or { source }')
    })

    it('refuses an empty template list and a cms that is not one', () => {
      expect(() => new CMS.PageHelper({ cms: {}, templates: { a: { source: 'x' } } })).to.throw('needs the cms')
      expect(() => new CMS.PageHelper()).to.throw('needs the cms')
      expect(() => new CMS.PageHelper({ cms: fakeCms({}), templates: [] })).to.throw('needs its templates')
    })
  })
})
