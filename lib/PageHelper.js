/**
 * @fileoverview PageHelper: renders the pages of a public site from the content of the CMS, with Mustache templates, and keeps the finished pages, in memory or in a folder.
 *
 * It is given every template (by name, with its file) and the CMS. A route names its root template (`pages.route('article', loader)`), the loader reads the content through an `api`
 * that notes which resources it reads, and the page is rendered and kept. A kept page is sent again as long as the files of its templates have the date they had, no resource it
 * read has a record updated since (the `_updatedAt` of the records: nothing is hashed), and it is not older than `maxAge`. See docs/reference/PAGE_HELPER.md.
 */
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const crypto = require('crypto')
const _ = require('lodash')
const Mustache = require('mustache')
const logger = require('./logger')

const CACHE_VERSION = 1
// what changes the content of a record, and so the pages that show it
const CHANGES = ['create', 'update', 'remove', 'createAttachment', 'updateAttachment', 'removeAttachment']
const NAME = /^[\w][\w./-]*$/
const NOT_FOUND = Symbol('embed-cms.pages.notFound')
const DEFAULT_MAX_PAGES = 500
// what `{{value}}` turns into text for a page: the characters that start markup or end an attribute. (Mustache escapes "/" too, which makes an address unreadable in the source.)
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;', '`': '&#96;' }
const escapeHtml = (value) => String(value).replace(/[&<>"'`]/g, (character) => ESCAPES[character])

/**
 * @param {string} text
 * @returns {string} its sha256, in hexadecimal
 */
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex')

/**
 * @param {Array} tokens what Mustache.parse made of a template
 * @param {Set<string>} [found]
 * @returns {Set<string>} the names of the partials a template includes, inside its sections too
 */
function partialsOf (tokens, found = new Set()) {
  for (const token of tokens) {
    if (token[0] === '>') {
      found.add(token[1])
    } else if (Array.isArray(token[4])) {
      partialsOf(token[4], found)
    }
  }
  return found
}

/** Finished pages kept in memory: the oldest goes when there are more than `max`. Lost when the process stops. */
class MemoryStore {
  /** @param {number} max how many pages */
  constructor (max) {
    this.max = max
    this.pages = new Map()
  }

  /**
   * @param {string} key
   * @returns {Promise<{html: string, meta: object}|null>}
   */
  async get (key) {
    const page = this.pages.get(key)
    if (page) {
      // the one asked for last is the last to go
      this.pages.delete(key)
      this.pages.set(key, page)
    }
    return page || null
  }

  /**
   * @param {string} key
   * @param {string} url
   * @param {string} html
   * @param {object} meta
   */
  async set (key, url, html, meta) {
    this.pages.delete(key)
    this.pages.set(key, { html, meta })
    while (this.pages.size > this.max) {
      this.pages.delete(this.pages.keys().next().value)
    }
  }

  /** @returns {Promise<number>} how many pages were dropped */
  async clear () {
    const count = this.pages.size
    this.pages.clear()
    return count
  }
}

/** Finished pages kept in a folder, one `.html` and one `.json` (what it was made of) each: they survive a restart. */
class DiskStore {
  /** @param {string} dir */
  constructor (dir) {
    this.dir = dir
    fs.mkdirSync(dir, { recursive: true })
  }

  /**
   * @param {string} key
   * @param {string} url the path of the request, for a name a person can read
   * @returns {{html: string, meta: string}} the two files of a page
   */
  files (key, url) {
    const base = `${(url.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'index').slice(0, 60)}.${sha(key).slice(0, 16)}`
    return { html: path.join(this.dir, `${base}.html`), meta: path.join(this.dir, `${base}.json`) }
  }

  /**
   * @param {string} key
   * @param {string} url
   * @returns {Promise<{html: string, meta: object}|null>} nothing when the page is not there, or is not readable
   */
  async get (key, url) {
    const files = this.files(key, url)
    try {
      const meta = JSON.parse(await fsp.readFile(files.meta, 'utf8'))
      return { meta, html: await fsp.readFile(files.html, 'utf8') }
    } catch {
      return null
    }
  }

