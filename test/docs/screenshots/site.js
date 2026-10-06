// Retakes the screenshots of the example site of docs/reference/PAGE_HELPER.md: a throw-away CMS with the resource of docs/examples/site, a few articles, the site on a free port.
//   npm run docs:site-screenshots
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'
const fs = require('fs')
const os = require('os')
const path = require('path')
const express = require('express')
const { chromePath, gotoRetry, INSTALL_HINT } = require('./lib')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const EXAMPLE = path.join(ROOT, 'docs', 'examples', 'site')
const OUT = path.join(ROOT, 'docs', 'img')


async function main () {
  let playwright
  try {
    playwright = require('playwright-core')
  } catch {
    console.error(INSTALL_HINT)
    process.exit(1)
  }
  const CMS = require(ROOT)
  const site = require(path.join(EXAMPLE, 'site'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-site-shots-'))
  const cms = new CMS({ mid: 'webnode1', resources: path.join(EXAMPLE, 'resources'), data: dir, config: path.join(dir, 'cms.json'), syslog: undefined, replication: { peers: [], peersByResource: {} }, disableAdmin: true })
  const { router, pages } = site(cms)
  const app = express()
  app.use(cms.express())
  // an address that fails, for the picture of the error page (the example has no route that does)
  app.get('/boom', pages.route('home', () => { throw new Error('the database is down') }))
  app.use(router)
  const server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
  await cms.bootstrap(server)
  // the content of the example, loaded as its server loads it
  await new CMS.ContentLoader(cms).load(path.join(EXAMPLE, 'content.json'))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await playwright.chromium.launch({ executablePath: chromePath() })
  const log = console.error
  try {
    const page = await (await browser.newContext({ viewport: { width: 760, height: 300 }, deviceScaleFactor: 2, colorScheme: 'light' })).newPage()
    for (const [name, url] of [['home', '/'], ['article', '/articles/welcome'], ['notfound', '/articles/nothing'], ['error', '/boom']]) {
      // the error is logged by the helper, as it should: not in the middle of this output
      console.error = () => {}
      await gotoRetry(page, base + url)
      console.error = log
      const file = path.join(OUT, `page-helper-${name}.png`)
      await page.screenshot({ path: file, fullPage: true })
      console.log(`ok   ${path.relative(ROOT, file)}`)
    }
  } finally {
    console.error = log
    await browser.close()
    cms._closeSockets()
    await new Promise((resolve) => server.close(resolve))
    await cms._closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

main().then(() => process.exit(0), (error) => {
  console.error(error)
  process.exit(1)
})
