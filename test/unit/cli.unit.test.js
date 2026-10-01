const path = require('path')
const os = require('os')
const fs = require('fs-extra')
const { spawn } = require('child_process')
const { expect } = require('chai')
const { cliOptions, DEV_OPTIONS } = require('../../lib/cliOptions')

const ROOT = path.resolve(__dirname, '..', '..')

// The cms command (server.js) is the development harness of node-cms when it runs from a clone of node-cms itself, and a
// plain CMS everywhere else: it used to write its development options (a sync of resources the project does not have,
// replication off) into the cms.json of every new project.
describe('cms command options (unit)', () => {
  it('uses the development options in the node-cms folder itself', () => {
    expect(cliOptions(ROOT, ROOT)).to.deep.equal(DEV_OPTIONS)
    expect(DEV_OPTIONS).to.have.property('sync')
  })

  it('uses no options of its own in a project folder', () => {
    expect(cliOptions(path.join(os.tmpdir(), 'my-site'), ROOT)).to.deep.equal({})
  })

  it('writes a cms.json without the development options in a new project', async function () {
    this.timeout(20000)
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'node-cms-cli-'))
    const port = String(20000 + Math.floor(Math.random() * 20000))
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: dir, env: { ...process.env, PORT: port, LOG_LEVEL: 'info' } })
    try {
      await new Promise((resolve, reject) => {
        let output = ''
        const timer = setTimeout(() => reject(new Error(`no start: ${output}`)), 15000)
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