  /**
   * Writes a page and what it was made of, each through a temporary file renamed over the real one, so a request never reads half a page.
   * @param {string} key
   * @param {string} url
   * @param {string} html
   * @param {object} meta
   */
  async set (key, url, html, meta) {
    const files = this.files(key, url)
    try {
      for (const [file, text] of [[files.html, html], [files.meta, JSON.stringify(meta)]]) {
        const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
        await fsp.writeFile(temporary, text)
        await fsp.rename(temporary, file)
      }
    } catch (error) {
      logger.warn(`The page cache could not be written: ${error.message}`)
    }
  }

  /** @returns {Promise<number>} how many pages were deleted (only the files this helper wrote: `<name>.<16 hexadecimal digits>.html` and `.json`) */
  async clear () {
    let count = 0
    for (const file of await fsp.readdir(this.dir)) {
      if (/\.[0-9a-f]{16}\.(html|json)$/.test(file)) {
        await fsp.rm(path.join(this.dir, file), { force: true })
        count += file.endsWith('.html') ? 1 : 0
      }
    }
    return count
  }
}

class PageHelper {
  /**
   * @param {object} options
   * @param {object} options.cms the CMS: pages read its content through `cms.api()` (the server's own access, no rights are checked)
   * @param {Object<string, string|{source: string}>} options.templates every template, by name: the path of its file, or `{ source }` for one written in the code. A name is the
   * one `{{> name}}` and `route(name)` use. Read and checked now: a file that cannot be read, a template that does not parse and a partial that is not in the list stop the start.
   * @param {string|false} [options.cache] where the finished pages are kept: a folder (they survive a restart), nothing for the memory of the process, `false` for nowhere
   * @param {number} [options.maxPages] how many pages the memory keeps, 500 by default
   * @param {object} [options.locals] given to every page, under the data of the page
   * @param {number} [options.maxAge] seconds a kept page lives at most, 3600 by default, 0 for no limit
   * @param {number} [options.revalidate] seconds between two checks of a kept page, 0 (every request) by default
   * @param {string} [options.notFound] the template of the 404 page
   * @param {string} [options.error] the template of the page of an error
   */
  constructor (options = {}) {
    if (!options.cms || typeof options.cms.api !== 'function') {
      throw new Error('PageHelper needs the cms: new CMS.PageHelper({ cms, templates })')
    }
    if (!_.isPlainObject(options.templates) || _.isEmpty(options.templates)) {
      throw new Error('PageHelper needs its templates: { name: \'path/to/file.html\' }')
    }
    this.cms = options.cms
    this.locals = options.locals || {}
    this.maxAge = _.isNil(options.maxAge) ? 3600 : Number(options.maxAge)
    this.revalidate = _.isNil(options.revalidate) ? 0 : Number(options.revalidate)
    if (options.cache === false) {
      this.store = null
    } else if (typeof options.cache === 'string' && options.cache) {
      this.store = new DiskStore(path.resolve(options.cache))
    } else {
      this.store = new MemoryStore(_.isNil(options.maxPages) ? DEFAULT_MAX_PAGES : Number(options.maxPages))
    }
    // the parsed templates are kept by this writer, by their text: a changed file is a new text
    this.writer = new Mustache.Writer()
    /** @type {Map<string, {name: string, file?: string, source: string, stamp: string|number, partials: Set<string>}>} */
    this.templates = new Map()
    _.each(options.templates, (spec, name) => this.addTemplate(name, spec))
    this.checkPartials()
    this.notFoundTemplate = this.knownTemplate(options.notFound, 'notFound')
    this.errorTemplate = this.knownTemplate(options.error, 'error')
    // what is known of each resource: the latest update of its records, and whether the hooks are in
    this.resources = new Map()
    this.checked = new Map()
    this.building = new Map()
  }

  /**
   * @param {string|undefined} name
   * @param {string} option
   * @returns {string|undefined} the name, when it is the name of a template
   * @throws {Error} when it is not
   */
  knownTemplate (name, option) {
    if (name !== undefined && !this.templates.has(name)) {
      throw new Error(`The ${option} template "${name}" is not in templates`)
    }
    return name
  }

