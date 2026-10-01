const request = require('supertest')
const { expect } = require('chai')
const { startApp, hardened, createUser } = require('../helpers/app')
const { options: baseOptions } = require('../cmsInstance')

describe('admin plugin (unit)', () => {
  let app, auth

  const loginAs = async (username, password) => {
    const agent = request.agent(app.url)
    const res = await agent.post('/admin/login').send({ username, password })
    return { agent, res }
  }

  before(async () => {
    // cookies and sessions are only wired up in jwt mode (disableAuthentication: true)
    app = await startApp({ disableAuthentication: true })
    auth = app.cms.$authentication
    const editors = await auth.groups.create({ name: 'editors', read: ['articles'], create: [], update: [], remove: [], attachments: [] })
    await auth.users.create({ username: 'editor', password: 'editorPass', group: editors._id })
  })
  after(async () => {
    await app.close()
  })

  describe('login', () => {
    it('logs an admin in and never returns the password', async () => {
      const { res } = await loginAs('localAdmin', 'localAdmin')
      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('username', 'localAdmin')
      expect(res.body).to.not.have.property('password')
    })
    it('answers 401 for wrong credentials and sets no cookie', async () => {
      const { res } = await loginAs('localAdmin', 'wrong')
      expect(res.status).to.equal(401)
      expect(res.headers['set-cookie'] || []).to.satisfy(c => !c.some(x => x.startsWith('nodeCmsJwt=')))
    })
    it('does not distinguish an unknown user from a wrong password', async () => {
      const wrong = await loginAs('localAdmin', 'wrong')
      const unknown = await loginAs('ghost', 'wrong')
      expect(unknown.res.status).to.equal(wrong.res.status)
      expect(unknown.res.body).to.deep.equal(wrong.res.body)
    })
    it('answers an error, not a crash, for an empty body', async () => {
      const res = await request(app.url).post('/admin/login').send({})
      expect(res.status).to.be.oneOf([400, 401, 403])
    })
  })

  describe('public endpoints', () => {
    it('/admin/config exposes settings but never secrets', async () => {
      const res = await request(app.url).get('/admin/config')
      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('version')
      const text = JSON.stringify(res.body)
      expect(text).to.not.include(baseOptions.auth.secret)
      expect(text).to.not.include(baseOptions.session.secret)
      expect(res.body).to.not.have.property('auth')
      expect(res.body).to.not.have.property('session')
    })
    it('/admin/_groups needs a login', async () => {
      const res = await request(app.url).get('/admin/_groups')
      expect(res.status).to.be.oneOf([401, 403])
    })
    it('/admin/_groups only lists group names and plugins', async () => {
      const { agent } = await loginAs('localAdmin', 'localAdmin')
      const res = await agent.get('/admin/_groups')
      expect(res.status).to.equal(200)
      const names = res.body.map(g => g.name)
      expect(names).to.include.members(['admins', 'anonymous', 'editors'])
      res.body.forEach(g => {
        expect(Object.keys(g)).to.include('name')
        expect(Object.keys(g).every(k => ['name', 'plugins'].includes(k))).to.equal(true)
      })
    })
  })

  describe('resources', () => {
    it('requires a session', async () => {
      const res = await request(app.url).get('/admin/resources')
      expect(res.status).to.be.oneOf([401, 403])
    })
    it('lists every resource for an admin, without internals', async () => {
      const { agent } = await loginAs('localAdmin', 'localAdmin')
      const res = await agent.get('/admin/resources')
      expect(res.status).to.equal(200)
      const titles = res.body.map(r => r.title)
      expect(titles).to.include.members(['articles', 'cities', 'publicData'])
      res.body.forEach(r => {
        expect(r.cms).to.equal(null)
        expect(r.resource).to.equal(null)
      })
    })
    it('only lists what the user group may read', async () => {
      const { agent } = await loginAs('editor', 'editorPass')
      const res = await agent.get('/admin/resources')
      expect(res.status).to.equal(200)
      expect(res.body.map(r => r.title)).to.deep.equal(['articles'])
    })
    it('does not change the live resource options when it is called repeatedly', async () => {
      const { agent } = await loginAs('localAdmin', 'localAdmin')
      const first = await agent.get('/admin/resources')
      const second = await agent.get('/admin/resources')
      expect(second.body).to.deep.equal(first.body)
    })
  })

  describe('paragraphs', () => {
    it('requires a session', async () => {
      const res = await request(app.url).get('/admin/paragraphs')
      expect(res.status).to.be.oneOf([401, 403])
    })
    it('answers for a logged in user', async () => {
      const { agent } = await loginAs('localAdmin', 'localAdmin')
      const res = await agent.get('/admin/paragraphs')
      expect(res.status).to.equal(200)
      expect(res.body).to.be.an('array')
    })
  })

  describe('cms-config editor', () => {
    it('refuses anonymous users', async () => {
      const get = await request(app.url).get('/admin/cms-config')
      const post = await request(app.url).post('/admin/cms-config').send({ port: 1 })
      expect(get.status).to.equal(403)
      expect(post.status).to.equal(403)
    })
    it('refuses users who are not in the admins group', async () => {
      const { agent } = await loginAs('editor', 'editorPass')
      const get = await agent.get('/admin/cms-config')
      const post = await agent.post('/admin/cms-config').send({ port: 1 })
      expect(get.status).to.equal(403)
      expect(post.status).to.equal(403)
    })
  })

  describe('removed routes', () => {
    it('/admin/replicate no longer exists (replication is triggered through /replicator)', async () => {
      const res = await request(app.url).get('/admin/replicate/articles').query({ host: 'localhost', port: 1 })
      expect(res.status).to.be.oneOf([401, 403, 404])
    })
  })

  describe('static and dev routes', () => {
    it('does not serve files outside the served folders through /fonts or /js', async () => {
      const fonts = await request(app.url).get('/admin/fonts/..%2f..%2fpackage.json')
      const js = await request(app.url).get('/admin/js/..%2f..%2fpackage.json')
      for (const res of [fonts, js]) {
        expect(res.text || '').to.not.include('"name": "node-cms"')
      }
    })
    it('serves the i18n config', async () => {
      const res = await request(app.url).get('/admin/i18n/config.json')
      expect(res.status).to.be.oneOf([200, 404])
    })
  })
})

