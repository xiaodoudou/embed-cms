// The magazine: an Express application that reads the CMS with `cms.api()` and writes its own pages. No helper of the CMS is used: this is what a site on the platform looks like
// when you build it yourself.
const path = require('path')
const express = require('express')
const _ = require('lodash')
const createEngine = require('./engine')
const content = require('./content')
const feed = require('./feed')
const { LANGUAGES, WORDS, language } = require('./i18n')

const PER_PAGE = 6
const VIEWS = path.join(__dirname, 'views')
const IMAGE_WIDTHS = [320, 640, 960, 1280]

/**
 * @param {Array<object>} list
 * @param {*} requested `?page=` as it came: anything
 * @returns {{items: Array<object>, page: number, pages: number, hasPrevious: boolean, hasNext: boolean}} a page of the list; the page counts from 1 and is brought into range
 */
function paginate (list, requested) {
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE))
  const page = _.clamp(parseInt(requested, 10) || 1, 1, pages)
  return { items: list.slice((page - 1) * PER_PAGE, page * PER_PAGE), page, pages, hasPrevious: page > 1, hasNext: page < pages }
}

/**
 * @param {string} resource
 * @param {object} record
 * @param {object} file one of `record._attachments`
 * @param {number} width
 * @returns {string} where the CMS serves the file, resized (the extension tells the browser what it is)
 */
const imageUrl = (resource, record, file, width) => `/api/${resource}/${record._id}/attachments/${file._id}${path.extname(_.get(file, '_fields._filename', ''))}?resize=${width}xauto`

/**
 * @param {object} cms the CMS the content comes from
 * @param {object} [options]
 * @param {string} [options.baseUrl] `https://example.com`, for the feed and the sitemap; the address of the request when it is not given
 * @param {string} [options.views] the folder of the templates
 * @returns {import('express').Express}
 */
