const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const request = require('supertest')
const { expect } = require('chai')
const CMS = require('../../')
const { startApp } = require('../helpers/app')
const { examples, ROOT } = require('../helpers/examples')
const { crawl } = require('../helpers/crawl')

// Every example project of docs/examples held to the same bar, so that no change of the CMS can break one without a test saying so: its resources are the CMS's, its content loads and loads
// again with nothing to do, every address its pages link to answers, and its own server.js starts, serves, and starts again over the data it kept. What each example does on top of that is
// in its own file (exampleSite, exampleMagazine, examplePlatform).

/** fetch, tried again when the first packet is dropped (see docs/contributing/TESTING.md) */
async function get (url, options) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, options)
    } catch (error) {
      if (attempt >= 3) {
        throw error
      }
    }
  }
}

/** @returns {Promise<Array<number>>} free ports on this machine */
async function freePorts (count) {
  const servers = await Promise.all(Array.from({ length: count }, () => new Promise((resolve) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => resolve(server))
  })))
  const ports = servers.map((server) => server.address().port)
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))))
  return ports
}

/**
 * Runs the server.js of an example, as a person would (`node server.js`), over a folder of its own, and waits for it to say that it is ready.
 * @returns {Promise<{output: function(): string, stop: function(): Promise<void>}>}
 */
function run (example, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], { cwd: example.dir, env: { ...process.env, LOG_LEVEL: 'error', ...env } })
    let output = ''
    const exited = new Promise((done) => child.once('exit', done))
    const seconds = example.startupSeconds || 60
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`${example.name}: server.js was not ready in ${seconds} s. Output:\n${output}`))
    }, seconds * 1000)
    const listen = (chunk) => {
      output += chunk
      if (example.ready.test(output)) {
        clearTimeout(timer)
        resolve({ output: () => output, stop: async () => { child.kill(); await exited } })
      }
    }
    child.stdout.on('data', listen)
    child.stderr.on('data', (chunk) => { output += chunk })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`${example.name}: server.js ended with ${code} before it was ready. Output:\n${output}`))
    })
  })
}

