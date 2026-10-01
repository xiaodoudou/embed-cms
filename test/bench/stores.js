/**
 * Benchmark of the key-value engines a resource can keep its records in, one process per engine and size, so that the
 * memory figures are not mixed. Every engine is used through the abstract-level interface, like JsonStore uses it.
 * Not part of the test run. Usage:
 *
 *   node --expose-gc test/bench/stores.js [--sizes 10000,100000] [--engines jsondown,sqlite,leveldb,mongodb,postgres]
 *   node test/bench/stores.js --crash [--engines jsondown,sqlite,leveldb] [--trials 5] [--pace 2]
 *
 * The first form measures speed and memory. The second kills the process in the middle of a stream of writes, and
 * counts what was acknowledged and is gone after the restart. --pace is the wait in milliseconds between two writes (2,
 * about 500 writes per second, is a busy site; 0 writes as fast as the engine answers).
 *
 * MongoDB and PostgreSQL are measured when BENCH_MONGODB_URL (host:port) and BENCH_POSTGRES_URL (host:port, with
 * POSTGRES_USER and POSTGRES_PASSWORD in the environment) are set. Every time is milliseconds, unless the name says
 * otherwise. The ranges are not measured on MongoDB and PostgreSQL: their engines do not take key ranges.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { performance, monitorEventLoopDelay } = require('perf_hooks')
const { createLocalEngine } = require('../../lib/db/leveldown/localEngines')

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}
const REMOTE = ['mongodb', 'postgres']

const random = (seed) => () => {
  seed |= 0
  seed = seed + 0x6D2B79F5 | 0
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
  return ((t ^ t >>> 14) >>> 0) / 4294967296
}
const WORDS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima']
const makeKey = (i) => `${(1700000000000 + i * 997).toString(36)}42424242${i.toString(36).padStart(6, '0')}`
const makeValue = (i, rnd) => JSON.stringify({
  _id: makeKey(i),
  title: { enUS: `${WORDS[i % 12]} ${WORDS[(i * 7) % 12]} ${i}`, zhCN: `标题 ${i}` },
  body: { enUS: Array.from({ length: 40 }, () => WORDS[Math.floor(rnd() * 12)]).join(' ') },
  price: Math.round(rnd() * 100000) / 100,
  stock: Math.floor(rnd() * 1000),
  tags: [WORDS[i % 12], WORDS[(i * 5) % 12]],
  published: rnd() > 0.5,
  _createdAt: 1700000000000 + i,
  _updatedAt: 1700000000000 + i * 3,
  _updatedBy: 'admins~localAdmin'
})

const dirSize = (dir) => {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size
  }
  return total
}
const mb = (bytes) => Math.round(bytes / 1024 / 1024 * 10) / 10

/**
 * The place an engine keeps its data in: a folder for the local engines, a database name on a server for the others.
 */
