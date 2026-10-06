import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// What the stylesheet of the image map tool has to keep (jsdom draws nothing, so these read the rules a regression would remove).

const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/attachments/ImageMapDialog.vue'), 'utf8')
const styles = source.slice(source.indexOf('<style'))
const rule = (selector) => {
  const start = styles.indexOf(selector)
  expect(start, `${selector} is styled`).toBeGreaterThan(-1)
  return styles.slice(start, styles.indexOf('}', start))
}

describe('the stylesheet of the image map tool', () => {
  it('gives the modal a height of its own, so that it does not grow and shrink with what is selected', () => {
    const card = rule('.map-card {\n    display: flex;')
    expect(card).toMatch(/height:\s*min\(92vh,\s*820px\)/)
    expect(card).not.toMatch(/max-height/)
  })

  it('beats the flex basis Vuetify gives the card of a dialog, which a height alone does not', () => {
    const override = rule('&.v-dialog > .v-overlay__content > .map-card')
    expect(override).toMatch(/flex:\s*0 0 auto/)
  })

  it('scrolls the panel on the side inside the modal, and not the modal', () => {
    expect(rule('.map-tools {')).toMatch(/overflow-y:\s*auto/)
    expect(rule('.map-tools {')).toMatch(/min-height:\s*0/)
    expect(rule('.map-body {')).toMatch(/overflow:\s*hidden/)
  })

  it('keeps the picture in the room the stage has, centred', () => {
    // (before the picture is fitted to the stage, which is when it is measured)
    expect(rule('.map-image {\n    display: block;')).toMatch(/max-height:\s*calc\(min\(92vh,\s*820px\)/)
    expect(rule('.map-stage {')).toMatch(/align-items:\s*center/)
  })

  it('lets the picture fill the box it is fitted to, and shows the stage in a height of its own on a narrow screen', () => {
    const fitted = rule('.map-canvas.is-fitted .map-image {')
    expect(fitted).toMatch(/width:\s*100%/)
    expect(fitted).toMatch(/height:\s*100%/)
    expect(fitted).toMatch(/max-height:\s*none/)
    expect(styles).toMatch(/\.map-stage \{\s*height:\s*46vh/)
  })

  it('draws the areas with the colours of the theme, not colours of its own', () => {
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    expect(rule('.map-area {')).toMatch(/var\(--cms-primary\)/)
  })

  it('draws a stroke that keeps its width whatever the size of the picture', () => {
    expect(rule('.map-area {')).toMatch(/vector-effect:\s*non-scaling-stroke/)
  })
})
