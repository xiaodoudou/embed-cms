const fs = require('fs')
const os = require('os')
const path = require('path')
const { Readable } = require('stream')
const sharp = require('sharp')
const _ = require('lodash')
const { expect } = require('chai')
const CMS = require('../../')
const { startApp } = require('../helpers/app')

// ContentLoader with the other kinds of resources: blocks, localised files and relations, nested fields, a relation to its own resource, one that is declared wrong, and a hook that
// refuses a record.

const png = (color) => sharp({ create: { width: 4, height: 4, channels: 3, background: color } }).png().toBuffer()

const RESOURCES = {
  'people.js': `module.exports = {
    displayname: { enUS: 'People' },
    locales: ['enUS', 'zhCN'],
    schema: [
      { field: 'handle', input: 'string', unique: true, localised: false, label: 'Handle' },
      { field: 'name', input: 'string', label: 'Name' },
      { field: 'manager', input: 'select', source: 'people', localised: false, label: 'Manager' }
    ]
  }`,
  'notes.js': `module.exports = {
    displayname: { enUS: 'Notes' },
    schema: [{ field: 'text', input: 'string', localised: false, label: 'Text' }]
  }`,
  'site.js': `module.exports = {
    displayname: { enUS: 'Site' },
    maxCount: 1,
    schema: [{ field: 'title', input: 'string', localised: false, label: 'Title' }]
  }`,
  'places.js': `module.exports = {
    displayname: { enUS: 'Places' },
    schema: [
      { field: 'slug', input: 'string', unique: true, localised: false, label: 'Slug' },
      { field: 'address.city', input: 'string', localised: false, label: 'City' },
      { field: 'address.zip', input: 'string', localised: false, label: 'Zip' }
    ]
  }`,
  'galleries.js': `module.exports = {
    displayname: { enUS: 'Galleries' },
    locales: ['enUS', 'zhCN'],
    schema: [
      { field: 'slug', input: 'string', unique: true, localised: false, label: 'Slug' },
      { field: 'photo', input: 'image', label: 'Photo' },
      { field: 'files', input: 'file', localised: false, label: 'Files' },
      { field: 'owner', input: 'select', source: 'people', label: 'Owner' },
      { field: 'ghost', input: 'select', source: 'ghosts', localised: false, label: 'Ghost' },
      { field: 'siteRef', input: 'select', source: 'site', localised: false, label: 'Site' },
      { field: 'seen', input: 'date', label: 'Seen' },
      { field: 'shownAt', input: 'datetime', localised: false, label: 'Shown at' },
      { field: 'tags', input: 'pillbox', localised: false, label: 'Tags' }
    ]
  }`,
  'pages.js': `module.exports = {
    displayname: { enUS: 'Pages' },
    schema: [
      { field: 'slug', input: 'string', unique: true, localised: false, label: 'Slug' },
      { field: 'blocks', input: 'paragraph', localised: false, label: 'Blocks', options: { types: ['block_link', 'block_pic', 'block_bare'] } }
    ]
  }`,
  'paragraphs/block_link.js': `module.exports = {
    displayname: { enUS: 'Link block' },
    schema: [
      { field: 'title', input: 'string', label: 'Title' },
      { field: 'person', input: 'select', source: 'people', localised: false, label: 'Person' },
      { field: 'when', input: 'date', localised: false, label: 'When' },
      { field: 'friends', input: 'multiselect', source: 'people', localised: false, label: 'Friends' }
    ]
  }`,
  'paragraphs/block_bare.js': `module.exports = {
    displayname: { enUS: 'Bare block' }
  }`,
  'paragraphs/block_pic.js': `module.exports = {
    displayname: { enUS: 'Picture block' },
    schema: [{ field: 'image', input: 'image', localised: false, label: 'Image' }]
  }`
}

