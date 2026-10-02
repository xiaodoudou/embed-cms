const { PassThrough, Readable } = require('stream')
const { expect } = require('chai')
const { syncAttachment, isSafeFileId, md5Of } = require('../../lib/plugins/replicator/attachments')

// a resource as far as the attachment sync is concerned: records with attachments and a store of files
const fakeResource = ({ records, files }) => {
  const written = {}
  const removed = []
  return {
    name: 'articles',
    options: { cms: { replication: {} } },
    written,
    removed,
    list: async () => records,
    file: {
      exists: (id) => id in files,
      read: (id) => Readable.from([Buffer.from(files[id])]),
      write: (id) => {
        const stream = new PassThrough()
        written[id] = ''
        stream.on('data', chunk => { written[id] += chunk })
        return stream
      },
      remove: async (id) => { removed.push(id) },
      cleanAttachment: async () => {}
    }
  }
}

describe('replicated attachments (unit)', () => {
  let realFetch, requests
  beforeEach(() => {
    realFetch = global.fetch
    requests = []
    global.fetch = async (url, options = {}) => {
      requests.push({ url: String(url), method: options.method || 'GET' })
      return new Response(options.method === 'HEAD' ? null : 'new content', { status: 200 })
    }
  })
  afterEach(() => { global.fetch = realFetch })

  const md5 = (text) => md5Of(Readable.from([Buffer.from(text)]))

  describe('isSafeFileId', () => {
    it('accepts generated ids and the ids of resized copies', () => {
      for (const id of ['lkjhgfdscccccccc12345678', 'lkjhgfdscccccccc12345678-autox100', 'lkjhgfdscccccccc12345678-smart-500xauto']) {
        expect(isSafeFileId(id), id).to.equal(true)
      }
    })
    it('refuses paths, urls and anything else', () => {
      for (const id of ['../../etc/passwd', 'a/b', 'a\\b', 'a?x=1', 'a#b', '', '.', '..', 'a b', undefined, null, 42, {}]) {
        expect(isSafeFileId(id), String(id)).to.equal(false)
      }
    })
  })

  describe('syncAttachment', () => {
    it('downloads an attachment that is missing locally', async () => {
      const resource = fakeResource({ records: [{ _attachments: [{ _id: 'abc123' }] }], files: {} })
      await syncAttachment(resource, 'http://peer/api/', () => {})
      expect(requests.map(r => `${r.method} ${r.url}`)).to.deep.equal(['HEAD http://peer/api/articles/file/abc123', 'GET http://peer/api/articles/file/abc123'])
      expect(resource.written.abc123).to.equal('new content')
    })

    it('does nothing for an attachment whose checksum matches', async () => {
      const resource = fakeResource({ records: [{ _attachments: [{ _id: 'abc123', _md5sum: await md5('same') }] }], files: { abc123: 'same' } })
      await syncAttachment(resource, 'http://peer/api/', () => {})
      expect(requests).to.have.length(0)
    })

    it('downloads again an attachment whose checksum differs', async () => {
      const resource = fakeResource({ records: [{ _attachments: [{ _id: 'abc123', _md5sum: await md5('the new version') }] }], files: { abc123: 'the old version' } })
      await syncAttachment(resource, 'http://peer/api/', () => {})
      expect(requests.filter(r => r.method === 'GET')).to.have.length(1)
      expect(resource.written.abc123).to.equal('new content')
    })

    it('never asks a peer for an id that is not a plain file id', async () => {
      const resource = fakeResource({
        records: [{ _attachments: [{ _id: '../../admin/config' }, { _id: 'x?y=1' }, { _id: 'good1' }] }],
        files: {}
      })
      await syncAttachment(resource, 'http://peer/api/', () => {})
      expect(requests.map(r => r.url)).to.deep.equal(['http://peer/api/articles/file/good1', 'http://peer/api/articles/file/good1'])
      expect(resource.written).to.have.keys(['good1'])
    })
  })

  describe('md5Of', () => {
    it('hashes what the stream carries', async () => {
      expect(await md5('abc')).to.equal('900150983cd24fb0d6963f7d28e17f72')
    })
  })
})