  /**
   * Reads a template and parses it.
   * @param {string} name
   * @param {string|{source: string}} spec
   * @throws {Error} naming the template, when it cannot be read or does not parse
   */
  addTemplate (name, spec) {
    if (typeof name !== 'string' || !NAME.test(name) || name.includes('..')) {
      throw new Error(`"${name}" is not a name a template can have: letters, digits, "_", "-", "." and "/"`)
    }
    const entry = { name, source: '', stamp: 0, partials: new Set() }
    if (typeof spec === 'string') {
      entry.file = path.resolve(spec)
      try {
        entry.source = fs.readFileSync(entry.file, 'utf8')
        entry.stamp = fs.statSync(entry.file).mtimeMs
      } catch (error) {
        throw new Error(`Template "${name}": cannot read ${entry.file} (${error.code})`, { cause: error })
      }
    } else if (spec && typeof spec.source === 'string') {
      entry.source = spec.source
      entry.stamp = sha(spec.source)
    } else {
      throw new Error(`Template "${name}": give the path of its file, or { source }`)
    }
    entry.partials = this.parse(name, entry.source)
    this.templates.set(name, entry)
  }

  /**
   * @param {string} name
   * @param {string} source
   * @returns {Set<string>} the partials of the template
   * @throws {Error} naming the template, when it does not parse
   */
  parse (name, source) {
    try {
      return partialsOf(this.writer.parse(source))
    } catch (error) {
      throw new Error(`Template "${name}": ${error.message}`, { cause: error })
    }
  }

  /** @throws {Error} when a template includes a partial that is not in the list */
  checkPartials () {
    for (const entry of this.templates.values()) {
      this.checkEntry(entry)
    }
  }

  /**
   * @param {{name: string, partials: Set<string>}} entry
   * @throws {Error} when it includes a partial that is not in the list
   */
  checkEntry (entry) {
    for (const partial of entry.partials) {
      if (!this.templates.has(partial)) {
        throw new Error(`Template "${entry.name}" includes "${partial}", which is not in templates`)
      }
    }
  }

  /** @returns {Array<string>} the names of the templates */
  names () {
    return [...this.templates.keys()]
  }

  /**
   * @param {string} name
   * @returns {boolean} whether it is the name of a template
   */
  has (name) {
    return this.templates.has(name)
  }

  /**
   * Reads a template again when its file has another date than the one it was read at.
   * @param {object} entry
   * @throws {Error} when the new text does not parse, or includes a partial that is not there: the template that was read before stays, and the next request tries again
   */
  async refresh (entry) {
    if (!entry.file) {
      return
    }
    let stamp
    try {
      stamp = (await fsp.stat(entry.file)).mtimeMs
    } catch (error) {
      if (!entry.missingSaid) {
        entry.missingSaid = true
        logger.warn(`Template "${entry.name}": ${entry.file} cannot be read now (${error.code}), the last text is used`)
      }
      return
    }
    entry.missingSaid = false
    if (stamp === entry.stamp) {
      return
    }
    const source = await fsp.readFile(entry.file, 'utf8')
    const changed = { name: entry.name, partials: this.parse(entry.name, source) }
    this.checkEntry(changed)
    entry.source = source
    entry.partials = changed.partials
    entry.stamp = stamp
    this.writer.clearCache()
  }

  /**
   * @param {string} name the root template
   * @returns {Promise<Array<object>>} the template and the ones it includes, all of them up to date
   */
  async closure (name) {
    const seen = new Map()
    const queue = [name]
    while (queue.length > 0) {
      const next = queue.shift()
      if (seen.has(next)) {
        continue
      }
      const entry = this.templates.get(next)
      seen.set(next, entry)
      await this.refresh(entry)
      queue.push(...entry.partials)
    }
    return [...seen.values()]
  }

