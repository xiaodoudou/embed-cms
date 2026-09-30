const fs = require('fs')
const path = require('path')
const { expect } = require('chai')
const FileType = require('../../lib/util/fileType')

const image = path.join(__dirname, '..', 'man.jpg')

describe('fileType adapter', () => {
  it('detects a buffer', async () => {
    expect(await FileType.fromBuffer(fs.readFileSync(image))).to.deep.include({ ext: 'jpg', mime: 'image/jpeg' })
  })
  it('returns undefined for unknown content', async () => {
    expect(await FileType.fromBuffer(Buffer.from('just some text'))).to.equal(undefined)
  })
  it('detects a node stream and still yields every byte', async () => {
    const s = await FileType.stream(fs.createReadStream(image))
    expect(s.fileType).to.deep.include({ mime: 'image/jpeg' })
    let size = 0
    for await (const chunk of s) size += chunk.length
    expect(size).to.equal(fs.statSync(image).size)
  })
})
