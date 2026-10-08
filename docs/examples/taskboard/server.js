// Boardwalk: a team task board, a Vue 3 single-page app over the REST API of embed-cms. One program:
//
//   node server.js      then open http://localhost:3000
//   DEV=1 node server.js    the same, with the app served by Vite and reloaded as it is edited
//
// The CMS and the app share one address (the cookie of the login and the check of where a request comes from need it). The first start builds the app, and fills the CMS
// (the people, the projects, the tasks, an account for each person: their passwords are printed once). The next ones find everything in place.
const fs = require('fs')
const path = require('path')
const express = require('express')
const CMS = require('../../../')
const hooks = require('./hooks')
const { seed } = require('./seed')

const PORT = Number(process.env.PORT) || 3000
// where the data of the CMS and the built app are put: this folder, unless STATE_DIR says another (a test, a second copy)
const STATE = process.env.STATE_DIR || __dirname
const DIST = path.join(STATE, 'dist')

const cms = new CMS({
  mid: 'webnode1',
  resources: path.join(__dirname, 'resources'),
  data: path.join(STATE, 'data'),
  // the login page and its cookie, not the Basic authentication of a browser prompt: a single-page app has its own login form
  disableAuthentication: true,
  disableJwtLogin: false,
  // the websocket that tells an open board that a card was changed by someone else
  wsRecordUpdates: true,
  // what signs the token of the login and the cookie of the session. In production they are required, and long: AUTH_SECRET and SESSION_SECRET in the environment.
  // (Without them a development start makes its own, and the people sign in again after each restart.)
  ...(process.env.AUTH_SECRET ? { auth: { secret: process.env.AUTH_SECRET } } : {}),
  ...(process.env.SESSION_SECRET ? { session: { secret: process.env.SESSION_SECRET } } : {})
})

/**
 * The app, to the browser: served by Vite while it is worked on, built once and served as files otherwise.
 * @param {import('express').Express} app
 * @param {import('http').Server} server
 */
async function serveApp (app, server) {
  const vite = await import('vite')
  if (process.env.DEV === '1') {
    const dev = await vite.createServer({ root: __dirname, configFile: path.join(__dirname, 'vite.config.mjs'), appType: 'spa', server: { middlewareMode: true, hmr: { server } } })
    app.use(dev.middlewares)
    return
  }
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    await vite.build({ root: __dirname, configFile: path.join(__dirname, 'vite.config.mjs'), logLevel: 'warn', build: { outDir: DIST, emptyOutDir: true } })
  }
  app.use(express.static(DIST))
  // an address of the app (/p/WEB, /login) is the page of the app: the router of the browser reads it. The addresses of the CMS were answered before.
  app.get('/*path', (req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

const app = express()
// the CMS first: /api, /admin, /_updates; then the app
app.use(cms.express())

const server = app.listen(PORT, async () => {
  await cms.bootstrap(server)
  hooks.install(cms)
  const { accounts } = await seed(cms)
  await serveApp(app, server)
  for (const { username, password } of accounts) {
    console.log(`An account to sign in with: ${username} / ${password}`)
  }
  console.log(`Boardwalk is at http://localhost:${PORT} (the admin of the CMS is at /admin)`)
})
