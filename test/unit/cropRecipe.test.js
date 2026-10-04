const sharp = require('sharp')
const { expect } = require('chai')
const { parseRecipe, recipeKey, renderRecipe, resultSize, fitRect } = require('../../lib/util/cropRecipe')
const { suggestCrop } = require('../../lib/util/smartcrop')

// The crop of the admin's crop tool is a recipe kept with the original: flips, a turn, the part kept, the size and shape of the result.
// The pictures here have four flat colours, one per quarter, so what is cut shows in the colour of each corner.

// 40x20: red top left, green bottom left, blue top right, yellow bottom right
const quadrants = () => sharp(Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20">' +
  '<rect x="0" y="0" width="20" height="10" fill="#ff0000"/><rect x="0" y="10" width="20" height="10" fill="#00ff00"/>' +
  '<rect x="20" y="0" width="20" height="10" fill="#0000ff"/><rect x="20" y="10" width="20" height="10" fill="#ffff00"/></svg>'
))
const png = () => quadrants().png().toBuffer()

const near = (value, target) => Math.abs(value - target) < 40
const colourName = (r, g, b) => {
  const names = { R: [255, 0, 0], G: [0, 255, 0], B: [0, 0, 255], Y: [255, 255, 0] }
  return Object.keys(names).find(name => near(r, names[name][0]) && near(g, names[name][1]) && near(b, names[name][2])) || `${r},${g},${b}`
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<{width: number, height: number, channels: number, grid: string}>} the colour at a quarter of each side, two rows of two letters
 */
const look = async (buffer) => {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
  const rows = [0.25, 0.75].map(y => [0.25, 0.75].map((x) => {
    const at = (Math.floor(info.height * y) * info.width + Math.floor(info.width * x)) * info.channels
    return colourName(data[at], data[at + 1], data[at + 2])
  }).join(''))
  return { width: info.width, height: info.height, channels: info.channels, grid: rows.join('/') }
}

const render = async (recipe, options, source) => {
  const result = await renderRecipe(source || await png(), parseRecipe(recipe), options)
  return { ...result, ...await look(result.buffer) }
}

