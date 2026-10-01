const crypto = require('crypto')
const { Client } = require('pg')
const { MongoClient } = require('mongodb')

/**
 * The storage engines the driver contract suite runs against. The json file store, SQLite and LevelDB are always there; PostgreSQL and MongoDB
 * take part when a server answers (TEST_POSTGRES_URL, default postgres://postgres:postgres@localhost:5432/postgres;
 * TEST_MONGODB_URL, default mongodb://localhost:27017). Each run works in a database of its own, dropped afterwards.
 * @returns {Array<{name: string, prepare: function(): Promise<null|{options: object, teardown: function(): Promise<void>}>}>}
 *   prepare resolves with null when the engine is not available
 */
function engines () {
  return [
    {
      name: 'json file store',
      prepare: async () => ({ options: { dbEngine: { type: 'jsondown' } }, teardown: async () => {} })
    },
    {
      name: 'SQLite',
      prepare: async () => ({ options: { dbEngine: { type: 'sqlite' } }, teardown: async () => {} })
    },
    {
      name: 'LevelDB',
      prepare: async () => ({ options: { dbEngine: { type: 'leveldb' } }, teardown: async () => {} })
    },
    {
      name: 'PostgreSQL',
      prepare: async () => {
        const url = new URL(process.env.TEST_POSTGRES_URL || 'postgres://postgres:postgres@localhost:5432/postgres')
        const connection = { host: url.hostname, port: Number(url.port) || 5432, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1) || 'postgres' }
        const admin = new Client({ ...connection, connectionTimeoutMillis: 2000 })
        try {
          await admin.connect()
        } catch {
          return null
        }
        const database = `embedcms_contract_${crypto.randomBytes(4).toString('hex')}`
        await admin.query(`CREATE DATABASE "${database}"`)
        // the driver reads these when it is created
        const keys = ['POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD']
        const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
        Object.assign(process.env, { POSTGRES_HOST: connection.host, POSTGRES_PORT: String(connection.port), POSTGRES_DB: database, POSTGRES_USER: connection.user, POSTGRES_PASSWORD: connection.password })
        return {
          options: { dbEngine: { type: 'postgres', url: `${connection.host}:${connection.port}/${database}` } },
          teardown: async () => {
            keys.forEach(key => previous[key] === undefined ? delete process.env[key] : (process.env[key] = previous[key]))
            await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
            await admin.end()
          }
        }
      }
    },
    {
      name: 'MongoDB',
      prepare: async () => {
        const url = process.env.TEST_MONGODB_URL || 'mongodb://localhost:27017'
        const client = new MongoClient(url, { serverSelectionTimeoutMS: 2000 })
        try {
          await client.connect()
          await client.db('admin').command({ ping: 1 })
        } catch {
          await client.close().catch(() => {})
          return null
        }
        const database = `embedcms_contract_${crypto.randomBytes(4).toString('hex')}`
        const host = url.replace(/^mongodb(\+srv)?:\/\//, '')
        return {
          options: { dbEngine: { type: 'mongodb', url: `${host}/${database}` } },
          teardown: async () => {
            await client.db(database).dropDatabase()
            await client.close()
          }
        }
      }
    }
  ]
}

module.exports = { engines }
