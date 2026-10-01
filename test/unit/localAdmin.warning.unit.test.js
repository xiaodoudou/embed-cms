const { expect } = require('chai')
const logger = require('../../lib/logger')
const { startApp, createUser, randomSecret } = require('../helpers/app')

// the lines the CMS logs while it boots (and after), as { level, text }
const capture = async (fn) => {
  const lines = []
  const original = { warn: logger.warn, error: logger.error }
  for (const level of ['warn', 'error']) {
    logger[level] = (...args) => lines.push({ level, text: args.map(String).join(' ') })
  }
  try {
    await fn()
  } finally {
    Object.assign(logger, original)
  }
  return lines.filter(line => /localAdmin/.test(line.text))
}

describe('localAdmin warning at boot (unit)', () => {
  it('warns loudly when the built-in account still has its default password', async () => {
    let app
    const lines = await capture(async () => { app = await startApp({}) })
    await app.close()
    const line = lines.find(item => /default password/i.test(item.text))
    expect(line, JSON.stringify(lines)).to.be.ok
    expect(line.level).to.equal('error')
  })

  it('still warns, more quietly, when the password was changed', async () => {
    const first = await startApp({}, { keepData: true })
    const record = await first.cms.$authentication.users.json.find({ username: 'localAdmin' })
    await first.cms.$authentication.users.update(record._id, { password: randomSecret(12) })
    await first.close()
    let second
    const lines = await capture(async () => { second = await startApp({}, { dataDir: first.dataDir }) })
    await second.close()
    expect(lines.some(item => /default password/i.test(item.text))).to.equal(false)
    const line = lines.find(item => /exists/i.test(item.text))
    expect(line, JSON.stringify(lines)).to.be.ok
    expect(line.level).to.equal('warn')
  })

  it('says the account cannot log in when security.localAdmin is off but the record is still there', async () => {
    const first = await startApp({}, { keepData: true })
    await first.close()
    let second
    const lines = await capture(async () => { second = await startApp({ security: { localAdmin: false } }, { dataDir: first.dataDir }) })
    await second.close()
    const line = lines.find(item => /default password/i.test(item.text))
    expect(line, JSON.stringify(lines)).to.be.ok
    expect(line.text).to.match(/security\.localAdmin/)
  })

  it('says nothing when the account does not exist', async () => {
    let app
    const lines = await capture(async () => { app = await startApp({ security: { localAdmin: false } }) })
    await createUser(app)
    await app.close()
    expect(lines).to.deep.equal([])
  })
})
