/**
 * @fileoverview Smart cropping through the resource API: an image cropped when it is uploaded and the same image cropped
 * when it is downloaded come out at the same size.
 */
const sharp = require('sharp')
const fs = require('fs-extra')
const path = require('path')
const { expect } = require('chai')
const { getCMSInstance } = require('./cmsInstance')

const sizes = [
  { resize: '500xauto', smart: false },
  { resize: '500xauto', smart: true },
  { resize: '200x200', smart: true },
  { resize: 'autoxauto', smart: true }
]

const bufferOf = async (stream) => {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

describe('smart cropping through the resource API', function () {
  const testImagePath = path.join(__dirname, 'man.jpg')
  let api

  before(async function () {
    if (await fs.pathExists('./test/data')) {
      await fs.remove('./test/data')
    }
    api = getCMSInstance().api()
  })

  for (const options of sizes) {
    it(`gives the same size on upload and on download for resize=${options.resize}, smart=${options.smart}`, async function () {
      const existing = await api('cctImages').find({ key: 'Smart crop test image' })
      if (existing) {
        await api('cctImages').remove(existing._id)
      }
      const record = await api('cctImages').create({ key: 'Smart crop test image' })
      const attachment = await api('cctImages').createAttachment(record._id, {
        name: 'example-attachment',
        stream: fs.createReadStream(testImagePath),
        fields: { _filename: 'man.jpg' },
        ...options
      })
      const created = await sharp(await bufferOf(await api('cctImages').findFile(attachment._id))).metadata()
      const { stream } = await api('cctImages').findAttachment(record._id, attachment._id, options)
      const found = await sharp(await bufferOf(stream)).metadata()
      expect([created.width, created.height]).to.deep.equal([found.width, found.height])
    })
  }
})
