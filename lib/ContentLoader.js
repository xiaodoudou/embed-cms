/**
 * @fileoverview ContentLoader: puts content and files into the CMS from a JSON description, so that sample content, a first version of a site or a migration is a file rather than
 * code. One list of records for each resource, in the order they are made (the targets of relations first); a string `authors://mei-lin` in a `select` is the record of `authors` that has
 * `mei-lin` for its unique field; a string `attachment://files/cover.jpg` in a file field is a file, relative to the JSON file. A load can be run again: a record is matched by its unique
 * field and changed only if something differs, and a file is compared with the ones attached by its MD5. See docs/operations/CONTENT_LOADER.md.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { pipeline } = require('stream/promises')
const _ = require('lodash')
const mime = require('mime-types')
const { ATTACHMENT_INPUTS } = require('./util/inputTypes')

const ATTACHMENT = /^attachment:\/\/(.+)$/s
const REFERENCE = /^([\w-]+):\/\/(.+)$/s
// the key of an object that gives a file options (a name, an order, a crop): { "uri": "attachment://files/cover.jpg", "name": "harbour.jpg" }
const KEYWORD = 'uri'
const FILE_OPTIONS = ['name', 'order', 'cropOptions', 'imageMap', 'fields', 'contentType']
const DATE_INPUTS = ['date', 'datetime']

/** Everything that is wrong with a content file, found before anything is written. */
class ContentError extends Error {
  /** @param {Array<string>} problems what is wrong, each naming where (`articles[2].author`) */
  constructor (problems) {
    super(`The content has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.map((problem) => ` - ${problem}`).join('\n')}`)
    this.name = 'ContentError'
    this.problems = problems
  }
}

/** A reference to a record, written `resource://key`: it becomes the `_id` of the record when it is known. */
class Ref {
  /**
   * @param {string} resource
   * @param {string} key the value of the unique field of the record
   */
  constructor (resource, key) {
    this.resource = resource
    this.key = key
  }
}

/**
 * @param {*} existing what the record holds
 * @param {*} wanted what the content says
 * @returns {boolean} whether the record holds what the content says: every key of the content is there with the same value (a record has more keys than a content file mentions)
 */
function holds (existing, wanted) {
  if (_.isPlainObject(wanted)) {
    return _.isPlainObject(existing) && _.every(wanted, (value, key) => holds(existing[key], value))
  }
  if (Array.isArray(wanted)) {
    return Array.isArray(existing) && existing.length === wanted.length && wanted.every((value, index) => holds(existing[index], value))
  }
  return _.isEqual(existing, wanted)
}

class ContentLoader {
  /** @param {object} cms a CMS that has been bootstrapped: the content is written through `cms.api()` (hooks and unique checks apply) */
  constructor (cms) {
    if (!cms || typeof cms.api !== 'function') {
      throw new Error('ContentLoader needs the cms: new CMS.ContentLoader(cms)')
    }
    this.cms = cms
    this.api = cms.api()
  }

  /**
   * Loads content.
   * @param {string|object} source the path of a JSON file, or the content as an object
   * @param {object} [options]
   * @param {string} [options.basePath] the folder the paths of the files are relative to: the folder of the JSON file, the current folder for an object
   * @param {boolean} [options.dryRun] check and report, write nothing
   * @param {Object<string, string>} [options.keys] the field that names a record of a resource, when it is not its first unique field
   * @param {boolean} [options.strict] false: a field the resource does not declare is kept (true by default: it is reported, most often it is a typo)
   * @param {function(string): void} [options.log] told what is done to each record
   * @returns {Promise<{dryRun: boolean, created: number, updated: number, unchanged: number, files: {added: number, removed: number, unchanged: number}, resources: Object<string, object>}>}
   * @throws {ContentError} with every problem, before anything is written
   */
  async load (source, options = {}) {
    const { content, basePath } = this.read(source, options)
    const plan = await this.plan(content, basePath, options)
    return this.run(plan, options)
  }

