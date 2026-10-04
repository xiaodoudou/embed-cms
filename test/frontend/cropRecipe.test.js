import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import {
  parseRatio, fixedSize, lockedRatio, ratioChoices, resultSize, buildRecipe, readRecipe, hasCrop, canCrop, isCroppable, cropVersion, DEFAULT_RATIOS
} from '@u/cropRecipe'
import { isAttachmentInput, isImageInput } from '@u/inputTypes'

const require = createRequire(import.meta.url)

// The admin's side of the crop recipe: what the tool offers, and how its state becomes the recipe the API cuts by and comes back from it.

describe('parseRatio', () => {
  it('reads a number, text, a pair and a size', () => {
    expect(parseRatio(1.5)).toBe(1.5)
    expect(parseRatio('3:2')).toBe(1.5)
    expect(parseRatio('16/9')).toBeCloseTo(16 / 9)
    expect(parseRatio(' 4 : 5 ')).toBe(0.8)
    expect(parseRatio('1.91:1')).toBeCloseTo(1.91)
    expect(parseRatio('2')).toBe(2)
    expect(parseRatio([3, 2])).toBe(1.5)
    expect(parseRatio({ width: 1200, height: 400 })).toBe(3)
  })

  it('is null for what is not a ratio', () => {
    for (const value of [0, -1, NaN, 'wide', '3:0', '0:3', [1], [1, 0], {}, { width: 1 }, null, undefined, true, '']) {
      expect(parseRatio(value), String(value)).toBe(null)
    }
  })
})

describe('what a field fixes', () => {
  it('takes the size from width and height together, or from the crop option of the first crop tool', () => {
    expect(fixedSize({ width: 1200, height: 400 })).toEqual({ width: 1200, height: 400 })
    expect(fixedSize({ crop: { width: 400, height: 300 } })).toEqual({ width: 400, height: 300 })
    expect(fixedSize({ width: 1200 })).toBe(null)
    expect(fixedSize({ crop: { width: 400 } })).toBe(null)
    expect(fixedSize({})).toBe(null)
  })

  it('locks the ratio to the fixed size, or to the aspectRatio option', () => {
    expect(lockedRatio({ width: 1200, height: 400 })).toBe(3)
    expect(lockedRatio({ aspectRatio: '3:2' })).toBe(1.5)
    expect(lockedRatio({ aspectRatio: 'wide' })).toBe(null)
    expect(lockedRatio({})).toBe(null)
  })
})

describe('ratioChoices', () => {
  it('offers the usual shapes when the field names none', () => {
    expect(ratioChoices({}).map(choice => choice.key)).toEqual(DEFAULT_RATIOS)
    expect(ratioChoices({ aspectRatios: [] }).map(choice => choice.key)).toEqual(DEFAULT_RATIOS)
  })

  it('has free and original as ways to choose, and the others as ratios', () => {
    const [free, original, square] = ratioChoices({})
    expect(free).toMatchObject({ key: 'free', kind: 'free', ratio: null })
    expect(original).toMatchObject({ key: 'original', kind: 'original', ratio: null })
    expect(square).toMatchObject({ key: '1:1', kind: 'ratio', ratio: 1, label: '1:1' })
  })

  it('takes the shapes of the field, in the ways they can be written, and drops what is not one', () => {
    const choices = ratioChoices({ aspectRatios: ['free', 1.5, [16, 9], { ratio: '4:5', label: 'Portrait' }, 'wide', { ratio: 'x' }, '1.91 : 1'] })
    // a ratio written as text keeps its text for key and label, one written as a number or a pair is named by its value
    expect(choices.map(choice => choice.key)).toEqual(['free', '1.5', '1.7778', '4:5', '1.91:1'])
    expect(choices.find(choice => choice.key === '4:5')).toMatchObject({ ratio: 0.8, label: 'Portrait' })
    expect(choices.find(choice => choice.key === '1.5').ratio).toBe(1.5)
  })
})

describe('resultSize', () => {
  const kept = { width: 400, height: 200 }

  it('is the part kept, or the size the output says, or the one side with the ratio kept', () => {
    expect(resultSize(kept, null)).toEqual({ width: 400, height: 200 })
    expect(resultSize(kept, {})).toEqual({ width: 400, height: 200 })
    expect(resultSize(kept, { width: 100, height: 100 })).toEqual({ width: 100, height: 100 })
    expect(resultSize(kept, { width: 100 })).toEqual({ width: 100, height: 50 })
    expect(resultSize(kept, { height: 100 })).toEqual({ width: 200, height: 100 })
  })

  it('shrinks to the maximums and never enlarges', () => {
    expect(resultSize(kept, { maxWidth: 100 })).toEqual({ width: 100, height: 50 })
    expect(resultSize(kept, { maxWidth: 1000, maxHeight: 1000 })).toEqual({ width: 400, height: 200 })
  })

  // the tool shows the size the server will make: the two have to agree
  it('gives the size the server makes', () => {
    const server = require('../../lib/util/cropRecipe')
    for (const output of [null, { width: 100, height: 100 }, { width: 100 }, { height: 70 }, { maxWidth: 150 }, { maxHeight: 60 }, { width: 8000, height: 8000 }, { width: 500, maxWidth: 200 }]) {
      expect(resultSize(kept, output), JSON.stringify(output)).toEqual(server.resultSize(kept, output))
    }
  })
})

