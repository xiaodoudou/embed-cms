const { expect } = require('chai')
const { injectAttachmentUrl } = require('../../lib/plugins/rest/routes')

describe('REST routes helpers (unit)', () => {
  describe('injectAttachmentUrl', () => {
    const req = { originalUrl: '/api/articles', params: { resource: 'articles' }, resource: { options: {} } }
    const record = (id) => ({ _id: id, _attachments: [{ _id: `${id}-file`, _name: 'image' }] })

    it('gives the attachments of a record their url', () => {
      const one = record('a')
      injectAttachmentUrl(one, req)
      expect(one.image[0].url).to.equal('/api/articles/a/attachments/a-file')
    })

    it('handles every record of an array, without recursing for ever (#28)', () => {
      const records = [record('a'), record('b')]
      injectAttachmentUrl(records, req)
      expect(records[0].image[0].url).to.equal('/api/articles/a/attachments/a-file')
      expect(records[1].image[0].url).to.equal('/api/articles/b/attachments/b-file')
    })
  })
})
