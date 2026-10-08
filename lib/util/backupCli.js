// The cms-backup and cms-restore commands (bin/cmsBackup.js, bin/cmsRestore.js), see docs/operations/BACKUP.md.
// Two ways to take a copy of a site:
//   files  copies the data folder (and cms.json) of a stopped server. Every _id, date and file is kept as it was.
//   api    reads a running server over REST and writes a payload (content.json and files/) that cms-load replays. The records get new _id when they are loaded again.
const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const loadCli = require('./loadCli')
const pkg = require('../../package.json')

const FILE_INPUTS = ['file', 'image', 'cropimage', 'imagemap']
const DATE_INPUTS = ['date', 'datetime']
const PAGE = 100

const BACKUP_USAGE = `Usage: cms-backup <files|api> [options]

Takes a copy of a site into a new folder <out>/embed-cms-backup-<date>/.

  files   copies the data folder and cms.json of this project. Stop the server first.
          Every _id, date and file is kept, so the copy is the site as it was.
  api     reads a running server over its REST API and writes content.json and files/, which cms-load replays.
          Works from another machine. The records get NEW _id when they are loaded again (relations are rebuilt from unique fields).
          Users, groups and settings (_users, _groups, _settings) are not exported.

Options for both:
  --out <folder>        where the backup folder is made (default: ./backups)
Options for files:
  --config <file>       the cms.json of the project (default: ./cms.json)
  --server-stopped      say that the server is stopped (required: a copy of a running store can be broken)
Options for api:
  --url <address>       the server to read (default: $EMBED_CMS_URL, else http://localhost:9990)
  --user <name>         a user that may read the resources (the password is $EMBED_CMS_PASSWORD, or --password)
  --token <token>       a login token instead of user and password (default: $EMBED_CMS_TOKEN)
  --resources a,b       only these resources (default: all except the system ones)
  -h, --help            this text

Exit code: 0 when it is done, 2 for a wrong command, 3 when the copy failed.`

const RESTORE_USAGE = `Usage: cms-restore <files|api> <backup folder> [options]

Puts a backup made by cms-backup back. Stop the server first.

  files   puts the data folder back. The data folder that is there is moved aside to <data>.replaced-<date>, never deleted.
          Every _id comes back as it was.
  api     loads content.json and files/ into the CMS of this project with cms-load. The records get NEW _id.
          Records that match a unique field are updated, the others are created, nothing is deleted.

Options:
  --config <file>       the cms.json of the project (default: ./cms.json)
  --server-stopped      say that the server is stopped (required)
  --with-config         files: also put the saved cms.json back (it holds the secrets; by default the one of the project stays)
  --dry-run             api: check and say what would change, write nothing
  -h, --help            this text

Exit code: 0 when it is done, 1 when the content has problems (api), 2 for a wrong command, 3 when the restore failed.`

const stamp = (date = new Date()) => date.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
const safe = (name) => String(name).replace(/[^\w.-]+/g, '_').replace(/^\.+/, '_') || '_'
const withoutSlash = (url) => url.replace(/\/+$/, '')

/**
 * @param {string[]} argv what follows the command
 * @param {object} env the environment
 * @returns {object} the options, with `error` or `help` when the command cannot run
 */
function parseArguments (argv, env = {}) {
  const parsed = { positional: [], out: 'backups', config: 'cms.json', url: env.EMBED_CMS_URL || 'http://localhost:9990', password: env.EMBED_CMS_PASSWORD, token: env.EMBED_CMS_TOKEN, resources: [], serverStopped: false, withConfig: false, dryRun: false }
  const withValue = { '--out': 'out', '--config': 'config', '--url': 'url', '--user': 'user', '--password': 'password', '--token': 'token' }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '-h' || arg === '--help') {
      return { ...parsed, help: true }
    } else if (arg === '--server-stopped') {
      parsed.serverStopped = true
    } else if (arg === '--with-config') {
      parsed.withConfig = true
    } else if (arg === '--dry-run') {
      parsed.dryRun = true
    } else if (arg === '--resources') {
      const value = argv[++index]
      if (!value || value.startsWith('--')) {
        return { ...parsed, error: '--resources needs a list' }
      }
      parsed.resources = value.split(',').map(name => name.trim()).filter(Boolean)
    } else if (withValue[arg]) {
      const value = argv[++index]
      if (value === undefined || value.startsWith('--')) {
        return { ...parsed, error: `${arg} needs a value` }
      }
      parsed[withValue[arg]] = value
    } else if (arg.startsWith('-')) {
      return { ...parsed, error: `unknown option ${arg}` }
    } else {
      parsed.positional.push(arg)
    }
  }
  return parsed
}

