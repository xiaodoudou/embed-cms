// embed-cms in a container: the same program runs on a laptop and in the image. Everything that is a secret comes from the environment,
// which is where a container gets it (env_file: .env in compose.yaml), and nothing of it is written anywhere:
//
//   AUTH_SECRET, SESSION_SECRET   sign the login token and the cookie of the session (the CMS refuses to start in production without them)
//   ADMIN_USERNAME, ADMIN_PASSWORD   the first administrator: production has no localAdmin, so this is the way in
//
// The configuration that is not secret is cms.json, which is in the image. The CMS only writes that file when it is missing, so the secrets,
// which are given to the constructor, never land in it.
const path = require('path')
const express = require('express')
const CMS = require('embed-cms')

const PORT = Number(process.env.PORT) || 3000
// the one place the container writes to: a volume
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data')
const PRODUCTION = process.env.NODE_ENV === 'production'

/**
 * The value of a variable of the environment, without the spaces and the line end that a file edited on another system leaves.
 * @param {string} name
 * @returns {string|undefined}
 */
function env (name) {
  const value = (process.env[name] || '').trim()
  return value || undefined
}

/**
 * In production a secret that is missing stops the start with a message that names the variable (the CMS would say only that a secret is short).
 * @param {string} name
 * @returns {string|undefined}
 */
function secret (name) {
  const value = env(name)
  if (PRODUCTION && (!value || value.length < 32)) {
    console.error(`${name} is missing or shorter than 32 characters: put a long random value in .env (scripts/env.sh makes one)`)
    process.exit(1)
  }
  return value
}

const authSecret = secret('AUTH_SECRET')
const sessionSecret = secret('SESSION_SECRET')

const cms = new CMS({
  mid: 'webnode1',
  resources: path.join(__dirname, 'resources'),
  data: DATA,
  // the configuration that is not secret, kept in the image
  config: path.join(__dirname, 'cms.json'),
  // what a visitor may read without signing in: the notes, and nothing else
  anonymousRead: ['notes'],
  ...(authSecret ? { auth: { secret: authSecret } } : {}),
  ...(sessionSecret ? { session: { secret: sessionSecret } } : {})
})

/**
 * Makes the first administrator, once: when ADMIN_USERNAME and ADMIN_PASSWORD are in the environment and nobody has that name yet.
 * It never changes the password of an account that exists, so the variables can be taken out of .env after the first start.
 * @param {CMS} cms
 */
async function ensureAdmin (cms) {
  const username = env('ADMIN_USERNAME')
  const password = env('ADMIN_PASSWORD')
  if (!username || !password) {
    return
  }
  if (password.length < 12) {
    console.error('ADMIN_PASSWORD is shorter than 12 characters: no administrator was made')
    return
  }
  const api = cms.api()
  if ((await api('_users').find({ username }))?._id) {
    return
  }
  const admins = await api('_groups').find({ name: 'admins' })
  await api('_users').create({ username, password, group: admins._id })
  console.log(`The administrator ${username} was made`)
}

const app = express()
// what the healthcheck of the image asks: first, so that it answers whatever the CMS is doing
app.get('/healthz', (req, res) => res.json({ ok: true }))
app.use(cms.express())

const server = app.listen(PORT, async () => {
  await cms.bootstrap(server)
  await ensureAdmin(cms)
  await new CMS.ContentLoader(cms).load(path.join(__dirname, 'content.json'))
  console.log(`The CMS is at http://localhost:${PORT}/admin`)
})

// docker stop sends SIGTERM: close the databases, then leave with 0. The handler is called with no argument: it took the name of the signal
// that process.on passes for an error (in 3.0.4 and before), and a container that was stopped properly "failed" with exit code 1.
process
  .on('SIGTERM', () => cms.shutdown('SIGTERM')())
  .on('SIGINT', () => cms.shutdown('SIGINT')())
