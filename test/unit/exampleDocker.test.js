const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { expect } = require('chai')
const rootPackage = require('../../package.json')

// The Docker example (docs/examples/docker): every secret in a .env file, an image with none, and the scripts that make the file, build and run.
// Docker itself is not needed here (the image is built and run by hand, see docs/examples/docker/README.md): what is held is what makes the example
// safe, and what a change of the CMS could break: the server.js that takes its secrets from the environment and writes them nowhere, the scripts,
// and the files that keep a secret out of git and out of the image.
const DIR = path.resolve(__dirname, '../../docs/examples/docker')
const ROOT = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(DIR, file), 'utf8')
const SECRET = 'a-secret-for-the-tests-of-the-docker-example-0123456789'
const OTHER_SECRET = 'another-secret-for-the-tests-of-the-docker-example-9876543210'
const PASSWORD = 'a password of the administrator'

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

/** @returns {Promise<number>} a free port on this machine */
async function freePort () {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

describe('the Docker example (unit)', () => {
  describe('the files that keep a secret where it belongs', () => {
    it('has the files of a deployment', () => {
      for (const file of ['Dockerfile', 'compose.yaml', '.dockerignore', '.gitignore', '.env.example', 'package.json', 'package-lock.json', 'server.js', 'cms.json', 'README.md', 'scripts/build.sh', 'scripts/env.sh', 'scripts/start.sh', 'scripts/common.sh']) {
        expect(fs.existsSync(path.join(DIR, file)), file).to.equal(true)
      }
    })

    it('leaves .env out of git and out of the build', () => {
      for (const file of ['.gitignore', '.dockerignore']) {
        expect(read(file).split('\n'), file).to.include('.env')
      }
      // the other files that start with .env are left out of the build too, except the example that has no secret
      expect(read('.dockerignore')).to.match(/^\.env\.\*$/m).and.to.match(/^!\.env\.example$/m)
    })

    it('gives the image no secret: no ARG, no ENV that is one, and only the files it needs are copied, by name', () => {
      const lines = read('Dockerfile').split('\n').filter((line) => !line.trim().startsWith('#'))
      const dockerfile = lines.join('\n')
      expect(dockerfile).not.to.match(/^\s*ARG\b/m)
      expect(dockerfile).not.to.match(/(SECRET|PASSWORD|TOKEN|KEY)\s*=/i)
      expect(dockerfile).not.to.match(/(^|\s)\.env\b/)
      // nothing is copied as a whole folder, with a .env in it: not `COPY . .`, not `ADD`
      expect(dockerfile).not.to.match(/^\s*ADD\b/m)
      for (const line of lines.filter((item) => /^\s*COPY\b/.test(item) && !item.includes('--from'))) {
        expect(line, line).not.to.match(/COPY\s+(--\S+\s+)*\.\s/)
      }
      // it runs as a user that is not root, with the lock file of the example
      expect(dockerfile).to.match(/^USER node$/m)
      expect(dockerfile).to.include('npm ci')
    })

    it('has a compose.yaml that gives the secrets to the container from .env, writes none of them, and limits the container', () => {
      const compose = read('compose.yaml').split('\n').filter((line) => !line.trim().startsWith('#')).join('\n')
      expect(compose).to.match(/^\s+env_file: \.env$/m)
      // no value of its own: not in an environment, not in the arguments of a build (they stay in the layers of the image)
      expect(compose).not.to.match(/^\s*environment:/m)
      expect(compose).not.to.match(/^\s*args:/m)
      expect(compose).not.to.match(/AUTH_SECRET|SESSION_SECRET|ADMIN_PASSWORD/)
      // published on this machine only, read-only, with no power
      expect(compose).to.include('"127.0.0.1:${HOST_PORT:-3000}:3000"')
      expect(compose).to.match(/^\s+read_only: true$/m)
      expect(compose).to.match(/^\s+- ALL$/m)
      expect(compose).to.include('no-new-privileges:true')
      // the image it runs is the one scripts/build.sh builds
      expect(compose).to.include('image: ${IMAGE:-embed-cms-docker}:${TAG:-latest}')
    })

    it('has a .env.example whose secrets are empty (the scripts make them), and that names every variable the server and the scripts read', () => {
      const example = Object.fromEntries(read('.env.example').split('\n').filter((line) => /^[A-Z_]+=/.test(line)).map((line) => line.split(/=(.*)/s).slice(0, 2)))
      for (const secret of ['AUTH_SECRET', 'SESSION_SECRET', 'ADMIN_PASSWORD']) {
        expect(example, secret).to.have.property(secret, '')
      }
      const used = new Set()
      for (const file of ['server.js']) {
        for (const match of read(file).matchAll(/(?:process\.env\.|\benv\(|\bsecret\()'?([A-Z][A-Z_]+)/g)) {
          used.add(match[1])
        }
      }
      // what the Dockerfile sets for itself is not for .env
      const inImage = new Set(['NODE_ENV', 'PORT', 'DATA_DIR'])
      for (const name of used) {
        expect(inImage.has(name) || name in example, `${name} is read by server.js and is not in .env.example`).to.equal(true)
      }
      for (const name of ['IMAGE', 'TAG', 'HOST_PORT']) {
        expect(example, name).to.have.property(name)
      }
    })

    it('has a cms.json with the settings that are not secret: the CMS only writes that file when it is missing, and a secret there would be in the image', () => {
      const text = read('cms.json')
      expect(text).not.to.match(/"(secret|password|token|apiKey)"\s*:/i)
      const config = JSON.parse(text)
      expect(config.auth).to.equal(undefined)
      expect(config.session).to.equal(undefined)
      expect(config.security.localAdmin).to.equal(false)
      expect(config.security.strongSecrets).to.equal(true)
    })

    it('depends on a version of embed-cms that is this one or an earlier one, with a lock file that names it', () => {
      const pkg = JSON.parse(read('package.json'))
      // `^3.0.4`: the version it starts from is not after the one that is in this checkout (the example can only ask for what was published)
      const asked = pkg.dependencies['embed-cms'].replace(/^[^\d]*/, '').split('.').map(Number)
      const current = rootPackage.version.split('.').map(Number)
      const later = asked.some((part, index) => asked.slice(0, index).every((same, before) => same === current[before]) && part > current[index])
      expect(later, `embed-cms ${pkg.dependencies['embed-cms']} is later than this version, ${rootPackage.version}`).to.equal(false)
      const lock = JSON.parse(read('package-lock.json'))
      expect(lock.packages['node_modules/embed-cms']).to.have.property('version')
      expect(lock.packages['node_modules/embed-cms'].integrity).to.be.a('string')
    })
  })

  describe('the scripts', function () {
    const bash = process.platform !== 'win32' && spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' }).stdout === 'ok\n'
    let dir
    // the scripts and the template in a folder of their own: they write a .env, which is not for the example's folder
    beforeEach(function () {
      if (!bash) {
        this.skip()
      }
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-docker-env-'))
      fs.mkdirSync(path.join(dir, 'scripts'))
      for (const file of ['scripts/common.sh', 'scripts/env.sh', '.env.example']) {
        fs.copyFileSync(path.join(DIR, file), path.join(dir, file))
      }
    })
    afterEach(() => {
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    const env = (...args) => spawnSync('bash', ['scripts/env.sh', ...args], { cwd: dir, encoding: 'utf8' })
    const values = () => Object.fromEntries(fs.readFileSync(path.join(dir, '.env'), 'utf8').split('\n').filter((line) => /^[A-Z_]+=/.test(line)).map((line) => line.split(/=(.*)/s).slice(0, 2)))

    it('parses', () => {
      for (const file of ['build.sh', 'start.sh', 'env.sh', 'common.sh']) {
        const result = spawnSync('bash', ['-n', path.join(DIR, 'scripts', file)], { encoding: 'utf8' })
        expect(result.status, `${file}: ${result.stderr}`).to.equal(0)
      }
    })

    it('makes a .env with random secrets, prints none of them, and keeps the file for its owner', () => {
      const result = env()
      expect(result.status, result.stderr).to.equal(0)
      const made = values()
      expect(made.AUTH_SECRET).to.match(/^[0-9a-f]{64}$/)
      expect(made.SESSION_SECRET).to.match(/^[0-9a-f]{64}$/)
      expect(made.AUTH_SECRET).not.to.equal(made.SESSION_SECRET)
      expect(made.ADMIN_PASSWORD).to.match(/^[0-9a-f]{24}$/)
      expect(made.ADMIN_USERNAME).to.equal('admin')
      for (const name of ['AUTH_SECRET', 'SESSION_SECRET', 'ADMIN_PASSWORD']) {
        expect(result.stdout + result.stderr).not.to.include(made[name])
      }
      expect(fs.statSync(path.join(dir, '.env')).mode & 0o077).to.equal(0)
    })

    it('changes nothing in a .env that is complete, and fills only the secret that is empty', () => {
      env()
      const before = fs.readFileSync(path.join(dir, '.env'), 'utf8')
      expect(env().status).to.equal(0)
      expect(fs.readFileSync(path.join(dir, '.env'), 'utf8')).to.equal(before)
      const first = values()
      fs.writeFileSync(path.join(dir, '.env'), before.replace(/^SESSION_SECRET=.*$/m, 'SESSION_SECRET='))
      expect(env().status).to.equal(0)
      const after = values()
      expect(after.AUTH_SECRET).to.equal(first.AUTH_SECRET)
      expect(after.ADMIN_PASSWORD).to.equal(first.ADMIN_PASSWORD)
      expect(after.SESSION_SECRET).to.match(/^[0-9a-f]{64}$/).and.not.equal(first.SESSION_SECRET)
    })

    it('keeps the values that a person wrote, and a file saved on Windows (a line end of two characters)', () => {
      fs.writeFileSync(path.join(dir, '.env'), `AUTH_SECRET=${SECRET}\r\nSESSION_SECRET=${OTHER_SECRET}\r\nADMIN_USERNAME=boss\r\nADMIN_PASSWORD=${PASSWORD}\r\n`)
      const result = env()
      expect(result.status, result.stderr).to.equal(0)
      expect(values()).to.include({ AUTH_SECRET: SECRET, SESSION_SECRET: OTHER_SECRET, ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: PASSWORD })
    })

    it('refuses a .env whose secrets are short or the same, and says which, without writing', () => {
      fs.writeFileSync(path.join(dir, '.env'), 'AUTH_SECRET=short\nSESSION_SECRET=short\nADMIN_PASSWORD=tiny\nADMIN_USERNAME=admin\n')
      const result = env('--check')
      expect(result.status).to.equal(1)
      expect(result.stderr).to.include('AUTH_SECRET is missing or shorter than 32')
      expect(result.stderr).to.include('SESSION_SECRET is missing or shorter than 32')
      expect(result.stderr).to.include('ADMIN_PASSWORD is shorter than 12')
      expect(fs.readFileSync(path.join(dir, '.env'), 'utf8')).to.include('AUTH_SECRET=short')
      fs.writeFileSync(path.join(dir, '.env'), `AUTH_SECRET=${SECRET}\nSESSION_SECRET=${SECRET}\n`)
      expect(env('--check').stderr).to.include('are the same value')
    })

    it('does not need an administrator once there is one: a .env with no ADMIN_PASSWORD line is right', () => {
      fs.writeFileSync(path.join(dir, '.env'), `AUTH_SECRET=${SECRET}\nSESSION_SECRET=${OTHER_SECRET}\n`)
      expect(env('--check').status).to.equal(0)
    })

    it('has --check on a folder with no .env fail, and write nothing', () => {
      const result = env('--check')
      expect(result.status).to.equal(1)
      expect(fs.existsSync(path.join(dir, '.env'))).to.equal(false)
    })
  })

  describe('server.js, as the container runs it', function () {
    this.timeout(120000)
    let tmp, modules
    before(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-docker-'))
      // `require('embed-cms')` finds this checkout, as it finds the package in the image
      modules = path.join(tmp, 'node_modules')
      fs.mkdirSync(modules)
      fs.symlinkSync(ROOT, path.join(modules, 'embed-cms'), 'junction')
    })
    after(() => {
      // the link first, alone: what is removed is the link, never the checkout it points to
      try {
        fs.unlinkSync(path.join(modules, 'embed-cms'))
      } catch {
        fs.rmdirSync(path.join(modules, 'embed-cms'))
      }
      // (a database that was just closed can still be held for a moment on Windows)
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    })

    /** starts server.js in production over a data folder, with the environment of a container; waits for its ready message or its end */
    function start (env, folder) {
      return new Promise((resolve) => {
        const data = path.join(tmp, folder)
        const child = spawn(process.execPath, ['server.js'], {
          cwd: DIR,
          env: { PATH: process.env.PATH, NODE_PATH: modules, NODE_ENV: 'production', DATA_DIR: data, LOG_LEVEL: 'error', ...env }
        })
        let output = ''
        const exited = new Promise((done) => child.once('exit', (code, signal) => done({ code, signal })))
        const result = (extra) => ({ output: () => output, data, exited, stop: async () => { child.kill('SIGTERM'); return exited }, ...extra })
        child.stdout.on('data', (chunk) => {
          output += chunk
          if (/The CMS is at/.test(output)) {
            resolve(result({ ready: true }))
          }
        })
        child.stderr.on('data', (chunk) => { output += chunk })
        child.once('exit', (code) => resolve(result({ ready: false, code })))
      })
    }

    const secrets = (port) => ({ PORT: String(port), AUTH_SECRET: SECRET, SESSION_SECRET: OTHER_SECRET, ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: PASSWORD })
    const basic = (user, password) => ({ headers: { authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` } })
    const status = async (port, url, options) => (await get(`http://127.0.0.1:${port}${url}`, options)).status

    /** every file of a folder, as text */
    function everything (folder) {
      return fs.readdirSync(folder, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => fs.readFileSync(path.join(entry.parentPath || entry.path, entry.name), 'latin1'))
        .join('\n')
    }

    it('refuses to start in production without the secrets, and names the one that is missing', async () => {
      const run = await start({ PORT: String(await freePort()) }, 'none')
      expect(run.ready).to.equal(false)
      expect(run.code).to.equal(1)
      expect(run.output()).to.include('AUTH_SECRET is missing or shorter than 32 characters')
      const short = await start({ PORT: String(await freePort()), AUTH_SECRET: SECRET, SESSION_SECRET: 'short' }, 'short')
      expect(short.code).to.equal(1)
      expect(short.output()).to.include('SESSION_SECRET is missing')
    })

    it('starts with them: answers its healthcheck, shows the notes to everybody and the users to the administrator only, and has no localAdmin', async () => {
      const port = await freePort()
      // a fresh folder, also when the test is tried again
      fs.rmSync(path.join(tmp, 'first'), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
      const run = await start(secrets(port), 'first')
      expect(run.ready, run.output()).to.equal(true)
      try {
        expect(await status(port, '/healthz')).to.equal(200)
        const notes = await (await get(`http://127.0.0.1:${port}/api/notes`)).json()
        expect(notes.map((note) => note.slug).sort()).to.deep.equal(['container', 'secrets'])
        expect(await status(port, '/api/_users')).to.equal(401)
        expect(await status(port, '/api/_users', basic('boss', PASSWORD))).to.equal(200)
        expect(await status(port, '/api/_users', basic('boss', 'the wrong password'))).to.equal(401)
        expect(await status(port, '/api/_users', basic('localAdmin', 'localAdmin'))).to.equal(401)
        expect(run.output()).to.include('The administrator boss was made')
      } finally {
        await run.stop()
      }
    })

    it('leaves with 0 when it is stopped (SIGTERM, what docker stop sends), writing no secret anywhere: not in the data it keeps, not in the cms.json of the image, not in what it prints', async function () {
      const before = read('cms.json')
      const run = await start(secrets(await freePort()), 'quiet')
      expect(run.ready, run.output()).to.equal(true)
      const ended = await run.stop()
      // a supervisor does not count a stop as a failure. (There is no SIGTERM to catch on Windows: the process is ended.)
      if (process.platform !== 'win32') {
        expect(ended).to.deep.equal({ code: 0, signal: null })
      }
      const kept = everything(run.data)
      expect(kept.length).to.be.greaterThan(0)
      for (const secret of [SECRET, OTHER_SECRET, PASSWORD]) {
        expect(kept, 'the data').not.to.include(secret)
        expect(run.output(), 'the output').not.to.include(secret)
      }
      expect(read('cms.json')).to.equal(before)
    })

    it('starts again over what it kept: the notes are not made twice, the administrator is not made again, and its password is not needed any more', async () => {
      // the data of the test before, which was stopped
      const folder = 'quiet'
      if (!fs.existsSync(path.join(tmp, folder))) {
        // run on its own (mocha -g): make the data first
        const first = await start(secrets(await freePort()), folder)
        expect(first.ready, first.output()).to.equal(true)
        await first.stop()
      }
      const port = await freePort()
      const { ADMIN_PASSWORD: _gone, ...without } = secrets(port)
      const second = await start(without, folder)
      expect(second.ready, second.output()).to.equal(true)
      try {
        expect((await (await get(`http://127.0.0.1:${port}/api/notes`)).json()).length).to.equal(2)
        expect(second.output()).not.to.include('was made')
        expect(await status(port, '/api/_users', basic('boss', PASSWORD))).to.equal(200)
      } finally {
        await second.stop()
      }
    })

    it('makes no administrator from a password that is too short, and says so', async () => {
      const port = await freePort()
      const run = await start({ ...secrets(port), ADMIN_PASSWORD: 'tiny' }, 'tiny')
      expect(run.ready, run.output()).to.equal(true)
      try {
        expect(run.output()).to.include('ADMIN_PASSWORD is shorter than 12 characters')
        expect(await status(port, '/api/_users', basic('boss', 'tiny'))).to.equal(401)
      } finally {
        await run.stop()
      }
    })
  })
})
