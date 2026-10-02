// Retakes the screenshots of the documentation. See the "Screenshots of the documentation" section of CONTRIBUTING.md.
//   npm run docs:screenshots                       every image
//   npm run docs:screenshots -- --only string      the images whose name matches "string" (a regular expression)
//   npm run docs:screenshots -- --url http://127.0.0.1:9990 --seed    a running server instead of a throw-away one
const path = require('path')
const { start, USER, PASSWORD } = require('./server')
const { launch, makeContext } = require('./lib')
const { seed } = require('./seed')
const { makeFixtures } = require('./fixtures')

const arg = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : (process.argv[index + 1] || true)
}

const ROOT = path.resolve(__dirname, '..', '..', '..')
const FIELDS_OUT = path.join(ROOT, 'docs', 'reference', 'fields', 'img')
const UI_OUT = path.join(ROOT, 'docs', 'ui')
// a toast is cropped to itself with a little of the page around it
const TOAST_CROP = { width: 0, pad: { l: 6, r: 6, t: 6, b: 6 } }
const DEFAULT_VIEWPORT = { width: 1280, height: 900 }

async function main () {
  const only = arg('--only') ? new RegExp(arg('--only')) : null
  const fields = require('./fields').specs.filter((spec) => !only || only.test(spec.name))
  const ui = require('./ui').specs.filter((spec) => !only || only.test(spec.name))
  if (fields.length + ui.length === 0) {
    console.log('No image matches --only')
    return
  }
  const own = !arg('--url')
  const server = own ? await start(Number(process.env.SCREENSHOT_PORT) || 0) : null
  const base = own ? server.url : arg('--url')
  const started = Date.now()
  let handle = null
  let failed = 0
  try {
    const files = await makeFixtures()
    let seeded = {}
    if (own || arg('--seed')) {
      process.stdout.write('Seeding... ')
      seeded = await seed(base, USER, PASSWORD, files)
      console.log('done')
    }
    handle = await launch(base, USER, PASSWORD)
    const { page } = handle
    const ctx = makeContext(page, base, FIELDS_OUT, { user: USER, password: PASSWORD })
    ctx.files = files
    ctx.seeded = seeded
    for (const [list, out] of [[fields, FIELDS_OUT], [ui, UI_OUT]]) {
      ctx.outDir = out
      for (const spec of list) {
        // a second try: the page of a picture sometimes loads too slowly (see docs/contributing/TESTING.md)
        for (let attempt = 1; ; attempt++) {
          try {
            await ctx.page.setViewportSize(spec.options.viewport || DEFAULT_VIEWPORT)
            const options = { ...spec.options }
            if (typeof options.record === 'function') options.record = options.record(seeded)
            if (spec.resource) await ctx.open(spec.resource, options)
            const targets = await spec.run(ctx)
            if (targets) await ctx.shoot(spec.name, targets, { ...(spec.options.toast ? TOAST_CROP : {}), ...(spec.options.crop || {}), ...(spec.options.scroll ? { scroll: spec.options.scroll } : {}) })
            console.log(`ok   ${spec.name}`)
            break
          } catch (error) {
            if (attempt < 2) continue
            failed++
            await ctx.page.screenshot({ path: path.join(require('os').tmpdir(), `docshot-fail-${spec.name}.png`) }).catch(() => {})
            console.log(`FAIL ${spec.name}: ${error.message.split('\n')[0]}`)
            break
          }
        }
      }
    }
  } finally {
    if (handle) await handle.browser.close()
    if (server) await server.stop()
  }
  console.log(`${fields.length + ui.length - failed} images taken, ${failed} failed, ${Math.round((Date.now() - started) / 1000)}s`)
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