  /**
   * @param {string|object} source
   * @param {object} options
   * @returns {{content: object, basePath: string}}
   */
  read (source, options) {
    let content = source
    let basePath = options.basePath || process.cwd()
    if (typeof source === 'string') {
      const file = path.resolve(source)
      try {
        const text = fs.readFileSync(file, 'utf8')
        // (a byte order mark, which some editors write at the start of a file, is not part of the JSON)
        content = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
      } catch (error) {
        throw new Error(`Cannot read the content file ${file}: ${error.message}`, { cause: error })
      }
      basePath = options.basePath || path.dirname(file)
    }
    if (!_.isPlainObject(content)) {
      throw new ContentError(['the content is an object with a list of records for each resource: { "articles": [ … ] }'])
    }
    return { content, basePath: path.resolve(basePath) }
  }

  // ---------------------------------------------------------------- what a resource is

  /**
   * @param {string} name
   * @param {object} options
   * @returns {Promise<object>} what is known of a resource: its declaration, the field that names a record, and the records it has
   */
  async info (name, options) {
    this.infos = this.infos || new Map()
    if (this.infos.has(name)) {
      return this.infos.get(name)
    }
    const declaration = this.api(name).options
    const schema = _.get(declaration, 'schema', [])
    const locales = _.get(declaration, 'locales') || []
    const keyField = _.get(options, ['keys', name]) || _.get(_.find(schema, 'unique'), 'field')
    const field = _.find(schema, { field: keyField })
    let keyPath = null
    if (keyField) {
      keyPath = locales.length > 0 && _.get(field, 'localised') !== false ? `${keyField}.${locales[0]}` : keyField
    }
    const single = !keyField && _.get(declaration, 'maxCount') === 1
    const records = await this.api(name).list({})
    const existing = new Map()
    if (single && records[0]) {
      existing.set('*', records[0])
    }
    for (const record of records) {
      const key = keyPath ? _.get(record, keyPath) : undefined
      if (!_.isNil(key) && key !== '') {
        existing.set(String(key), record)
      }
    }
    const info = { name, declaration, schema, locales, keyField, keyPath, single, existing, fields: _.keyBy(schema, 'field') }
    this.infos.set(name, info)
    return info
  }

  // ---------------------------------------------------------------- the plan: everything is checked, nothing is written

  /**
   * @param {object} content
   * @param {string} basePath
   * @param {object} options
   * @returns {Promise<Array<object>>} what to do, resource by resource
   * @throws {ContentError}
   */
  async plan (content, basePath, options) {
    const problems = []
    const context = { basePath, options, problems, order: new Map(), keys: new Map(), buffers: new Map() }
    const resources = []
    for (const [position, name] of Object.keys(content).entries()) {
      context.order.set(name, position)
      if (!_.includes(this.cms._resourceNames, name) || name.startsWith('_')) {
        problems.push(`${name}: ${name.startsWith('_') ? 'a resource of the CMS itself is not loaded here' : 'there is no such resource'}`)
        continue
      }
      const info = await this.info(name, options)
      const list = Array.isArray(content[name]) ? content[name] : [content[name]]
      const entries = []
      const seen = new Set()
      list.forEach((record, index) => {
        const where = `${name}[${index}]`
        if (!_.isPlainObject(record)) {
          problems.push(`${where}: a record is an object`)
          return
        }
        let key = '*'
        if (info.keyPath) {
          const value = _.get(record, info.keyPath)
          if (_.isNil(value) || value === '') {
            problems.push(`${where}: it has no ${info.keyPath}, which names a record of ${name}`)
            return
          }
          key = String(value)
        } else if (!info.single) {
          problems.push(`${name}: it has no unique field to tell its records apart: declare one, or name the field in the option \`keys\``)
          return
        }
        if (seen.has(key)) {
          problems.push(`${where}: ${info.single ? `${name} holds one record` : `${info.keyPath} "${key}" is there twice`}`)
          return
        }
        seen.add(key)
        entries.push({ record, where, key, index })
      })
      context.keys.set(name, new Map(entries.map((entry) => [entry.key, entry.index])))
      resources.push({ info, entries, position })
    }
    for (const resource of resources) {
      for (const entry of resource.entries) {
        Object.assign(entry, await this.convert(resource, entry, context))
      }
    }
    if (problems.length > 0) {
      throw new ContentError(problems)
    }
    return resources
  }

