// The public site of the docs platform: an Express application that has no route of the CMS in it. It reads the CMS in its own process (`cms.api()`), and sends what a visitor may see:
// pages (the PageHelper), pictures and files (media.js), the forms (a sign-in, a question for the team). /admin and /api are not here: server.js puts them on another port.
//
//   /                               the products
//   /:product/latest/...            goes to the current version of the product
//   /:product/:version/:page        a page of a version
//   /search, /login, /account, /support, /figures/..., /pdf/...
const crypto = require('crypto')
const path = require('path')
const { promisify } = require('util')
const express = require('express')
const session = require('express-session')
const _ = require('lodash')
const CMS = require('../../../')
const accounts = require('./accounts')
const catalog = require('./catalog')
const createMedia = require('./media')
const { canRead, guardNames, text } = catalog
const { WIDTHS } = createMedia
const { securityHeaders, Limiter, csrfToken, csrfValid, localPath } = require('./security')

const VIEWS = path.join(__dirname, 'views')
const TEMPLATES = ['header', 'footer', 'home', 'page', 'locked', 'search', 'login', 'account', 'support', 'thanks', 'notfound', 'error']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** @returns {string} a value of a form as a text of at most `max` letters: whatever else it is (a list, an object) is nothing */
const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/** @returns {string} the path of a page of this site that a form was opened from, or nothing: a path with no line break, never another address (`//evil.example`) */
const pagePath = (value) => (typeof value === 'string' && /^\/(?![/\\])[^\r\n]{0,200}$/.test(value) ? value : '')

const enc = encodeURIComponent
/** @returns {string} the address of a product, of its version, or of a page */
const address = (product, version, page) => `/${[product, version, page].filter(Boolean).map((record) => enc(record.slug)).join('/')}`

/**
 * What a template shows of a page (Mustache computes nothing, so this is where the addresses and the flags are made). The text is not in it: it goes to the page that may show it.
 * @param {object} product
 * @param {object} version
 * @param {object} page a record of `pages`
 * @returns {object}
 */
function describePage (product, version, page) {
  const has = (field) => _.some(page._attachments, { _name: field })
  const where = address(product, version, page)
  return {
    title: text(page, 'title'),
    summary: text(page, 'summary'),
    membersOnly: Boolean(page.membersOnly || product.membersOnly),
    href: where,
    hasDiagram: has('diagram'),
    diagram: `/figures${where}?w=800`,
    srcset: WIDTHS.map((width) => `/figures${where}?w=${width} ${width}w`).join(', '),
    hasDownload: has('download'),
    download: `/pdf${where}`,
    report: `/support?page=${enc(where)}`
  }
}

/**
 * Everything the template of a page shows around its text: the menu of the version, the switcher of versions (which keeps the page when the other version has it), the banner of an old version.
 * @param {object} reads the catalogue (`catalog(cms, api)`)
 * @param {{product: object, version: object, page: object}} found
 * @returns {Promise<object>}
 */
async function pageData (reads, { product, version, page }) {
  const [versions, pages, current] = await Promise.all([reads.versions(product), reads.pages(version), reads.current(product)])
  const groups = _.uniq(pages.map((one) => one.group || '')).map((title) => ({
    title,
    pages: pages.filter((one) => (one.group || '') === title).map((one) => ({ title: text(one, 'title'), href: address(product, version, one), membersOnly: Boolean(one.membersOnly), selected: one._id === page._id }))
  }))
  const switcher = await Promise.all(versions.map(async (other) => {
    const same = await reads.page(other, page.slug)
    return { name: other.slug, current: Boolean(other.current), selected: other._id === version._id, href: same ? address(product, other, same) : address(product, other) }
  }))
  return {
    title: `${text(page, 'title')} · ${product.name}`,
    product: { name: product.name, href: `/${enc(product.slug)}/latest/` },
    version: { name: version.slug, archived: Boolean(version.archived) },
    groups,
    switcher,
    banner: version.archived && current && current._id !== version._id ? { name: current.slug, href: address(product, current) } : null,
    page: describePage(product, version, page)
  }
}

/**
 * The last word on a failure, after the page of an error: when even that page cannot be made, Express would answer with the stack of the error (outside production), which is a
 * map of the server for whoever asked. This answers a line of text, and leaves an answer that is already being sent to Express, which closes it.
 */
function lastResort (error, req, res, next) {
  if (res.headersSent) {
    return next(error)
  }
  return res.status(500).type('text').send('Something went wrong')
}