describe('the example projects (unit)', () => {
  for (const example of examples) {
    describe(`the ${example.name}`, () => {
      describe('as a CMS project', () => {
        let app
        before(async () => {
          app = await startApp({ resources: path.join(example.dir, 'resources'), ...example.options })
        })
        after(async () => {
          await app.close()
        })

        it('has resources that the CMS accepts, each with a name, a schema and fields that are all of a type of the CMS', async () => {
          for (const name of example.resources) {
            expect(app.cms._resourceNames, name).to.include(name)
            const { schema, displayname } = app.cms.api()(name).options
            expect(displayname, name).to.be.an('object')
            expect(schema, name).to.be.an('array').that.is.not.empty
            for (const field of schema) {
              expect(field.field, name).to.be.a('string').that.is.not.empty
              expect(field.input, `${name}.${field.field}`).to.be.a('string')
            }
          }
        })

        it('has a content file that loads, with nothing to say against it, and loads again with nothing to do', async () => {
          const content = path.join(example.dir, 'content.json')
          const loader = new CMS.ContentLoader(app.cms)
          const first = await loader.load(content)
          expect(first.created).to.be.above(0)
          const second = await new CMS.ContentLoader(app.cms).load(content)
          expect(second).to.include({ created: 0, updated: 0 })
          expect(second.unchanged).to.be.above(0)
        })

        it('can be checked before anything is written: a dry run of the content file finds no problem', async () => {
          const report = await new CMS.ContentLoader(app.cms).load(path.join(example.dir, 'content.json'), { dryRun: true })
          expect(report).to.include({ created: 0, updated: 0 })
        })
      })

      // a single-page app is one page for every address: what is checked of it is what that page loads (in 'as a program')
      describe('as a site', function () {
        if (example.spa) {
          return
        }
        let app, server
        before(async () => {
          app = await startApp({ resources: path.join(example.dir, 'resources'), ...example.options })
          // the site comes first when it puts hooks on a resource of its own, then the content, then whoever signs in
          const web = example.build(app.cms)
          await new CMS.ContentLoader(app.cms).load(path.join(example.dir, 'content.json'))
          if (example.member) {
            await app.cms.api()('members').create({ ...example.member })
          }
          server = await new Promise((resolve) => { const listening = web.listen(0, '127.0.0.1', () => resolve(listening)) })
        })
        after(async () => {
          await new Promise((resolve) => server.close(resolve))
          await app.close()
        })

        it('answers at every address its pages link to: no broken link, no missing picture, no page that shows undefined', async function () {
          this.timeout(120000)
          const { pages, problems } = await crawl(server, example.start, { allowedStatuses: example.allowedStatuses })
          expect(problems).to.deep.equal([])
          expect(pages.length, `${pages.length} addresses were visited`).to.be.at.least(example.minPages)
          // the pictures, the stylesheet and the pages are all there
          expect(pages.some((page) => page.type === 'text/html')).to.equal(true)
          expect(pages.some((page) => page.type === 'text/css')).to.equal(true)
        })

        if (example.member) {
          it('answers at every address when a member of its own is signed in, and reaches more pages than a visitor', async function () {
            this.timeout(120000)
            const guest = await crawl(server, example.start, { allowedStatuses: example.allowedStatuses })
            const agent = request.agent(server)
            const page = await agent.get('/login')
            const token = page.text.match(/name="_csrf" value="([^"]+)"/)[1]
            const login = await agent.post('/login').type('form').send({ _csrf: token, email: example.member.email, password: example.member.password })
            expect(login.status).to.equal(303)
            const member = await crawl(server, example.start, { client: agent })
            expect(member.problems).to.deep.equal([])
            expect(member.pages.length).to.be.above(guest.pages.length)
            expect(member.pages.every((one) => one.status === 200 || (one.status >= 300 && one.status < 400))).to.equal(true)
          })
        }
      })

      describe('as a program: node server.js', function () {
        this.timeout(180000)
        let state, ports

        before(async () => {
          state = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-example-'))
          ports = await freePorts(2)
        })
        after(() => {
          fs.rmSync(state, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
        })

        const environment = () => ({ PORT: String(ports[0]), ADMIN_PORT: String(ports[1]), STATE_DIR: state })
        const base = () => `http://127.0.0.1:${ports[0]}`

        it('starts over an empty folder, loads its content, and serves its first page', async () => {
          const running = await run(example, environment())
          try {
            const res = await get(`${base()}${example.start[0]}`)
            expect(res.status).to.equal(200)
            expect(res.headers.get('content-type')).to.match(/^text\/html/)
            const html = await res.text()
            expect(html).to.match(/<title>[^<]+<\/title>/)
            // the content is in it: more than the frame of a page
            expect(html.length).to.be.above(example.spa ? 200 : 800)
            // a single-page app answers every address with its page: the router of the browser says what is there
            expect((await get(`${base()}/nowhere-at-all`)).status).to.equal(example.spa ? 200 : 404)
            if (example.spa) {
              // everything the page loads is there: the scripts and the stylesheets, with the type of what they are
              const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1])
              expect(assets.length, 'what the page loads').to.be.above(1)
              for (const asset of assets) {
                const res = await get(`${base()}${asset}`)
                expect(res.status, asset).to.equal(200)
                expect(res.headers.get('content-type'), asset).to.match(/javascript|css/)
              }
              // the CMS is in the same program, and asks for a sign-in
              expect((await get(`${base()}/api/tasks`)).status).to.equal(401)
            }
          } finally {
            await running.stop()
          }
        })

        it('starts again over what it kept, and finds its content in place', async () => {
          const running = await run(example, environment())
          try {
            expect((await get(`${base()}${example.start[0]}`)).status).to.equal(200)
            // nothing is made twice: the content is not loaded again, and the member of the platform is not made again
            expect(running.output()).to.not.match(/[1-9]\d* created/)
            expect(running.output()).to.not.include('A member to sign in with')
          } finally {
            await running.stop()
          }
        })
      })
    })
  }

  describe('the docs platform keeps the CMS off the public site', function () {
    this.timeout(180000)
    const example = examples.find((one) => one.name === 'docs platform')
    let state, ports, running

    before(async () => {
      state = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-example-'))
      ports = await freePorts(2)
      running = await run(example, { PORT: String(ports[0]), ADMIN_PORT: String(ports[1]), STATE_DIR: state })
    })
    after(async () => {
      await running.stop()
      fs.rmSync(state, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    })

    it('answers 404 to /api and /admin on the public port, and asks for a sign-in on the port of the editors', async () => {
      for (const url of ['/api/pages', '/api/members', '/admin', '/admin/']) {
        expect((await get(`http://127.0.0.1:${ports[0]}${url}`)).status, url).to.equal(404)
      }
      expect((await get(`http://127.0.0.1:${ports[1]}/api/pages`)).status).to.equal(401)
      expect((await get(`http://127.0.0.1:${ports[1]}/api/members`)).status).to.equal(401)
    })

    it('does not listen for the editors on every address of the machine', async () => {
      const other = Object.values(os.networkInterfaces()).flat().find((address) => address && !address.internal && address.family === 'IPv4')
      if (!other) {
        return
      }
      let reached = true
      try {
        await get(`http://${other.address}:${ports[1]}/api/pages`, { signal: AbortSignal.timeout(3000) })
      } catch {
        reached = false
      }
      expect(reached, `the admin answered on ${other.address}`).to.equal(false)
    })

    it('makes a member whose password is printed once, and who can sign in and read what is for members', async () => {
      const [, password] = running.output().match(/ada@example\.com \/ (\w+)/)
      let cookie = ''
      const call = async (url, options = {}) => {
        const res = await get(`http://127.0.0.1:${ports[0]}${url}`, { redirect: 'manual', ...options, headers: { ...(options.headers || {}), cookie } })
        const set = res.headers.getSetCookie().map((item) => item.split(';')[0]).join('; ')
        if (set) {
          cookie = set
        }
        return res
      }
      const token = (await (await call('/login')).text()).match(/name="_csrf" value="([^"]+)"/)[1]
      const login = await call('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: token, email: 'ada@example.com', password }) })
      expect(login.status).to.equal(303)
      const page = await call('/tidewater/3.0/single-sign-on')
      expect(page.status).to.equal(200)
      expect(await page.text()).to.include('SAML')
      expect((await get(`http://127.0.0.1:${ports[0]}/tidewater/3.0/single-sign-on`)).status).to.equal(401)
    })
  })

  it('has every example in the list: one for each folder of docs/examples that has a server.js', () => {
    const folders = fs.readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, entry.name, 'server.js'))).map((entry) => entry.name)
    expect(examples.map((example) => path.basename(example.dir)).sort()).to.deep.equal(folders.sort())
  })

  it('has for every example a README, a content file, a folder of resources and a screenshots script', () => {
    for (const example of examples) {
      const folder = path.basename(example.dir)
      expect(fs.existsSync(path.join(example.dir, 'README.md')), `${folder}/README.md`).to.equal(true)
      expect(fs.existsSync(path.join(example.dir, 'content.json')), `${folder}/content.json`).to.equal(true)
      expect(fs.existsSync(path.join(example.dir, 'resources')), `${folder}/resources`).to.equal(true)
      expect(fs.existsSync(path.join(__dirname, '../docs/screenshots', `${folder === 'site' ? 'site' : folder}.js`)), `screenshots of ${folder}`).to.equal(true)
    }
  })
})
