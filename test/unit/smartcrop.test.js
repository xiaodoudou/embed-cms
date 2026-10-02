const sharp = require('sharp')
const { expect } = require('chai')
const { applyCrop, getSizes } = require('../../lib/util/smartcrop')

// Smart cropping keeps the interesting part of a picture (sharp's attention strategy) instead of its centre. It used to
// load face and object detection models whose loading was commented out, so every smart crop was a centre crop.

// a grey picture, 400x200, with a red disc near its right edge
const picture = () => sharp(Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#808080"/>' +
  '<circle cx="330" cy="100" r="45" fill="#e01010"/></svg>'
)).png().toBuffer()

describe('smart crop (unit)', () => {
  it('crops around the interesting part, not the centre', async () => {
    const result = await applyCrop(await picture(), '100x100')
    const meta = await sharp(result.buffer).metadata()
    expect([meta.width, meta.height]).to.deep.equal([100, 100])
    // a centre crop of a 200x200 square would start at x=100; the disc is between 285 and 375
    expect(result.cropResult.width).to.equal(200)
    expect(result.cropResult.x).to.be.at.least(175)
    expect(result.mimeType).to.equal('image/png')
  })

  it('keeps the aspect ratio when one side is auto, and the size with autoxauto', async () => {
    const buffer = await picture()
    expect((await applyCrop(buffer, '200xauto')).targetSize).to.deep.equal({ width: 200, height: 100 })
    expect((await applyCrop(buffer, 'autox50')).targetSize).to.deep.equal({ width: 100, height: 50 })
    expect((await applyCrop(buffer, 'autoxauto')).targetSize).to.deep.equal({ width: 400, height: 200 })
  })

  it('refuses a size it cannot read', () => {
    expect(() => getSizes({ width: 10, height: 10 }, 'bigxsmall')).to.throw(/WIDTHxHEIGHT/)
    expect(() => getSizes({ width: 10, height: 10 }, '0x10')).to.throw()
  })
})