  /**
   * @param {string} name the root template
   * @param {object} [data]
   * @returns {Promise<{html: string, templates: Object<string, string|number>}>} the page, and the date of each template it is made of
   */
  async build (name, data = {}) {
    if (!this.templates.has(name)) {
      throw new Error(`Template "${name}" is not in templates`)
    }
    const used = await this.closure(name)
    // (every partial is in the list: it was checked when the template was read)
    const partials = (partial) => this.templates.get(partial).source
    const html = this.writer.render(this.templates.get(name).source, { ...this.locals, ...data }, partials, { escape: escapeHtml })
    return { html, templates: Object.fromEntries(used.map((entry) => [entry.name, entry.stamp])) }
  }

  /**
   * Renders a template. Only the templates are cached here: the data is yours, so this cannot know what the page depends on (that is what `route` is for).
   * @param {string} name the root template
   * @param {object} [data] what the template shows, over `locals`
   * @returns {Promise<string>} the page
   */
  async render (name, data = {}) {
    return (await this.build(name, data)).html
  }

  // ---------------------------------------------------------------- what the content was when a page was made

  /**
   * @param {string} name a resource
   * @returns {{value: number, loaded: Promise<void>|null}} what is known of it; its hooks are put in the first time
   */
  resourceState (name) {
    let state = this.resources.get(name)
    if (!state) {
      state = { value: 0, loaded: null }
      this.resources.set(name, state)
      const api = this.cms.api()(name)
      for (const event of CHANGES) {
        api.after(event, (context) => {
          this.touch(name)
          context.next()
        })
      }
    }
    return state
  }

  /**
   * A change, now: the date of the resource moves forward, by at least one so that two changes in the same millisecond are two.
   * @param {string} name
   */
  touch (name) {
    const state = this.resourceState(name)
    state.value = Math.max(Date.now(), state.value + 1)
  }

  /**
   * @param {string} name a resource
   * @returns {Promise<number>} the update of its latest record, or of the latest change this process saw. Its records are read once, the first time it is asked for.
   */
  async lastUpdated (name) {
    const state = this.resourceState(name)
    if (!state.loaded) {
      state.loaded = this.cms.api()(name).list({}).then((records) => {
        const latest = records.reduce((most, record) => Math.max(most, record._updatedAt || record._createdAt || 0), 0)
        state.value = Math.max(state.value, latest)
      }, (error) => {
        state.loaded = null
        throw error
      })
    }
    await state.loaded
    return state.value
  }

  /**
   * Makes the pages that read a resource old: they are made again when they are asked for.
   * @param {string} name a resource
   */
  invalidate (name) {
    this.touch(name)
  }

  /**
   * @param {Map<string, number>} used filled with the resources the loader reads, each with its date when it was first read
   * @returns {function(string, ...string): object} the `api` of a loader: `cms.api()`, noting the resources it is used on
   */
  trackedApi (used) {
    const api = this.cms.api()
    return (name, ...rest) => {
      const wrapper = api(name, ...rest)
      return new Proxy(wrapper, {
        get: (target, property) => {
          const value = target[property]
          if (typeof value !== 'function') {
            return value
          }
          if (property === 'before' || property === 'after') {
            return value.bind(target)
          }
          return async (...args) => {
            // the date comes first: a record that changes while the page is made makes the page old at once
            const date = await this.lastUpdated(name)
            if (!used.has(name)) {
              used.set(name, date)
            }
            return value.apply(target, args)
          }
        }
      })
    }
  }

  // ---------------------------------------------------------------- the kept pages

  /**
   * @param {string} name the root template
   * @param {object} options the options of the route
   * @param {object} req
   * @returns {string} what makes this page this page: the template, the path, and the query parameters the route says change it (`vary`)
   */
  keyOf (name, options, req) {
    const query = _.map(_.sortBy(options.vary || []), (parameter) => {
      const value = _.get(req, ['query', parameter])
      return value === undefined ? '' : `${parameter}=${String(value)}`
    }).filter(Boolean).join('&')
    return `${name}\u0000${req.path}\u0000${query}`
  }