/** @returns {string} the data folder named by a cms.json, as an absolute path */
function dataFolder (configFile) {
  const file = path.resolve(configFile)
  let data = './data'
  if (fs.existsSync(file)) {
    data = JSON.parse(fs.readFileSync(file, 'utf8')).data || data
  }
  return path.resolve(path.dirname(file), data)
}

function newBackupFolder (out, kind) {
  const folder = path.resolve(out, `embed-cms-backup-${stamp()}-${kind}`)
  fs.mkdirSync(folder, { recursive: true })
  return folder
}

const inside = (folder, parent) => { const relative = path.relative(parent, folder); return !relative.startsWith('..') && !path.isAbsolute(relative) }

/** The files mode: a copy of the data folder and of cms.json. */
function backupFiles (options, io) {
  if (!options.serverStopped) {
    io.err('cms-backup: stop the server, then say so with --server-stopped. A copy of a store that is being written can be broken, and sqlite and jsondown stores are not even locked.')
    return 2
  }
  const data = dataFolder(options.config)
  if (!fs.existsSync(data)) {
    io.err(`cms-backup: the data folder ${data} does not exist (looked for it from ${path.resolve(options.config)})`)
    return 3
  }
  if (inside(path.resolve(options.out), data)) {
    io.err('cms-backup: --out is inside the data folder; choose a folder outside it')
    return 2
  }
  const folder = newBackupFolder(options.out, 'files')
  fs.cpSync(data, path.join(folder, 'data'), { recursive: true })
  if (fs.existsSync(options.config)) {
    fs.copyFileSync(options.config, path.join(folder, 'cms.json'))
  }
  const manifest = { kind: 'files', createdAt: new Date().toISOString(), embedCms: pkg.version, data }
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2))
  io.out(`Backup written to ${folder}`)
  io.out('It holds the data folder and cms.json (secrets included: keep it private). Restoring it brings back every _id, date and file as they were.')
  return 0
}

/** The files mode, the other way. */
function restoreFiles (backup, options, io) {
  if (!options.serverStopped) {
    io.err('cms-restore: stop the server, then say so with --server-stopped')
    return 2
  }
  const saved = path.join(backup, 'data')
  if (!fs.existsSync(saved)) {
    io.err(`cms-restore: ${backup} has no data folder; it is not a files backup`)
    return 3
  }
  const data = dataFolder(options.config)
  if (fs.existsSync(data)) {
    const aside = `${data}.replaced-${stamp()}`
    fs.renameSync(data, aside)
    io.out(`The data folder that was there is kept at ${aside}`)
  }
  fs.cpSync(saved, data, { recursive: true })
  if (options.withConfig && fs.existsSync(path.join(backup, 'cms.json'))) {
    if (fs.existsSync(options.config)) {
      fs.copyFileSync(options.config, `${options.config}.replaced-${stamp()}`)
    }
    fs.copyFileSync(path.join(backup, 'cms.json'), options.config)
  }
  io.out(`Restored ${data}. Every _id is as it was. Start the server and look through the content.`)
  return 0
}

/** A small client of the REST API of a running CMS. */
function client (options) {
  const base = withoutSlash(options.url)
  const headers = {}
  if (options.token) {
    headers['x-access-token'] = options.token
  } else if (options.user) {
    headers.authorization = `Basic ${Buffer.from(`${options.user}:${options.password || ''}`).toString('base64')}`
  }
  const get = async (route) => {
    const response = await fetch(base + route, { headers })
    if (!response.ok) {
      throw new Error(`GET ${route} answered ${response.status}${response.status === 401 ? ' (give --user and a password, or --token)' : ''}`)
    }
    return response
  }
  return { get, base }
}

const uniqueField = (resource) => (resource.schema || []).find(field => field.unique)

/** The value that names a record: its first unique field, in the first language when it is localised. */
function keyOf (resource, record) {
  const field = uniqueField(resource)
  if (!field) {
    return undefined
  }
  let value = record[field.field]
  if (value && typeof value === 'object') {
    value = value[(resource.locales || [])[0]] ?? Object.values(value)[0]
  }
  return value === undefined || value === null || value === '' ? undefined : String(value)
}

