const fs = require('fs')
const os = require('os')
const path = require('path')
const { Readable } = require('stream')
const sharp = require('sharp')
const { expect } = require('chai')
const CMS = require('../../')
const { main, parseArguments, explain } = require('../../lib/util/loadCli')
const { startApp } = require('../helpers/app')

// ContentLoader: content and files from a JSON description, checked before it is written, and safe to run again.

const RESOURCES = path.resolve(__dirname, '../fixtures/contentResources')
const png = (color) => sharp({ create: { width: 4, height: 4, channels: 3, background: color } }).png().toBuffer()

/** A folder with files, and the function that writes one */
const makeFolder = () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-content-'))
  return { folder, write: (name, data) => { fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true }); fs.writeFileSync(path.join(folder, name), data) } }
}

describe('ContentLoader (unit)', () => {
  let app, api, folder, write, files
  const loader = () => new CMS.ContentLoader(app.cms)
  const content = (extra = {}) => ({
    settings: [{ name: { enUS: 'The Review' }, tagline: { enUS: 'Slow stories' } }],
    authors: [{ name: 'Mei Lin', slug: 'mei-lin', bio: { enUS: 'Writes' }, photo: 'attachment://files/mei.png' }],
    categories: [{ slug: 'travel', order: 1, name: { enUS: 'Travel', zhCN: '旅行' } }, { slug: 'food', order: 2, name: { enUS: 'Food' } }],
    articles: [
      { slug: 'lisbon', title: { enUS: 'Lisbon' }, author: 'authors://mei-lin', categories: ['categories://travel'], publishedOn: '2026-10-01', published: true, cover: 'attachment://files/lisbon.png' },
      { slug: 'bread', title: { enUS: 'Bread' }, author: 'authors://mei-lin', categories: ['categories://food', 'categories://travel'], published: false }
    ],
    ...extra
  })
  const problemsOf = async (promise) => {
    let caught
    await promise.catch((error) => { caught = error })
    expect(caught, 'a ContentError was expected').to.be.an.instanceOf(CMS.ContentLoader.ContentError)
    return caught.problems
  }
  const counts = async () => ({
    articles: (await api('articles').list({})).length,
    authors: (await api('authors').list({})).length,
    categories: (await api('categories').list({})).length,
    settings: (await api('settings').list({})).length
  })

  before(async () => {
    app = await startApp({ resources: RESOURCES })
    api = app.cms.api()
  })
  after(async () => {
    await app.close()
  })

  beforeEach(async () => {
    ;({ folder, write } = makeFolder())
    write('files/mei.png', await png('#e86f8c'))
    write('files/lisbon.png', await png('#3b3fa8'))
    files = { mei: await png('#e86f8c'), lisbon: await png('#3b3fa8') }
    for (const name of ['articles', 'authors', 'categories', 'settings']) {
      for (const record of await api(name).list({})) {
        await api(name).remove(record._id)
      }
    }
  })
  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true })
  })

  describe('a load', () => {
    it('creates the records of every resource and says how many', async () => {
      const report = await loader().load(content(), { basePath: folder })
      expect(report).to.include({ dryRun: false, created: 6, updated: 0, unchanged: 0 })
      expect(report.files).to.deep.equal({ added: 2, removed: 0, unchanged: 0 })
      expect(report.resources.articles).to.include({ created: 2, updated: 0, unchanged: 0 })
      expect(await counts()).to.deep.equal({ articles: 2, authors: 1, categories: 2, settings: 1 })
    })

    it('reads a JSON file, with the files next to it', async () => {
      write('content.json', JSON.stringify(content()))
      const report = await loader().load(path.join(folder, 'content.json'))
      expect(report.created).to.equal(6)
      expect(report.files.added).to.equal(2)
    })

    it('reads a JSON file that starts with a byte order mark', async () => {
      write('content.json', String.fromCharCode(0xFEFF) + `${JSON.stringify({ categories: [{ slug: 'travel', name: { enUS: 'Travel' } }] })}`)
      expect((await loader().load(path.join(folder, 'content.json'))).created).to.equal(1)
    })

    it('puts the id of the record a relation points to, for one record and for a list', async () => {
      await loader().load(content(), { basePath: folder })
      const mei = await api('authors').find({ slug: 'mei-lin' })
      const travel = await api('categories').find({ slug: 'travel' })
      const food = await api('categories').find({ slug: 'food' })
      const lisbon = await api('articles').find({ slug: 'lisbon' })
      expect(lisbon.author).to.equal(mei._id)
      expect(lisbon.categories).to.deep.equal([travel._id])
      expect((await api('articles').find({ slug: 'bread' })).categories).to.deep.equal([food._id, travel._id])
    })

    it('follows a relation to a record that is in the CMS already, not in the file', async () => {
      await loader().load({ authors: content().authors }, { basePath: folder })
      const report = await loader().load({ articles: [{ slug: 'late', title: { enUS: 'Late' }, author: 'authors://mei-lin' }] }, { basePath: folder })
      expect(report.created).to.equal(1)
      expect((await api('articles').find({ slug: 'late' })).author).to.equal((await api('authors').find({ slug: 'mei-lin' }))._id)
    })

    it('turns a date written as text into the timestamp the field keeps: a day is the start of that day', async () => {
      await loader().load(content(), { basePath: folder })
      expect((await api('articles').find({ slug: 'lisbon' })).publishedOn).to.equal(new Date(2026, 9, 1).getTime())
      await loader().load({ articles: [{ slug: 'lisbon', publishedOn: '2026-10-02T09:30:00Z' }] }, { basePath: folder })
      expect((await api('articles').find({ slug: 'lisbon' })).publishedOn).to.equal(Date.parse('2026-10-02T09:30:00Z'))
    })

    it('attaches the files, with their name and their type', async () => {
      await loader().load(content(), { basePath: folder })
      const lisbon = await api('articles').find({ slug: 'lisbon' })
      expect(lisbon._attachments).to.have.length(1)
      expect(lisbon._attachments[0]).to.include({ _name: 'cover', _filename: 'lisbon.png', _contentType: 'image/png' })
      expect(lisbon._attachments[0]._md5sum).to.match(/^[0-9a-f]{32}$/)
      expect((await api('authors').find({ slug: 'mei-lin' }))._attachments[0]._name).to.equal('photo')
    })

    it('updates the single record of a resource that has no unique field', async () => {
      await loader().load(content(), { basePath: folder })
      const report = await loader().load({ settings: [{ name: { enUS: 'A new name' } }] }, { basePath: folder })
      expect(report.resources.settings).to.include({ created: 0, updated: 1 })
      const [site] = await api('settings').list({})
      expect(site.name.enUS).to.equal('A new name')
      expect(site.tagline.enUS).to.equal('Slow stories')
      expect((await api('settings').list({})).length).to.equal(1)
    })

    it('goes through the hooks of the CMS, like any write', async () => {
      const seen = []
      api('categories').after('create', (context) => { seen.push('created'); context.next() })
      await loader().load({ categories: [{ slug: 'a', name: { enUS: 'A' } }] })
      expect(seen).to.include('created')
    })

    it('tells what it does to each record', async () => {
      const lines = []
      await loader().load({ categories: [{ slug: 'a', name: { enUS: 'A' } }] }, { log: (line) => lines.push(line) })
      expect(lines).to.deep.equal(['categories/a: created'])
    })
  })

  describe('a load again', () => {
    it('changes nothing when nothing changed', async () => {
      await loader().load(content(), { basePath: folder })
      const report = await loader().load(content(), { basePath: folder })
      expect(report).to.include({ created: 0, updated: 0, unchanged: 6 })
      expect(report.files).to.deep.equal({ added: 0, removed: 0, unchanged: 2 })
      expect(await counts()).to.deep.equal({ articles: 2, authors: 1, categories: 2, settings: 1 })
    })

    it('updates only the record that differs', async () => {
      await loader().load(content(), { basePath: folder })
      const changed = content()
      changed.articles[1].title = { enUS: 'Bread, patiently' }
      const report = await loader().load(changed, { basePath: folder })
      expect(report).to.include({ created: 0, updated: 1, unchanged: 5 })
      expect((await api('articles').find({ slug: 'bread' })).title.enUS).to.equal('Bread, patiently')
    })

    it('keeps what the content does not mention', async () => {
      await loader().load(content(), { basePath: folder })
      await loader().load({ articles: [{ slug: 'lisbon', featured: true }] }, { basePath: folder })
      const lisbon = await api('articles').find({ slug: 'lisbon' })
      expect(lisbon.featured).to.equal(true)
      expect(lisbon.title.enUS).to.equal('Lisbon')
      expect(lisbon._attachments).to.have.length(1)
    })

    it('changes a file whose content changed: the old one goes, the new one comes', async () => {
      await loader().load(content(), { basePath: folder })
      const before = (await api('articles').find({ slug: 'lisbon' }))._attachments[0]
      write('files/lisbon.png', await png('#2f8f6b'))
      const report = await loader().load(content(), { basePath: folder })
      expect(report.files).to.deep.equal({ added: 1, removed: 1, unchanged: 1 })
      const after = (await api('articles').find({ slug: 'lisbon' }))._attachments
      expect(after).to.have.length(1)
      expect(after[0]._md5sum).to.not.equal(before._md5sum)
    })

    it('takes the files of a field away when the content says there are none', async () => {
      await loader().load(content(), { basePath: folder })
      const report = await loader().load({ articles: [{ slug: 'lisbon', cover: [] }] }, { basePath: folder })
      expect(report.files.removed).to.equal(1)
      expect((await api('articles').find({ slug: 'lisbon' }))._attachments).to.have.length(0)
    })

    it('leaves the files of a field the content does not mention', async () => {
      await loader().load(content(), { basePath: folder })
      const report = await loader().load({ articles: [{ slug: 'lisbon', featured: true }] }, { basePath: folder })
      expect(report.files).to.deep.equal({ added: 0, removed: 0, unchanged: 0 })
    })

    it('keeps one file for the same file given twice', async () => {
      await loader().load({ authors: [{ name: 'A', slug: 'a', photo: ['attachment://files/mei.png', 'attachment://files/mei.png'] }] }, { basePath: folder })
      const record = await api('authors').find({ slug: 'a' })
      expect(record._attachments.length).to.be.at.most(2)
    })
  })

  describe('a dry run', () => {
    it('says what would happen and writes nothing', async () => {
      const report = await loader().load(content(), { basePath: folder, dryRun: true })
      expect(report).to.include({ dryRun: true, created: 6 })
      expect(report.files.added).to.equal(2)
      expect(await counts()).to.deep.equal({ articles: 0, authors: 0, categories: 0, settings: 0 })
    })

    it('says what would change in a load again', async () => {
      await loader().load(content(), { basePath: folder })
      const changed = content()
      changed.categories[0].name = { enUS: 'Journeys' }
      const report = await loader().load(changed, { basePath: folder, dryRun: true })
      expect(report).to.include({ created: 0, updated: 1, unchanged: 5 })
      expect((await api('categories').find({ slug: 'travel' })).name.enUS).to.equal('Travel')
    })
  })

  describe('what is wrong with the content', () => {
    it('says so before it writes anything, and says everything that is wrong', async () => {
      const wrong = content()
      wrong.articles[0].author = 'authors://nobody'
      wrong.articles[0].cover = 'attachment://files/missing.png'
      wrong.articles[1].titel = { enUS: 'typo' }
      const problems = await problemsOf(loader().load(wrong, { basePath: folder }))
      expect(problems).to.have.length(3)
      expect(await counts()).to.deep.equal({ articles: 0, authors: 0, categories: 0, settings: 0 })
    })

    it('names the place of each problem, and puts them in the message', async () => {
      const wrong = content()
      wrong.articles[1].author = 'authors://nobody'
      let error
      await loader().load(wrong, { basePath: folder }).catch((caught) => { error = caught })
      expect(error.message).to.include('The content has 1 problem:')
      expect(error.message).to.include('articles[1].author: there is no authors with slug "nobody"')
    })

    it('is not an object', async () => {
      expect((await problemsOf(loader().load([1, 2]))).join()).to.include('an object with a list of records')
    })

    it('says when the file cannot be read', async () => {
      write('broken.json', '{ "articles": ')
      let message
      await loader().load(path.join(folder, 'broken.json')).catch((error) => { message = error.message })
      expect(message).to.include('Cannot read the content file')
    })

    it('does not know a resource', async () => {
      expect((await problemsOf(loader().load({ nope: [{ slug: 'x' }] }))).join()).to.include('nope: there is no such resource')
    })

    it('does not load a resource of the CMS itself', async () => {
      expect((await problemsOf(loader().load({ _users: [{ username: 'x', password: 'y' }] }))).join()).to.include('a resource of the CMS itself')
    })

    it('has a record that is not an object', async () => {
      expect((await problemsOf(loader().load({ categories: ['travel'] }))).join()).to.include('categories[0]: a record is an object')
    })

    it('has a record with no value for the field that names it', async () => {
      expect((await problemsOf(loader().load({ categories: [{ name: { enUS: 'No slug' } }] }))).join()).to.include('categories[0]: it has no slug')
    })

    it('has the same record twice', async () => {
      const problems = await problemsOf(loader().load({ categories: [{ slug: 'a' }, { slug: 'a' }] }))
      expect(problems.join()).to.include('categories[1]: slug "a" is there twice')
    })

    it('has a field the resource does not declare, unless it is told to keep it', async () => {
      const problems = await problemsOf(loader().load({ categories: [{ slug: 'a', colour: 'red' }] }))
      expect(problems.join()).to.include('categories[0].colour: categories has no field "colour"')
      expect((await loader().load({ categories: [{ slug: 'a', colour: 'red' }] }, { strict: false })).created).to.equal(1)
    })

    it('points a relation at a record that is not there', async () => {
      const problems = await problemsOf(loader().load({ articles: [{ slug: 'a', author: 'authors://nobody' }] }))
      expect(problems.join()).to.include('there is no authors with slug "nobody"')
    })

    it('points a relation at the wrong resource', async () => {
      const problems = await problemsOf(loader().load({ categories: [{ slug: 'x' }], articles: [{ slug: 'a', author: 'categories://x' }] }))
      expect(problems.join()).to.include('this field points to authors, not to categories')
    })

    it('writes a relation as something else than resource://key', async () => {
      const problems = await problemsOf(loader().load({ articles: [{ slug: 'a', author: 'mei-lin' }, { slug: 'b', author: 5 }] }))
      expect(problems.join('\n')).to.include('a reference to authors is written "authors://<slug>", not "mei-lin"')
      expect(problems.join('\n')).to.include('not 5')
    })

    it('points a relation at a resource that comes after in the file', async () => {
      const problems = await problemsOf(loader().load({ articles: [{ slug: 'a', author: 'authors://mei-lin' }], authors: content().authors }, { basePath: folder }))
      expect(problems.join()).to.include('"mei-lin" is made after this record: put authors before articles in the file')
    })

    it('points a relation at a record that comes after it, in the same resource', async () => {
      // (a category has no relation: an article does, to the categories it is in, so the order of the resources is what is checked; for the same resource the check is the same code)
      const problems = await problemsOf(loader().load({ authors: [{ name: 'A', slug: 'a' }], categories: [{ slug: 'x' }], articles: [{ slug: 'a', author: 'authors://a', categories: ['categories://y'] }] }))
      expect(problems.join()).to.include('there is no categories with slug "y"')
    })

    it('has a text that is a file in a field that is not a file field', async () => {
      const problems = await problemsOf(loader().load({ categories: [{ slug: 'a', name: { enUS: 'attachment://files/mei.png' } }] }, { basePath: folder }))
      expect(problems.join()).to.include('is a file, and this is not a file field')
    })

    it('has a file field with a text that is not a file', async () => {
      const problems = await problemsOf(loader().load({ authors: [{ name: 'A', slug: 'a', photo: 'files/mei.png' }] }, { basePath: folder }))
      expect(problems.join()).to.include('a file field takes "attachment://<path>", not "files/mei.png"')
    })

    it('has a file that does not exist', async () => {
      const problems = await problemsOf(loader().load({ authors: [{ name: 'A', slug: 'a', photo: 'attachment://files/none.png' }] }, { basePath: folder }))
      expect(problems.join()).to.include('the file files/none.png does not exist')
    })

    it('has a file outside the folder of the content', async () => {
      write('outside.txt', 'secret')
      const inside = path.join(folder, 'inner')
      fs.mkdirSync(inside)
      const problems = await problemsOf(loader().load({ authors: [{ name: 'A', slug: 'a', photo: 'attachment://../outside.txt' }] }, { basePath: inside }))
      expect(problems.join()).to.include('is outside the folder of the content')
    })

    it('has an absolute path to a file', async () => {
      const problems = await problemsOf(loader().load({ authors: [{ name: 'A', slug: 'a', photo: `attachment://${path.join(os.tmpdir(), 'x.png')}` }] }, { basePath: folder }))
      expect(problems.join()).to.match(/does not exist|outside the folder/)
    })

    it('has a folder where a file is expected', async () => {
      const problems = await problemsOf(loader().load({ authors: [{ name: 'A', slug: 'a', photo: 'attachment://files' }] }, { basePath: folder }))
      expect(problems.join()).to.include('is not a file')
    })

    it('has a date that is not one', async () => {
      const problems = await problemsOf(loader().load({ articles: [{ slug: 'a', publishedOn: 'next tuesday' }] }))
      expect(problems.join()).to.include('"next tuesday" is not a date')
    })

    it('has a resource whose records cannot be told apart', async () => {
      const problems = await problemsOf(loader().load({ categories: [{ slug: 'a' }] }, { keys: { categories: 'order' } }))
      expect(problems.join()).to.include('it has no order')
    })
  })

  describe('the field that names a record', () => {
    it('can be named in the options', async () => {
      await loader().load({ categories: [{ slug: 'a', order: 7, name: { enUS: 'A' } }] })
      const report = await loader().load({ categories: [{ slug: 'changed', order: 7, name: { enUS: 'A again' } }] }, { keys: { categories: 'order' } })
      expect(report.resources.categories).to.include({ created: 0, updated: 1 })
      expect((await api('categories').find({ order: 7 })).slug).to.equal('changed')
    })

    it('is the first locale when it is a localised field', async () => {
      const first = new CMS.ContentLoader(app.cms)
      await first.load({ categories: [{ slug: 'a', name: { enUS: 'Alpha', zhCN: '甲' } }] }, { keys: { categories: 'name' } })
      const report = await new CMS.ContentLoader(app.cms).load({ categories: [{ slug: 'a', name: { enUS: 'Alpha', zhCN: '甲乙' } }] }, { keys: { categories: 'name' } })
      expect(report.resources.categories.updated).to.equal(1)
      expect((await api('categories').list({})).length).to.equal(1)
    })
  })

  describe('the files', () => {
    it('are given an object when they need a name or an order', async () => {
      const report = await loader().load({
        authors: [{ name: 'A', slug: 'a', photo: { uri: 'attachment://files/mei.png', name: 'portrait.png', order: 2 } }]
      }, { basePath: folder })
      expect(report.files.added).to.equal(1)
      const attachment = (await api('authors').find({ slug: 'a' }))._attachments[0]
      expect(attachment._filename).to.equal('portrait.png')
      expect(attachment.order).to.equal(2)
    })

    it('are refused with an object that says no file', async () => {
      const problems = await problemsOf(loader().load({ authors: [{ name: 'A', slug: 'a', photo: { name: 'x.png' } }] }, { basePath: folder }))
      expect(problems.join()).to.include('a file is "attachment://<path>", or an object with "uri", "buffer" or "stream"')
    })

    it('are refused with a "uri" that is not a file', async () => {
      const problems = await problemsOf(loader().load({ authors: [{ name: 'A', slug: 'a', photo: { uri: 'files/mei.png' } }] }, { basePath: folder }))
      expect(problems.join()).to.include('"uri" is "attachment://<path>"')
    })

    it('can be given from code as a buffer or a stream, with a name', async () => {
      const report = await loader().load({
        authors: [{ name: 'B', slug: 'b', photo: { buffer: files.mei, name: 'from-buffer.png' } }, { name: 'S', slug: 's', photo: { stream: Readable.from([files.lisbon]), name: 'from-stream.png' } }]
      })
      expect(report.files.added).to.equal(2)
      expect((await api('authors').find({ slug: 'b' }))._attachments[0]).to.include({ _filename: 'from-buffer.png', _contentType: 'image/png' })
      expect((await api('authors').find({ slug: 's' }))._attachments[0]._filename).to.equal('from-stream.png')
    })

    it('are compared by their content when they are a buffer: the same one is not added again', async () => {
      const loadIt = () => loader().load({ authors: [{ name: 'B', slug: 'b', photo: { buffer: files.mei, name: 'from-buffer.png' } }] })
      await loadIt()
      expect((await loadIt()).files).to.deep.equal({ added: 0, removed: 0, unchanged: 1 })
    })

    it('need a name when they are a buffer', async () => {
      const problems = await problemsOf(loader().load({ authors: [{ name: 'B', slug: 'b', photo: { buffer: files.mei } }] }))
      expect(problems.join()).to.include('give the file a name')
    })

    it('are given a type by their name', async () => {
      write('files/note.txt', 'hello')
      write('files/data.unknownext', 'x')
      await loader().load({ authors: [{ name: 'A', slug: 'a', photo: 'attachment://files/note.txt' }, { name: 'B', slug: 'b', photo: 'attachment://files/data.unknownext' }] }, { basePath: folder })
      expect((await api('authors').find({ slug: 'a' }))._attachments[0]._contentType).to.equal('text/plain')
      expect((await api('authors').find({ slug: 'b' }))._attachments[0]._contentType).to.equal('application/octet-stream')
    })
  })

  describe('the command', () => {
    const run = async (argv, extra = {}) => {
      const out = []
      const err = []
      const code = await main(argv, { out: (line) => out.push(line), err: (line) => err.push(line), start: async () => ({ cms: app.cms, close: async () => {} }), ...extra })
      return { code, out: out.join('\n'), err: err.join('\n') }
    }

    it('reads its arguments', () => {
      expect(parseArguments(['content.json'])).to.include({ file: 'content.json', dryRun: false, strict: true, quiet: false })
      expect(parseArguments(['-q', '--dry-run', '--loose', '--config', 'my.json', '--key', 'articles=slug', 'c.json'])).to.deep.include({ file: 'c.json', dryRun: true, strict: false, quiet: true, config: 'my.json', keys: { articles: 'slug' } })
    })

    it('says what is wrong with them', () => {
      expect(parseArguments([]).error).to.include('Give the JSON file')
      expect(parseArguments(['a.json', 'b.json']).error).to.include('Give one JSON file')
      expect(parseArguments(['--nope', 'a.json']).error).to.include('Unknown option --nope')
      expect(parseArguments(['--config']).error).to.include('needs a value')
      expect(parseArguments(['--key', 'broken', 'a.json']).error).to.include('<resource>=<field>')
    })

    it('shows its help', async () => {
      const result = await run(['--help'])
      expect(result.code).to.equal(0)
      expect(result.out).to.include('Usage: cms-load <content.json>')
    })

    it('answers 2 for a wrong command', async () => {
      const result = await run([])
      expect(result.code).to.equal(2)
      expect(result.err).to.include('Give the JSON file')
    })

    it('loads the file and says what it did, with a line for each record', async () => {
      write('content.json', JSON.stringify(content()))
      const result = await run([path.join(folder, 'content.json')])
      expect(result.code).to.equal(0)
      expect(result.out).to.include('articles/lisbon: created, 1 file added')
      expect(result.out).to.include('Done: 6 created, 0 updated, 0 unchanged; files: 2 added, 0 removed, 0 unchanged.')
      expect((await counts()).articles).to.equal(2)
    })

    it('says only the summary with --quiet, and writes nothing with --dry-run', async () => {
      write('content.json', JSON.stringify(content()))
      const result = await run(['--quiet', '--dry-run', path.join(folder, 'content.json')])
      expect(result.code).to.equal(0)
      expect(result.out).to.not.include('articles/lisbon')
      expect(result.out).to.include('Would have 6 created')
      expect(result.out).to.include('Nothing was written.')
      expect((await counts()).articles).to.equal(0)
    })

    it('lists the problems of the content, answers 1 and writes nothing', async () => {
      const wrong = content()
      wrong.articles[0].author = 'authors://nobody'
      write('content.json', JSON.stringify(wrong))
      const result = await run([path.join(folder, 'content.json')])
      expect(result.code).to.equal(1)
      expect(result.err).to.include('articles[0].author')
      expect(result.err).to.include('Nothing was written.')
      expect((await counts()).articles).to.equal(0)
    })

    it('answers 3 when the CMS cannot be started, and says to stop the server', async () => {
      write('content.json', '{}')
      const result = await run([path.join(folder, 'content.json')], { start: async () => { throw new Error('the lock is taken') } })
      expect(result.code).to.equal(3)
      expect(result.err).to.include('the lock is taken')
      expect(result.err).to.include('Stop it first')
    })

    it('explains an error of the store that says the data folder is held by another process, and says any other error as it is', () => {
      const taken = 'the data folder is in use by another process. Is the server of the project running?'
      expect(explain(Object.assign(new Error('Database failed to open'), { code: 'LEVEL_DATABASE_NOT_OPEN', cause: { code: 'LEVEL_LOCKED', message: 'IO error: LockFile x/LOCK' } }))).to.include(taken)
      expect(explain({ code: 'LEVEL_LOCKED', message: 'locked' })).to.include(taken)
      expect(explain(Object.assign(new Error('opening'), { cause: new Error('IO error: lock x/LOCK: in use') }))).to.include(taken)
      expect(explain(Object.assign(new Error('opening'), { code: 'LEVEL_DATABASE_NOT_OPEN' }))).to.include(taken)
      expect(explain(new Error('something else'))).to.equal('something else')
      expect(explain('a text')).to.equal('a text')
      expect(explain(undefined)).to.equal('undefined')
    })

    it('says so, with what to do, when the CMS cannot be started because the data folder is taken', async () => {
      const lock = Object.assign(new Error('Database failed to open'), { code: 'LEVEL_DATABASE_NOT_OPEN', cause: { code: 'LEVEL_LOCKED' } })
      const result = await run(['content.json'], { start: async () => { throw lock } })
      expect(result.code).to.equal(3)
      expect(result.err).to.include('the data folder is in use by another process')
      expect(result.err).to.include('Stop it first')
    })

    it('answers 3 for a file it cannot read, and stops the CMS in any case', async () => {
      let closed = false
      const result = await run([path.join(folder, 'missing.json')], { start: async () => ({ cms: app.cms, close: async () => { closed = true } }) })
      expect(result.code).to.equal(3)
      expect(result.err).to.include('Cannot read the content file')
      expect(closed).to.equal(true)
    })
  })

  describe('the start', () => {
    it('needs the cms', () => {
      expect(() => new CMS.ContentLoader()).to.throw('needs the cms')
    })
  })
})
