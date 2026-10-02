// Browser helpers for the documentation screenshots: one headless Chrome, one page, a few verbs (open a record, find a field,
// take a crop). playwright-core is not a dependency of the project: it is required here, on first use.
const fs = require('fs')
const path = require('path')

const INSTALL_HINT = 'The screenshot tool needs playwright-core and Chrome: run `npm i --no-save playwright-core`; Chrome is expected at CHROME_PATH (default: the usual install folder of your system).'

function chromePath () {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  return path.normalize(candidates.find((file) => fs.existsSync(file)) || candidates[0])
}

function loadPlaywright () {
  try {
    return require('playwright-core')
  } catch {
    console.error(INSTALL_HINT)
    process.exit(1)
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** page.goto that tries again when the connection to the throw-away server is dropped (see docs/contributing/TESTING.md) */
async function gotoRetry (page, url, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.goto(url, { waitUntil: 'networkidle' })
    } catch (error) {
      if (attempt >= attempts) throw error
    }
  }
}

/** Fills the login page when it shows (the page answers a dropped request by asking for the login again) */
async function login (page, user, password) {
  const field = page.locator('input[name=embedCmsUsername]')
  await page.locator('input[name=embedCmsUsername], nav').first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  if ((await field.count()) === 0) return false
  await field.fill(user)
  await page.fill('input[name=embedCmsPassword]', password)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await page.waitForSelector('nav', { state: 'attached', timeout: 20000 })
  await page.waitForTimeout(800)
  return true
}

/** One Chrome, one logged-in page. `base` is the server URL, `viewport` the page size */
async function launch (base, user, password, viewport = { width: 1280, height: 900 }) {
  const { chromium } = loadPlaywright()
  let browser
  try {
    browser = await chromium.launch({ executablePath: chromePath() })
  } catch (error) {
    console.error(`${INSTALL_HINT} (${error.message.split('\n')[0]})`)
    process.exit(1)
  }
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'light', acceptDownloads: false })
  // the choices the admin remembers (list density, sidebar mode) start from their defaults on every page
  await context.addInitScript(() => {
    try {
      localStorage.removeItem('embed-cms.ui.list.density')
      localStorage.removeItem('embed-cms.ui.nav.mode')
    } catch {
      // no storage: nothing is remembered
    }
  })
  const page = await context.newPage()
  prepare(page)
  await gotoRetry(page, `${base}/admin/`)
  await login(page, user, password)
  return { browser, context, page }
}

/** Sets a page up the way every picture needs it */
function prepare (page) {
  page.on('pageerror', (error) => console.log('page error:', error.message))
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}))
  return page
}

/** The verbs the specs use. `ctx.page` is the Playwright page of the current picture */
function makeContext (firstPage, base, outDir, credentials) {
  let page = firstPage
  const ctx = { base, outDir, sleep }
  Object.defineProperty(ctx, 'page', { get: () => page })
  const hash = (resource, record) => `${base}/admin/#/?id=${resource}${record ? `&record=${record}` : ''}`

  /**
   * Loads the admin on a resource, in a page of its own so nothing of the picture before (a form with unsaved edits, an open
   * list) is left over: a new record form, or the record `record` (an id)
   */
  ctx.visit = async (resource, { record, theme = 'light', viewport } = {}) => {
    const old = page
    const size = viewport || old.viewportSize()
    page = prepare(await old.context().newPage())
    await old.close({ runBeforeUnload: false }).catch(() => {})
    await page.setViewportSize(size)
    await gotoRetry(page, hash(resource, record))
    if (credentials && await login(page, credentials.user, credentials.password)) {
      await gotoRetry(page, hash(resource, record))
    }
    await page.waitForSelector('.record-list, .records', { timeout: 20000 })
    await ctx.theme(theme)
    await page.waitForTimeout(900)
    return ctx
  }

  /** Visits a resource and opens the editor: a new record form, or the record `record` (an id) */
  ctx.open = async (resource, { record, locale, theme, viewport } = {}) => {
    await ctx.visit(resource, { record, theme, viewport })
    if (!record) {
      await page.locator('button[aria-label="New record"]').click()
    }
    await page.waitForSelector('.record-editor-form .field-wrapper', { timeout: 20000 })
    await page.waitForTimeout(500)
    if (locale) await ctx.locale(locale)
    return ctx
  }

  /** A picture of the whole window (or `options.clip`) */
  ctx.snap = (file, options = {}) => page.screenshot({ path: path.join(ctx.outDir, file + '.png'), ...options })

  ctx.theme = async (wanted) => {
    const button = page.locator('button.theme-switch')
    const dark = (await button.getAttribute('aria-checked')) === 'true'
    if ((wanted === 'dark') !== dark) {
      await button.click()
      await page.waitForTimeout(500)
    }
  }

  ctx.locale = async (name) => {
    await page.locator('.record-editor .locale-btn').filter({ hasText: name }).first().click()
    await page.waitForTimeout(400)
  }

  /** The wrapper of the field whose model is `model` (`name.enUS`, `flag`) */
  ctx.field = (model) => page.locator(`.record-editor-form .field-wrapper[data-model="${model}"]`).first()
  ctx.input = (model) => ctx.field(model).locator('input:not([type=file]), textarea').first()

  ctx.type = async (model, text) => {
    const input = ctx.input(model)
    await input.click()
    await input.fill(text)
  }
  ctx.blur = async () => {
    await page.mouse.click(5, 5)
    await page.waitForTimeout(300)
  }
  ctx.create = async () => {
    await page.locator('.record-editor').getByRole('button', { name: /^(Create|Save)$/ }).first().click()
    await page.waitForTimeout(700)
  }

  /**
   * Saves a PNG of a union of elements. `targets` are locators (or a locator), `pad` is extra pixels
   * { l, r, t, b }, `width` forces the width of the crop (650 for a field) starting 12px left of the first element.
   */
  ctx.shoot = async (file, targets, { pad = {}, width = 650, height, left = 12, scroll = 'center', clipWidth } = {}) => {
    const list = Array.isArray(targets) ? targets : [targets]
    if (scroll !== 'none') {
      await list[0].evaluate((element, block) => element.scrollIntoView({ block }), scroll)
      await page.waitForTimeout(450)
    }
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
    for (const target of list) {
      const box = await target.boundingBox()
      if (!box) throw new Error(`${file}: nothing to crop`)
      x0 = Math.min(x0, box.x); y0 = Math.min(y0, box.y)
      x1 = Math.max(x1, box.x + box.width); y1 = Math.max(y1, box.y + box.height)
    }
    const top = pad.t === undefined ? (width ? 8 : 0) : pad.t
    const bottom = pad.b === undefined ? (width ? 3 : 0) : pad.b
    const clip = {
      x: Math.max(0, Math.round(width ? x0 - left : x0 - (pad.l || 0))),
      y: Math.max(0, Math.round(y0 - top)),
      width: clipWidth || width || Math.round(x1 - x0 + (pad.l || 0) + (pad.r || 0)),
      height: height || Math.round(y1 - y0 + top + bottom)
    }
    await page.screenshot({ path: path.join(ctx.outDir, file + '.png'), clip })
  }
  return ctx
}

module.exports = { login, gotoRetry, launch, makeContext, sleep, chromePath, INSTALL_HINT }