/** Puts the resources in the order they can be loaded: the targets of relations first. */
function ordered (resources) {
  const names = resources.map(resource => resource.name)
  const done = []
  const visit = (resource, trail) => {
    if (done.includes(resource.name) || trail.includes(resource.name)) {
      return
    }
    for (const field of resource.schema || []) {
      const target = resources.find(other => other.name === field.source)
      if (target && target.name !== resource.name && names.includes(target.name)) {
        visit(target, [...trail, resource.name])
      }
    }
    done.push(resource.name)
  }
  resources.forEach(resource => visit(resource, []))
  return done.map(name => resources.find(resource => resource.name === name))
}

async function readAll (api, resource) {
  const records = []
  for (let page = 0; ; page++) {
    const response = await api.get(`/api/${encodeURIComponent(resource)}?limit=${PAGE}&page=${page}`)
    const batch = await response.json()
    records.push(...batch)
    const total = Number(response.headers.get('numRecords'))
    if (batch.length < PAGE || (Number.isFinite(total) && records.length >= total)) {
      return records
    }
  }
}

/** The api mode: reads a running server and writes content.json and files/. */
async function backupApi (options, io) {
  const api = client(options)
  const warnings = []
  const warn = (text) => { warnings.push(text); io.err(`warning: ${text}`) }
  let declarations
  try {
    declarations = Object.values(await (await api.get('/resources')).json())
  } catch (error) {
    io.err(`cms-backup: ${options.url} could not be read: ${error.message}`)
    return 3
  }
  let resources = declarations.filter(resource => resource.name && !resource.name.startsWith('_'))
  if (options.resources.length) {
    const unknown = options.resources.filter(name => !resources.some(resource => resource.name === name))
    if (unknown.length) {
      io.err(`cms-backup: no such resource: ${unknown.join(', ')} (the server has: ${resources.map(resource => resource.name).join(', ')})`)
      return 2
    }
    resources = resources.filter(resource => options.resources.includes(resource.name))
  }
  resources = ordered(resources)
  const folder = newBackupFolder(options.out, 'api')
  try {
    const records = {}
    for (const resource of resources) {
      records[resource.name] = await readAll(api, resource.name)
      io.out(`${resource.name}: ${records[resource.name].length} records`)
    }
    // the id of a record → the value that names it, to write a relation as resource://value
    const keys = {}
    for (const resource of resources) {
      keys[resource.name] = new Map(records[resource.name].map(record => [record._id, keyOf(resource, record)]))
    }
    const content = {}
    const counts = {}
    let files = 0
    for (const resource of resources) {
      const fields = resource.schema || []
      const known = new Set(fields.map(field => field.field.split('.')[0]))
      if (!uniqueField(resource) && resource.maxCount !== 1 && records[resource.name].length) {
        warn(`${resource.name} has no unique field: cms-load refuses it. Add a unique field before you restore, or restore with --key`)
      }
      if (fields.some(field => field.input === 'paragraph')) {
        warn(`${resource.name}: the files and the relations inside paragraph blocks are not carried by a payload`)
      }
      content[resource.name] = []
      for (const record of records[resource.name]) {
        const where = keys[resource.name].get(record._id) || record._id
        const out = {}
        for (const key of Object.keys(record)) {
          if (known.has(key) && !FILE_INPUTS.includes((fields.find(field => field.field === key) || {}).input)) {
            out[key] = record[key]
          }
        }
        for (const field of fields) {
          const value = record[field.field]
          if (value === undefined || value === null) {
            continue
          }
          if ((field.input === 'select' || field.input === 'multiselect') && typeof field.source === 'string') {
            const refer = (id) => {
              const key = keys[field.source] && keys[field.source].get(id)
              if (key === undefined) {
                warn(`${resource.name}/${where}.${field.field}: ${id} points to a ${field.source} that is not in the backup or has no unique value; left out`)
              }
              return key === undefined ? undefined : `${field.source}://${key}`
            }
            const convert = (item) => Array.isArray(item) ? item.map(refer).filter(Boolean) : refer(item)
            out[field.field] = field.localised && value && typeof value === 'object' && !Array.isArray(value)
              ? Object.fromEntries(Object.entries(value).map(([locale, item]) => [locale, convert(item)]))
              : convert(value)
          } else if (DATE_INPUTS.includes(field.input)) {
            const date = (item) => typeof item === 'number' ? new Date(item).toISOString() : item
            out[field.field] = value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).map(([locale, item]) => [locale, date(item)])) : date(value)
          } else if (FILE_INPUTS.includes(field.input)) {
            const attachments = (Array.isArray(value) ? value : []).filter(item => item && item.url)
            const taken = new Set()
            const specs = []
            for (const attachment of attachments) {
              const name = safe(attachment._filename || (attachment._fields && attachment._fields._filename) || attachment._id)
              const stored = taken.has(name) ? `${taken.size}-${name}` : name
              taken.add(name)
              const relative = ['files', safe(resource.name), safe(where), safe(field.field), stored].join('/')
              const target = path.join(folder, ...relative.split('/'))
              fs.mkdirSync(path.dirname(target), { recursive: true })
              const response = await api.get(attachment.url)
              await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(target))
              files++
              const extra = {}
              for (const key of ['order', 'cropOptions', 'imageMap']) {
                if (attachment[key] !== undefined) {
                  extra[key] = attachment[key]
                }
              }
              specs.push(stored !== name || Object.keys(extra).length ? { uri: `attachment://${relative}`, name, ...extra } : `attachment://${relative}`)
            }
            if (specs.length) {
              out[field.field] = specs.length === 1 && field.options && field.options.maxCount === 1 ? specs[0] : specs
            }
          }
        }
        content[resource.name].push(out)
      }
      counts[resource.name] = content[resource.name].length
    }
    fs.writeFileSync(path.join(folder, 'content.json'), JSON.stringify(content, null, 2))
    const manifest = { kind: 'api', createdAt: new Date().toISOString(), embedCms: pkg.version, source: withoutSlash(options.url), records: counts, files, warnings }
    fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2))
    io.out(`Backup written to ${folder} (${Object.values(counts).reduce((sum, count) => sum + count, 0)} records, ${files} files, ${warnings.length} warnings)`)
    io.out('Loading it again with cms-restore api creates the records with NEW _id. Anything that stores an _id outside the CMS (a link, another system) will not find them. Use a files backup to keep the _id.')
    return 0
  } catch (error) {
    io.err(`cms-backup: ${error.message}. What was written so far is in ${folder}`)
    return 3
  }
}

