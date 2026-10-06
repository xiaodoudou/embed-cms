const os = require('os')
const path = require('path')
const crypto = require('crypto')
const fs = require('fs-extra')
const express = require('express')
const { getCMSInstance, options: baseOptions } = require('./cmsInstance')

const ADMIN = ['localAdmin', 'localAdmin']

/**
 * Deletes a folder, trying again for a moment when the system says a file is still in use: on Windows the store of a database keeps its LOG file for a few milliseconds after it is
 * closed, and a test that passed must not fail while it is cleaning up.
 * @param {string} folder
 * @returns {Promise<void>}
 */
async function removeFolder (folder) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fs.remove(folder)
    } catch (error) {
      if (attempt >= 10 || !['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code)) {
        throw error
      }
      await new Promise(resolve => setTimeout(resolve, 100 * attempt))
    }
  }
}

/**
 * Boots an isolated in-process CMS on a random port with a temp data directory.
 * Replication peers are disabled so tests never open connections to other ports.
 * @param {object} overrides - CMS options merged over the shared test options
 * @param {object} [extra]
 * @param {string} [extra.dataDir] - reuse an existing data directory (a second boot on the same data)
 * @param {boolean} [extra.keepData] - do not delete the data directory on close
 * @param {function(import('express').Express): void} [extra.beforeMount] - runs on the host app before the CMS is mounted
 * @returns {Promise<{cms: object, server: object, url: string, dataDir: string, close: Function}>}
 */
async function startApp (overrides = {}, extra = {}) {
  const dataDir = extra.dataDir || await fs.mkdtemp(path.join(os.tmpdir(), 'embed-cms-test-'))
  const options = {
    ...baseOptions,
    syslog: undefined,
    replication: { peers: [], peersByResource: {} },
    ...overrides,
    data: dataDir,
    // the CMS reads and writes this file: keep it per app so options never leak between tests
    config: path.join(dataDir, 'cms.json')
  }
  const cms = getCMSInstance(options)
  const app = express()
  if (extra.beforeMount) {
    extra.beforeMount(app)
  }
  app.use(cms.express())
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s))
  })
  cms.options.port = server.address().port
  await cms.bootstrap(server)
  return {
    cms,
    server,
    dataDir,
    url: `http://localhost:${server.address().port}`,
    close: async () => {
      cms._closeSockets()
      await new Promise(resolve => {
        server.close(resolve)
        // open keep-alive and websocket connections would keep close() waiting
        server.closeAllConnections && server.closeAllConnections()
      })
      // flush and close the stores before their folder disappears, or a pending write fails with ENOENT
      await cms._closeDatabase()
      if (!extra.keepData) {
        await removeFolder(dataDir)
      }
    }
  }
}

/**
 * Random secret, generated per test run (never a literal in the repository).
 * @param {number} [bytes]
 * @returns {string}
 */
const randomSecret = (bytes = 24) => crypto.randomBytes(bytes).toString('hex')

/**
 * Options for a production like app: strong, freshly generated secrets, the strict secret policy and no built-in localAdmin.
 * The shared test options carry the published default session secret, which that policy refuses.
 * @param {object} [overrides]
 * @returns {object}
 */
const hardened = (overrides = {}) => ({
  auth: { secret: randomSecret() },
  session: { secret: randomSecret(), resave: true, saveUninitialized: true },
  ...overrides,
  security: { strongSecrets: true, localAdmin: false, ...(overrides.security || {}) }
})

/**
 * Creates a user in the admins group and returns its credentials.
 * @param {{cms: object}} app
 * @param {{username?: string, password?: string, group?: string}} [user]
 * @returns {Promise<{username: string, password: string, _id: string}>}
 */
async function createUser (app, user = {}) {
  const authentication = app.cms.$authentication
  const username = user.username || `user-${randomSecret(4)}`
  const password = user.password || randomSecret(12)
  const group = user.group || authentication.adminsGroup._id
  const created = await authentication.users.create({ username, password, group })
  return { username, password, _id: created._id }
}

/**
 * Runs a function with NODE_ENV set, restoring it afterwards.
 * @param {string|undefined} value
 * @param {function(): Promise<*>|*} fn
 * @returns {Promise<*>}
 */
async function withNodeEnv (value, fn) {
  const previous = process.env.NODE_ENV
  if (value === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = value
  }
  try {
    return await fn()
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previous
    }
  }
}

module.exports = { startApp, ADMIN, randomSecret, hardened, createUser, withNodeEnv }