describe('crop recipe (unit)', () => {
  describe('parseRecipe', () => {
    it('has nothing to do for no crop, no turn and no change of size or shape', () => {
      expect(parseRecipe(undefined)).to.equal(null)
      expect(parseRecipe('crop')).to.equal(null)
      expect(parseRecipe({})).to.equal(null)
      expect(parseRecipe({ rotate: 0, flipX: false, shape: 'rect', output: {} })).to.equal(null)
    })

    it('reads the coordinates the first crop tool stored, under data.coordinates', () => {
      expect(parseRecipe({ data: { coordinates: { left: 5.4, top: 6, width: 100, height: 50.6 } }, updated: true }).rect).to.deep.equal({ left: 5, top: 6, width: 100, height: 51 })
    })

    it('reads the part kept from the recipe itself', () => {
      expect(parseRecipe({ left: 1, top: 2, width: 3, height: 4 })).to.deep.equal({
        rect: { left: 1, top: 2, width: 3, height: 4 }, rotate: 0, flipX: false, flipY: false, shape: 'rect', output: null
      })
    })

    it('keeps the whole picture when the part has no size, and a part that starts before the picture at its edge', () => {
      expect(parseRecipe({ left: 5, top: 5, width: 0, height: 10, rotate: 90 }).rect).to.equal(null)
      expect(parseRecipe({ left: -20, top: -1, width: 10, height: 10 }).rect).to.deep.equal({ left: 0, top: 0, width: 10, height: 10 })
    })

    it('turns by quarters, clockwise, whatever number it is given', () => {
      const turn = rotate => parseRecipe({ rotate, shape: 'circle' }).rotate
      expect([0, 90, 180, 270, 360, 450, -90, -270, 100, 'abc', null].map(turn)).to.deep.equal([0, 90, 180, 270, 0, 90, 270, 90, 90, 0, 0])
    })

    it('flips only on an explicit true', () => {
      expect(parseRecipe({ flipX: true, flipY: 'yes' })).to.include({ flipX: true, flipY: false })
    })

    it('keeps the circle shape, and any other shape is a rectangle', () => {
      expect(parseRecipe({ shape: 'circle' }).shape).to.equal('circle')
      expect(parseRecipe({ shape: 'star', rotate: 90 }).shape).to.equal('rect')
    })

    it('keeps the sizes, the quality and the formats it knows, in range, and drops the rest', () => {
      expect(parseRecipe({ output: { width: '300', height: 0.2, maxWidth: 99999, quality: 500, format: 'webp', extra: 1 } }).output).to.deep.equal({
        width: 300, height: 1, maxWidth: 8192, quality: 100, format: 'webp'
      })
      expect(parseRecipe({ output: { width: 'wide', format: 'exe', quality: null } })).to.equal(null)
    })
  })

  describe('recipeKey', () => {
    it('is the same for the same recipe and size, and differs when either changes', () => {
      const recipe = parseRecipe({ left: 1, top: 2, width: 3, height: 4 })
      expect(recipeKey(recipe, '100x100')).to.equal(recipeKey(parseRecipe({ left: 1, top: 2, width: 3, height: 4 }), '100x100'))
      expect(recipeKey(recipe, '100x100')).to.not.equal(recipeKey(recipe, '200x200'))
      expect(recipeKey(recipe)).to.not.equal(recipeKey(parseRecipe({ left: 1, top: 2, width: 3, height: 5 })))
      expect(recipeKey(recipe)).to.match(/^[0-9a-f]{16}$/)
    })
  })

  describe('resultSize', () => {
    const kept = { width: 400, height: 200 }
    it('is the part kept without an output or a size', () => {
      expect(resultSize(kept, null)).to.deep.equal({ width: 400, height: 200 })
    })
    it('takes the size of the output, and keeps the ratio when it gives one side', () => {
      expect(resultSize(kept, { width: 100, height: 100 })).to.deep.equal({ width: 100, height: 100 })
      expect(resultSize(kept, { width: 100 })).to.deep.equal({ width: 100, height: 50 })
      expect(resultSize(kept, { height: 100 })).to.deep.equal({ width: 200, height: 100 })
    })
    it('shrinks to the maximum sizes and never enlarges', () => {
      expect(resultSize(kept, { maxWidth: 100 })).to.deep.equal({ width: 100, height: 50 })
      expect(resultSize(kept, { maxWidth: 1000, maxHeight: 1000 })).to.deep.equal({ width: 400, height: 200 })
      expect(resultSize(kept, { maxWidth: 300, maxHeight: 50 })).to.deep.equal({ width: 100, height: 50 })
    })
    it('then follows the size asked for, auto keeping the ratio', () => {
      expect(resultSize(kept, null, '200xauto')).to.deep.equal({ width: 200, height: 100 })
      expect(resultSize(kept, null, 'autox50')).to.deep.equal({ width: 100, height: 50 })
      expect(resultSize(kept, { width: 100 }, '50x50')).to.deep.equal({ width: 50, height: 50 })
      expect(resultSize(kept, null, 'big')).to.deep.equal({ width: 400, height: 200 })
      expect(resultSize(kept, null, 'autoxauto')).to.deep.equal({ width: 400, height: 200 })
    })
    it('is never larger than the limits, whatever the recipe asks', () => {
      const size = resultSize(kept, { width: 8000, height: 8000 })
      expect(size.width * size.height).to.be.at.most(50e6)
      expect(Math.max(size.width, size.height)).to.be.at.most(8192)
    })
  })

  describe('fitRect', () => {
    it('keeps a part inside the picture, at least a pixel', () => {
      expect(fitRect({ left: 30, top: 10, width: 100, height: 100 }, { width: 40, height: 20 })).to.deep.equal({ left: 30, top: 10, width: 10, height: 10 })
      expect(fitRect({ left: 500, top: 500, width: 5, height: 5 }, { width: 40, height: 20 })).to.deep.equal({ left: 39, top: 19, width: 1, height: 1 })
    })
  })

  describe('renderRecipe', () => {
    it('cuts the part kept', async () => {
      // the right half of the picture: blue over yellow
      const result = await render({ left: 20, top: 0, width: 20, height: 20 })
      expect(result).to.include({ width: 20, height: 20, grid: 'BB/YY', mimeType: 'image/png' })
      expect(result.contentLength).to.equal(result.buffer.length)
    })

    it('turns by quarters before it cuts: the part is in pixels of the turned picture', async () => {
      // turned 90 clockwise the picture is 20x40: green red over yellow blue
      expect(await render({ rotate: 90 })).to.include({ width: 20, height: 40, grid: 'GR/YB' })
      // its top left quarter is green
      expect(await render({ rotate: 90, left: 0, top: 0, width: 10, height: 20 })).to.include({ width: 10, height: 20, grid: 'GG/GG' })
      expect(await render({ rotate: 180, left: 0, top: 0, width: 20, height: 10 })).to.include({ grid: 'YY/YY' })
      expect(await render({ rotate: 270, left: 0, top: 0, width: 10, height: 20 })).to.include({ grid: 'BB/BB' })
    })

    it('flips before it cuts, with or without a turn (a flip alone used to be done after the cut)', async () => {
      // flipped left to right the picture is blue red over yellow green: its top left quarter is blue
      expect(await render({ flipX: true })).to.include({ grid: 'BR/YG' })
      expect(await render({ flipX: true, left: 0, top: 0, width: 20, height: 10 })).to.include({ width: 20, height: 10, grid: 'BB/BB' })
      expect(await render({ flipY: true, left: 0, top: 0, width: 20, height: 10 })).to.include({ grid: 'GG/GG' })
      expect(await render({ flipX: true, flipY: true, left: 0, top: 0, width: 20, height: 10 })).to.include({ grid: 'YY/YY' })
      // turned 90 and flipped left to right: yellow blue over green red, top left quarter yellow
      expect(await render({ rotate: 90, flipX: true, left: 0, top: 0, width: 10, height: 20 })).to.include({ grid: 'YY/YY' })
    })

    it('keeps a part that hangs over the picture inside it', async () => {
      const result = await render({ left: 30, top: 10, width: 100, height: 100 })
      expect(result).to.include({ width: 10, height: 10, grid: 'YY/YY' })
    })

    it('puts the picture the way a browser shows it first, its EXIF orientation applied', async () => {
      // orientation 6: the picture is shown turned 90 clockwise, 20x40
      const tagged = await quadrants().jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).withMetadata({ orientation: 6 }).toBuffer()
      expect(await render({ left: 0, top: 0, width: 10, height: 20 }, {}, tagged)).to.include({ width: 10, height: 20, grid: 'GG/GG', mimeType: 'image/jpeg' })
      // and a turn comes after: 6 then 90 more is 180 in all, the top left quarter is yellow
      expect(await render({ rotate: 90, left: 0, top: 0, width: 20, height: 10 }, {}, tagged)).to.include({ width: 20, height: 10, grid: 'YY/YY' })
    })

    it('gives the size of the output, and keeps the ratio with one side', async () => {
      expect(await render({ left: 0, top: 0, width: 40, height: 20, output: { width: 20, height: 10 } })).to.include({ width: 20, height: 10, grid: 'RB/GY' })
      expect(await render({ output: { width: 20 } })).to.include({ width: 20, height: 10 })
      expect(await render({ output: { maxHeight: 5 } })).to.include({ width: 10, height: 5 })
    })

    it('follows the size asked for after the output of the recipe', async () => {
      expect(await render({ output: { width: 20 } }, { resize: 'autox5' })).to.include({ width: 10, height: 5 })
      expect(await render({ left: 0, top: 0, width: 20, height: 20 }, { resize: '10x10' })).to.include({ width: 10, height: 10 })
    })

    it('keeps the format of the original, or changes it', async () => {
      const jpeg = await quadrants().jpeg().toBuffer()
      expect((await render({ left: 0, top: 0, width: 20, height: 20 }, {}, jpeg)).mimeType).to.equal('image/jpeg')
      expect((await render({ left: 0, top: 0, width: 20, height: 20 }, {}, await quadrants().webp().toBuffer())).mimeType).to.equal('image/webp')
      const converted = await render({ left: 0, top: 0, width: 20, height: 20, output: { format: 'webp', quality: 60 } })
      expect(converted.mimeType).to.equal('image/webp')
      expect((await sharp(converted.buffer).metadata()).format).to.equal('webp')
      expect((await render({ left: 0, top: 0, width: 20, height: 20, output: { format: 'jpeg' } })).mimeType).to.equal('image/jpeg')
    })

    it('a lower quality makes a smaller jpeg', async () => {
      const photo = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).png().toBuffer()
      const high = await renderRecipe(photo, parseRecipe({ output: { format: 'jpeg', quality: 95 } }))
      const low = await renderRecipe(photo, parseRecipe({ output: { format: 'jpeg', quality: 20 } }))
      expect(low.contentLength).to.be.below(high.contentLength)
    })

    it('leaves the corners of a circle transparent, as a png, and keeps webp', async () => {
      const result = await renderRecipe(await png(), parseRecipe({ left: 0, top: 0, width: 20, height: 20, shape: 'circle', output: { format: 'jpeg' } }))
      expect(result.mimeType).to.equal('image/png')
      const { data, info } = await sharp(result.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      expect(data[3]).to.equal(0)
      expect(data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3]).to.equal(255)
      expect((await renderRecipe(await png(), parseRecipe({ shape: 'circle', output: { format: 'webp' } }))).mimeType).to.equal('image/webp')
    })

    it('fills what is transparent with white when it becomes a jpeg', async () => {
      const clear = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
      const result = await renderRecipe(clear, parseRecipe({ output: { format: 'jpeg' } }))
      const { data } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true })
      expect([data[0], data[1], data[2]].every(value => value > 240)).to.equal(true)
    })

    it('does not touch the original buffer', async () => {
      const original = await png()
      const copy = Buffer.from(original)
      await renderRecipe(original, parseRecipe({ rotate: 90, flipX: true, left: 0, top: 0, width: 10, height: 10 }))
      expect(original.equals(copy)).to.equal(true)
    })

    it('refuses what is not a picture', async () => {
      let error
      try {
        await renderRecipe(Buffer.from('not a picture'), parseRecipe({ rotate: 90 }))
      } catch (thrown) {
        error = thrown
      }
      expect(error).to.be.an('error')
    })
  })

  describe('suggestCrop', () => {
    // a grey picture, 400x200, with a red disc near its right edge
    const wide = () => sharp(Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#808080"/>' +
      '<circle cx="330" cy="100" r="45" fill="#e01010"/></svg>'
    )).png().toBuffer()

    it('puts the largest window of the shape on the interesting part', async () => {
      const square = await suggestCrop(await wide(), 1)
      expect(square.width).to.equal(200)
      expect(square.height).to.equal(200)
      // a centre crop would start at 100; the disc lies between 285 and 375
      expect(square.left).to.be.at.least(175)
      const banner = await suggestCrop(await wide(), 4)
      expect(banner.width).to.equal(400)
      expect(banner.height).to.equal(100)
    })

    it('answers in pixels of the picture once it is turned', async () => {
      // turned 90 clockwise the picture is 200x400, the disc has gone to the bottom
      const turned = await suggestCrop(await wide(), 1, { rotate: 90 })
      expect(turned.width).to.equal(200)
      expect(turned.height).to.equal(200)
      expect(turned.top).to.be.at.least(175)
      // flipped left to right it has gone to the left
      expect((await suggestCrop(await wide(), 1, { flipX: true })).left).to.be.at.most(25)
    })
  })
})
