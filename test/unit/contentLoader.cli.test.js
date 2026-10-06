const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const sharp = require('sharp')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')

// The cms-load command, as a program: a project folder with its resources and a content file, the executable run in it, its output and its exit code.

const ROOT = path.resolve(__dirname, '..', '..')
const BIN = path.join(ROOT, 'bin', 'cmsLoad.js')
const RESOURCES = path.join(ROOT, 'test', 'fixtures', 'contentResources')

describe('cms-load, the command (unit)', function () {
  // the package is loaded from disk each time: as long as a slow disk needs
  this.timeout(240000)
  let project

  const run = (...args) => {
    const result = spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8', timeout: 200000, env: { ...process.env, LOG_LEVEL: 'silent' } })
    return { code: result.status, out: result.stdout, err: result.stderr }
  }
  const content = () => ({
    settings: [{ name: { enUS: 'The Review' } }],
    authors: [{ name: 'Mei Lin', slug: 'mei-lin', photo: 'attachment://files/mei.png' }],
    categories: [{ slug: 'travel', name: { enUS: 'Travel' } }],
    articles: [{ slug: 'lisbon', title: { enUS: 'Lisbon' }, author: 'authors://mei-lin', categories: ['categories://travel'], published: true }]
  })
  const write = (name, data) => {
    fs.mkdirSync(path.dirname(path.join(project, name)), { recursive: true })
    fs.writeFileSync(path.join(project, name), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data))
  }

  beforeEach(async () => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-load-project-'))
    fs.cpSync(RESOURCES, path.join(project, 'resources'), { recursive: true })
    write('files/mei.png', await sharp({ create: { width: 4, height: 4, channels: 3, background: '#e86f8c' } }).png().toBuffer())
    write('content.json', content())
  })
  afterEach(() => {
    // (Windows keeps a folder busy for a moment after the program that ran in it ends; a folder in the temporary directory that stays is not a failure of the test)
    try {
      fs.rmSync(project, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    } catch {
      // left for the system to clean
    }
  })

  it('shows its help, and answers 2 to a command it does not understand, without starting the CMS', () => {
    const help = run('--help')
    expect(help.code).to.equal(0)
    expect(help.out).to.include('Usage: cms-load <content.json>')
    const wrong = run()
    expect(wrong.code).to.equal(2)
    expect(wrong.err).to.include('Give the JSON file to load')
    expect(fs.existsSync(path.join(project, 'cms.json'))).to.equal(false)
  })

  it('loads the content of a file into the project, and says what it did', () => {
    const result = run('content.json')
    expect(result.err).to.equal('')
    expect(result.code).to.equal(0)
    expect(result.out).to.include('authors/mei-lin: created, 1 file added')
    expect(result.out).to.include('articles/lisbon: created')
    expect(result.out).to.include('Done: 4 created, 0 updated, 0 unchanged; files: 1 added, 0 removed, 0 unchanged.')
    expect(fs.existsSync(path.join(project, 'data'))).to.equal(true)
  })

  it('finds everything in place the second time', () => {
    expect(run('content.json').code).to.equal(0)
    const again = run('content.json')
    expect(again.code).to.equal(0)
    expect(again.out).to.include('Done: 0 created, 0 updated, 4 unchanged; files: 0 added, 0 removed, 1 unchanged.')
  })

  it('writes nothing with --dry-run, and says so', () => {
    const dry = run('content.json', '--dry-run')
    expect(dry.code).to.equal(0)
    expect(dry.out).to.include('Would have 4 created')
    expect(dry.out).to.include('Nothing was written.')
    // (a real load after it still creates everything)
    expect(run('content.json').out).to.include('Done: 4 created')
  })

  it('says only the summary with --quiet', () => {
    const result = run('content.json', '--quiet')
    expect(result.code).to.equal(0)
    expect(result.out.trim().split('\n')).to.have.length(1)
    expect(result.out).to.include('Done: 4 created')
  })

  it('lists the problems of a content file, answers 1 and writes nothing', () => {
    const wrong = content()
    wrong.articles[0].author = 'authors://nobody'
    write('content.json', wrong)
    const result = run('content.json')
    expect(result.code).to.equal(1)
    expect(result.err).to.include('articles[0].author: there is no authors with slug "nobody"')
    expect(result.err).to.include('Nothing was written.')
    // (so the next load, once it is mended, creates all of it)
    write('content.json', content())
    expect(run('content.json').out).to.include('Done: 4 created')
  })

  it('names the field that tells the records apart with --key, and reads another cms.json with --config', () => {
    write('content.json', { categories: [{ slug: 'a', order: 7, name: { enUS: 'A' } }] })
    expect(run('content.json', '--key', 'categories=order').code).to.equal(0)
    fs.mkdirSync(path.join(project, 'config'))
    fs.writeFileSync(path.join(project, 'config', 'other.json'), JSON.stringify({ resources: path.join(project, 'resources'), data: path.join(project, 'other-data') }))
    const result = run('content.json', '--config', path.join(project, 'config', 'other.json'))
    expect(result.err).to.equal('')
    expect(result.code).to.equal(0)
    expect(fs.existsSync(path.join(project, 'other-data'))).to.equal(true)
  })

  it('keeps a field the resource does not declare with --loose, and reports it without', () => {
    write('content.json', { categories: [{ slug: 'a', colour: 'red' }] })
    expect(run('content.json').code).to.equal(1)
    expect(run('content.json', '--loose').code).to.equal(0)
  })

  it('answers 3 for a file that cannot be read', () => {
    const result = run('missing.json')
    expect(result.code).to.equal(3)
    expect(result.err).to.include('Cannot read the content file')
  })

  it('answers 3 and says to stop the server when the data folder is taken', async () => {
    // a CMS that is running on the data folder the command is given
    const app = await startApp({ resources: RESOURCES })
    try {
      const config = path.join(project, 'taken.json')
      fs.writeFileSync(config, JSON.stringify({ resources: path.join(project, 'resources'), data: app.dataDir }))
      const result = run('content.json', '--config', config)
      expect(result.code).to.equal(3)
      expect(result.err).to.include('Stop it first')
    } finally {
      await app.close()
    }
  })
})