describe('admin plugin in basic authentication mode (unit)', () => {
  let app

  before(async () => {
    // no jwt login: /admin/resources and /admin/paragraphs are protected with HTTP Basic credentials
    app = await startApp({ disableJwtLogin: true })
  })
  after(async () => {
    await app.close()
  })

  const get = (route, auth) => {
    const req = request(app.url).get(route).timeout({ response: 3000 })
    return auth ? req.auth(...auth) : req
  }

  it('lists the resources for valid credentials instead of hanging', async () => {
    const res = await get('/admin/resources', ['localAdmin', 'localAdmin'])
    expect(res.status).to.equal(200)
    expect(res.body.map(r => r.title)).to.include.members(['articles', 'cities'])
  })
  it('lists the paragraphs for valid credentials instead of hanging', async () => {
    const res = await get('/admin/paragraphs', ['localAdmin', 'localAdmin'])
    expect(res.status).to.equal(200)
    expect(res.body).to.be.an('array')
  })
  it('refuses wrong credentials', async () => {
    const res = await get('/admin/resources', ['localAdmin', 'wrong'])
    expect(res.status).to.be.oneOf([401, 403])
  })
  it('asks anonymous callers to authenticate', async () => {
    const res = await get('/admin/resources')
    expect(res.status).to.be.oneOf([401, 403])
  })
})

