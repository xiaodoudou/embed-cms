const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { expect } = require('chai')
const CMS = require('../../')
const { startApp } = require('../helpers/app')
const { backup, restore, parseArguments, keyOf, ordered } = require('../../lib/util/backupCli')

const EXAMPLE = path.resolve(__dirname, '..', '..', 'docs', 'examples', 'magazine')
const capture = () => {
  const lines = { out: [], err: [] }
  return { lines, io: { out: (text) => lines.out.push(text), err: (text) => lines.err.push(text) } }
}
const md5 = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')
const listFiles = (folder, base = folder) => fs.readdirSync(folder, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? listFiles(path.join(folder, entry.name), base) : [path.relative(base, path.join(folder, entry.name))])
  .sort()

describe('cms-backup and cms-restore (unit)', () => {
  let scratch
  beforeEach(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-backup-')) })
  afterEach(() => fs.rmSync(scratch, { recursive: true, force: true }))

  describe('the arguments', () => {
    it('reads the options, the environment and the mode', () => {
      expect(parseArguments(['api', '--url', 'http://x:1/', '--user', 'a', '--resources', 'authors, articles'], { EMBED_CMS_PASSWORD: 'p' })).to.deep.include({
        positional: ['api'], url: 'http://x:1/', user: 'a', password: 'p', resources: ['authors', 'articles']
      })
      expect(parseArguments(['files', '--server-stopped']).serverStopped).to.equal(true)
      expect(parseArguments(['--out']).error).to.equal('--out needs a value')
      expect(parseArguments(['--nope']).error).to.equal('unknown option --nope')
    })

    it('answers 2 to a wrong command', async () => {
      const { lines, io } = capture()
      expect(await backup([], {}, io)).to.equal(2)
      expect(lines.err[0]).to.contain('say files or api')
      expect(await restore(['files'], {}, io)).to.equal(2)
      expect(lines.err[1]).to.contain('say which backup folder')
    })
  })

  describe('helpers', () => {
    it('names a record by its first unique field, in the first language when it is localised', () => {
      expect(keyOf({ schema: [{ field: 'slug', unique: true }] }, { slug: 'a' })).to.equal('a')
      expect(keyOf({ locales: ['enUS', 'zhCN'], schema: [{ field: 'name', unique: true }] }, { name: { enUS: 'Tea', zhCN: '茶' } })).to.equal('Tea')
      expect(keyOf({ schema: [{ field: 'name' }] }, { name: 'x' })).to.equal(undefined)
    })

    it('puts the targets of relations first', () => {
      const resources = [{ name: 'articles', schema: [{ field: 'author', source: 'authors' }] }, { name: 'authors', schema: [] }]
      expect(ordered(resources).map(resource => resource.name)).to.deep.equal(['authors', 'articles'])
    })
  })

  describe('files', () => {
    it('refuses without --server-stopped, copies the data folder, and restores every _id', async () => {
      const project = path.join(scratch, 'project')
      fs.mkdirSync(path.join(project, 'data', 'notes', 'json'), { recursive: true })
      fs.writeFileSync(path.join(project, 'data', 'notes', 'json', 'db.json'), '{"id-1":"record"}')
      fs.writeFileSync(path.join(project, 'cms.json'), JSON.stringify({ data: './data', auth: { secret: 'kept-secret' } }))
      const config = path.join(project, 'cms.json')
      const { lines, io } = capture()

      expect(await backup(['files', '--config', config], {}, io)).to.equal(2)
      expect(lines.err[0]).to.contain('--server-stopped')

      const out = path.join(scratch, 'backups')
      expect(await backup(['files', '--config', config, '--out', out, '--server-stopped'], {}, io)).to.equal(0)
      const [name] = fs.readdirSync(out)
      const folder = path.join(out, name)
      expect(fs.readFileSync(path.join(folder, 'data', 'notes', 'json', 'db.json'), 'utf8')).to.equal('{"id-1":"record"}')
      expect(JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8')).kind).to.equal('files')
      expect(lines.out.join('\n')).to.contain('every _id')

      fs.writeFileSync(path.join(project, 'data', 'notes', 'json', 'db.json'), 'damaged')
      expect(await restore(['files', folder, '--config', config], {}, io)).to.equal(2)
      expect(await restore(['files', folder, '--config', config, '--server-stopped'], {}, io)).to.equal(0)
      expect(fs.readFileSync(path.join(project, 'data', 'notes', 'json', 'db.json'), 'utf8')).to.equal('{"id-1":"record"}')
      const aside = fs.readdirSync(project).find(item => item.startsWith('data.replaced-'))
      expect(fs.readFileSync(path.join(project, aside, 'notes', 'json', 'db.json'), 'utf8')).to.equal('damaged')
    })

    it('refuses an --out inside the data folder', async () => {
      const project = path.join(scratch, 'project')
      fs.mkdirSync(path.join(project, 'data'), { recursive: true })
      fs.writeFileSync(path.join(project, 'cms.json'), JSON.stringify({ data: './data' }))
      const { lines, io } = capture()
      expect(await backup(['files', '--config', path.join(project, 'cms.json'), '--out', path.join(project, 'data', 'b'), '--server-stopped'], {}, io)).to.equal(2)
      expect(lines.err[0]).to.contain('inside the data folder')
    })
  })

  describe('api', () => {
    let source, target
    const options = { resources: path.join(EXAMPLE, 'resources'), disableJwtLogin: true }

    before(async function () {
      this.timeout(60000)
      source = await startApp(options)
      await new CMS.ContentLoader(source.cms).load(path.join(EXAMPLE, 'content.json'))
    })
    after(async () => {
      await source.close()
      if (target) {
        await target.close()
      }
    })

    const exportSource = async (app, out, extra = []) => {
      const { lines, io } = capture()
      const code = await backup(['api', '--url', app.url, '--user', 'localAdmin', '--out', out, ...extra], { EMBED_CMS_PASSWORD: 'localAdmin' }, io)
      return { code, lines, folder: path.join(out, fs.readdirSync(out)[0]) }
    }

    it('says why it could not read a server', async () => {
      const { lines, io } = capture()
      expect(await backup(['api', '--url', source.url, '--out', scratch], {}, io)).to.equal(3)
      expect(lines.err[0]).to.contain('401')
      expect(await backup(['api', '--url', source.url, '--user', 'localAdmin', '--resources', 'nope', '--out', scratch], { EMBED_CMS_PASSWORD: 'localAdmin' }, io)).to.equal(2)
    })

    it('writes a payload that loads into an empty CMS and exports the same again, with new _id', async function () {
      this.timeout(60000)
      const first = await exportSource(source, path.join(scratch, 'first'))
      expect(first.code).to.equal(0)
      expect(first.lines.out.join('\n')).to.contain('NEW _id')
      const content = JSON.parse(fs.readFileSync(path.join(first.folder, 'content.json'), 'utf8'))
      expect(Object.keys(content)).to.include.members(['authors', 'categories', 'articles'])
      expect(Object.keys(content).indexOf('authors')).to.be.below(Object.keys(content).indexOf('articles'))
      expect(content.articles[0].author).to.match(/^authors:\/\//)
      expect(content.articles[0].cover).to.match(/^attachment:\/\/files\/articles\//)
      expect(content.articles[0]).to.not.have.property('_id')

      target = await startApp(options)
      const report = await new CMS.ContentLoader(target.cms).load(path.join(first.folder, 'content.json'))
      expect(report.created).to.equal(Object.values(content).reduce((sum, list) => sum + list.length, 0))

      const second = await exportSource(target, path.join(scratch, 'second'))
      expect(second.code).to.equal(0)
      expect(JSON.parse(fs.readFileSync(path.join(second.folder, 'content.json'), 'utf8'))).to.deep.equal(content)
      const files = listFiles(path.join(first.folder, 'files'))
      expect(files.length).to.be.greaterThan(0)
      expect(listFiles(path.join(second.folder, 'files'))).to.deep.equal(files)
      for (const file of files) {
        expect(md5(path.join(second.folder, 'files', file))).to.equal(md5(path.join(first.folder, 'files', file)))
      }

      const sourceIds = (await source.cms.api()('articles').list()).map(record => record._id)
      const targetIds = (await target.cms.api()('articles').list()).map(record => record._id)
      expect(targetIds).to.have.length(sourceIds.length)
      expect(targetIds.filter(id => sourceIds.includes(id))).to.deep.equal([])
    })

    it('can be limited to some resources, and warns about a relation it cannot write', async () => {
      const { code, lines, folder } = await exportSource(source, path.join(scratch, 'some'), ['--resources', 'articles'])
      expect(code).to.equal(0)
      expect(lines.err.join('\n')).to.contain('is not in the backup')
      expect(Object.keys(JSON.parse(fs.readFileSync(path.join(folder, 'content.json'), 'utf8')))).to.deep.equal(['articles'])
    })
  })
})
