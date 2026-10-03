const path = require('path')
const os = require('os')
const fs = require('fs-extra')
const { spawn } = require('child_process')
const { expect } = require('chai')
const { cliOptions, DEV_OPTIONS } = require('../../lib/cliOptions')

const ROOT = path.resolve(__dirname, '..', '..')

// The cms command (bin/cms.js) is the development harness of embed-cms when it runs from a clone of embed-cms itself, and a
// plain CMS everywhere else: it used to write its development options (a sync of resources the project does not have,
// replication off) into the cms.json of every new project.
describe('cms command options (unit)', () => {
  it('uses the development options in the embed-cms folder itself', () => {
    expect(cliOptions(ROOT, ROOT, () => ({}))).to.deep.equal(DEV_OPTIONS)
    expect(DEV_OPTIONS).to.have.property('sync')
  })

  it('keeps the sync block of cms.json in the embed-cms folder: the harness only turns the plugin on when there is none', () => {
    const sync = { schedule: { push: '0 3 * * *' } }
    expect(cliOptions(ROOT, ROOT, () => ({ sync }))).to.deep.equal({ disableReplication: true })
    expect(cliOptions(ROOT, ROOT, () => ({ disableDarkMode: false }))).to.deep.equal(DEV_OPTIONS)
  })

  it('reads the cms.json of the folder, and goes without when it is missing or broken', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-cliopts-'))
    try {
      expect(cliOptions(dir, dir)).to.deep.equal(DEV_OPTIONS)
      fs.writeFileSync(path.join(dir, 'cms.json'), '{ not json')
      expect(cliOptions(dir, dir)).to.deep.equal(DEV_OPTIONS)
      fs.writeFileSync(path.join(dir, 'cms.json'), JSON.stringify({ sync: { resources: ['a'] } }))
      expect(cliOptions(dir, dir)).to.not.have.property('sync')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses no options of its own in a project folder', () => {
    expect(cliOptions(path.join(os.tmpdir(), 'my-site'), ROOT)).to.deep.equal({})
  })

  it('writes a cms.json without the development options in a new project', async function () {
    // the server is waited for as long as a slow disk needs (loading the package takes 25s on a WSL mount, 1s on a native disk)
    this.timeout(90000)
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'embed-cms-cli-'))
    const port = String(20000 + Math.floor(Math.random() * 20000))
    const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'cms.js')], { cwd: dir, env: { ...process.env, PORT: port, LOG_LEVEL: 'info' } })
    try {
      await new Promise((resolve, reject) => {
        let output = ''
        const timer = setTimeout(() => reject(new Error(`no start: ${output}`)), 80000)
        const onData = (data) => {
          output += data
          if (output.includes(`localhost:${port}/admin`)) {
            clearTimeout(timer)
            resolve()
          }
        }
        child.stdout.on('data', onData)
        child.stderr.on('data', onData)
        child.on('exit', (code) => reject(new Error(`exited with ${code}: ${output}`)))
      })
      const config = await fs.readJson(path.join(dir, 'cms.json'))
      expect(config).to.not.have.property('sync')
      expect(config.disableReplication).to.equal(false)
    } finally {
      child.kill('SIGTERM')
      await new Promise(resolve => child.once('exit', resolve))
      await fs.remove(dir)
    }
  })
})