describe('buildRecipe and readRecipe', () => {
  const state = {
    rect: { left: 10.4, top: 20.6, width: 300.2, height: 200 },
    transforms: { rotate: 90, flipX: true, flipY: false },
    shape: 'circle',
    output: { maxWidth: 256, format: 'png', quality: 0, height: undefined },
    ratio: '1:1'
  }

  it('keeps the part in whole pixels, the turns, the shape, the output that is set, the ratio, and flags it as updated', () => {
    expect(buildRecipe(state)).toEqual({
      left: 10, top: 21, width: 300, height: 200, rotate: 90, flipX: true, shape: 'circle', output: { maxWidth: 256, format: 'png' }, ratio: '1:1', updated: true
    })
  })

  it('leaves out what is the default', () => {
    expect(buildRecipe({ rect: { left: 0, top: 0, width: 5, height: 5 } })).toEqual({ left: 0, top: 0, width: 5, height: 5, updated: true })
  })

  it('turns by quarters, whatever the number', () => {
    const turn = rotate => buildRecipe({ rect: { left: 0, top: 0, width: 1, height: 1 }, transforms: { rotate } }).rotate
    expect([0, 90, 180, 270, 360, -90, 450].map(turn)).toEqual([undefined, 90, 180, 270, undefined, 270, 90])
  })

  it('keeps a part at least a pixel large and inside the picture on the left and the top', () => {
    expect(buildRecipe({ rect: { left: -5, top: -1, width: 0.2, height: 0 } })).toMatchObject({ left: 0, top: 0, width: 1, height: 1 })
  })

  it('gives the state of the tool back from what it built', () => {
    expect(readRecipe(buildRecipe(state))).toEqual({
      rect: { left: 10, top: 21, width: 300, height: 200 },
      transforms: { rotate: 90, flipX: true, flipY: false },
      shape: 'circle',
      output: { maxWidth: 256, format: 'png' },
      ratio: '1:1'
    })
  })

  it('reads the coordinates the first crop tool stored, and nothing at all', () => {
    expect(readRecipe({ data: { coordinates: { left: 1, top: 2, width: 3, height: 4 } }, updated: true }).rect).toEqual({ left: 1, top: 2, width: 3, height: 4 })
    expect(readRecipe(undefined)).toEqual({ rect: null, transforms: { rotate: 0, flipX: false, flipY: false }, shape: 'rect', output: {}, ratio: '' })
    expect(readRecipe({ updated: true }).rect).toBe(null)
  })
})

describe('hasCrop', () => {
  it('is true for what cuts something, false for what the tool stores for "no crop"', () => {
    expect(hasCrop({ left: 0, top: 0, width: 5, height: 5 })).toBe(true)
    expect(hasCrop({ rotate: 90 })).toBe(true)
    expect(hasCrop({ flipY: true })).toBe(true)
    expect(hasCrop({ shape: 'circle' })).toBe(true)
    expect(hasCrop({ output: { maxWidth: 10 } })).toBe(true)
    expect(hasCrop({ data: { coordinates: { left: 0, top: 0, width: 5, height: 5 } } })).toBe(true)
    expect(hasCrop({ updated: true })).toBe(false)
    expect(hasCrop(undefined)).toBe(false)
  })
})

describe('canCrop and isCroppable', () => {
  it('has the tool for a crop image field, and an image field with the crop option', () => {
    expect(canCrop({ input: 'cropimage' })).toBe(true)
    expect(canCrop({ input: 'image', crop: { width: 1, height: 1 } })).toBe(true)
    expect(canCrop({ input: 'image' })).toBe(false)
    expect(canCrop({})).toBe(false)
  })

  it('cuts a picture that is not a drawing', () => {
    expect(isCroppable({ _filename: 'a.jpg', _contentType: 'image/jpeg' })).toBe(true)
    expect(isCroppable({ _filename: 'a.SVG' })).toBe(false)
    expect(isCroppable({ _contentType: 'image/svg+xml' })).toBe(false)
    expect(isCroppable({ file: { name: 'logo.svg', type: 'image/svg+xml' } })).toBe(false)
    expect(isCroppable({ file: { name: 'a.png', type: 'image/png' } })).toBe(true)
  })
})

describe('cropVersion', () => {
  it('changes with the crop, not with the flag that says it is new', () => {
    const crop = { left: 1, top: 2, width: 3, height: 4 }
    expect(cropVersion(crop)).toBe(cropVersion({ ...crop, updated: true }))
    expect(cropVersion(crop)).not.toBe(cropVersion({ ...crop, width: 5 }))
    expect(cropVersion(crop)).toMatch(/^[0-9a-z]+$/)
  })
})

describe('the input types that hold files', () => {
  it('count a crop image as an image, and as a file', () => {
    expect(['image', 'cropimage', 'file', 'string', undefined].map(isImageInput)).toEqual([true, true, false, false, false])
    expect(['image', 'cropimage', 'file', 'string', undefined].map(isAttachmentInput)).toEqual([true, true, true, false, false])
  })
})
