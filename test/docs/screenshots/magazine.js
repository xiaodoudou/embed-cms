// Retakes the screenshots of the example magazine of docs/examples/magazine/README.md: a throw-away CMS with its resources and its content.json, the site on a free port.
//   npm run docs:magazine-screenshots
/* global document, window */
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'
const fs = require('fs')
const os = require('os')
const path = require('path')
const express = require('express')
const { chromePath, gotoRetry, INSTALL_HINT } = require('./lib')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const EXAMPLE = path.join(ROOT, 'docs', 'examples', 'magazine')
const OUT = path.join(ROOT, 'docs', 'img')

// [file, address, viewport width]
const SHOTS = [
  ['magazine-home', '/en', 1180],
  ['magazine-article', '/en/articles/slow-mornings-in-lisbon', 1180],
  ['magazine-zh', '/zh', 1180],
  ['magazine-search', '/en/search?q=bread', 1180]
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
  const magazine = require(path.join(EXAMPLE, 'magazine'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-magazine-shots-'))
  const cms = new CMS({
    mid: 'webnode1',
    resources: path.join(EXAMPLE, 'resources'),
    data: dir,
    config: path.join(dir, 'cms.json'),
    syslog: undefined,
    replication: { peers: [], peersByResource: {} },
    disableAdmin: true,
    anonymousRead: ['settings', 'authors', 'categories', 'articles']
  })
  const app = express()
  app.use(cms.express())
  app.use(magazine(cms))
  const server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
  await cms.bootstrap(server)
  await new CMS.ContentLoader(cms).load(path.join(EXAMPLE, 'content.json'))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await playwright.chromium.launch({ executablePath: chromePath() })
  try {
    for (const [name, url, width] of SHOTS) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' })).newPage()
      await gotoRetry(page, base + url)
      // the pictures below the fold are loaded when they come into view: go down, wait for them, come back
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y)
          await new Promise((resolve) => setTimeout(resolve, 60))
        }
        window.scrollTo(0, 0)
      })
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)
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