describe('ContentLoader with other kinds of resources (unit)', () => {
  let app, api, folder, resources
  const loader = () => new CMS.ContentLoader(app.cms)
  const problemsOf = async (promise) => {
    let caught
    await promise.catch((error) => { caught = error })
    expect(caught, 'a ContentError was expected').to.be.an.instanceOf(CMS.ContentLoader.ContentError)
    return caught.problems.join('\n')
  }
  const wipe = async () => {
    for (const name of ['people', 'notes', 'site', 'places', 'galleries', 'pages']) {
      for (const record of await api(name).list({})) {
        await api(name).remove(record._id)
      }
    }
  }

  before(async () => {
    resources = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-content-resources-'))
    fs.mkdirSync(path.join(resources, 'paragraphs'))
    for (const [file, source] of Object.entries(RESOURCES)) {
      fs.writeFileSync(path.join(resources, file), source)
    }
    app = await startApp({ resources })
    api = app.cms.api()
  })
  after(async () => {
    await app.close()
    fs.rmSync(resources, { recursive: true, force: true })
  })
  beforeEach(async () => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-content-files-'))
    fs.mkdirSync(path.join(folder, 'files'))
    fs.writeFileSync(path.join(folder, 'files', 'en.png'), await png('#e86f8c'))
    fs.writeFileSync(path.join(folder, 'files', 'zh.png'), await png('#3b3fa8'))
    await wipe()
  })
  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true })
  })

  describe('the blocks of a paragraph field', () => {
    const people = [{ handle: 'ana', name: { enUS: 'Ana' } }, { handle: 'bo', name: { enUS: 'Bo' } }]

    it('have their relations and their dates read like those of a record', async () => {
      await loader().load({
        people,
        pages: [{ slug: 'home', blocks: [{ _type: 'block_link', title: 'Hello', person: 'people://ana', when: '2026-10-01', friends: ['people://ana', 'people://bo'] }] }]
      })
      const ana = await api('people').find({ handle: 'ana' })
      const bo = await api('people').find({ handle: 'bo' })
      const [block] = (await api('pages').find({ slug: 'home' })).blocks
      expect(block).to.include({ _type: 'block_link', title: 'Hello', person: ana._id, when: new Date(2026, 9, 1).getTime() })
      expect(block.friends).to.deep.equal([ana._id, bo._id])
    })

    it('are loaded again without a change', async () => {
      const content = { people, pages: [{ slug: 'home', blocks: [{ _type: 'block_link', title: 'Hello', person: 'people://ana' }] }] }
      await loader().load(content)
      expect(await loader().load(content)).to.include({ created: 0, updated: 0, unchanged: 3 })
    })

    it('say where a relation inside a block points to nothing', async () => {
      const problems = await problemsOf(loader().load({ people, pages: [{ slug: 'home', blocks: [{ _type: 'block_link', person: 'people://nobody' }] }] }))
      expect(problems).to.include('pages[0].blocks[0].person: there is no people with handle "nobody"')
    })

    it('say when the type of a block does not exist', async () => {
      const problems = await problemsOf(loader().load({ pages: [{ slug: 'home', blocks: [{ _type: 'block_nope', title: 'x' }, { title: 'no type' }] }] }))
      expect(problems).to.include('pages[0].blocks[0]: there is no block type "block_nope"')
      expect(problems).to.include('pages[0].blocks[1]: there is no block type "undefined"')
    })

    it('say that the files of a block are not loaded', async () => {
      const problems = await problemsOf(loader().load({ pages: [{ slug: 'home', blocks: [{ _type: 'block_pic', image: 'attachment://files/en.png' }] }] }, { basePath: folder }))
      expect(problems).to.include('pages[0].blocks[0].image: files in a block are not loaded: add them in the admin')
    })

    it('are left as they are when the field holds something else than a list', async () => {
      expect((await loader().load({ pages: [{ slug: 'odd', blocks: 'not a list' }] })).created).to.equal(1)
    })

    it('can be of a type that declares no field', async () => {
      expect((await loader().load({ pages: [{ slug: 'bare', blocks: [{ _type: 'block_bare' }] }] })).created).to.equal(1)
    })

    it('can leave a field of the block out', async () => {
      expect((await loader().load({ pages: [{ slug: 'plain', blocks: [{ _type: 'block_link' }] }] })).created).to.equal(1)
    })
  })

  describe('a field that is localised', () => {
    const content = () => ({
      people: [{ handle: 'ana', name: { enUS: 'Ana' } }, { handle: 'bo', name: { enUS: 'Bo' } }],
      galleries: [{ slug: 'g', owner: { enUS: 'people://ana', zhCN: 'people://bo' }, seen: { enUS: '2026-10-01', zhCN: '2026-10-02' } }]
    })

    it('takes a relation for each language', async () => {
      await loader().load(content())
      const gallery = await api('galleries').find({ slug: 'g' })
      expect(gallery.owner.enUS).to.equal((await api('people').find({ handle: 'ana' }))._id)
      expect(gallery.owner.zhCN).to.equal((await api('people').find({ handle: 'bo' }))._id)
    })

    it('takes a date for each language', async () => {
      await loader().load(content())
      const gallery = await api('galleries').find({ slug: 'g' })
      expect(gallery.seen).to.deep.equal({ enUS: new Date(2026, 9, 1).getTime(), zhCN: new Date(2026, 9, 2).getTime() })
    })

    it('leaves a date that is a number as it is, and reads a datetime written with a time', async () => {
      await loader().load({ galleries: [{ slug: 'n', seen: { enUS: 1790000000000 }, shownAt: '2026-10-01T09:30:00Z' }] })
      const gallery = await api('galleries').find({ slug: 'n' })
      expect(gallery.seen.enUS).to.equal(1790000000000)
      expect(gallery.shownAt).to.equal(Date.parse('2026-10-01T09:30:00Z'))
    })

    it('names the language in the place of a relation that is wrong', async () => {
      const problems = await problemsOf(loader().load({ people: [{ handle: 'ana' }], galleries: [{ slug: 'g', owner: { enUS: 'people://ana', zhCN: 'people://nobody' } }] }))
      expect(problems).to.include('galleries[0].owner.zhCN: there is no people with handle "nobody"')
    })

    it('takes a file for each language, attached under the name of the field and the language', async () => {
      const report = await loader().load({ galleries: [{ slug: 'g', photo: { enUS: 'attachment://files/en.png', zhCN: 'attachment://files/zh.png' } }] }, { basePath: folder })
      expect(report.files.added).to.equal(2)
      const gallery = await api('galleries').find({ slug: 'g' })
      expect(gallery._attachments.map((attachment) => attachment._name).sort()).to.deep.equal(['photo.enUS', 'photo.zhCN'])
    })

    it('gives a single file to the first language', async () => {
      await loader().load({ galleries: [{ slug: 'g', photo: 'attachment://files/en.png' }] }, { basePath: folder })
      expect((await api('galleries').find({ slug: 'g' }))._attachments[0]._name).to.equal('photo.enUS')
    })

    it('takes a file with options for a language, and a list of files for a language', async () => {
      await loader().load({
        galleries: [{ slug: 'g', photo: { enUS: { uri: 'attachment://files/en.png', name: 'english.png' }, zhCN: ['attachment://files/zh.png'] } }]
      }, { basePath: folder })
      const names = (await api('galleries').find({ slug: 'g' }))._attachments.map((attachment) => `${attachment._name}:${attachment._filename}`).sort()
      expect(names).to.deep.equal(['photo.enUS:english.png', 'photo.zhCN:zh.png'])
    })

    it('changes the file of one language and leaves the other', async () => {
      const content = (zh) => ({ galleries: [{ slug: 'g', photo: { enUS: 'attachment://files/en.png', zhCN: zh } }] })
      await loader().load(content('attachment://files/zh.png'), { basePath: folder })
      const report = await loader().load(content('attachment://files/en.png'), { basePath: folder })
      expect(report.files).to.deep.equal({ added: 1, removed: 1, unchanged: 1 })
    })

    it('says which language a file is wrong in', async () => {
      const problems = await problemsOf(loader().load({ galleries: [{ slug: 'g', photo: { enUS: 'attachment://files/en.png', zhCN: 'attachment://files/none.png' } }] }, { basePath: folder }))
      expect(problems).to.include('galleries[0].photo.zhCN: the file files/none.png does not exist')
    })
  })

  describe('a file field that is not localised', () => {
    it('takes a list of files, and keeps each of them when the load is run again', async () => {
      const content = { galleries: [{ slug: 'g', files: ['attachment://files/en.png', 'attachment://files/zh.png'] }] }
      expect((await loader().load(content, { basePath: folder })).files.added).to.equal(2)
      expect((await loader().load(content, { basePath: folder })).files).to.deep.equal({ added: 0, removed: 0, unchanged: 2 })
      expect((await api('galleries').find({ slug: 'g' }))._attachments).to.have.length(2)
    })

    it('says which file of a list is wrong, by its place in the list', async () => {
      const problems = await problemsOf(loader().load({ galleries: [{ slug: 'g', files: ['attachment://files/en.png', 'attachment://files/none.png'] }] }, { basePath: folder }))
      expect(problems).to.include('galleries[0].files[1]: the file files/none.png does not exist')
    })

    it('ignores a field whose value is null', async () => {
      expect((await loader().load({ galleries: [{ slug: 'g', files: null, owner: null }] }, { basePath: folder })).created).to.equal(1)
    })

    it('reads a stream that comes from a file as it is, and one that does not by way of a temporary file', async () => {
      const fromFile = fs.createReadStream(path.join(folder, 'files', 'en.png'))
      const fromMemory = Readable.from([await png('#2f8f6b')])
      await loader().load({ galleries: [{ slug: 'g', files: [{ stream: fromFile, name: 'disk.png' }, { stream: fromMemory, name: 'memory.png' }] }] })
      const gallery = await api('galleries').find({ slug: 'g' })
      expect(gallery._attachments.map((attachment) => attachment._filename).sort()).to.deep.equal(['disk.png', 'memory.png'])
      expect(gallery._attachments.every((attachment) => attachment._contentType === 'image/png')).to.equal(true)
      // (no temporary file is left behind)
      expect(fs.readdirSync(os.tmpdir()).filter((name) => /^embed-cms-load-[0-9a-f]{8}-[0-9a-f]{4}-/.test(name))).to.deep.equal([])
    })
  })

  describe('a file field that is given something else', () => {
    it('says a number, a boolean or a list of lists is not a file', async () => {
      const problems = await problemsOf(loader().load({ galleries: [{ slug: 'a', files: 5 }, { slug: 'b', files: true }, { slug: 'c', files: [['attachment://files/en.png'], 7] }] }, { basePath: folder }))
      expect(problems).to.include('galleries[0].files: a file field takes "attachment://<path>", not 5')
      expect(problems).to.include('galleries[1].files: a file field takes "attachment://<path>", not true')
      expect(problems).to.include('galleries[2].files[1]: a file field takes "attachment://<path>", not 7')
    })
  })

  describe('a relation to a resource that has no unique field', () => {
    it('says there is no record, without naming a field it does not have', async () => {
      const problems = await problemsOf(loader().load({ galleries: [{ slug: 'g', siteRef: 'site://anything' }] }))
      expect(problems).to.include('galleries[0].siteRef: there is no site with a record "anything"')
    })
  })

  describe('a field that is declared wrong', () => {
    it('says a relation points to a resource that does not exist', async () => {
      const problems = await problemsOf(loader().load({ galleries: [{ slug: 'g', ghost: 'ghosts://boo' }] }))
      expect(problems).to.include('galleries[0].ghost: there is no resource ghosts')
    })
  })

  describe('a resource that has no unique field', () => {
    it('is refused, with what to do', async () => {
      const problems = await problemsOf(loader().load({ notes: [{ text: 'a' }] }))
      expect(problems).to.include('notes: it has no unique field to tell its records apart: declare one, or name the field in the option `keys`')
    })

    it('is loaded when the option names the field that tells its records apart', async () => {
      const content = { notes: [{ text: 'a' }, { text: 'b' }] }
      expect((await loader().load(content, { keys: { notes: 'text' } })).created).to.equal(2)
      expect((await loader().load(content, { keys: { notes: 'text' } })).unchanged).to.equal(2)
      expect((await api('notes').list({})).length).to.equal(2)
    })
  })

  describe('a resource that holds one record', () => {
    it('takes the record itself instead of a list', async () => {
      expect((await loader().load({ site: { title: 'One' } })).created).to.equal(1)
      expect((await loader().load({ site: { title: 'Two' } })).updated).to.equal(1)
      expect((await api('site').list({})).map((record) => record.title)).to.deep.equal(['Two'])
    })

    it('refuses two records', async () => {
      const problems = await problemsOf(loader().load({ site: [{ title: 'One' }, { title: 'Two' }] }))
      expect(problems).to.include('site[1]: site holds one record')
    })
  })

  describe('nested fields', () => {
    it('are written as a nested object, and kept on a second load', async () => {
      expect((await loader().load({ places: [{ slug: 'p', address: { city: 'Lyon', zip: '69003' } }] })).created).to.equal(1)
      expect((await api('places').find({ slug: 'p' })).address).to.deep.equal({ city: 'Lyon', zip: '69003' })
      expect((await loader().load({ places: [{ slug: 'p', address: { city: 'Lyon', zip: '69003' } }] })).unchanged).to.equal(1)
    })

    it('are updated one at a time, and the others are kept', async () => {
      await loader().load({ places: [{ slug: 'p', address: { city: 'Lyon', zip: '69003' } }] })
      expect((await loader().load({ places: [{ slug: 'p', address: { city: 'Paris' } }] })).updated).to.equal(1)
      expect((await api('places').find({ slug: 'p' })).address).to.deep.equal({ city: 'Paris', zip: '69003' })
    })

    it('are found when a field of the group is misspelt', async () => {
      const problems = await problemsOf(loader().load({ places: [{ slug: 'p', adress: { city: 'Lyon' } }] }))
      expect(problems).to.include('places[0].adress: places has no field "adress"')
    })
  })

  describe('a relation to its own resource', () => {
    it('can point to a record that comes before it', async () => {
      await loader().load({ people: [{ handle: 'boss' }, { handle: 'ana', manager: 'people://boss' }] })
      expect((await api('people').find({ handle: 'ana' })).manager).to.equal((await api('people').find({ handle: 'boss' }))._id)
    })

    it('cannot point to a record that comes after it, or to itself', async () => {
      const problems = await problemsOf(loader().load({ people: [{ handle: 'ana', manager: 'people://boss' }, { handle: 'boss', manager: 'people://boss' }] }))
      expect(problems).to.include('people[0].manager: "boss" comes after this record in people: put it before')
      expect(problems).to.include('people[1].manager: "boss" comes after this record in people: put it before')
    })
  })

  describe('a list', () => {
    it('is replaced as a whole: a shorter list takes the others away', async () => {
      await loader().load({ galleries: [{ slug: 'g', tags: ['a', 'b', 'c'] }] })
      expect((await loader().load({ galleries: [{ slug: 'g', tags: ['a', 'b'] }] })).updated).to.equal(1)
      expect((await api('galleries').find({ slug: 'g' })).tags).to.deep.equal(['a', 'b'])
      expect((await loader().load({ galleries: [{ slug: 'g', tags: ['a', 'b'] }] })).unchanged).to.equal(1)
    })

    it('is a change when it is the same values in another order', async () => {
      await loader().load({ galleries: [{ slug: 'g', tags: ['a', 'b'] }] })
      expect((await loader().load({ galleries: [{ slug: 'g', tags: ['b', 'a'] }] })).updated).to.equal(1)
    })
  })

  describe('a record that the CMS refuses', () => {
    it('stops the load with the error of the CMS, and keeps the records made before it', async () => {
      const hook = (context) => (_.get(context, 'params.object.handle') === 'bad' ? context.error({ code: 400, message: 'refused by a hook' }) : context.next())
      api('people').before('create', hook)
      let error
      await loader().load({ people: [{ handle: 'first' }, { handle: 'bad' }, { handle: 'later' }] }).catch((caught) => { error = caught })
      // (the error of a hook is the one the hook gave, not a ContentError: the content was fine, the CMS refused it)
      expect(error).to.not.be.an.instanceOf(CMS.ContentLoader.ContentError)
      expect(error.message).to.include('refused by a hook')
      expect((await api('people').list({})).map((record) => record.handle)).to.deep.equal(['first'])
    })
  })

  describe('a dry run', () => {
    it('says what a file would do for a record that does not exist yet', async () => {
      const report = await loader().load({ galleries: [{ slug: 'g', photo: { enUS: 'attachment://files/en.png' } }, { slug: 'h', files: ['attachment://files/zh.png'] }] }, { basePath: folder, dryRun: true })
      expect(report).to.include({ created: 2 })
      expect(report.files.added).to.equal(2)
      expect((await api('galleries').list({})).length).to.equal(0)
    })

    it('says what would be removed', async () => {
      await loader().load({ galleries: [{ slug: 'g', files: ['attachment://files/en.png'] }] }, { basePath: folder })
      const report = await loader().load({ galleries: [{ slug: 'g', files: [] }] }, { basePath: folder, dryRun: true })
      expect(report.files).to.deep.equal({ added: 0, removed: 1, unchanged: 0 })
      expect((await api('galleries').find({ slug: 'g' }))._attachments).to.have.length(1)
    })
  })
})

