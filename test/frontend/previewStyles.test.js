import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// What the stylesheet of the previews has to keep: jsdom draws nothing, so these read the rules a regression would remove.

const scss = fs.readFileSync(path.resolve(__dirname, '../../src/assets/scss/components/ImageView.scss'), 'utf8')
const rule = (selector) => {
  const start = scss.indexOf(selector)
  expect(start, `${selector} is styled`).toBeGreaterThan(-1)
  return scss.slice(start, scss.indexOf('}', start))
}

describe('the stylesheet of the upload previews', () => {
  it('lays the Remove button of a file beside View without the hover layer of Vuetify leaving the button', () => {
    const text = rule('.preview-remove.is-text')
    // a static button has its hover layer and border positioned in the row around it (a tinted strip over the whole row)
    expect(text).toMatch(/position:\s*relative/)
    expect(text).not.toMatch(/position:\s*static/)
    // and it must not keep the corner offsets of the bin, which would push it off the line of View
    expect(text).toMatch(/top:\s*auto/)
    expect(text).toMatch(/right:\s*auto/)
  })

  it('puts the bin of a picture in its corner', () => {
    const bin = rule('    .preview-remove {')
    expect(bin).toMatch(/position:\s*absolute/)
    expect(bin).toMatch(/top:/)
    expect(bin).toMatch(/right:/)
  })

  it('draws the drop look from the file input of Vuetify, not from a flag of ours that a drop never switched off', () => {
    expect(scss).toMatch(/\.v-file-input--dragging \.v-field/)
    expect(scss).not.toMatch(/\.drag-and-drop/)
  })

  it('cuts the name of a file with an ellipsis on its own line, so a long name cannot push anything out of the card', () => {
    const name = rule('.filename-text')
    expect(name).toMatch(/text-overflow:\s*ellipsis/)
    expect(name).toMatch(/min-width:\s*0/)
    expect(name).toMatch(/white-space:\s*nowrap/)
  })
})
