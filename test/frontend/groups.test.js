import { describe, it, expect, vi, afterEach } from 'vitest'
import { placeGroupLayout, revealField, REVEAL_EVENT } from '@u/groups'

// The groups of a form: the lines of their layout, and the opening of a closed one around a field.

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const leaf = (originalModel, model = originalModel) => ({ type: 'input', originalModel, model })
const names = (layout) => layout.lines.map((line) => line.fields.map((field) => field.model))

describe('placeGroupLayout', () => {
  const items = [leaf('address.street'), leaf('address.number'), leaf('address.city'), leaf('address.postcode')]

  it('has nothing for a group without a layout, or with no lines', () => {
    expect(placeGroupLayout(items, undefined, 'address')).toBeUndefined()
    expect(placeGroupLayout(items, {}, 'address')).toBeUndefined()
    expect(placeGroupLayout(items, { lines: [] }, 'address')).toBeUndefined()
  })

  it('places the fields on the lines, named by their key inside the group', () => {
    const layout = placeGroupLayout(items, { lines: [{ slots: 4, fields: [{ model: 'street', width: 3 }, { model: 'number' }] }, { fields: [{ model: 'city' }, { model: 'postcode' }] }] }, 'address')
    expect(names(layout)).toEqual([['address.street', 'address.number'], ['address.city', 'address.postcode']])
    expect(layout.lines[0].slots).toBe(4)
    expect(layout.lines[0].fields.map((field) => field.width)).toEqual([3, undefined])
    expect(layout.lines[0].fields[0].schema).toBe(items[0])
  })

  it('divides a line that gives no slots among its fields', () => {
    const layout = placeGroupLayout(items, { lines: [{ fields: [{ model: 'street' }, { model: 'number' }, { model: 'city' }] }] }, 'address')
    expect(layout.lines[0].slots).toBe(3)
  })

  it('takes the whole key of a field too', () => {
    const layout = placeGroupLayout(items, { lines: [{ fields: [{ model: 'address.city' }] }] }, 'address')
    expect(layout.lines[0].fields[0].schema).toBe(items[2])
  })

  it('names a localised field by its key, and keeps its model for the form', () => {
    const localised = [leaf('address.city', 'address.city.enUS')]
    const layout = placeGroupLayout(localised, { lines: [{ fields: [{ model: 'city' }] }] }, 'address')
    expect(layout.lines[0].fields[0].model).toBe('address.city.enUS')
  })

  it('names a group inside it by its key', () => {
    const inner = { type: 'group', key: 'profiles', groupOptions: { fields: [] } }
    const layout = placeGroupLayout([leaf('social.website'), inner], { lines: [{ fields: [{ model: 'profiles' }] }] }, 'social')
    expect(layout.lines[0].fields[0].schema).toBe(inner)
    expect(layout.lines[0].fields[0].model).toBe('profiles')
  })

  it('finds the fields of a block, whose keys start with a prefix the path leaves out', () => {
    const block = [leaf('block.a.x'), leaf('block.a.y')]
    const layout = placeGroupLayout(block, { lines: [{ fields: [{ model: 'x' }, { model: 'y' }] }] }, 'a', 'block.')
    expect(names(layout)).toEqual([['block.a.x', 'block.a.y']])
  })

  it('puts the fields no line names at the end, each on a line of its own', () => {
    const layout = placeGroupLayout(items, { lines: [{ fields: [{ model: 'street' }] }] }, 'address')
    expect(names(layout)).toEqual([['address.street'], ['address.number'], ['address.city'], ['address.postcode']])
  })

  it('shows a field once when two lines name it', () => {
    const layout = placeGroupLayout(items, { lines: [{ fields: [{ model: 'street' }] }, { fields: [{ model: 'street' }, { model: 'number' }] }] }, 'address')
    expect(names(layout).flat().filter((model) => model === 'address.street')).toHaveLength(1)
  })

  it('leaves out a field the group does not hold, says so, and drops the line it leaves empty', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const layout = placeGroupLayout(items, { lines: [{ fields: [{ model: 'nope' }] }, { fields: [{ model: 'street' }, { model: 'ghost' }] }] }, 'address')
    expect(error).toHaveBeenCalledTimes(2)
    expect(error.mock.calls[0][0]).toContain('nope')
    expect(names(layout)[0]).toEqual(['address.street'])
    expect(layout.lines).toHaveLength(4)
  })

  it('does not change the layout it is given', () => {
    const given = { lines: [{ fields: [{ model: 'street' }] }] }
    const copy = JSON.parse(JSON.stringify(given))
    placeGroupLayout(items, given, 'address')
    expect(given).toEqual(copy)
  })
})

describe('revealField', () => {
  const page = (collapsed) => {
    document.body.innerHTML = `<div class="group ${collapsed ? 'is-collapsed' : ''}"><div class="group is-collapsed"><input id="inner"></div><input id="outer"></div><input id="free">`
  }

  it('tells every closed group around the field to open, and says it did', () => {
    page(true)
    const heard = []
    document.querySelectorAll('.group').forEach((group, index) => group.addEventListener(REVEAL_EVENT, () => heard.push(index)))
    expect(revealField(document.getElementById('inner'))).toBe(true)
    // (the one around the field first, then the one around that)
    expect(heard).toEqual([1, 0])
  })

  it('has nothing to do for a field that is not in a closed group, or for no field', () => {
    page(false)
    const heard = vi.fn()
    document.body.addEventListener(REVEAL_EVENT, heard)
    expect(revealField(document.getElementById('outer'))).toBe(false)
    expect(revealField(document.getElementById('free'))).toBe(false)
    expect(revealField(null)).toBe(false)
    expect(heard).not.toHaveBeenCalled()
  })
})
