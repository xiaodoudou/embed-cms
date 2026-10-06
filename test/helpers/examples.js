// The example projects of docs/examples, described once, for the tests that hold every one of them to the same bar (test/unit/examples.test.js): what each is called, which resources it
// declares, how to build its site over a CMS, where to start a crawl of its links, and what its server.js says when it is ready.
const path = require('path')
const express = require('express')

const ROOT = path.resolve(__dirname, '../../docs/examples')
const SECRET = 'a-secret-of-the-examples-tests-that-is-long-enough'

/** @type {Array<object>} */
const examples = [
  {
    name: 'blog',
    dir: path.join(ROOT, 'site'),
    // CMS options the project's server.js gives
    options: { anonymousRead: ['articles'] },
    resources: ['articles'],
    // where a crawl of the links starts, and how many pages it must reach at least
    start: ['/', '/articles'],
    minPages: 7,
    ready: /The blog is at/,
    /** @returns {import('express').Express} the site over a CMS, as its server.js mounts it */
    build: (cms) => {
      const web = express()
      web.use(cms.express())
      web.use(require(path.join(ROOT, 'site', 'site'))(cms, { cache: false }).router)
      return web
    }
  },
  {
    name: 'magazine',
    dir: path.join(ROOT, 'magazine'),
    options: { anonymousRead: ['settings', 'authors', 'categories', 'articles'] },
    resources: ['settings', 'authors', 'categories', 'articles'],
    start: ['/en', '/zh', '/sitemap.xml', '/robots.txt', '/en/feed.xml', '/zh/feed.xml'],
    minPages: 40,
    ready: /The magazine is at/,
    build: (cms) => {
      const web = express()
      web.use(cms.express())
      web.use(require(path.join(ROOT, 'magazine', 'magazine'))(cms, { baseUrl: 'https://magazine.test' }))
      return web
    }
  },
  {
    name: 'docs platform',
    dir: path.join(ROOT, 'platform'),
    options: {},
    resources: ['products', 'versions', 'pages', 'members', 'messages'],
    start: ['/'],
    minPages: 20,
    // what a visitor who is not signed in meets on purpose: the title of a page for members, and a way in
    allowedStatuses: [200, 401],
    ready: /Docshelf is at/,
    // the platform has its own sign-in: a member to crawl as, made after the site (which puts the hooks on the members)
    member: { name: 'Crawler', email: 'crawler@example.com', password: 'a password for the crawl', active: true },
    // the site only: the CMS is not in it
    build: (cms) => require(path.join(ROOT, 'platform', 'platform'))(cms, { secret: SECRET, cache: false }).app
  }
]

module.exports = { examples, ROOT, SECRET }
