const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const { Readable } = require('stream')
const sharp = require('sharp')
const { expect } = require('chai')
const ImageOptimization = require('../../lib/util/imageOptimization')

const make = (format, width = 200, height = 100) => sharp({
  create: { width, height, channels: 3, background: { r: 200, g: 60, b: 60 } }
})[format]().toBuffer()

const resultBuffer = async (result) => ImageOptimization.getBufferFromStream(result.stream)

describe('ImageOptimization (unit)', () => {
  describe('getBufferFromStream', () => {
    it('joins buffer and string chunks', async () => {
      const buffer = await ImageOptimization.getBufferFromStream(Readable.from([Buffer.from('ab'), 'cd']))
      expect(buffer.toString()).to.equal('abcd')
    })
    it('returns an empty buffer for an empty stream', async () => {
      expect((await ImageOptimization.getBufferFromStream(Readable.from([]))).length).to.equal(0)
    })
  })

  describe('resizeAttachment', () => {
    it('resizes a jpeg to exact dimensions and reports mime and length', async () => {
      const result = await ImageOptimization.resizeAttachment(Readable.from([await make('jpeg')]), '50x40')
      const out = await resultBuffer(result)
      const meta = await sharp(out).metadata()
      expect([meta.width, meta.height, meta.format]).to.deep.equal([50, 40, 'jpeg'])
      expect(result.mimeType).to.equal('image/jpeg')
      expect(result.contentLength).to.equal(out.length)
    })
    it('keeps the aspect ratio with autoxH and Wxauto', async () => {
      const input = await make('png', 200, 100)
      const byHeight = await sharp(await resultBuffer(await ImageOptimization.resizeAttachment(Readable.from([input]), 'autox50'))).metadata()
      expect([byHeight.width, byHeight.height]).to.deep.equal([100, 50])
      const byWidth = await sharp(await resultBuffer(await ImageOptimization.resizeAttachment(Readable.from([input]), '80xauto'))).metadata()
      expect([byWidth.width, byWidth.height]).to.deep.equal([80, 40])
    })
    it('keeps the input format for png and webp', async () => {
      for (const format of ['png', 'webp']) {
        const result = await ImageOptimization.resizeAttachment(Readable.from([await make(format)]), '20x20')
        const meta = await sharp(await resultBuffer(result)).metadata()
        expect(meta.format, format).to.equal(format)
        expect(result.mimeType).to.equal(`image/${format}`)
      }
    })
    it('honours a forced mime type', async () => {
      const result = await ImageOptimization.resizeAttachment(Readable.from([await make('png')]), '20x20', 'image/jpeg')
      expect(result.mimeType).to.equal('image/jpeg')
      expect((await sharp(await resultBuffer(result)).metadata()).format).to.equal('jpeg')
    })
    it('rejects an empty input', async () => {
      let error
      try { await ImageOptimization.resizeAttachment(Readable.from([]), '20x20') } catch (e) { error = e }
      expect(error).to.be.instanceOf(Error)
      expect(error.message).to.match(/empty or invalid/)
    })
    it('rejects data that is not an image', async () => {
      let error
      try { await ImageOptimization.resizeAttachment(Readable.from([Buffer.from('definitely not an image')]), '20x20') } catch (e) { error = e }
      expect(error).to.be.instanceOf(Error)
    })
  })

  describe('optimizeAttachment (crop)', () => {
    it('extracts the requested region', async () => {
      const result = await ImageOptimization.optimizeAttachment(Readable.from([await make('jpeg', 200, 100)]), { left: 10, top: 5, width: 60, height: 30 })
      const meta = await sharp(await resultBuffer(result)).metadata()
      expect([meta.width, meta.height]).to.deep.equal([60, 30])
      expect(result.mimeType).to.equal('image/jpeg')
    })
    it('accepts the cropper.js shape (data.coordinates) and ignores extra keys', async () => {
      const result = await ImageOptimization.optimizeAttachment(Readable.from([await make('png', 200, 100)]), {
        data: { coordinates: { left: 0, top: 0, width: 40, height: 40, extra: 'ignored' } }, updated: true
      })
      const meta = await sharp(await resultBuffer(result)).metadata()
      expect([meta.width, meta.height]).to.deep.equal([40, 40])
    })
    it('keeps a region that hangs over the image inside it', async () => {
      const result = await ImageOptimization.optimizeAttachment(Readable.from([await make('jpeg', 50, 50)]), { left: 40, top: 40, width: 100, height: 100 })
      const meta = await sharp(await resultBuffer(result)).metadata()
      expect([meta.width, meta.height]).to.deep.equal([10, 10])
    })
    it('sends the image as it is when the recipe changes nothing', async () => {
      const original = await make('png', 30, 20)
      const result = await ImageOptimization.optimizeAttachment(Readable.from([original]), { updated: true })
      expect(await resultBuffer(result)).to.deep.equal(original)
      expect(result.mimeType).to.equal('image/png')
    })
    it('turns, flips and sizes the image as the recipe says', async () => {
      const result = await ImageOptimization.optimizeAttachment(Readable.from([await make('jpeg', 200, 100)]), { rotate: 90, flipX: true, output: { width: 25 } })
      const meta = await sharp(await resultBuffer(result)).metadata()
      expect([meta.width, meta.height]).to.deep.equal([25, 50])
    })
    it('gives the size asked for the result', async () => {
      const result = await ImageOptimization.optimizeAttachment(Readable.from([await make('jpeg', 200, 100)]), { left: 0, top: 0, width: 100, height: 100 }, { resize: '20xauto' })
      const meta = await sharp(await resultBuffer(result)).metadata()
      expect([meta.width, meta.height]).to.deep.equal([20, 20])
    })
    it('rejects an empty input', async () => {
      let error
      try { await ImageOptimization.optimizeAttachment(Readable.from([]), { left: 0, top: 0, width: 1, height: 1 }) } catch (e) { error = e }
      expect(error.message).to.match(/empty or invalid/)
    })
  })

  describe('getImageDimensions', () => {
    let dir
    before(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'img-')) })
    after(async () => { await fs.remove(dir) })

    it('reads width and height from a file', async () => {
      const file = path.join(dir, 'a.png')
      await fs.writeFile(file, await make('png', 123, 45))
      expect(await ImageOptimization.getImageDimensions(file)).to.deep.equal({ width: 123, height: 45 })
    })
    it('returns null for a missing or non-image file', async () => {
      expect(await ImageOptimization.getImageDimensions(path.join(dir, 'missing.png'))).to.equal(null)
      const text = path.join(dir, 'a.txt')
      await fs.writeFile(text, 'hello')
      expect(await ImageOptimization.getImageDimensions(text)).to.equal(null)
    })
  })

  describe('smartCropAttachment', () => {
    it('refuses formats smart crop does not support', async () => {
      let error
      try { await ImageOptimization.smartCropAttachment(Readable.from([await make('webp')]), '50x50') } catch (e) { error = e }
      expect(error.message).to.match(/not supported for image\/webp/)
    })
    it('rejects an empty input', async () => {
      let error
      try { await ImageOptimization.smartCropAttachment(Readable.from([]), '50x50') } catch (e) { error = e }
      expect(error.message).to.match(/empty or invalid/)
    })
    it('crops a real photo to the requested size', async function () {
      this.timeout(30000)
      const result = await ImageOptimization.smartCropAttachment(Readable.from([fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'man.jpg'))]), '120x80')
      const meta = await sharp(await resultBuffer(result)).metadata()
      expect([meta.width, meta.height]).to.deep.equal([120, 80])
      expect(result.mimeType).to.match(/^image\//)
      expect(result.contentLength).to.be.greaterThan(0)
    })
  })
})