  /**
   * Whether a kept page is still the page that would be made now.
   * @param {object} meta what it was made of
   * @param {string} key
   * @param {object} options the options of the route
   * @returns {Promise<boolean>}
   */
  async isFresh (meta, key, options) {
    if (!meta || meta.version !== CACHE_VERSION || meta.key !== key || !_.isPlainObject(meta.templates) || !_.isPlainObject(meta.resources)) {
      return false
    }
    const maxAge = _.isNil(options.maxAge) ? this.maxAge : Number(options.maxAge)
    const now = Date.now()
    if (maxAge > 0 && now - meta.generatedAt > maxAge * 1000) {
      return false
    }
    const checked = this.checked.get(key)
    if (this.revalidate > 0 && checked && now - checked < this.revalidate * 1000) {
      return true
    }
    for (const [name, stamp] of Object.entries(meta.templates)) {
      const entry = this.templates.get(name)
      if (!entry) {
        return false
      }
      await this.refresh(entry)
      if (entry.stamp !== stamp) {
        return false
      }
    }
    for (const [name, date] of Object.entries(meta.resources)) {
      try {
        if (await this.lastUpdated(name) > date) {
          return false
        }
      } catch {
        // a resource that cannot be read now: the page is made again, and says why if it fails too
        return false
      }
    }
    this.checked.set(key, now)
    return true
  }

  /**
   * Drops the kept pages.
   * @returns {Promise<number>} how many
   */
  async clear () {
    this.checked.clear()
    return this.store ? this.store.clear() : 0
  }

  // ---------------------------------------------------------------- routes

  /**
   * The route of a page.
   * @param {string} name the root template
   * @param {function(object): Promise<object>|object} [loader] gets `{ api, params, query, req, res, cms, notFound }` and gives the data of the page, or `notFound()`. `api` is `cms.api()`:
   * the resources it is used on are what the kept page depends on.
   * @param {object} [options]
   * @param {number} [options.maxAge] seconds this page is kept, over the one of the helper
   * @param {boolean} [options.cache] false: this page is made for every request
   * @param {Array<string>} [options.vary] the query parameters that change the page (`page`): without them the query is not part of what a page is
   * @param {object} [options.headers] response headers; `Cache-Control` is `no-cache` (the browser asks again and gets 304) unless it is here
   * @returns {function(object, object, function): Promise<void>} an Express handler
   * @throws {Error} when the template is not in the list
   */
  route (name, loader, options = {}) {
    if (!this.templates.has(name)) {
      throw new Error(`Template "${name}" is not in templates`)
    }
    if (_.isPlainObject(loader)) {
      options = loader
      loader = undefined
    }
    return async (req, res, next) => {
      try {
        await this.serve(name, loader, options, req, res)
      } catch (error) {
        await this.fail(error, req, res, next)
      }
    }
  }

  /**
   * @param {string} name
   * @param {function|undefined} loader
   * @param {object} options
   * @param {object} req
   * @param {object} res
   */
  async serve (name, loader, options, req, res) {
    const cacheable = !!this.store && options.cache !== false && (req.method === 'GET' || req.method === 'HEAD')
    if (!cacheable) {
      return this.send(res, await this.make(name, loader, options, req, res, null), options)
    }
    const key = this.keyOf(name, options, req)
    const kept = await this.store.get(key, req.path)
    if (kept && await this.isFresh(kept.meta, key, options)) {
      return this.send(res, { status: 200, html: kept.html }, options)
    }
    // one page is made once at a time: the requests that come while it is made wait for it (so the loader of a page that is kept must not depend on who asks)
    let making = this.building.get(key)
    if (!making) {
      making = this.make(name, loader, options, req, res, key).finally(() => this.building.delete(key))
      this.building.set(key, making)
    }
    return this.send(res, await making, options)
  }