  /**
   * @param {{info: object, position: number}} resource
   * @param {{record: object, where: string, index: number}} entry
   * @param {object} context
   * @returns {Promise<{data: object, files: Object<string, Array<object>>}>} the record as it is written (references still to be resolved), and its files
   */
  async convert (resource, entry, context) {
    const { info } = resource
    const { record, where } = entry
    const data = {}
    const files = {}
    const known = new Set(info.schema.map((field) => field.field.split('.')[0]))
    if (context.options.strict !== false) {
      for (const key of Object.keys(record)) {
        if (!known.has(key)) {
          context.problems.push(`${where}.${key}: ${info.name} has no field "${key}" (declared: ${[...known].join(', ')})`)
        }
      }
    }
    for (const field of info.schema) {
      const value = _.get(record, field.field)
      if (value === undefined) {
        continue
      }
      const at = `${where}.${field.field}`
      if (_.includes(ATTACHMENT_INPUTS, field.input)) {
        files[field.field] = this.files(field, info, value, at, context)
      } else {
        _.set(data, field.field, await this.value(field, value, at, context, { resource, entry }))
      }
    }
    return { data, files }
  }

  /**
   * @param {object} field its declaration
   * @param {*} value what the content says
   * @param {string} at where, for a problem
   * @param {object} context
   * @param {{resource: object, entry: object}} origin the record, to say whether a reference points to something made before it
   * @returns {Promise<*>} the value as it is stored (a reference is a Ref until it is resolved)
   */
  async value (field, value, at, context, origin) {
    if ((field.input === 'select' || field.input === 'multiselect') && typeof field.source === 'string') {
      return this.references(value, field.source, at, context, origin)
    }
    if (_.includes(DATE_INPUTS, field.input)) {
      return this.dates(value, field.input, at, context)
    }
    if (field.input === 'paragraph') {
      return this.blocks(value, at, context, origin)
    }
    this.stray(value, at, context)
    return value
  }

  /** A text that looks like a reference or a file, in a field that takes neither, is most likely a mistake. */
  stray (value, at, context) {
    _.cloneDeepWith(value, (item) => {
      if (typeof item === 'string' && ATTACHMENT.test(item)) {
        context.problems.push(`${at}: "${item}" is a file, and this is not a file field`)
      }
      return undefined
    })
  }

  /**
   * @returns {Promise<*>} the references of a value, as Ref (one, a list, or one for each language)
   */
  async references (value, source, at, context, origin) {
    if (_.isNil(value)) {
      return value
    }
    if (Array.isArray(value)) {
      return Promise.all(value.map((item, index) => this.references(item, source, `${at}[${index}]`, context, origin)))
    }
    if (_.isPlainObject(value)) {
      return _.fromPairs(await Promise.all(Object.entries(value).map(async ([locale, item]) => [locale, await this.references(item, source, `${at}.${locale}`, context, origin)])))
    }
    const match = typeof value === 'string' ? REFERENCE.exec(value) : null
    if (!match) {
      context.problems.push(`${at}: a reference to ${source} is written "${source}://<${_.get(await this.info(source, context.options), 'keyPath', 'key')}>", not ${JSON.stringify(value)}`)
      return value
    }
    const [, resource, key] = match
    if (resource !== source) {
      context.problems.push(`${at}: this field points to ${source}, not to ${resource}`)
      return value
    }
    if (!_.includes(this.cms._resourceNames, resource)) {
      context.problems.push(`${at}: there is no resource ${resource}`)
      return value
    }
    const target = await this.info(resource, context.options)
    const index = context.keys.has(resource) ? context.keys.get(resource).get(key) : undefined
    if (target.existing.has(key)) {
      return new Ref(resource, key)
    }
    if (index === undefined) {
      context.problems.push(`${at}: there is no ${resource} with ${target.keyPath || 'a record'} "${key}"`)
    } else if (resource !== origin.resource.info.name && context.order.get(resource) > origin.resource.position) {
      context.problems.push(`${at}: "${key}" is made after this record: put ${resource} before ${origin.resource.info.name} in the file`)
    } else if (resource === origin.resource.info.name && index >= origin.entry.index) {
      context.problems.push(`${at}: "${key}" comes after this record in ${resource}: put it before`)
    }
    return new Ref(resource, key)
  }

