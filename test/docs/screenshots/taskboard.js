// Retakes the screenshots of the example task board of docs/examples/taskboard/README.md: a throw-away CMS with its resources, its hooks and its seed, the app built by Vite, a browser that
// signs in as a person of the team and looks at the board.
//   npm run docs:taskboard-screenshots
/* global document */
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const path = require('path')
const express = require('express')
const { chromePath, gotoRetry, INSTALL_HINT } = require('./lib')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const EXAMPLE = path.join(ROOT, 'docs', 'examples', 'taskboard')
const OUT = path.join(ROOT, 'docs', 'img')

// [file, address, whether the page is seen signed in, what to wait for]
const SHOTS = [
  ['taskboard-login', '/login', false, 'form'],
  ['taskboard-projects', '/', true, '.project-list'],
  ['taskboard-board', '/p/WEB', true, '.columns .card'],
  ['taskboard-filtered', '/p/WEB?label=content', true, '.columns .card'],
  ['taskboard-card', '/p/WEB/t/WEB-3', true, 'aside.panel .comments li']
]

async function main () {
  let playwright
  try {
    playwright = require('playwright-core')
  } catch {
    console.error(INSTALL_HINT)
    process.exit(1)
  }
  const CMS = require(ROOT)
  const hooks = require(path.join(EXAMPLE, 'hooks'))
  const { seed } = require(path.join(EXAMPLE, 'seed'))
  const vite = await import('vite')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-taskboard-shots-'))
  const dist = path.join(dir, 'dist')
  await vite.build({ root: EXAMPLE, configFile: path.join(EXAMPLE, 'vite.config.mjs'), logLevel: 'warn', build: { outDir: dist, emptyOutDir: true } })
  const cms = new CMS({
    mid: 'webnode1',
    resources: path.join(EXAMPLE, 'resources'),
    data: path.join(dir, 'data'),
    config: path.join(dir, 'cms.json'),
    syslog: undefined,
    replication: { peers: [], peersByResource: {} },
    disableAuthentication: true,
    disableJwtLogin: false,
    wsRecordUpdates: true,
    // the login signs tokens and cookies: secrets for this run only
    auth: { secret: crypto.randomBytes(32).toString('hex') },
    session: { secret: crypto.randomBytes(32).toString('hex') }
  })
  const app = express()
  app.use(cms.express())
  app.use(express.static(dist))
  app.get('/*path', (req, res) => res.sendFile(path.join(dist, 'index.html')))
  const server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
  await cms.bootstrap(server)
  hooks.install(cms)
  const { accounts } = await seed(cms)
  const ada = accounts.find((account) => account.username === 'ada')
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await playwright.chromium.launch({ executablePath: chromePath() })
  try {
    for (const [name, url, signedIn, wait] of SHOTS) {
      const page = await (await browser.newContext({ viewport: { width: 1180, height: name === 'taskboard-card' ? 1040 : 760 }, deviceScaleFactor: 1, colorScheme: 'light' })).newPage()
      if (signedIn) {
        await gotoRetry(page, `${base}/login`)
        await page.fill('input[name=username]', ada.username)
        await page.fill('input[name=password]', ada.password)
        await Promise.all([page.waitForURL(`${base}/`), page.click('button[type=submit]')])
      }
      await gotoRetry(page, base + url)
      await page.waitForSelector(wait)
      // the websocket has opened: the badge says "Live"
      if (signedIn) {
        await page.waitForSelector('.connection.open')
      }
      await page.evaluate(() => document.fonts.ready)
      const file = path.join(OUT, `${name}.png`)
      await page.screenshot({ path: file })
      console.log(`ok   ${path.relative(ROOT, file)}`)
      await page.context().close()
    }
  } finally {
    await browser.close()
    cms._closeSockets()
    await new Promise((resolve) => server.close(resolve))
    await cms._closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  }
}

main().then(() => process.exit(0), (error) => {
  console.error(error)
  process.exit(1)
})
