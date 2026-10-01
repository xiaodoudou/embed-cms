const os = require('os')
const fs = require('fs-extra')
const path = require('path')
const { expect } = require('chai')
const { isLocalId } = require('../../lib/util/localId')
const createJsonStore = require('../../lib/db/json_store')

// A record id is 8 characters of time, the id of the machine (8 characters), then a random tail. The machine id used by the tests is
// "42424242", and a time part that ends in "42" puts that id at position 6 as well as at position 8: looking for it with indexOf
// then said the record belonged to another machine, and it could never be removed or updated again (about one id in 1300).

const MID = '42424242'
const OVERLAPPING = `muov4i42${MID}y0f7dv8q`

describe('local record ids (unit)', () => {
  describe('isLocalId', () => {
    it('knows the records of this machine', () => {
      expect(isLocalId(`muov4cv1${MID}y0355qdz`, MID)).to.equal(true)
    })

    it('knows the records of another machine', () => {
      expect(isLocalId('muov4cv1abcdefghy0355qdz', MID)).to.equal(false)
    })

    it('finds the machine id at position 8 even when its first characters also end the time part', () => {
      expect(OVERLAPPING.indexOf(MID)).to.equal(6)
      expect(isLocalId(OVERLAPPING, MID)).to.equal(true)
    })

    it('does not take a machine id found anywhere else for a match', () => {
      expect(isLocalId('abcdefgh1234567842424242', MID)).to.equal(false)
      expect(isLocalId(`${MID}abcdefghijklmnop`, MID)).to.equal(false)
    })

    it('says no to what is not an id', () => {
      expect(isLocalId(undefined, MID)).to.equal(false)
      expect(isLocalId('', MID)).to.equal(false)
      expect(isLocalId(`muov4cv1${MID}x`, '')).to.equal(false)
      expect(isLocalId(`muov4cv1${MID}x`, undefined)).to.equal(false)
    })

    it('is true for every id of the machine, whatever the time part ends with', () => {
      for (const tail of ['42', '4', '2', '24', '00', 'zz']) {
        expect(isLocalId(`muov4i${tail.padStart(2, '0').slice(-2)}${MID}y0f7dv8q`, MID), tail).to.equal(true)
      }
    })
  })

  describe('a store with such an id', () => {
    let dir
    let store

    beforeEach(async () => {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-id-'))
      store = createJsonStore(dir, MID, { cms: {} }, 'things')
      await store.open()
    })
    afterEach(async () => {
      await store.close()
      await fs.remove(dir)
    })

    it('removes the record', async () => {
      await store._db.put(OVERLAPPING, { _id: OVERLAPPING, key: 'reuse' })
      expect(await store.remove(OVERLAPPING)).to.equal(true)
      expect(await store.find(OVERLAPPING)).to.equal(undefined)
    })

    it('still refuses to touch a record of another machine', async () => {
      const foreign = 'muov4i42abcdefghy0f7dv8q'
      await store._db.put(foreign, { _id: foreign })
      const error = await store.remove(foreign).then(() => null, (e) => e)
      expect(error && error.code).to.equal('EFOREIGN')
    })
  })
})