const makePlace = (engine) => REMOTE.includes(engine)
  ? `bench_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
  : fs.mkdtempSync(path.join(os.tmpdir(), `store-${engine}-`))

const openEngine = (engine, place) => {
  const options = { keyEncoding: 'utf8', valueEncoding: 'utf8' }
  if (engine === 'mongodb') {
    const MongoDOWN = require('../../lib/db/mongo/mongodown')
    return new MongoDOWN(`${process.env.BENCH_MONGODB_URL}/${place}/bench/{}`, options)
  }
  if (engine === 'postgres') {
    const PgDOWN = require('../../lib/db/postgres/pgdown')
    return new PgDOWN(`${process.env.BENCH_POSTGRES_URL}/${place}/bench/{}`, options)
  }
  return createLocalEngine(engine, place, options)
}

/**
 * The size of what an engine holds, and the removal of it.
 */
const placeSize = async (engine, place) => {
  if (engine === 'mongodb') {
    const { MongoClient } = require('mongodb')
    const client = new MongoClient(`mongodb://${process.env.BENCH_MONGODB_URL}`)
    try {
      const stats = await client.db(place).command({ dbStats: 1 })
      return mb(stats.storageSize + stats.indexSize)
    } finally {
      await client.close()
    }
  }
  if (engine === 'postgres') {
    const pool = postgresAdmin()
    try {
      const { rows } = await pool.query(`SELECT pg_database_size('${place}') AS size`)
      return mb(Number(rows[0].size))
    } finally {
      await pool.end()
    }
  }
  return mb(dirSize(place))
}
const removePlace = async (engine, place) => {
  if (engine === 'mongodb') {
    const { MongoClient } = require('mongodb')
    const client = new MongoClient(`mongodb://${process.env.BENCH_MONGODB_URL}`)
    await client.db(place).dropDatabase()
    await client.close()
  } else if (engine === 'postgres') {
    const pool = postgresAdmin()
    await pool.query(`DROP DATABASE IF EXISTS "${place}" WITH (FORCE)`)
    await pool.end()
  } else {
    fs.rmSync(place, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
}
const postgresAdmin = () => {
  const { Client } = require('pg')
  const [host, port] = process.env.BENCH_POSTGRES_URL.split(':')
  const client = new Client({ host, port: Number(port) || 5432, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: 'postgres' })
  const connected = client.connect()
  return {
    query: async (text) => { await connected; return client.query(text) },
    end: async () => { await connected; await client.end() }
  }
}
// the postgres engine creates the database when it is missing, and reads its login from the environment
const prepareServer = async (engine, place) => {
  if (engine === 'postgres') {
    const pool = postgresAdmin()
    await pool.query(`CREATE DATABASE "${place}"`)
    await pool.end()
    Object.assign(process.env, { POSTGRES_HOST: process.env.BENCH_POSTGRES_URL.split(':')[0], POSTGRES_PORT: process.env.BENCH_POSTGRES_URL.split(':')[1] || '5432', POSTGRES_DB: place })
  }
}

const timed = async (fn) => {
  const started = performance.now()
  const detail = await fn()
  return { ms: Math.round((performance.now() - started) * 10) / 10, ...detail }
}

const child = async (engine, size) => {
  process.env.LOG_LEVEL = 'error'
  const place = makePlace(engine)
  await prepareServer(engine, place)
  const remote = REMOTE.includes(engine)
  const rnd = random(size)
  const result = { engine, size }
  const rss = () => { global.gc && global.gc(); return mb(process.memoryUsage().rss) }
  let db = openEngine(engine, place)
  await db.open()

  // load: batches of 1000, what an import does
  result.load = (await timed(async () => {
    for (let from = 0; from < size; from += 1000) {
      const ops = []
      for (let i = from; i < Math.min(size, from + 1000); i++) {
        ops.push({ type: 'put', key: makeKey(i), value: makeValue(i, rnd) })
      }
      await db.batch(ops)
    }
  })).ms
  // close: for jsondown this is the flush of the whole file
  result.closeAfterLoad = (await timed(() => db.close())).ms
  result.diskMB = await placeSize(engine, place)

  // reopen: the start of the server
  db = openEngine(engine, place)
  result.open = (await timed(() => db.open())).ms
  result.rssAfterOpenMB = rss()

  const keyAt = () => makeKey(Math.floor(rnd() * size))
  result.get20k = (await timed(async () => {
    for (let n = 0; n < 20000; n++) {
      await db.get(keyAt())
    }
  })).ms
  if (!remote) {
    result.range200x50 = (await timed(async () => {
      for (let n = 0; n < 200; n++) {
        const start = Math.floor(rnd() * Math.max(1, size - 50))
        const rows = await db.iterator({ gte: makeKey(start), limit: 50 }).all()
        if (rows.length === 0) throw new Error('empty range')
      }
    })).ms
  }
  result.scanAll = (await timed(async () => {
    let parsed = 0
    for await (const [, value] of db.iterator()) {
      JSON.parse(value)
      parsed++
    }
    return { parsed }
  })).ms
  result.rssAfterScanMB = rss()

  // single writes, awaited one by one, what the REST API does: updates of existing records, then new records. The
  // first two are written as the engine takes them without being asked to sync, the last two the way JsonStore writes
  // them (sync: true), which is when the data is on disk and not only handed to the operating system
  const histogram = monitorEventLoopDelay({ resolution: 1 })
  histogram.enable()
  result.update2k = (await timed(async () => {
    for (let n = 0; n < 2000; n++) {
      const i = Math.floor(rnd() * size)
      await db.put(makeKey(i), makeValue(i, rnd))
    }
  })).ms
  result.create1k = (await timed(async () => {
    for (let n = 0; n < 1000; n++) {
      await db.put(makeKey(size + n), makeValue(size + n, rnd))
    }
  })).ms
  result.update300Sync = (await timed(async () => {
    for (let n = 0; n < 300; n++) {
      const i = Math.floor(rnd() * size)
      await db.put(makeKey(i), makeValue(i, rnd), { sync: true })
    }
  })).ms
  histogram.disable()
  result.loopMaxMs = Math.round(histogram.max / 1e6)
  result.closeAfterWrites = (await timed(() => db.close())).ms
  result.diskFinalMB = await placeSize(engine, place)
  console.log(JSON.stringify(result))
  await removePlace(engine, place)
}

/**
 * The crash test: a child writes records one by one, the way the REST API does (sync: true), and reports each record
 * once the write is answered. The parent kills it without warning, opens the store again and looks for every record
 * that was reported. A write that was answered and is not there is lost data.
 */
const crashChild = async (engine, place, preload, pace) => {
  process.env.LOG_LEVEL = 'error'
  await prepareServer(engine, place)
  const rnd = random(7)
  let db = openEngine(engine, place)
  await db.open()
  const ops = []
  for (let i = 0; i < preload; i++) {
    ops.push({ type: 'put', key: makeKey(i), value: makeValue(i, rnd) })
  }
  await db.batch(ops)
  // the content that is there before the crash: closed properly, and opened again
  await db.close()
  db = openEngine(engine, place)
  await db.open()
  for (let i = preload; ; i++) {
    await db.put(makeKey(i), makeValue(i, rnd), { sync: true })
    fs.writeSync(1, `${i}\n`)
    if (pace > 0) {
      await new Promise(resolve => setTimeout(resolve, pace))
    }
  }
}

const crashTrial = async (engine, preload, pace) => {
  const place = makePlace(engine)
  const child = spawn(process.execPath, ['--no-warnings', __filename, '--crash-child', engine, place, String(preload), String(pace)], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit']
  })
  let last = -1
  let buffer = ''
  let killed = false
  const kill = () => { killed = true; child.kill('SIGKILL') }
  const exited = new Promise(resolve => child.on('exit', resolve))
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      last = Number(line)
      // from the first answered write on, wait a random moment and pull the plug
      if (!killed && !child.timer) {
        child.timer = setTimeout(kill, 300 + Math.random() * 900)
      }
    }
  })
  await exited
  clearTimeout(child.timer)
  const result = { engine, answered: last < 0 ? 0 : last - preload + 1, lost: 0, preloadMissing: 0, opened: true }
  try {
    const db = openEngine(engine, place)
    await db.open()
    const present = new Set(await db.keys().all())
    for (let i = 0; i < preload; i++) {
      if (!present.has(makeKey(i))) result.preloadMissing++
    }
    for (let i = preload; i <= last; i++) {
      if (!present.has(makeKey(i))) result.lost++
    }
    await db.close()
  } catch (error) {
    result.opened = false
    result.error = error.message.slice(0, 100)
  }
  await removePlace(engine, place).catch(() => {})
  return result
}

