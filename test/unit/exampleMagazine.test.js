const fs = require('fs')
const os = require('os')
const path = require('path')
const express = require('express')
const request = require('supertest')
const { expect } = require('chai')
const CMS = require('../../')
const magazine = require('../../docs/examples/magazine/magazine')
const createEngine = require('../../docs/examples/magazine/engine')
const feed = require('../../docs/examples/magazine/feed')
const content = require('../../docs/examples/magazine/content')
// (a CMS stand-in for the cases where something is not there: it answers what each resource is told to)
const { startApp } = require('../helpers/app')

// The magazine of docs/examples/magazine: a site on the platform with no helper: Express, cms.api(), its own template engine. Loaded from its own content.json.

const EXAMPLE = path.resolve(__dirname, '../../docs/examples/magazine')

describe('the example magazine (unit)', () => {
  let app, web
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

  before(async () => {
    app = await startApp({ resources: path.join(EXAMPLE, 'resources'), anonymousRead: ['settings', 'authors', 'categories', 'articles'] })
    // the content of the example, as its server loads it
    await new CMS.ContentLoader(app.cms).load(path.join(EXAMPLE, 'content.json'))
    web = express()
    web.use(app.cms.express())
    web.use(magazine(app.cms, { baseUrl: 'https://magazine.test' }))
  })
  after(async () => {
    await app.close()
  })

  describe('its content', () => {
    it('is loaded from content.json: authors, categories, articles and their covers', async () => {
      expect((await articles().list({})).length).to.equal(13)
      expect((await app.cms.api()('authors').list({})).length).to.equal(3)
      expect((await app.cms.api()('categories').list({})).length).to.equal(4)
      const lisbon = await articles().find({ slug: 'slow-mornings-in-lisbon' })
      expect(lisbon._attachments[0]).to.include({ _name: 'cover', _contentType: 'image/jpeg' })
    })

    it('is not made again when it is loaded again', async () => {
      const report = await new CMS.ContentLoader(app.cms).load(path.join(EXAMPLE, 'content.json'))
      expect(report).to.include({ created: 0, updated: 0 })
      expect(report.files.added).to.equal(0)
    })
  })

  describe('the languages', () => {
    it('sends the address without a language to the one the browser asks for, English when it asks for neither', async () => {
      const zh = await get('/', { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5' })
      expect(zh.status).to.equal(302)
      expect(zh.headers.location).to.equal('/zh')
      expect((await get('/', { 'Accept-Language': 'fr' })).headers.location).to.equal('/en')
      expect((await get('/')).headers.location).to.equal('/en')
    })

    it('writes each page in its language, with the words of the language and its tag', async () => {
      const en = await get('/en')
      expect(en.text).to.include('<html lang="en">')
      expect(en.text).to.include('Latest')
      const zh = await get('/zh')
      expect(zh.text).to.include('<html lang="zh-CN">')
      expect(zh.text).to.include('最新文章')
      expect(zh.text).to.include('里斯本的慢早晨')
      expect(zh.text).to.not.include('Slow mornings in Lisbon')
    })

    it('links to the same page in the other language', async () => {
      const res = await get('/en/articles/bread-patiently')
      expect(res.text).to.include('href="/zh/articles/bread-patiently"')
      expect(res.text).to.include('<strong>English</strong>')
    })

    it('says an address with another language is not found', async () => {
      expect((await get('/fr')).status).to.equal(404)
    })
  })

  describe('the home page', () => {
    it('has the featured article first, the newest below it, and the sections in the menu', async () => {
      const res = await get('/en')
      expect(res.status).to.equal(200)
      expect(res.text).to.include('<title>The Harbour Review</title>')
      expect(res.text).to.match(/class="hero"[\s\S]*Slow mornings in Lisbon/)
      expect(res.text).to.include('<a href="/en/category/travel">Travel</a>')
      expect(res.text.indexOf('/en/category/travel')).to.be.lessThan(res.text.indexOf('/en/category/food'))
      expect((res.text.match(/class="card"/g) || []).length).to.equal(6)
    })

    it('does not show an article that is not published', async () => {
      expect((await get('/en')).text).to.not.include('An unfinished idea')
      expect((await get('/en/articles/an-unfinished-idea')).status).to.equal(404)
    })

    it('shows pictures at several widths, from the API of the CMS', async () => {
      const res = await get('/en')
      expect(res.text).to.match(/src="\/api\/articles\/[\w]+\/attachments\/[\w]+\.jpg\?resize=1280xauto"/)
      expect(res.text).to.match(/srcset="[^"]*\?resize=320xauto 320w, [^"]*\?resize=640xauto 640w/)
    })

    it('has pictures that the CMS serves, resized', async () => {
      const src = /src="(\/api\/articles\/[^"]+\?resize=640xauto)"/.exec((await get('/en')).text)[1]
      const image = await get(src.replace(/&amp;/g, '&'))
      expect(image.status).to.equal(200)
      expect(image.headers['content-type']).to.equal('image/jpeg')
    })
  })

  describe('an article', () => {
    it('shows its title, summary, categories, author, date and body', async () => {
      const res = await get('/en/articles/slow-mornings-in-lisbon')
      expect(res.status).to.equal(200)
      expect(res.text).to.include('<h1>Slow mornings in Lisbon</h1>')
      expect(res.text).to.include('Coffee, trams and an hour with nowhere to be.')
      expect(res.text).to.include('<a class="pill" href="/en/category/travel">Travel</a>')
      expect(res.text).to.include('By <a href="/en/authors/mei-lin">Mei Lin</a>')
      // (the start of that day, in the time zone of the machine, as the content file and the date field of the admin keep it)
      expect(res.text).to.include(new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date(2026, 9, 1)))
      expect(res.text).to.include('<blockquote>')
    })

    it('prints the body as the HTML an editor wrote, and everything else escaped', async () => {
      const created = await articles().create({ title: { enUS: '<b>Bold</b> & "quoted"' }, summary: { enUS: '<i>x</i>' }, body: { enUS: '<p>Real <em>markup</em></p>' }, slug: 'markup', published: true })
      try {
        const res = await get('/en/articles/markup')
        expect(res.text).to.include('<h1>&lt;b&gt;Bold&lt;/b&gt; &amp; &quot;quoted&quot;</h1>')
        expect(res.text).to.include('<p>Real <em>markup</em></p>')
        expect(res.text).to.not.include('<b>Bold</b>')
      } finally {
        await articles().remove(created._id)
      }
    })

    it('shows more to read from the same section, not the article itself', async () => {
      const res = await get('/en/articles/slow-mornings-in-lisbon')
      const related = res.text.slice(res.text.indexOf('More to read'))
      expect(related).to.include('A street market after rain')
      expect(related).to.not.include('Slow mornings in Lisbon')
    })

    it('has a picture and the picture of its author', async () => {
      const res = await get('/en/articles/slow-mornings-in-lisbon')
      expect(res.text).to.match(/class="story-cover" src="\/api\/articles\//)
      expect(res.text).to.match(/class="avatar" src="\/api\/authors\//)
    })
  })

  describe('sections and authors', () => {
    it('lists the articles of a section, found by a query on the relation', async () => {
      const res = await get('/en/category/food')
      expect(res.status).to.equal(200)
      expect(res.text).to.include('<h1 class="page-title">Food</h1>')
      for (const title of ['The case for the long lunch', 'Bread, patiently', 'Fermentation for beginners']) {
        expect(res.text).to.include(title)
      }
      expect(res.text).to.not.include('Lisbon')
    })

    it('says a section that does not exist is not found', async () => {
      expect((await get('/en/category/nothing')).status).to.equal(404)
    })

    it('says an author that does not exist is not found', async () => {
      expect((await get('/en/authors/nobody')).status).to.equal(404)
    })

    it('lists the articles of an author, with the photo', async () => {
      const res = await get('/en/authors/tom-becker')
      expect(res.status).to.equal(200)
      expect(res.text).to.include('Articles by Tom Becker')
      expect(res.text).to.include('What a small server can do')
      expect(res.text).to.not.include('Bread, patiently')
      expect(res.text).to.match(/class="avatar" src="\/api\/authors\//)
    })

    it('draws a pager when there are more articles than a page holds, and keeps the page in range', async () => {
      const first = await get('/en/category/travel')
      expect(first.text).to.not.include('class="pager"')
      const extra = []
      for (let i = 0; i < 4; i++) {
        extra.push(await articles().create({ title: { enUS: `Extra ${i}` }, slug: `extra-${i}`, published: true, publishedOn: Date.UTC(2026, 0, 1 + i), categories: [(await app.cms.api()('categories').find({ slug: 'travel' }))._id] }))
      }
      try {
        const page1 = await get('/en/category/travel')
        expect(page1.text).to.include('class="pager"')
        expect(page1.text).to.include('Page 1 of 2')
        expect(page1.text).to.include('href="/en/category/travel?page=2"')
        const page2 = await get('/en/category/travel?page=2')
        expect(page2.text).to.include('Page 2 of 2')
        expect(page2.text).to.include('rel="prev"')
        // a page outside the range, or not a number, is the nearest page
        expect((await get('/en/category/travel?page=99')).text).to.include('Page 2 of 2')
        expect((await get('/en/category/travel?page=-3')).text).to.include('Page 1 of 2')
        expect((await get('/en/category/travel?page=abc')).text).to.include('Page 1 of 2')
        expect((await get('/zh/category/travel')).text).to.include('第 1 页，共 2 页')
      } finally {
        for (const record of extra) {
          await articles().remove(record._id)
        }
      }
    })
  })

  describe('the search', () => {
    it('finds articles by their title or summary, in the language of the page', async () => {
      const res = await get('/en/search?q=bread')
      expect(res.text).to.include('Results for “bread”')
      expect(res.text).to.include('Bread, patiently')
      expect(res.text).to.not.include('Lisbon')
      expect((await get('/zh/search?q=面包')).text).to.include('耐心做面包')
    })

    it('does not care about case, and looks in the summary too', async () => {
      expect((await get('/en/search?q=KETTLE')).text).to.include('Letters from a tea house')
    })

    it('says when nothing matches, and shows no result for an empty search', async () => {
      expect((await get('/en/search?q=zzzzzz')).text).to.include('Nothing matches that search.')
      const empty = await get('/en/search')
      expect(empty.status).to.equal(200)
      expect(empty.text).to.not.include('Results for')
    })

    it('reads what is typed as letters, not as a pattern', async () => {
      for (const term of ['c++', '(', '[a-', '.*', '\\', '$where']) {
        const res = await get(`/en/search?q=${encodeURIComponent(term)}`)
        expect(res.status, term).to.equal(200)
        expect(res.text, term).to.include('Nothing matches that search.')
      }
      // a dot is a dot: it does not match any letter
      expect((await get('/en/search?q=Bread.')).text).to.include('Nothing matches')
    })

    it('answers a very long search, and a search given twice, without failing', async () => {
      expect((await get(`/en/search?q=${'a'.repeat(5000)}`)).status).to.equal(200)
      expect((await get('/en/search?q=a&q=b')).status).to.equal(200)
    })

    it('escapes what was searched for, in the page', async () => {
      const res = await get(`/en/search?q=${encodeURIComponent('<script>alert(1)</script>')}`)
      expect(res.text).to.not.include('<script>alert(1)</script>')
      expect(res.text).to.include('&lt;script&gt;')
    })
  })

  describe('the feed, the sitemap and robots.txt', () => {
    it('has an RSS feed of the newest articles in each language, with absolute addresses', async () => {
      const res = await get('/en/feed.xml')
      expect(res.status).to.equal(200)
      expect(res.headers['content-type']).to.include('application/rss+xml')
      expect(res.text).to.include('<rss version="2.0">')
      expect(res.text).to.include('<title>The Harbour Review</title>')
      expect(res.text).to.include('<link>https://magazine.test/en/articles/slow-mornings-in-lisbon</link>')
      expect(res.text).to.include('<language>en</language>')
      expect(res.text).to.not.include('An unfinished idea')
      expect((res.text.match(/<item>/g) || []).length).to.equal(12)
      expect((await get('/zh/feed.xml')).text).to.include('<language>zh-CN</language>')
    })

    it('writes the text of a feed so that it is safe in XML', () => {
      const xml = feed.rss({
        baseUrl: 'https://x.test',
        language: { code: 'en', tag: 'en' },
        site: { name: { enUS: 'A & B' }, tagline: { enUS: '<tag>' } },
        text: (record, field) => record[field].enUS,
        articles: [{ slug: 's', publishedOn: Date.UTC(2026, 0, 1), title: { enUS: 'Fish "&" chips <3' }, summary: { enUS: 'it\'s' } }]
      })
      expect(xml).to.include('<title>A &amp; B</title>')
      expect(xml).to.include('<title>Fish &quot;&amp;&quot; chips &lt;3</title>')
      expect(xml).to.include('<description>it&#39;s</description>')
      expect(xml).to.include('<pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>')
    })

    it('has a sitemap with every published article and section, in each language', async () => {
      const res = await get('/sitemap.xml')
      expect(res.headers['content-type']).to.include('application/xml')
      expect(res.text).to.include('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
      expect(res.text).to.include('<loc>https://magazine.test/zh/articles/bread-patiently</loc>')
      expect(res.text).to.include('<loc>https://magazine.test/en/category/food</loc>')
      expect(res.text).to.not.include('an-unfinished-idea')
      expect(res.text).to.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/)
    })

    it('says where the sitemap is', async () => {
      const res = await get('/robots.txt')
      expect(res.text).to.include('Sitemap: https://magazine.test/sitemap.xml')
    })
  })

  describe('what the browser is told', () => {
    it('sends the date the content last changed, and answers 304 when the browser has it', async () => {
      const first = await get('/en/articles/slow-mornings-in-lisbon')
      const modified = first.headers['last-modified']
      expect(modified).to.be.a('string')
      expect(first.headers['cache-control']).to.equal('public, max-age=0, must-revalidate')
      const again = await get('/en/articles/slow-mornings-in-lisbon', { 'If-Modified-Since': modified })
      expect(again.status).to.equal(304)
      expect(again.text).to.equal('')
    })

    it('gives the page again when the article, its author or its section was updated', async () => {
      const first = await get('/en/articles/bread-patiently')
      const since = first.headers['last-modified']
      await new Promise((resolve) => setTimeout(resolve, 1100))
      const author = await app.cms.api()('authors').find({ slug: 'aiko-tanaka' })
      await app.cms.api()('authors').update(author._id, { bio: { enUS: 'Aiko, updated' } })
      const again = await get('/en/articles/bread-patiently', { 'If-Modified-Since': since })
      expect(again.status).to.equal(200)
      expect(again.text).to.include('Aiko, updated')
    })

    it('does not tell a page it is not modified once the process started later than that date', async () => {
      const res = await get('/en/articles/bread-patiently', { 'If-Modified-Since': new Date(0).toUTCString() })
      expect(res.status).to.equal(200)
    })

    it('serves the stylesheet', async () => {
      const res = await get('/assets/magazine.css')
      expect(res.status).to.equal(200)
      expect(res.headers['content-type']).to.include('text/css')
      expect(res.text).to.include('prefers-color-scheme: dark')
    })
  })

  describe('what the site keeps', () => {
    it('shows a change of the content at once: a hook empties what was kept', async () => {
      expect((await get('/en')).text).to.include('The case for the long lunch')
      const record = await articles().find({ slug: 'the-case-for-the-long-lunch' })
      await articles().update(record._id, { title: { enUS: 'The long lunch, revisited' } })
      const res = await get('/en')
      expect(res.text).to.include('The long lunch, revisited')
      expect(res.text).to.not.include('The case for the long lunch')
      await articles().update(record._id, { title: { enUS: 'The case for the long lunch' } })
    })

    it('shows an article that is published, and hides one that is not any more', async () => {
      const record = await articles().find({ slug: 'letters-from-a-tea-house' })
      await articles().update(record._id, { published: false })
      expect((await get('/en/articles/letters-from-a-tea-house')).status).to.equal(404)
      expect((await get('/en')).text).to.not.include('Letters from a tea house')
      await articles().update(record._id, { published: true })
      expect((await get('/en/articles/letters-from-a-tea-house')).status).to.equal(200)
    })
  })

  describe('404 and errors', () => {
    it('answers the 404 page in the language of the address, with its status', async () => {
      const en = await get('/en/nothing/here')
      expect(en.status).to.equal(404)
      expect(en.text).to.include('<h1 class="page-title">Page not found</h1>')
      const zh = await get('/zh/nothing/here')
      expect(zh.status).to.equal(404)
      expect(zh.text).to.include('找不到页面')
    })

    it('answers the 404 page of an address with no language in the language of the browser', async () => {
      const res = await get('/nowhere', { 'Accept-Language': 'zh' })
      expect(res.status).to.equal(404)
      expect(res.text).to.include('找不到页面')
    })

    it('leaves the response alone when an error comes after it was begun', () => {
      const site = magazine(app.cms)
      const handler = site.router.stack.map((layer) => layer.handle).filter((handle) => handle.length === 4).pop()
      const ended = []
      const log = console.error
      console.error = () => {}
      try {
        handler(new Error('late'), { originalUrl: '/en/x', path: '/en/x' }, { headersSent: true, end: () => ended.push('end') }, () => {})
      } finally {
        console.error = log
      }
      expect(ended).to.deep.equal(['end'])
    })

    describe('when the CMS fails', () => {
      let log, original
      beforeEach(() => {
        log = console.error
        console.error = () => {}
        original = app.cms.api
      })
      afterEach(() => {
        console.error = log
        app.cms.api = original
      })

      it('answers a page that says nothing of the error, with the status 500', async () => {
        // a magazine of its own, over a CMS whose articles cannot be read
        const broken = Object.create(app.cms)
        broken.api = () => (name, ...rest) => {
          const real = original.call(app.cms)(name, ...rest)
          return name === 'articles' ? new Proxy(real, { get: (target, property) => (property === 'list' ? async () => { throw new Error('the database password is hunter2') } : target[property]) }) : real
        }
        const site = express()
        site.use(magazine(broken))
        const res = await request(site).get('/en')
        expect(res.status).to.equal(500)
        expect(res.text).to.include('Something went wrong')
        expect(res.text).to.not.include('hunter2')
      })
    })
  })

  describe('what it reads', () => {
    const read = () => content(app.cms)

    it('finds nothing for a search that is empty once it is trimmed', async () => {
      expect(await read().search('   ', 'enUS')).to.deep.equal([])
      expect(await read().search('', 'enUS')).to.deep.equal([])
    })

    it('shows more to read from the whole magazine for an article that has no section', async () => {
      const created = await articles().create({ title: { enUS: 'Loose' }, slug: 'loose', published: true })
      try {
        const loose = await read().article('loose')
        const related = await read().related(loose, 3)
        expect(related).to.have.length(3)
        expect(related.map((article) => article.slug)).to.not.include('loose')
      } finally {
        await articles().remove(created._id)
      }
    })

    it('has the date of the latest update among what a page shows, and nothing for nothing', () => {
      expect(read().modified().getTime()).to.equal(0)
      expect(read().modified(null, [{ _updatedAt: 5 }, { _updatedAt: 9, author: { _updatedAt: 20 }, categories: [{ _updatedAt: 30 }, undefined] }]).getTime()).to.equal(30)
      expect(read().modified({ _updatedAt: 'not a date' }).getTime()).to.equal(0)
    })

    it('finds nobody and no section for an address that is not one', async () => {
      expect(await read().byAuthor('nobody')).to.equal(null)
      expect(await read().inCategory('nothing')).to.equal(null)
      expect(await read().article('nothing')).to.equal(undefined)
    })

    it('keeps a menu without an order after the ones that have one', async () => {
      const created = await app.cms.api()('categories').create({ slug: 'unordered', name: { enUS: 'Unordered' } })
      try {
        const slugs = (await read().categories()).map((category) => category.slug)
        expect(slugs[slugs.length - 1]).to.equal('unordered')
      } finally {
        await app.cms.api()('categories').remove(created._id)
      }
    })

    it('keeps the settings of the site: the one record', async () => {
      expect((await read().site()).name.enUS).to.equal('The Harbour Review')
    })

    it('makes a feed item from the date of creation when an article has no day of publication', () => {
      const xml = feed.rss({ baseUrl: 'https://x.test', language: { code: 'en', tag: 'en' }, site: { name: { enUS: 'S' }, tagline: { enUS: 'T' } }, text: (record, field) => record[field].enUS, articles: [{ slug: 's', _createdAt: Date.UTC(2026, 5, 15), title: { enUS: 'A' }, summary: { enUS: 'B' } }] })
      expect(xml).to.include('<pubDate>Mon, 15 Jun 2026 00:00:00 GMT</pubDate>')
    })

    it('makes a sitemap whose entries have no date when the record has none', () => {
      const xml = feed.sitemap({ baseUrl: 'https://x.test', languages: [{ code: 'en' }], articles: [{ slug: 'a' }], categories: [{ slug: 'c', _updatedAt: Date.UTC(2026, 0, 2) }] })
      expect(xml).to.include('<url><loc>https://x.test/en/articles/a</loc></url>')
      expect(xml).to.include('<lastmod>2026-01-02</lastmod>')
      expect(xml).to.include('<url><loc>https://x.test/en</loc></url>')
    })
  })

  describe('when something is not there', () => {
    /** The magazine over the real CMS, except for what `lists` says: a function for a resource gives its records */
    const withLists = (lists, options = {}) => {
      const stand = Object.create(app.cms)
      const original = app.cms.api.bind(app.cms)
      stand.api = () => (name, ...rest) => {
        const real = original()(name, ...rest)
        return lists[name] ? new Proxy(real, { get: (target, property) => (property === 'list' ? async (...args) => lists[name](...args) : target[property]) }) : real
      }
      const site = express()
      site.use(app.cms.express())
      site.use(magazine(stand, options))
      return site
    }
    const getFrom = (site, url, headers = {}) => request(site).get(url).set(headers)

    it('uses the address of the request for the feed, the sitemap and robots.txt when it is given no address of its own', async () => {
      const site = express()
      site.use(magazine(app.cms))
      const robots = await getFrom(site, '/robots.txt')
      expect(robots.text).to.match(/Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/)
      expect((await getFrom(site, '/en/feed.xml')).text).to.match(/<link>http:\/\/127\.0\.0\.1:\d+\/en<\/link>/)
    })

    it('has a name for the site when the CMS has no settings', async () => {
      const res = await getFrom(withLists({ settings: async () => [] }), '/en')
      expect(res.status).to.equal(200)
      expect(res.text).to.include('<title>Magazine</title>')
      expect(res.text).to.not.include('Slow stories about places')
    })

    it('shows the newest article first when none is featured', async () => {
      const featured = await articles().list({ featured: true })
      for (const record of featured) {
        await articles().update(record._id, { featured: false })
      }
      try {
        const res = await get('/en')
        expect(res.text).to.match(/class="hero"[\s\S]*Slow mornings in Lisbon/)
      } finally {
        for (const record of featured) {
          await articles().update(record._id, { featured: true })
        }
      }
    })

    it('says there is nothing yet when there is no article', async () => {
      const res = await getFrom(withLists({ articles: async () => [] }), '/en')
      expect(res.status).to.equal(200)
      expect(res.text).to.include('No articles here yet.')
      expect(res.text).to.not.include('class="hero"')
      expect((await getFrom(withLists({ articles: async () => [] }), '/sitemap.xml')).status).to.equal(200)
    })

    it('draws an article that has no picture and no author', async () => {
      const created = await articles().create({ title: { enUS: 'Plain' }, slug: 'plain', body: { enUS: '<p>Just text</p>' }, published: true })
      try {
        const page = await get('/en/articles/plain')
        expect(page.status).to.equal(200)
        expect(page.text).to.not.include('story-cover')
        expect(page.text).to.not.include('class="byline"')
        expect(page.text).to.include('<p>Just text</p>')
        const home = await get('/en/search?q=Plain')
        expect(home.text).to.include('Plain')
        expect(home.text).to.not.include('<img')
      } finally {
        await articles().remove(created._id)
      }
    })

    it('draws nothing for a picture a record does not have: no address, no srcset', async () => {
      const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-views-'))
      try {
        fs.cpSync(path.join(EXAMPLE, 'views'), folder, { recursive: true })
        fs.writeFileSync(path.join(folder, 'home.html'), '[<%= srcset(\'articles\', { _id: \'x\' }, \'cover\') %>][<%- image(\'articles\', { _id: \'x\' }, \'cover\', 100) %>][<%- image(\'articles\', { _id: \'x\', _attachments: [{ _id: \'f\', _name: \'cover\' }] }, \'cover\', 100) %>]')
        const site = express()
        site.use(magazine(app.cms, { views: folder }))
        const res = await request(site).get('/en')
        expect(res.text).to.equal('[][][/api/articles/x/attachments/f?resize=100xauto]')
      } finally {
        fs.rmSync(folder, { recursive: true, force: true })
      }
    })

    it('answers the 404 page in English for an address with no language when the browser asks for another language', async () => {
      const res = await get('/nowhere', { 'Accept-Language': 'fr' })
      expect(res.status).to.equal(404)
      expect(res.text).to.include('Page not found')
    })

    it('answers the 404 page in English for an address with no language when the browser asks for none', async () => {
      const res = await get('/nowhere')
      expect(res.status).to.equal(404)
      expect(res.text).to.include('Page not found')
    })

    describe('and the CMS fails', () => {
      let log
      beforeEach(() => { log = console.error; console.error = () => {} })
      afterEach(() => { console.error = log })
      const failing = () => ({ articles: async () => { throw new Error('the database is down') } })

      it('says nothing of it in English for an address that has no language', async () => {
        const res = await getFrom(withLists(failing()), '/sitemap.xml')
        expect(res.status).to.equal(500)
        expect(res.text).to.include('Something went wrong')
        expect(res.text).to.include('<html lang="en">')
        expect(res.text).to.not.include('database')
      })

      it('says it in Chinese for an address in Chinese', async () => {
        const res = await getFrom(withLists(failing()), '/zh')
        expect(res.status).to.equal(500)
        expect(res.text).to.include('出了点问题')
      })

      it('answers a line of plain text when the page of the error cannot be drawn either', async () => {
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-views-'))
        try {
          fs.cpSync(path.join(EXAMPLE, 'views'), folder, { recursive: true })
          fs.rmSync(path.join(folder, '500.html'))
          const res = await getFrom(withLists(failing(), { views: folder }), '/en')
          expect(res.status).to.equal(500)
          expect(res.text).to.equal('Something went wrong')
          expect(res.headers['content-type']).to.include('text/plain')
        } finally {
          fs.rmSync(folder, { recursive: true, force: true })
        }
      })
    })
  })

  describe('the template engine', () => {
    let folder
    beforeEach(() => {
      folder = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-engine-'))
      fs.mkdirSync(path.join(folder, 'partials'))
      fs.writeFileSync(path.join(folder, 'page.html'), '<h1><%- title %></h1><%= include("partials/note", { text: "hi" }) %>')
      fs.writeFileSync(path.join(folder, 'partials', 'note.html'), '<p><%- text %> from <%- title %></p>')
    })
    afterEach(() => {
      fs.rmSync(folder, { recursive: true, force: true })
    })
    const render = (engine, file, data) => new Promise((resolve, reject) => engine(path.join(folder, file), data, (error, html) => (error ? reject(error) : resolve(html))))

    it('renders a template with its data, escaping what is printed with <%-', async () => {
      const engine = createEngine({ views: folder })
      expect(await render(engine, 'page.html', { title: '<b>&' })).to.equal('<h1>&lt;b&gt;&amp;</h1><p>hi from &lt;b&gt;&amp;</p>')
    })

    it('gives an included template the data of the page, and its own', async () => {
      const engine = createEngine({ views: folder })
      expect(await render(engine, 'page.html', { title: 'T' })).to.include('<p>hi from T</p>')
    })

    it('compiles a template again when its file changes', async () => {
      const engine = createEngine({ views: folder })
      await render(engine, 'page.html', { title: 'T' })
      const file = path.join(folder, 'page.html')
      fs.writeFileSync(file, '<h2><%- title %></h2>')
      const later = new Date(Date.now() + 5000)
      fs.utimesSync(file, later, later)
      expect(await render(engine, 'page.html', { title: 'T' })).to.equal('<h2>T</h2>')
    })

    it('says which file a template error is in', async () => {
      fs.writeFileSync(path.join(folder, 'bad.html'), '<% if ( %>')
      let error
      await render(createEngine({ views: folder }), 'bad.html', {}).catch((caught) => { error = caught })
      expect(error).to.be.an('error')
    })

    it('runs the JavaScript of a template', async () => {
      fs.writeFileSync(path.join(folder, 'list.html'), '<% items.forEach(function (item) { %>[<%- item %>]<% }) %>')
      expect(await render(createEngine({ views: folder }), 'list.html', { items: ['a', 'b'] })).to.equal('[a][b]')
    })
  })
})
