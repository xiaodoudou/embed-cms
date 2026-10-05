const fs = require('fs')
const os = require('os')
const path = require('path')
const request = require('supertest')
const { expect } = require('chai')
const logger = require('../../lib/logger')
const { createDictionaries, readDictionary } = require('../../lib/util/i18n')
const { startApp } = require('../helpers/app')

// The words of the admin: the ones of the CMS, with the ones of a project over them.

const BUILT_IN = path.resolve(__dirname, '../../i18n')
const write = (folder, name, content) => fs.writeFileSync(path.join(folder, `${name}.json`), typeof content === 'string' ? content : JSON.stringify(content))

/** Runs a function with the warnings of the logger kept, answers them. */
const warnings = (fn) => {
  const said = []
  const warn = logger.warn
  logger.warn = (...args) => said.push(args.join(' '))
  try {
    fn()
  } finally {
    logger.warn = warn
  }
  return said
}

describe('dictionaries of the admin (unit)', () => {
  let project
  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-i18n-'))
  })
  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true })
  })

  describe('readDictionary', () => {
    it('reads a flat object of texts', () => {
      write(project, 'enUS', { TL_A: 'a', TL_B: 'b' })
      expect(readDictionary(path.join(project, 'enUS.json'))).to.deep.equal({ TL_A: 'a', TL_B: 'b' })
    })

    it('has nothing for a file that is not there', () => {
      expect(readDictionary(path.join(project, 'nope.json'))).to.equal(null)
    })

    it('leaves out what is not a text, and says so', () => {
      write(project, 'enUS', { TL_A: 'a', TL_B: 3, TL_C: { x: 1 }, TL_D: null })
      const said = warnings(() => {
        expect(readDictionary(path.join(project, 'enUS.json'))).to.deep.equal({ TL_A: 'a' })
      })
      expect(said).to.have.length(1)
      expect(said[0]).to.include('TL_B, TL_C, TL_D')
    })

    it('does not use a file that is not json, or not an object, and says so', () => {
      write(project, 'enUS', '{ not json')
      write(project, 'zhCN', '["a"]')
      const said = warnings(() => {
        expect(readDictionary(path.join(project, 'enUS.json'))).to.equal(null)
        expect(readDictionary(path.join(project, 'zhCN.json'))).to.equal(null)
      })
      expect(said).to.have.length(2)
    })
  })

  describe('createDictionaries', () => {
    it('gives the dictionary of the CMS when the project has none', () => {
      const dictionaries = createDictionaries({ builtIn: BUILT_IN, project })
      const zh = dictionaries.get('zhCN')
      expect(zh.TL_SEARCH).to.equal('搜寻')
      expect(zh.TL_EDIT).to.equal('编辑')
    })

    it('puts the words of the project over the ones of the CMS, and keeps the rest', () => {
      write(project, 'zhCN', { TL_SEARCH: '查找', TL_MY_PAGE: '我的页面' })
      const zh = createDictionaries({ builtIn: BUILT_IN, project }).get('zhCN')
      expect(zh.TL_SEARCH).to.equal('查找')
      expect(zh.TL_MY_PAGE).to.equal('我的页面')
      expect(zh.TL_EDIT).to.equal('编辑')
    })

    it('adds a language the CMS does not have, with English for what the project has not translated', () => {
      write(project, 'frFR', { TL_SEARCH: 'Rechercher', TL_MY_PAGE: 'Ma page' })
      const dictionaries = createDictionaries({ builtIn: BUILT_IN, project })
      const fr = dictionaries.get('frFR')
      expect(fr.TL_SEARCH).to.equal('Rechercher')
      expect(fr.TL_MY_PAGE).to.equal('Ma page')
      expect(fr.TL_BACK).to.equal('Back')
    })

    it('works when the folder of the CMS has no such language', () => {
      const dictionaries = createDictionaries({ builtIn: fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-i18n-built-')), project })
      expect(dictionaries.get('zhCN')).to.equal(null)
      write(project, 'zhCN', { TL_ONLY: '只有' })
      expect(dictionaries.get('zhCN')).to.deep.equal({ TL_ONLY: '只有' })
    })

    it('has nothing for a language that nobody has words for', () => {
      expect(createDictionaries({ builtIn: BUILT_IN, project }).get('itIT')).to.equal(null)
    })

    it('has nothing for a name that is not a language, whatever it says', () => {
      write(project, 'secret', { TL_X: 'x' })
      const dictionaries = createDictionaries({ builtIn: BUILT_IN, project })
      for (const name of ['../package', '..%2Fpackage', 'config', 'secret', 'en', 'enus', 'enUS.json', '', 'enUS/../zhCN', 'e nUS']) {
        expect(dictionaries.get(name), name).to.equal(null)
      }
    })

    it('reads a file again when it changes', () => {
      write(project, 'frFR', { TL_SEARCH: 'Chercher' })
      const dictionaries = createDictionaries({ builtIn: BUILT_IN, project })
      expect(dictionaries.get('frFR').TL_SEARCH).to.equal('Chercher')
      write(project, 'frFR', { TL_SEARCH: 'Rechercher, svp' })
      const file = path.join(project, 'frFR.json')
      const later = new Date(Date.now() + 5000)
      fs.utimesSync(file, later, later)
      expect(dictionaries.get('frFR').TL_SEARCH).to.equal('Rechercher, svp')
    })

    it('does not read the folder of the CMS twice when the project is that folder', () => {
      const dictionaries = createDictionaries({ builtIn: BUILT_IN, project: BUILT_IN })
      expect(dictionaries.get('enUS').TL_SEARCH).to.equal('Search')
    })

    it('does not use a file of the project that is wrong, and keeps the CMS words', () => {
      write(project, 'zhCN', '{ nope')
      let zh
      warnings(() => {
        zh = createDictionaries({ builtIn: BUILT_IN, project }).get('zhCN')
      })
      expect(zh.TL_SEARCH).to.equal('搜寻')
    })
  })

  describe('the route of the admin', () => {
    let app, folder
    before(async () => {
      folder = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-i18n-app-'))
      write(folder, 'zhCN', { TL_SEARCH: '查找我的', TL_BLOG: '博客' })
      write(folder, 'jaJP', { TL_BLOG: 'ブログ' })
      app = await startApp({ i18n: folder, admin: { language: { defaultLocale: 'enUS', locales: ['enUS', 'zhCN', 'jaJP'] } } })
    })
    after(async () => {
      await app.close()
      fs.rmSync(folder, { recursive: true, force: true })
    })

    it('answers the words of the CMS with the ones of the project over them', async () => {
      const res = await request(app.url).get('/admin/i18n/zhCN.json')
      expect(res.status).to.equal(200)
      expect(res.headers['content-type']).to.include('application/json')
      expect(res.body.TL_SEARCH).to.equal('查找我的')
      expect(res.body.TL_BLOG).to.equal('博客')
      expect(res.body.TL_EDIT).to.equal('编辑')
    })

    it('answers a language of the project only, in English where it has no words', async () => {
      const res = await request(app.url).get('/admin/i18n/jaJP.json')
      expect(res.status).to.equal(200)
      expect(res.body.TL_BLOG).to.equal('ブログ')
      expect(res.body.TL_BACK).to.equal('Back')
    })

    it('answers English as it is, with nothing of another language', async () => {
      const res = await request(app.url).get('/admin/i18n/enUS.json')
      expect(res.body.TL_SEARCH).to.equal('Search')
      expect(res.body).to.not.have.property('TL_BLOG')
    })

    it('answers 404 for a language nobody has words for, and for a name that is not a language', async () => {
      for (const name of ['itIT', 'package', 'secret', '..%2F..%2Fpackage']) {
        const res = await request(app.url).get(`/admin/i18n/${name}.json`)
        expect(res.status, name).to.equal(404)
      }
    })

    it('still answers the languages of the admin', async () => {
      const res = await request(app.url).get('/admin/i18n/config.json')
      expect(res.status).to.equal(200)
      expect(res.body.config.language.locales).to.deep.equal(['enUS', 'zhCN', 'jaJP'])
    })
  })
})
