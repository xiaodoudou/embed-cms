// Retakes the screenshots of the example docs platform of docs/examples/platform/README.md: a throw-away CMS with its resources and its content.json, the site on a free port.
//   npm run docs:platform-screenshots
/* global document */
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { chromePath, gotoRetry, INSTALL_HINT } = require('./lib')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const EXAMPLE = path.join(ROOT, 'docs', 'examples', 'platform')
const OUT = path.join(ROOT, 'docs', 'img')

// the member the screenshots sign in with: made here, with a password that exists only for this run
const MEMBER = { name: 'Ada Reader', email: 'ada@example.com', password: 'screenshots-only-password', active: true }

// [file, address, whether the page is seen signed in]
const SHOTS = [
  ['platform-home', '/', false],
  ['platform-page', '/tidewater/3.0/install', false],
  ['platform-old-version', '/tidewater/2.x/install', false],
  ['platform-locked', '/tidewater/3.0/single-sign-on', false],
  ['platform-member', '/tidewater/3.0/single-sign-on', true]
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
  const platform = require(path.join(EXAMPLE, 'platform'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-platform-shots-'))
  const cms = new CMS({
    mid: 'webnode1',
    resources: path.join(EXAMPLE, 'resources'),
    data: dir,
    config: path.join(dir, 'cms.json'),
    syslog: undefined,
    replication: { peers: [], peersByResource: {} },
    disableAdmin: true
  })
  // only the site is served: the CMS is read in this process, as in server.js
  const { app } = platform(cms, { secret: 'a-secret-for-the-screenshots-only', cache: false })
  const server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
  await cms.bootstrap(server)
  await new CMS.ContentLoader(cms).load(path.join(EXAMPLE, 'content.json'))
  await cms.api()('members').create({ ...MEMBER })
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await playwright.chromium.launch({ executablePath: chromePath() })
  try {
    for (const [name, url, signedIn] of SHOTS) {
      const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1, colorScheme: 'light' })).newPage()
      if (signedIn) {
        await gotoRetry(page, `${base}/login?next=${encodeURIComponent(url)}`)
        await page.fill('input[name=email]', MEMBER.email)
        await page.fill('input[name=password]', MEMBER.password)
        await Promise.all([page.waitForURL(`${base}${url}`), page.click('button[type=submit]')])
      } else {
        await gotoRetry(page, base + url)
      }
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => document.fonts.ready)
      const file = path.join(OUT, `${name}.png`)
      await page.screenshot({ path: file, fullPage: true })
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