/** The api mode, the other way: cms-load on the payload. */
async function restoreApi (backup, options, io) {
  if (!options.serverStopped) {
    io.err('cms-restore: stop the server, then say so with --server-stopped (the loader starts the CMS itself)')
    return 2
  }
  const file = path.join(backup, 'content.json')
  if (!fs.existsSync(file)) {
    io.err(`cms-restore: ${backup} has no content.json; it is not an api backup`)
    return 3
  }
  io.out('The records are created with new _id. Records that match a unique field are updated; nothing is deleted.')
  return loadCli.main([file, '--config', options.config, ...(options.dryRun ? ['--dry-run'] : [])], io)
}

const consoleIo = { out: (text) => console.log(text), err: (text) => console.error(text) }

/**
 * @param {string[]} argv what follows `cms-backup`
 * @returns {Promise<number>} the exit code
 */
async function backup (argv, env = process.env, io = consoleIo) {
  const options = parseArguments(argv, env)
  if (options.help) {
    io.out(BACKUP_USAGE)
    return 0
  }
  const [mode] = options.positional
  const error = options.error || (!['files', 'api'].includes(mode) ? 'say files or api' : options.positional.length > 1 ? `unexpected ${options.positional[1]}` : '')
  if (error) {
    io.err(`cms-backup: ${error}\n${BACKUP_USAGE}`)
    return 2
  }
  try {
    return mode === 'files' ? backupFiles(options, io) : await backupApi(options, io)
  } catch (failure) {
    io.err(`cms-backup: ${failure.message}`)
    return 3
  }
}

/**
 * @param {string[]} argv what follows `cms-restore`
 * @returns {Promise<number>} the exit code
 */
async function restore (argv, env = process.env, io = consoleIo) {
  const options = parseArguments(argv, env)
  if (options.help) {
    io.out(RESTORE_USAGE)
    return 0
  }
  const [mode, folder] = options.positional
  const error = options.error || (!['files', 'api'].includes(mode) ? 'say files or api' : !folder ? 'say which backup folder' : options.positional.length > 2 ? `unexpected ${options.positional[2]}` : '')
  if (error) {
    io.err(`cms-restore: ${error}\n${RESTORE_USAGE}`)
    return 2
  }
  try {
    return mode === 'files' ? restoreFiles(path.resolve(folder), options, io) : await restoreApi(path.resolve(folder), options, io)
  } catch (failure) {
    io.err(`cms-restore: ${failure.message}`)
    return 3
  }
}

module.exports = { backup, restore, parseArguments, keyOf, ordered }