const crashMain = async () => {
  const engines = option('engines', 'jsondown,sqlite,leveldb').split(',')
  const trials = Number(option('trials', '5'))
  const preload = 2000
  const pace = Number(option('pace', '2'))
  const rows = []
  for (const engine of engines) {
    const results = []
    for (let n = 0; n < trials; n++) {
      results.push(await crashTrial(engine, preload, pace))
    }
    const sum = (key) => results.reduce((total, result) => total + result[key], 0)
    rows.push({
      engine,
      trials,
      opened: `${results.filter(result => result.opened).length}/${trials}`,
      answeredPerTrial: Math.round(sum('answered') / trials),
      lostPerTrial: Math.round(sum('lost') / trials),
      lostWorst: Math.max(...results.map(result => result.lost)),
      olderRecordsLost: sum('preloadMissing')
    })
  }
  console.log(JSON.stringify(rows, null, 2))
  console.log(`\n${'engine'.padEnd(12)}${'opens again'.padStart(13)}${'answered'.padStart(10)}${'lost avg'.padStart(10)}${'lost worst'.padStart(12)}${'older lost'.padStart(12)}`)
  for (const row of rows) {
    console.log(`${row.engine.padEnd(12)}${row.opened.padStart(13)}${String(row.answeredPerTrial).padStart(10)}${String(row.lostPerTrial).padStart(10)}${String(row.lostWorst).padStart(12)}${String(row.olderRecordsLost).padStart(12)}`)
  }
}

const main = () => {
  const sizes = option('sizes', '10000,100000').split(',').map(Number)
  const engines = option('engines', 'jsondown,sqlite,leveldb').split(',')
  const rows = []
  for (const size of sizes) {
    for (const engine of engines) {
      const run = spawnSync(process.execPath, ['--expose-gc', '--no-warnings', __filename, '--child', engine, String(size)], {
        encoding: 'utf8',
        env: process.env
      })
      const line = (run.stdout || '').trim().split('\n').pop()
      try {
        rows.push(JSON.parse(line))
      } catch {
        console.error(`${engine} ${size} failed:`, (run.stderr || run.stdout || '').slice(0, 600))
      }
    }
  }
  console.log(JSON.stringify(rows, null, 2))
  if (rows.length) {
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))].filter(key => !['engine', 'size'].includes(key))
    console.log(`\n${'metric'.padEnd(18)}${rows.map(row => `${row.engine}/${row.size}`.padStart(22)).join('')}`)
    for (const key of keys) {
      console.log(`${key.padEnd(18)}${rows.map(row => String(row[key] === undefined ? '-' : row[key]).padStart(22)).join('')}`)
    }
  }
}

const fail = (error) => { console.error(error); process.exit(1) }
if (args[0] === '--child') {
  child(args[1], Number(args[2])).then(() => process.exit(0), fail)
} else if (args[0] === '--crash-child') {
  crashChild(args[1], args[2], Number(args[3]), Number(args[4])).catch(fail)
} else if (args.includes('--crash')) {
  crashMain().then(() => process.exit(0), fail)
} else {
  main()
}