/**
 * @param {object} body the fields of the support form
 * @returns {{values: {name: string, email: string, text: string}, errors: string[]}}
 */
function readMessage (body) {
  const values = { name: clean(body.name, 100), email: clean(body.email, 200), text: clean(body.text, 3000) }
  const errors = []
  if (!values.name) {
    errors.push('Please tell us your name.')
  }
  if (!EMAIL.test(values.email)) {
    errors.push('Please give an email address we can answer to.')
  }
  if (values.text.length < 10) {
    errors.push('Please write a few words: at least ten letters.')
  }
  return { values, errors }
}

/**
 * @param {object} cms the CMS the content comes from; it is not mounted: only read
 * @param {object} [options]
 * @param {string} [options.secret] what signs the cookie of the session; a new one for each start when it is not given (the members sign in again after a restart)
 * @param {boolean} [options.secureCookies] send the cookie over HTTPS only: set it when the site is served over HTTPS
 * @param {number|boolean|string} [options.trustProxy] what Express believes of `X-Forwarded-For`, when the site is behind a proxy: the address of the visitor, not of the proxy, is what the limits count
 * @param {string|false} [options.cache] where the finished pages are kept: a folder, nothing for the memory, false for nowhere
 * @param {string} [options.views] the folder of the templates
 * @param {{login?: object, support?: object}} [options.limits] `{ limit, windowMs, now }` of the two limits
 * @returns {{app: import('express').Express, pages: CMS.PageHelper}}
 */