describe('admin wrong Basic credentials (unit)', () => {
  // the browser shows its login prompt again only for a 401 that carries WWW-Authenticate
  const expectPrompt = (res) => {
    expect(res.status).to.equal(401)
    expect(res.headers['www-authenticate']).to.match(/^Basic realm=/)
  }
  const profiles = {
    legacy: { disableJwtLogin: true },
    hardened: hardened({ disableJwtLogin: true, security: { localAdmin: true } })
  }

  Object.entries(profiles).forEach(([profile, options]) => {
    describe(`${profile} profile`, () => {
      let app
      before(async () => { app = await startApp(options) })
      after(async () => { await app.close() })

      const get = (route, auth) => {
        const req = request(app.url).get(route).timeout({ response: 3000 })
        return auth ? req.auth(...auth) : req
      }

      it('asks again for the credentials of /admin/ after a wrong password', async () => {
        expectPrompt(await get('/admin/', ['localAdmin', 'wrong']))
      })
      it('asks for the credentials of /admin/ without any', async () => {
        expectPrompt(await get('/admin/'))
      })
      it('asks again for the credentials of /admin/login after a wrong password', async () => {
        expectPrompt(await get('/admin/login', ['localAdmin', 'wrong']))
      })
      it('still answers the user of /admin/login for valid credentials', async () => {
        const res = await get('/admin/login', ['localAdmin', 'localAdmin'])
        expect(res.status).to.equal(200)
        expect(res.body).to.include({ username: 'localAdmin', group: 'admins' })
      })
    })
  })

  describe('admin resources outside of routesToAuth', () => {
    let app
    // /admin/resources and /admin/paragraphs then rely on the Basic check of the admin plugin alone
    before(async () => { app = await startApp({ disableJwtLogin: true, routesToAuth: ['/api/_syslog'] }) })
    after(async () => { await app.close() })

    const get = (route, auth) => {
      const req = request(app.url).get(route).timeout({ response: 3000 })
      return auth ? req.auth(...auth) : req
    }

    it('lists the resources for valid credentials instead of hanging', async () => {
      const res = await get('/admin/resources', ['localAdmin', 'localAdmin'])
      expect(res.status).to.equal(200)
      expect(res.body.map(r => r.title)).to.include('articles')
    })
    it('asks again for the credentials after a wrong password', async () => {
      expectPrompt(await get('/admin/paragraphs', ['localAdmin', 'wrong']))
    })
  })
})

describe('admin resources of a group that reads nothing (unit)', () => {
  const routesToAuth = ['/api/_syslog', '/api/system', '/admin/resources', '/admin/paragraphs', '/import', '/importFromRemote', '/replicator', '/resources']
  const modes = {
    'JWT login': { disableAuthentication: true },
    'Basic authentication': { disableJwtLogin: true }
  }

  Object.entries(modes).forEach(([mode, options]) => {
    describe(mode, () => {
      let app, reader
      // 'resources' was compared with the routesToAuth entries, where it can only appear by mistake (express never
      // matches a path without a leading slash): it must not change who sees what
      before(async () => {
        app = await startApp({ ...options, routesToAuth: [...routesToAuth, 'resources'] })
        const nothing = await app.cms.$authentication.groups.create({ name: 'nothing', read: [], create: [], update: [], remove: [], attachments: [] })
        reader = await createUser(app, { group: nothing._id })
      })
      after(async () => { await app.close() })

      const asUser = async (user) => {
        if (mode === 'JWT login') {
          const agent = request.agent(app.url)
          expect((await agent.post('/admin/login').send({ username: user.username, password: user.password })).status).to.equal(200)
          return agent.get('/admin/resources')
        }
        return request(app.url).get('/admin/resources').auth(user.username, user.password)
      }

      it('answers an empty list to a logged in user', async () => {
        const res = await asUser(reader)
        expect(res.status).to.equal(200)
        expect(res.body).to.deep.equal([])
      })
      it('still lists every resource for an admin', async () => {
        const res = await asUser({ username: 'localAdmin', password: 'localAdmin' })
        expect(res.status).to.equal(200)
        expect(res.body.map(r => r.title)).to.include('articles')
      })
      it('still refuses anonymous callers', async () => {
        const res = await request(app.url).get('/admin/resources')
        expect(res.status).to.be.oneOf([401, 403])
      })
    })
  })
})

describe('admin languages (unit)', () => {
  const chinese = { defaultLocale: 'enUS', locales: ['enUS', 'zhCN'] }
  const languageOf = async (admin) => {
    const app = await startApp(admin ? { admin } : {})
    try {
      const res = await request(app.url).get('/admin/i18n/config.json')
      expect(res.status).to.equal(200)
      // the admin (src/services/TranslateService.js) reads config.language
      return res.body.config && res.body.config.language
    } finally {
      await app.close()
    }
  }

  it('answers English by default, in the shape the admin reads', async () => {
    expect(await languageOf()).to.deep.equal({ defaultLocale: 'enUS', locales: ['enUS'] })
  })
  it('answers the languages of admin.language in cms.json', async () => {
    expect(await languageOf({ language: chinese })).to.deep.equal(chinese)
  })
  it('still answers the languages of the older admin.config.language', async () => {
    expect(await languageOf({ config: { language: chinese } })).to.deep.equal(chinese)
  })
})