  /**
   * Runs the loader, renders, and keeps the page when it is one to keep.
   * @param {string} name
   * @param {function|undefined} loader
   * @param {object} options
   * @param {object} req
   * @param {object} res
   * @param {string|null} key the key to keep the page under; nothing to keep it nowhere
   * @returns {Promise<{status: number, html?: string, sent?: boolean}>}
   */
  async make (name, loader, options, req, res, key) {
    const used = new Map()
    let data = {}
    if (loader) {
      data = await loader({ api: this.trackedApi(used), cms: this.cms, params: req.params, query: req.query, req, res, notFound: () => NOT_FOUND })
      if (res.headersSent) {
        if (key) {
          throw new Error(`The loader of the page "${name}" answered the request itself: a page that is kept is made once for everyone, give it \`cache: false\` to answer in the loader`)
        }
        return { sent: true }
      }
      if (data === NOT_FOUND) {
        return { status: 404, html: await this.statusPage(404, req) }
      }
      if (!_.isPlainObject(data)) {
        throw new Error(`The loader of the page "${name}" gave ${data === undefined ? 'nothing' : 'something that is not an object'}: it returns the data of the page, or notFound()`)
      }
    }
    const generatedAt = Date.now()
    const { html, templates } = await this.build(name, data)
    if (key) {
      await this.store.set(key, req.path, html, { version: CACHE_VERSION, key, template: name, generatedAt, templates, resources: Object.fromEntries(used) })
      this.checked.set(key, generatedAt)
    }
    return { status: 200, html }
  }

  /**
   * @param {object} res
   * @param {{status?: number, html?: string, sent?: boolean}} page
   * @param {object} options
   */
  send (res, page, options) {
    if (page.sent || res.headersSent) {
      return
    }
    if (page.html === undefined) {
      // a 404 without a template of its own
      return res.status(page.status).type('text').send('Not found')
    }
    res.status(page.status)
    res.set({ 'Cache-Control': 'no-cache', ...(options.headers || {}) })
    res.type('html').send(page.html)
  }

  // ---------------------------------------------------------------- 404 and errors

  /**
   * @param {number} status 404, or the status of an error
   * @param {object} req
   * @param {Error} [error]
   * @returns {Promise<string|undefined>} the page of the status, from the template the helper was given; nothing when it has none
   */
  async statusPage (status, req, error) {
    const name = status === 404 ? this.notFoundTemplate : this.errorTemplate
    if (!name) {
      return undefined
    }
    // a message is shown only when the error says it may be (a 4xx of http-errors): the text of any other is for the log
    const message = error && error.expose === true && status < 500 ? error.message : ''
    const title = status === 404 ? 'Page not found' : status < 500 ? 'Request refused' : 'Something went wrong'
    return this.render(name, { status, title, message, url: _.get(req, 'path', '') })
  }

  /**
   * Answers an error with the error template; without one, or when that fails too, it is Express that answers it.
   * @param {Error} error
   * @param {object} req
   * @param {object} res
   * @param {function} next
   */
  async fail (error, req, res, next) {
    const status = [error.status, error.statusCode].find((value) => Number.isInteger(value) && value >= 400 && value <= 599) || 500
    if (status >= 500) {
      logger.error(`The page ${_.get(req, 'originalUrl', '')} failed:`, error)
    }
    if (res.headersSent || !this.errorTemplate) {
      return next(error)
    }
    try {
      res.status(status).set('Cache-Control', 'no-store').type('html').send(await this.statusPage(status, req, error))
    } catch (failure) {
      logger.error('The error template failed:', failure)
      next(error)
    }
  }

  /** @returns {function(object, object, function): Promise<void>} the middleware that goes last: the 404 page of a URL no route answered (plain text without a notFound template) */
  notFoundHandler () {
    return async (req, res, next) => {
      try {
        const html = await this.statusPage(404, req)
        if (html === undefined) {
          return res.status(404).type('text').send('Not found')
        }
        res.status(404).set('Cache-Control', 'no-store').type('html').send(html)
      } catch (error) {
        await this.fail(error, req, res, next)
      }
    }
  }

  /** @returns {function(Error, object, object, function): Promise<void>} the error middleware that goes after the routes: for what a route, or another middleware, throws */
  errorHandler () {
    return (error, req, res, next) => this.fail(error, req, res, next)
  }
}

module.exports = PageHelper