module.exports = function platform (cms, { secret, secureCookies = false, trustProxy, cache, views = VIEWS, limits = {} } = {}) {
  accounts.install(cms)
  guardNames(cms)
  const media = createMedia(cms)
  const reads = catalog(cms)
  const loginLimiter = new Limiter({ limit: 5, windowMs: 15 * 60 * 1000, ...limits.login })
  const supportLimiter = new Limiter({ limit: 5, windowMs: 60 * 60 * 1000, ...limits.support })

  const pages = new CMS.PageHelper({
    cms,
    cache,
    templates: Object.fromEntries(TEMPLATES.map((name) => [name, path.join(views, `${name}.html`)])),
    notFound: 'notfound',
    error: 'error',
    locals: { siteName: 'Docshelf' }
  })

  const app = express()
  app.disable('x-powered-by')
  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy)
  }
  app.use(securityHeaders())
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }))
  // A session exists only for a visitor who has something to keep (a form's token, a sign-in): the pages everyone sees carry no cookie, so a cache may keep them.
  app.use(session({
    name: 'docshelf.sid',
    secret: secret || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 7 * 24 * 3600 * 1000 }
  }))
  const form = express.urlencoded({ extended: false, limit: '16kb' })
  const regenerate = (req) => promisify(req.session.regenerate.bind(req.session))()

  /** Answers a page that is made for this visitor (a form with its token, a page for a member): never kept, never shared. */
  const show = async (res, name, data = {}, status = 200) => {
    const html = await pages.render(name, data)
    return res.status(status).set('Cache-Control', 'private, no-store').type('html').send(html)
  }

  /**
   * Who is signed in, if anyone: `req.member`, or null. It is asked at every request, not only at the sign-in, so that a member made inactive is out at once.
   * (Without a session cookie there is nothing to ask: a visitor who never signed in costs the CMS nothing.)
   */
  app.use(async (req, res, next) => {
    try {
      req.member = await accounts.current(cms, req.session.memberId)
      next()
    } catch (error) {
      next(error)
    }
  })

  /** For the pages of members: a visitor who is not signed in is sent to the sign-in, and back here afterwards. */
  const requireMember = (req, res, next) => (req.member ? next() : res.redirect(303, `/login?next=${enc(req.originalUrl)}`))

  /** The answer to a visitor who may not read something: its title and its summary (which are public), and a way in. 401, never kept. */
  const locked = (req, res, title, summary) => show(res, 'locked', { title, summary, next: enc(req.originalUrl) }, 401)

  // ---------------------------------------------------------------- the products: made once, kept until a record changes

  app.get('/', pages.route('home', async ({ api }) => {
    const read = catalog(cms, api)
    const products = await Promise.all((await read.products()).map(async (product) => ({ product, current: await read.current(product) })))
    return {
      title: 'Documentation',
      products: products.map(({ product, current }) => ({ name: product.name, summary: product.summary, membersOnly: Boolean(product.membersOnly), href: current ? `/${enc(product.slug)}/latest/` : null, version: current ? current.slug : '' }))
    }
  }))

  // ---------------------------------------------------------------- made for each request: what a visitor typed

  app.get('/search', pages.route('search', async ({ api, query, req }) => {
    const read = catalog(cms, api)
    const term = clean(query.q, 80)
    const pattern = _.escapeRegExp(term)
    const match = (field) => ({ [`${field}.enUS`]: { $regex: pattern, $options: 'i' } })
    // only what this visitor may read is searched: the products that are for members are not there for anyone else
    const products = (await read.products()).filter((product) => canRead(req.member, product))
    const versions = _.flatten(await Promise.all(products.map(async (product) => (await read.versions(product)).map((version) => ({ product, version })))))
    const owner = _.keyBy(versions, ({ version }) => version._id)
    // the text is searched in the pages that this visitor may read: a page for members is found by its title and its summary, which everyone may read, and by what it says for a member
    const body = req.member ? [match('body')] : [{ $and: [{ membersOnly: { $ne: true } }, match('body')] }]
    const found = term && versions.length ? await api('pages').list({ published: true, version: { $in: Object.keys(owner) }, $or: [match('title'), match('summary'), ...body] }) : []
    const results = _.sortBy(found.map((page) => {
      const { product, version } = owner[page.version]
      return { ...describePage(product, version, page), product: product.name, version: version.slug, order: product.order }
    }), ['order', 'product', 'title'])
    return { title: 'Search', term, searched: Boolean(term), found: results.length > 0, results }
  }, { cache: false }))

  // ---------------------------------------------------------------- the files: the site decides who may have them

  app.get('/figures/:product/:version/:page', media.diagram)
  app.get('/pdf/:product/:version/:page', media.download)

  // ---------------------------------------------------------------- members

  app.get('/login', async (req, res, next) => {
    try {
      return await show(res, 'login', { title: 'Sign in', csrf: csrfToken(req), next: localPath(req.query.next) })
    } catch (error) {
      return next(error)
    }
  })

  app.post('/login', form, async (req, res, next) => {
    try {
      const retry = { title: 'Sign in', csrf: csrfToken(req), next: localPath(req.body.next) }
      if (!csrfValid(req)) {
        return await show(res, 'login', { ...retry, error: 'This form has expired. Please try again.' }, 403)
      }
      const email = clean(req.body.email, 200).toLowerCase()
      const rate = loginLimiter.hit(`${req.ip}|${email}`)
      if (!rate.allowed) {
        res.set('Retry-After', String(rate.retryAfter))
        return await show(res, 'login', { ...retry, email, error: 'Too many attempts. Please wait a few minutes.' }, 429)
      }
      const member = await accounts.signIn(cms, email, req.body.password)
      if (!member) {
        return await show(res, 'login', { ...retry, email, error: 'The email or the password is wrong.' }, 401)
      }
      loginLimiter.reset(`${req.ip}|${email}`)
      // a new session for a new person: what an earlier visitor of this browser had is not carried over (session fixation)
      await regenerate(req)
      req.session.memberId = member._id
      return res.redirect(303, localPath(req.body.next))
    } catch (error) {
      return next(error)
    }
  })

  app.post('/logout', form, (req, res) => {
    if (!csrfValid(req)) {
      return res.status(403).type('text').send('This form has expired.')
    }
    return req.session.destroy(() => {
      res.clearCookie('docshelf.sid')
      res.redirect(303, '/')
    })
  })

  app.get('/account', requireMember, async (req, res, next) => {
    try {
      const [products, versions, privatePages] = await Promise.all([reads.products(), cms.api()('versions').list({ published: true }), cms.api()('pages').list({ published: true, membersOnly: true })])
      const productOf = _.keyBy(products, '_id')
      const versionOf = _.keyBy(versions, '_id')
      const list = _.compact(privatePages.map((page) => {
        const version = versionOf[page.version]
        const product = version && productOf[version.product]
        return product && !product.membersOnly ? { ...describePage(product, version, page), product: product.name, version: version.slug } : null
      }))
      const whole = products.filter((product) => product.membersOnly).map((product) => ({ name: product.name, summary: product.summary, href: `/${enc(product.slug)}/latest/` }))
      return await show(res, 'account', { title: 'For members', member: req.member.name, products: whole, hasProducts: whole.length > 0, pages: _.sortBy(list, ['product', 'title']), csrf: csrfToken(req) })
    } catch (error) {
      return next(error)
    }
  })

  // ---------------------------------------------------------------- the support form: the only thing a visitor writes into the CMS

  app.get('/support', async (req, res, next) => {
    try {
      return await show(res, 'support', { title: 'Ask the team', csrf: csrfToken(req), values: {}, about: pagePath(req.query.page) })
    } catch (error) {
      return next(error)
    }
  })

  app.post('/support', form, async (req, res, next) => {
    try {
      const { values, errors } = readMessage(req.body)
      const about = pagePath(req.body.page)
      const again = (message, status) => show(res, 'support', { title: 'Ask the team', csrf: csrfToken(req), values, about, errors: message, hasErrors: true }, status)
      if (!csrfValid(req)) {
        return await again(['This form has expired. Please send it again.'], 403)
      }
      // a box that people do not see: a program that fills every box fills this one too, and is thanked without a record being made
      if (clean(req.body.website, 200)) {
        return res.redirect(303, '/support/thanks')
      }
      const rate = supportLimiter.hit(req.ip)
      if (!rate.allowed) {
        res.set('Retry-After', String(rate.retryAfter))
        return await again(['Too many messages from here. Please try again later.'], 429)
      }
      if (errors.length) {
        return await again(errors, 422)
      }
      await cms.api()('messages').create({ ...values, page: about, handled: false })
      return res.redirect(303, '/support/thanks')
    } catch (error) {
      return next(error)
    }
  })

  app.get('/support/thanks', pages.route('thanks', () => ({ title: 'Thank you' })))

  // ---------------------------------------------------------------- the products, the versions and the pages (after the addresses above, which are the platform's own)

  /** For a route under a product: the product of the address, answered here when it is not there or the visitor may not read it, handed to `handler` otherwise. */
  const underProduct = (handler) => async (req, res, next) => {
    try {
      const product = await reads.product(req.params.product)
      if (!product) {
        return next()
      }
      // a product for members shows nothing of itself to anyone else: not a version, not a page, not whether they exist
      return canRead(req.member, product) ? await handler(req, res, next, product) : await locked(req, res, product.name, product.summary)
    } catch (error) {
      return next(error)
    }
  }

  app.get('/:product', underProduct((req, res, next, product) => res.redirect(302, `/${enc(product.slug)}/latest/`)))

  // `latest` is not a version: it goes to the current one, on the same page
  app.get('/:product/latest{/:page}', underProduct(async (req, res, next, product) => {
    const current = await reads.current(product)
    return current ? res.redirect(302, `${address(product, current)}${req.params.page ? `/${enc(req.params.page)}` : ''}`) : next()
  }))

  // the version without a page goes to its first one
  app.get('/:product/:version', underProduct(async (req, res, next, product) => {
    const version = await reads.version(product, req.params.version)
    const first = version && (await reads.pages(version))[0]
    return first ? res.redirect(302, address(product, version, first)) : next()
  }))

  // A page of a public product that is public is a kept page. One that is for members is made for the member who asks and kept nowhere: the same address, two kinds of answer,
  // chosen by the page.
  const publicPage = pages.route('page', async ({ api, params, notFound }) => {
    const read = catalog(cms, api)
    const found = await read.resolve(params)
    return found.page && canRead(null, found.product, found.page) ? { ...(await pageData(read, found)), body: text(found.page, 'body') } : notFound()
  })

  app.get('/:product/:version/:page', underProduct(async (req, res, next, product) => {
    const found = await reads.resolve(req.params)
    if (!found.page) {
      return next()
    }
    if (!canRead(null, product, found.page)) {
      if (!req.member) {
        // the title and the summary are public; the text, the diagram and the PDF are not even sent
        return locked(req, res, text(found.page, 'title'), text(found.page, 'summary'))
      }
      return show(res, 'page', { ...(await pageData(reads, found)), body: text(found.page, 'body'), member: req.member.name })
    }
    return publicPage(req, res, next)
  }))

  // last: an address no route answered, then whatever a route threw
  app.use(pages.notFoundHandler())
  app.use(pages.errorHandler())
  app.use(lastResort)

  return { app, pages }
}

module.exports.describe = describePage
module.exports.readMessage = readMessage
module.exports.pagePath = pagePath
module.exports.lastResort = lastResort
