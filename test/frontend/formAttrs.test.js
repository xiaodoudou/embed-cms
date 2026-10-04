import { describe, it, expect } from 'vitest'
import { nameUnnamedInputs } from '../../src/utils/formAttrs.js'

const html = (markup) => {
  const root = document.createElement('div')
  root.innerHTML = markup
  return root
}

describe('naming the inputs of a widget that has none', () => {
  it('names an input with neither an id nor a name, after the field and what the input says it is', () => {
    const root = html('<input type="number" aria-label="Red value"><textarea></textarea>')
    expect(nameUnnamedInputs(root, 'colour')).toBe(2)
    const [number, textarea] = root.querySelectorAll('input, textarea')
    expect(number.getAttribute('name')).toBe('colour-red-value-0')
    expect(textarea.getAttribute('name')).toBe('colour-textarea-1')
  })

  it('leaves the inputs that have an id or a name as they are, and never gives the same name twice', () => {
    const root = html('<input id="a"><input name="b"><input type="text"><input type="text">')
    expect(nameUnnamedInputs(root, 'x')).toBe(2)
    const inputs = [...root.querySelectorAll('input')]
    expect(inputs[0].getAttribute('name')).toBe(null)
    expect(inputs[1].getAttribute('name')).toBe('b')
    expect(new Set(inputs.slice(2).map((input) => input.getAttribute('name'))).size).toBe(2)
  })

  it('does nothing without an element, and a second pass has nothing left to name', () => {
    expect(nameUnnamedInputs(null, 'x')).toBe(0)
    const root = html('<input type="text">')
    nameUnnamedInputs(root, 'x')
    expect(nameUnnamedInputs(root, 'x')).toBe(0)
  })
})