  /** @returns {*} a date written as a text (`2026-10-01`, `2026-10-01T09:30:00Z`) as the timestamp the field keeps; a day is the start of that day, as the date field of the admin makes it */
  dates (value, input, at, context) {
    if (_.isPlainObject(value)) {
      return _.mapValues(value, (item, locale) => this.dates(item, input, `${at}.${locale}`, context))
    }
    if (typeof value !== 'string') {
      return value
    }
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    const time = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).getTime() : Date.parse(value)
    if (!Number.isFinite(time)) {
      context.problems.push(`${at}: "${value}" is not a date (write 2026-10-01, or 2026-10-01T09:30:00Z)`)
      return value
    }
    return time
  }

  /** The blocks of a paragraph field: the references and the dates inside them are read like those of a record. Files in blocks are not loaded. */
  async blocks (value, at, context, origin) {
    if (!Array.isArray(value)) {
      return value
    }
    const result = []
    for (const [index, block] of value.entries()) {
      const where = `${at}[${index}]`
      const type = _.get(block, '_type')
      const declaration = _.get(this.cms, ['_paragraphs', type])
      if (!declaration) {
        context.problems.push(`${where}: there is no block type "${type}"`)
        result.push(block)
        continue
      }
      const copy = { ...block }
      for (const field of declaration.schema) {
        if (_.get(block, field.field) === undefined) {
          continue
        }
        if (_.includes(ATTACHMENT_INPUTS, field.input)) {
          context.problems.push(`${where}.${field.field}: files in a block are not loaded: add them in the admin`)
          continue
        }
        _.set(copy, field.field, await this.value(field, _.get(block, field.field), `${where}.${field.field}`, context, origin))
      }
      result.push(copy)
    }
    return result
  }

  // ---------------------------------------------------------------- files

  /**
   * @param {object} field
   * @param {object} info the resource
   * @param {*} value `attachment://<path>`, a list of them, an object with options, or one for each language
   * @param {string} at
   * @param {object} context
   * @returns {Array<object>} the files of the field, each with the name it is attached under
   */
  files (field, info, value, at, context) {
    const localised = info.locales.length > 0 && field.localised !== false
    const isSpec = (item) => _.isPlainObject(item) && (_.has(item, KEYWORD) || _.has(item, 'buffer') || _.has(item, 'stream'))
    const specs = []
    const add = (item, name, where) => {
      if (Array.isArray(item)) {
        return item.forEach((one, index) => add(one, name, `${where}[${index}]`))
      }
      const spec = this.file(item, name, where, context)
      if (spec) {
        specs.push(spec)
      }
    }
    if (_.isNil(value)) {
      return specs
    }
    if (localised && _.isPlainObject(value) && !isSpec(value)) {
      _.each(value, (item, locale) => add(item, `${field.field}.${locale}`, `${at}.${locale}`))
    } else {
      add(value, localised ? `${field.field}.${info.locales[0]}` : field.field, at)
    }
    return specs
  }

  /**
   * @param {*} item a string `attachment://<path>`, or an object `{ "uri": "attachment://<path>", name, order, cropOptions, imageMap, fields, contentType }`, or from code `{ buffer, name }` or `{ stream, name }`
   * @param {string} name the name the file is attached under
   * @param {string} where
   * @param {object} context
   * @returns {object|undefined}
   */
  file (item, name, where, context) {
    const spec = { attachment: name, where }
    let relative
    if (typeof item === 'string') {
      const match = ATTACHMENT.exec(item)
      if (!match) {
        context.problems.push(`${where}: a file field takes "attachment://<path>", not ${JSON.stringify(item)}`)
        return undefined
      }
      relative = match[1]
    } else if (_.isPlainObject(item)) {
      Object.assign(spec, _.pick(item, FILE_OPTIONS))
      if (typeof item[KEYWORD] === 'string') {
        const match = ATTACHMENT.exec(item[KEYWORD])
        if (!match) {
          context.problems.push(`${where}: "uri" is "attachment://<path>", not ${JSON.stringify(item[KEYWORD])}`)
          return undefined
        }
        relative = match[1]
      } else if (Buffer.isBuffer(item.buffer)) {
        spec.buffer = item.buffer
      } else if (item.stream && typeof item.stream.pipe === 'function') {
        spec.stream = item.stream
      } else {
        context.problems.push(`${where}: a file is "attachment://<path>", or an object with "uri", "buffer" or "stream"`)
        return undefined
      }
    } else {
      context.problems.push(`${where}: a file field takes "attachment://<path>", not ${JSON.stringify(item)}`)
      return undefined
    }
    if (relative !== undefined) {
      const real = this.safePath(context.basePath, relative, where, context)
      if (!real) {
        return undefined
      }
      if (!context.buffers.has(real)) {
        context.buffers.set(real, fs.readFileSync(real))
      }
      spec.buffer = context.buffers.get(real)
      spec.path = real
      spec.filename = spec.name || path.basename(real)
    } else {
      spec.filename = spec.name
      if (!spec.filename) {
        context.problems.push(`${where}: give the file a name: { "buffer": …, "name": "cover.jpg" }`)
        return undefined
      }
    }
    spec.contentType = spec.contentType || mime.lookup(spec.filename) || 'application/octet-stream'
    spec.md5 = spec.buffer ? crypto.createHash('md5').update(spec.buffer).digest('hex') : undefined
    return spec
  }

  /**
   * @param {string} basePath
   * @param {string} relative
   * @param {string} where
   * @param {object} context
   * @returns {string|undefined} the real path of the file, when it is a file inside the folder of the content (a link that leads out of it does not count)
   */
  safePath (basePath, relative, where, context) {
    const target = path.resolve(basePath, relative)
    let real
    let base
    try {
      base = fs.realpathSync(basePath)
      real = fs.realpathSync(target)
    } catch {
      context.problems.push(`${where}: the file ${relative} does not exist (looked for ${target})`)
      return undefined
    }
    const inside = path.relative(base, real)
    if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) {
      context.problems.push(`${where}: ${relative} is outside the folder of the content (${basePath})`)
      return undefined
    }
    if (!fs.statSync(real).isFile()) {
      context.problems.push(`${where}: ${relative} is not a file`)
      return undefined
    }
    return real
  }

  // ---------------------------------------------------------------- the run

  /**
   * @param {Array<object>} plan
   * @param {object} options
   * @returns {Promise<object>} the report
   */
  async run (plan, options) {
    const dryRun = !!options.dryRun
    const log = typeof options.log === 'function' ? options.log : () => {}
    const report = { dryRun, created: 0, updated: 0, unchanged: 0, files: { added: 0, removed: 0, unchanged: 0 }, resources: {} }
    // the id of each record the run has made or found, by resource and key
    const ids = new Map()
    const idOf = (resource, key) => {
      const known = ids.get(resource)
      // (a record of a resource that is not in the content was found when the content was checked)
      return known && known.has(key) ? known.get(key) : this.infos.get(resource).existing.get(key)._id
    }
    for (const { info, entries } of plan) {
      const own = (report.resources[info.name] = { created: 0, updated: 0, unchanged: 0, files: { added: 0, removed: 0, unchanged: 0 } })
      ids.set(info.name, new Map())
      const api = this.api(info.name)
      for (const entry of entries) {
        const data = _.cloneDeepWith(entry.data, (value) => (value instanceof Ref ? idOf(value.resource, value.key) : undefined))
        const existing = info.existing.get(entry.key)
        let record = existing
        let outcome
        if (!existing) {
          outcome = 'created'
          if (!dryRun) {
            record = await api.create(data)
          }
        } else if (!holds(existing, data)) {
          outcome = 'updated'
          if (!dryRun) {
            record = await api.update(existing._id, data)
          }
        } else {
          outcome = 'unchanged'
        }
        own[outcome]++
        report[outcome]++
        ids.get(info.name).set(entry.key, _.get(record, '_id') || `(new ${info.name}/${entry.key})`)
        const done = await this.attach(api, record, entry.files, dryRun)
        for (const kind of ['added', 'removed', 'unchanged']) {
          own.files[kind] += done[kind]
          report.files[kind] += done[kind]
        }
        const detail = [done.added ? `${done.added} file${done.added === 1 ? '' : 's'} added` : '', done.removed ? `${done.removed} removed` : ''].filter(Boolean).join(', ')
        log(`${info.name}/${entry.key}: ${outcome}${detail ? `, ${detail}` : ''}`)
      }
    }
    return report
  }

  /**
   * The stream the CMS reads a file from. It has to come from a file (it has a `path`): the CMS looks at the first bytes of an upload to know what it is, and cannot of a stream
   * that is only in memory. A file of the content is read where it is; a buffer, or a stream from code, is written to a temporary file for the time of the upload.
   * @param {object} spec
   * @returns {Promise<{stream: import('stream').Readable, cleanup: function(): Promise<void>}>}
   */
  async open (spec) {
    if (spec.path) {
      return { stream: fs.createReadStream(spec.path), cleanup: async () => {} }
    }
    if (spec.stream && spec.stream.path) {
      return { stream: spec.stream, cleanup: async () => {} }
    }
    const temporary = path.join(os.tmpdir(), `embed-cms-load-${crypto.randomUUID()}${path.extname(spec.filename)}`)
    if (spec.buffer) {
      await fs.promises.writeFile(temporary, spec.buffer)
    } else {
      await pipeline(spec.stream, fs.createWriteStream(temporary))
    }
    return { stream: fs.createReadStream(temporary), cleanup: () => fs.promises.rm(temporary, { force: true }) }
  }

  /**
   * Makes the files of a record the ones the content says, for the fields it mentions: a file that is there already (same MD5) stays, another is added, one that is no longer
   * said is removed.
   * @param {object} api
   * @param {object|undefined} record the record as it is stored (nothing for a record a dry run would create)
   * @param {Object<string, Array<object>>} files
   * @param {boolean} dryRun
   * @returns {Promise<{added: number, removed: number, unchanged: number}>}
   */
  async attach (api, record, files, dryRun) {
    const done = { added: 0, removed: 0, unchanged: 0 }
    const wanted = _.groupBy(_.flatten(Object.values(files)), 'attachment')
    const fieldNames = new Set(Object.keys(files))
    const touched = new Set(_.flatMap(Object.values(files), (specs) => specs.map((spec) => spec.attachment)))
    // a field the content mentions with no file at all (an empty list) is emptied
    const attachments = _.get(record, '_attachments', [])
    const mentioned = attachments.filter((attachment) => [...fieldNames].some((field) => attachment._name === field || attachment._name.startsWith(`${field}.`)))
    for (const name of new Set([...touched, ..._.map(mentioned, '_name')])) {
      const specs = wanted[name] || []
      const there = attachments.filter((attachment) => attachment._name === name)
      const wantedMd5 = specs.map((spec) => spec.md5)
      for (const attachment of there) {
        if (wantedMd5.includes(attachment._md5sum)) {
          done.unchanged++
        } else {
          done.removed++
          if (!dryRun) {
            await api.removeAttachment(record._id, attachment._id)
          }
        }
      }
      const thereMd5 = there.map((attachment) => attachment._md5sum)
      for (const spec of specs) {
        if (spec.md5 && thereMd5.includes(spec.md5)) {
          continue
        }
        done.added++
        if (!dryRun) {
          const { stream, cleanup } = await this.open(spec)
          try {
            await api.createAttachment(record._id, {
              name,
              stream,
              contentType: spec.contentType,
              fields: { _filename: spec.filename, ...(spec.fields || {}) },
              ..._.pick(spec, ['order', 'cropOptions', 'imageMap'])
            })
          } finally {
            await cleanup()
          }
        }
      }
    }
    return done
  }
}

ContentLoader.ContentError = ContentError

module.exports = ContentLoader
