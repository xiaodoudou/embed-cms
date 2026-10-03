const path = require('path')
const { spawn } = require('child_process')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')
const { main, parseArguments, USAGE } = require('../../lib/util/syncCli')

const ROOT = path.resolve(__dirname, '..', '..')

const capture = () => {
  const lines = { out: [], err: [] }
  return { lines, io: { out: (text) => lines.out.push(text), err: (text) => lines.err.push(text) } }
}
const keys = async (app, resource) => (await app.cms.api()(resource).list()).map(item => item.key).sort()

describe('cms-sync command (unit)', () => {
  describe('the arguments', () => {
    it('reads the direction, the resources, the address and the token', () => {
      expect(parseArguments(['push', 'cities', 'countries', '--url', 'https://staging.example.com/', '--token', 'abc'])).to.deep.include({
        direction: 'push', resources: ['cities', 'countries'], url: 'https://staging.example.com', token: 'abc', wait: true
      })
      expect(parseArguments(['pull', '--url=http://x:1', '--token=a=b', '--no-wait']).token).to.equal('a=b')
      expect(parseArguments(['pull', '--url=http://x:1', '--token=a=b', '--no-wait']).wait).to.equal(false)
    })

    it('takes the address and the token from the environment, and the arguments win', () => {
      const env = { EMBED_CMS_URL: 'http://env:2', EMBED_CMS_SYNC_TOKEN: 'from-env' }
      expect(parseArguments(['push'], env)).to.deep.include({ url: 'http://env:2', token: 'from-env' })
      expect(parseArguments(['push', '--token', 'mine'], env).token).to.equal('mine')
    })

    it('asks the CMS of this machine by default', () => {
      expect(parseArguments(['push', '--token', 't']).url).to.equal('http://localhost:9990')
    })

    it('says what is wrong', () => {
      expect(parseArguments([], {}).error).to.equal('say push or pull')
      expect(parseArguments(['sideways', '--token', 't']).error).to.equal('"sideways" is not push or pull')
      expect(parseArguments(['push']).error).to.match(/a token is needed/)
      expect(parseArguments(['push', '--token']).error).to.equal('--token needs a value')
      expect(parseArguments(['push', '--token', '--no-wait']).error).to.equal('--token needs a value')
      expect(parseArguments(['push', '--now', '--token', 't']).error).to.equal('unknown option --now')
    })

    it('answers help for -h and --help, before anything else is checked', () => {
      expect(parseArguments(['-h']).help).to.equal(true)
      expect(parseArguments(['push', '--help']).help).to.equal(true)
    })
  })

  describe('the command', () => {
    it('prints the usage for --help, and exits 0', async () => {
      const { lines, io } = capture()
      expect(await main(['--help'], {}, io)).to.equal(0)
      expect(lines.out.join('\n')).to.equal(USAGE)
    })

    it('exits 2 with the usage for a wrong command', async () => {
      const { lines, io } = capture()
      expect(await main(['sideways'], {}, io)).to.equal(2)
      expect(lines.err[0]).to.contain('cms-sync: "sideways" is not push or pull')
      expect(lines.err[0]).to.contain('Usage: cms-sync')
    })

    it('exits 3 when the CMS cannot be reached, without the token in the message', async () => {
      const { lines, io } = capture()
      expect(await main(['push', '--url', 'http://127.0.0.1:1', '--token', 'secret-token'], {}, io)).to.equal(3)
      expect(lines.err[0]).to.match(/^cms-sync: http:\/\/127\.0\.0\.1:1 could not be reached/)
      expect(lines.err.join()).to.not.contain('secret-token')
    })

    describe('with two servers', () => {
      let A, B

      before(async () => {
        const options = { sync: { resources: ['cities', 'countries'] }, disableJwtLogin: true }
        A = await startApp(options)
        B = await startApp(options)
        A.cms.$sync.runner.pollMs = 20
        B.cms.$sync.runner.pollMs = 20
        await A.cms.api()('_sync').create({ allows: ['read', 'write'], local: { token: 'token-a', url: A.url }, remote: { token: 'token-b', url: B.url } })
        await B.cms.api()('_sync').create({ allows: ['read', 'write'], local: { token: 'token-b', url: B.url }, remote: { token: 'token-a', url: A.url } })
      })
      after(async () => {
        await A.close()
        await B.close()
      })
      beforeEach(async () => {
        for (const app of [A, B]) {
          for (const resource of ['cities', 'countries']) {
            for (const item of await app.cms.api()(resource).list()) {
              await app.cms.api()(resource).remove(item._id)
            }
          }
        }
        await A.cms.api()('cities').create({ key: 'paris', name: { en: 'Paris' } })
        await A.cms.api()('countries').create({ key: 'fr', name: { en: 'France' } })
        await B.cms.api()('cities').create({ key: 'lyon', name: { en: 'Lyon' } })
        await B.cms.api()('countries').create({ key: 'de', name: { en: 'Germany' } })
        A.cms.$sync.runner.last = null
      })

      it('pushes every resource, says each result, and exits 0', async () => {
        const { lines, io } = capture()
        const code = await main(['push', '--url', A.url, '--token', 'token-a'], {}, io, { pollMs: 20 })
        expect(code).to.equal(0)
        expect(lines.out[0]).to.equal('push: cities, countries')
        expect(lines.out.slice(1)).to.deep.equal([
          '  cities: done, created 1, updated 0, removed 1, attachments added 0, removed 0',
          '  countries: done, created 1, updated 0, removed 1, attachments added 0, removed 0'
        ])
        expect(lines.err).to.deep.equal([])
        expect(await keys(B, 'cities')).to.deep.equal(['paris'])
        expect(await keys(B, 'countries')).to.deep.equal(['fr'])
      })

      it('pulls the resources it is told, and no others', async () => {
        const { lines, io } = capture()
        const code = await main(['pull', 'countries'], { EMBED_CMS_URL: A.url, EMBED_CMS_SYNC_TOKEN: 'token-a' }, io, { pollMs: 20 })
        expect(code).to.equal(0)
        expect(lines.out).to.deep.equal(['pull: countries', '  countries: done, created 1, updated 0, removed 1, attachments added 0, removed 0'])
        expect(await keys(A, 'countries')).to.deep.equal(['de'])
        expect(await keys(A, 'cities')).to.deep.equal(['paris'])
      })

      it('exits 1 when one resource failed, and says why, and does the others', async () => {
        await B.cms.api()('_sync').update((await B.cms.api()('_sync').find({}))._id, { allows: ['read'] })
        try {
          const { lines, io } = capture()
          const code = await main(['push', '--url', A.url, '--token', 'token-a'], {}, io, { pollMs: 20 })
          expect(code).to.equal(1)
          expect(lines.out.slice(1)).to.deep.equal(['  cities: error: write data is not allowed', '  countries: error: write data is not allowed'])
        } finally {
          await B.cms.api()('_sync').update((await B.cms.api()('_sync').find({}))._id, { allows: ['read', 'write'] })
        }
      })

      it('exits 3 when the token is wrong, or a resource is not one to sync, or a run is going on', async () => {
        let { lines, io } = capture()
        expect(await main(['push', '--url', A.url, '--token', 'wrong'], {}, io, { pollMs: 20 })).to.equal(3)
        expect(lines.err[0]).to.equal('cms-sync: the CMS did not start the push: token is not match')
        ;({ lines, io } = capture())
        expect(await main(['push', 'articles', '--url', A.url, '--token', 'token-a'], {}, io, { pollMs: 20 })).to.equal(3)
        expect(lines.err[0]).to.equal('cms-sync: the CMS did not start the push: Not among the resources to sync: articles')
        const run = await A.cms.$sync.runner.prepare('pull')
        try {
          ;({ lines, io } = capture())
          expect(await main(['push', '--url', A.url, '--token', 'token-a'], {}, io, { pollMs: 20 })).to.equal(3)
          expect(lines.err[0]).to.equal('cms-sync: the CMS did not start the push: a pull is already running')
        } finally {
          await A.cms.$sync.runner.execute(run)
        }
      })

      it('returns at once with --no-wait', async () => {
        const { lines, io } = capture()
        expect(await main(['push', '--no-wait', '--url', A.url, '--token', 'token-a'], {}, io, { pollMs: 20 })).to.equal(0)
        expect(lines.out).to.deep.equal(['push: cities, countries'])
        // the run goes on in the background
        const waitFor = async (check) => {
          for (let count = 0; count < 200; count++) {
            if (await check()) return true
            await new Promise(resolve => setTimeout(resolve, 20))
          }
          return false
        }
        expect(await waitFor(async () => (await keys(B, 'cities')).join() === 'paris')).to.equal(true)
      })

      it('is a real command: bin/cmsSync.js exits with the code', async () => {
        const run = (args, env = {}) => new Promise((resolve) => {
          const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'cmsSync.js'), ...args], { env: { ...process.env, ...env } })
          let output = ''
          child.stdout.on('data', data => { output += data })
          child.stderr.on('data', data => { output += data })
          child.on('close', code => resolve({ code, output }))
        })
        const ok = await run(['push', 'cities'], { EMBED_CMS_URL: A.url, EMBED_CMS_SYNC_TOKEN: 'token-a' })
        expect(ok.code).to.equal(0)
        expect(ok.output).to.contain('cities: done')
        const wrong = await run(['nothing'])
        expect(wrong.code).to.equal(2)
        expect(wrong.output).to.contain('Usage: cms-sync')
      })
    })
  })
})
