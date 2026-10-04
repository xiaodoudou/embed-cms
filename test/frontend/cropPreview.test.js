import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderPreview } from '@u/cropPreview'

// The small picture of a crop that the field shows until the picture is saved: drawn once, in the order the server cuts in.
// jsdom has no canvas: a stand-in records what is drawn.

const calls = []
const context = new Proxy({}, {
  get: (target, name) => (...args) => { calls.push([name, ...args]) },
  set: () => true
})
let canvas

const stand = (naturalWidth, naturalHeight, { getContext = () => context } = {}) => {
  calls.length = 0
  canvas = { width: 0, height: 0, getContext, toDataURL: vi.fn((type) => `data:${type};base64,XX`) }
  vi.spyOn(document, 'createElement').mockImplementation((tag) => tag === 'canvas' ? canvas : document.createElementNS('http://www.w3.org/1999/xhtml', tag))
  // an image that loads at once, with the size given
  vi.stubGlobal('Image', class {
    constructor () { this.naturalWidth = naturalWidth; this.naturalHeight = naturalHeight }
    set src (value) { this._src = value; Promise.resolve().then(() => value === 'broken' ? this.onerror() : this.onload()) }
  })
}
const names = () => calls.map(call => call[0])
const call = (name) => calls.find(entry => entry[0] === name)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('renderPreview', () => {
  it('gives nothing when there is no canvas to draw on', async () => {
    stand(100, 50, { getContext: () => null })
    expect(await renderPreview('a.png', { left: 0, top: 0, width: 10, height: 10 })).toBe('')
  })

  it('draws the part kept to the size of the result, at most 360 px on a side, and gives a jpeg', async () => {
    stand(4000, 3000)
    const url = await renderPreview('big.jpg', { left: 100, top: 200, width: 2000, height: 1000 })
    expect(url).toBe('data:image/jpeg;base64,XX')
    expect([canvas.width, canvas.height]).toEqual([360, 180])
    // the part kept fills the canvas: scaled by the size of the canvas over the part, moved so that its corner is at the origin
    expect(call('scale')).toEqual(['scale', 360 / 2000, 180 / 1000])
    expect(calls.filter(entry => entry[0] === 'translate')[0]).toEqual(['translate', -100, -200])
    expect(call('drawImage').slice(2, 4)).toEqual([-2000, -1500])
  })

  it('does not enlarge a part that is smaller than the maximum', async () => {
    stand(400, 300)
    await renderPreview('a.jpg', { left: 0, top: 0, width: 100, height: 50 })
    expect([canvas.width, canvas.height]).toEqual([100, 50])
  })

  it('draws the size of the output when the recipe gives one', async () => {
    stand(4000, 3000)
    await renderPreview('a.jpg', { left: 0, top: 0, width: 1000, height: 1000, output: { width: 200, height: 100 } })
    expect([canvas.width, canvas.height]).toEqual([200, 100])
  })

  it('draws the whole picture when the recipe has no part', async () => {
    stand(400, 200)
    await renderPreview('a.jpg', { rotate: 90 })
    // turned 90 the picture is 200 x 400
    expect([canvas.width, canvas.height]).toEqual([200, 360].map((side, i) => i ? side : Math.round(200 * 360 / 400)))
  })

  it('turns about the middle of the turned picture, flipped first, in the order of the server', async () => {
    stand(400, 200)
    await renderPreview('a.jpg', { left: 0, top: 0, width: 200, height: 400, rotate: 90, flipX: true })
    // the turned picture is 200 x 400: its middle is at 100, 200
    expect(calls.filter(entry => entry[0] === 'translate')[1]).toEqual(['translate', 100, 200])
    expect(call('rotate')).toEqual(['rotate', Math.PI / 2])
    expect(calls.filter(entry => entry[0] === 'scale')[1]).toEqual(['scale', -1, 1])
    // translate, rotate and scale are applied to a point in the opposite order: so the picture is flipped, then turned, then moved
    expect(names().indexOf('rotate')).toBeLessThan(names().lastIndexOf('scale'))
    expect(names().lastIndexOf('scale')).toBeLessThan(names().indexOf('drawImage'))
  })

  it('clips a circle and gives a png, so that the corners are transparent', async () => {
    stand(400, 400)
    const url = await renderPreview('a.jpg', { left: 0, top: 0, width: 400, height: 400, shape: 'circle' })
    expect(url).toBe('data:image/png;base64,XX')
    expect(names().indexOf('clip')).toBeLessThan(names().indexOf('drawImage'))
    expect(call('ellipse').slice(1, 5)).toEqual([180, 180, 180, 180])
  })

  it('does not clip a rectangle', async () => {
    stand(400, 400)
    await renderPreview('a.jpg', { left: 0, top: 0, width: 400, height: 400 })
    expect(names()).not.toContain('clip')
  })

  it('fails when the picture cannot be loaded', async () => {
    stand(400, 400)
    await expect(renderPreview('broken', { left: 0, top: 0, width: 1, height: 1 })).rejects.toThrow('could not be loaded')
  })
})