module.exports = function magazine (cms, { baseUrl, views = VIEWS } = {}) {
  const read = content(cms)
  const startedAt = new Date()
  const app = express()
  app.disable('x-powered-by')
  app.engine('html', createEngine({ views }))
  app.set('view engine', 'html')
  app.set('views', views)

  const origin = (req) => baseUrl || `${req.protocol}://${req.get('host')}`

  /** What every template can use: the language and its words, the menu, the name of the site, and the small functions that read a record. */
  async function prepare (req, res, lang) {
    const [site, categories] = await Promise.all([read.site(), read.categories()])
    const text = (record, field) => _.get(record, [field, lang.locale]) || _.get(record, [field, 'enUS']) || ''
    Object.assign(res.locals, {
      lang,
      languages: LANGUAGES,
      t: WORDS[lang.code],
      site,
      siteName: text(site, 'name') || 'Magazine',
      tagline: text(site, 'tagline'),
      categories,
      text,
      // the same page in another language: only the first part of the address changes
      switchTo: (code) => `/${code}${req.path.replace(/^\/(en|zh)/, '')}`,
      // (in the time zone of the server: a date field keeps the start of the day of the editor, and so does the content file)
      date: (ms) => (ms ? new Intl.DateTimeFormat(lang.tag, { dateStyle: 'long' }).format(ms) : ''),
      // the address of a file of a record, at a width: the CMS resizes it and keeps the copy (`?resize=640xauto`)
      image: (resource, record, field, width) => {
        const file = _.find(record._attachments, { _name: field })
        return file ? imageUrl(resource, record, file, width) : null
      },
      srcset: (resource, record, field) => {
        const file = _.find(record._attachments, { _name: field })
        return file ? IMAGE_WIDTHS.map((width) => `${imageUrl(resource, record, file, width)} ${width}w`).join(', ') : ''
      }
    })
    return res.locals
  }

  /**
   * Answers a page. The browser is told when the content last changed: it asks again with `If-Modified-Since`, and gets `304` with no body when nothing did. A restart counts as a
   * change (the templates may have), so the date is never older than the start of the process.
   */
  function send (req, res, view, data, ...records) {
    const modified = new Date(Math.max(startedAt, read.modified(res.locals.site, res.locals.categories, ...records)))
    res.set({ 'Last-Modified': modified.toUTCString(), 'Cache-Control': 'public, max-age=0, must-revalidate' })
    if (req.fresh) {
      return res.sendStatus(304)
    }
    return res.render(view, data)
  }

  /** `route(handler)`: an async handler whose errors go to Express */
  const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

  app.use('/assets', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }))

  app.get('/robots.txt', (req, res) => {
    res.type('text').send(`User-agent: *\nAllow: /\nSitemap: ${origin(req)}/sitemap.xml\n`)
  })

  app.get('/sitemap.xml', route(async (req, res) => {
    const [articles, categories] = await Promise.all([read.published(), read.categories()])
    res.type('application/xml').send(feed.sitemap({ baseUrl: origin(req), languages: LANGUAGES, articles, categories }))
  }))

  // the address without a language: the one the browser asks for first, English when it asks for neither
  app.get('/', (req, res) => {
    res.redirect(302, `/${req.acceptsLanguages(LANGUAGES.map((item) => item.code)) || 'en'}`)
  })

  const pages = express.Router({ mergeParams: true })
  // a path that names another language is not one of these pages
  app.param('lang', (req, res, next, code) => LANGUAGES.some((item) => item.code === code) ? next() : next('route'))
  app.use('/:lang', pages)

  pages.use(route(async (req, res, next) => {
    await prepare(req, res, language(req.params.lang))
    next()
  }))

  pages.get('/', route(async (req, res) => {
    const published = await read.published()
    // the featured article, or the newest one; the rest of the newest below it
    const featured = _.find(published, 'featured') || published[0]
    const latest = _.take(_.without(published, featured), PER_PAGE)
    send(req, res, 'home', { title: res.locals.siteName, featured, latest }, published)
  }))

  pages.get('/category/:slug', route(async (req, res, next) => {
    const found = await read.inCategory(req.params.slug)
    if (!found) {
      return next()
    }
    const list = paginate(found.articles, req.query.page)
    send(req, res, 'category', { title: res.locals.text(found.category, 'name'), category: found.category, list }, found.category, found.articles)
  }))

  pages.get('/authors/:slug', route(async (req, res, next) => {
    const found = await read.byAuthor(req.params.slug)
    if (!found) {
      return next()
    }
    const list = paginate(found.articles, req.query.page)
    send(req, res, 'author', { title: found.author.name, author: found.author, list }, found.author, found.articles)
  }))

  pages.get('/articles/:slug', route(async (req, res, next) => {
    const article = await read.article(req.params.slug)
    if (!article) {
      return next()
    }
    const related = await read.related(article, 3)
    send(req, res, 'article', { title: res.locals.text(article, 'title'), article, related }, article, related)
  }))

  pages.get('/search', route(async (req, res) => {
    // `?q=a&q=b` is an array: only a text is a search
    const term = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : ''
    const results = term ? await read.search(term, res.locals.lang.locale) : []
    send(req, res, 'search', { title: res.locals.t.search, term, results }, results)
  }))

  pages.get('/feed.xml', route(async (req, res) => {
    const articles = await read.published()
    res.type('application/rss+xml').send(feed.rss({ baseUrl: origin(req), language: res.locals.lang, site: res.locals.site, text: res.locals.text, articles }))
  }))

  // an address nothing answered: the page of a 404, in the language of the address (or of the browser)
  app.use(route(async (req, res) => {
    const code = _.get(req.path.match(/^\/(en|zh)(\/|$)/), 1) || req.acceptsLanguages(LANGUAGES.map((item) => item.code)) || 'en'
    await prepare(req, res, language(code))
    res.status(404).render('404', { title: res.locals.t.notFound })
  }))

  // what went wrong: logged, and the visitor sees a page that says nothing of it
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, _next) => {
    console.error(`The page ${req.originalUrl} failed:`, error)
    if (res.headersSent) {
      return res.end()
    }
    const lang = language(_.get(req.path.match(/^\/(en|zh)(\/|$)/), 1)) || LANGUAGES[0]
    // the page of an error does not depend on the CMS: it must work when the CMS is what failed
    Object.assign(res.locals, { lang, languages: LANGUAGES, t: WORDS[lang.code], siteName: 'Magazine', tagline: '', categories: [], switchTo: (code) => `/${code}` })
    res.status(500).render('500', { title: WORDS[lang.code].error }, (renderError, html) => (renderError ? res.status(500).type('text').send('Something went wrong') : res.send(html)))
  })

  return app
}
