import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import ImageMapDialog from '@c/attachments/ImageMapDialog.vue'
import ResourceService from '@s/ResourceService'
import { mountComponent } from './helpers/mountField.js'

// The image map tool in its modal. jsdom draws nothing and has no pointer: the picture is given a size (2000 x 1000 px, shown 1000 x 500),
// and the pointer events are made by hand, in pixels of that box. What an area is, and the geometry, are in imageMap.test.js; the server
// checks the map (test/unit/imageMap.test.js); the whole was also tried with a mouse in the real admin.

vi.mock('@s/ResourceService', () => ({ default: { get: vi.fn(), cache: vi.fn(), getSchema: vi.fn() } }))

const SHOWN = { width: 1000, height: 500 }
const room = { width: SHOWN.width, height: SHOWN.height }
const KITCHEN = { id: 'kitchen', shape: 'rect', coords: [0.1, 0.1, 0.4, 0.5], title: 'Kitchen', href: '/kitchen', target: '_self' }
const LAMP = { id: 'lamp', shape: 'circle', coords: [0.7, 0.3, 0.1], title: 'Lamp', href: 'https://example.com/lamp', target: '_blank' }
const DOOR = { id: 'door', shape: 'poly', coords: [0.6, 0.6, 0.9, 0.6, 0.75, 0.95], title: 'Door', ref: { resource: 'pages', id: 'p2' }, target: '_self' }
const REFERENCES = [{ resource: 'pages', label: '{{title}}' }]
const PAGES = [{ _id: 'p1', title: { enUS: 'Pricing' } }, { _id: 'p2', title: { enUS: 'About' } }, { _id: 'p3', title: { enUS: 'Contact' } }]

let wrapper
const mount = (props = {}) => {
  wrapper = mountComponent(ImageMapDialog, { props: { modelValue: true, title: 'Floor plan', src: '/api/plans/1/attachments/a1', schema: { input: 'imagemap', locale: 'enUS' }, ...props }, attachTo: document.body })
  return wrapper
}
const body = (selector) => document.body.querySelector(selector)
const all = (selector) => [...document.body.querySelectorAll(selector)]
const overlay = () => body('.map-overlay')
const fire = (element, type, init = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, init)
  element.dispatchEvent(event)
  return event
}
// a point of the picture, as the fractions of it, in the pixels of the box it is shown in
const at = (x, y) => ({ clientX: x * SHOWN.width, clientY: y * SHOWN.height, button: 0, pointerId: 1 })
const down = (x, y, target = overlay()) => fire(target, 'pointerdown', at(x, y))
const move = (x, y) => fire(overlay(), 'pointermove', at(x, y))
const up = (x, y) => fire(overlay(), 'pointerup', at(x, y))
const drag = async (from, to) => {
  down(...from)
  move(...to)
  up(...to)
  await flushPromises()
}
const click = async (selector) => {
  body(selector).click()
  await flushPromises()
}
const key = async (name, init = {}) => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init })
  overlay().dispatchEvent(event)
  await flushPromises()
  return event
}
const loaded = async (width = 2000, height = 1000) => {
  const image = body('.map-image')
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: width })
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: height })
  image.dispatchEvent(new Event('load'))
  await flushPromises()
}
const open = async (props) => {
  mount(props)
  await flushPromises()
  await loaded()
}
const type = async (selector, text) => {
  const input = body(selector)
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}
const rows = () => all('.map-row').map(row => row.textContent.replace(/\s+/g, ' ').trim())
const coords = (index = 0) => wrapper.vm.areas[index].coords

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: SHOWN.width, bottom: SHOWN.height, x: 0, y: 0, ...SHOWN })
  // the stage and the box of the picture have the room of the box the picture is shown in
  room.width = SHOWN.width
  room.height = SHOWN.height
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => room.width })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => room.height })
  ResourceService.get.mockReset().mockReturnValue(PAGES)
  ResourceService.cache.mockReset().mockResolvedValue(PAGES)
  ResourceService.getSchema.mockReset().mockReturnValue({ locales: ['enUS'], schema: [{ field: 'title', input: 'string' }] })
})

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('ImageMapDialog (the image map tool)', () => {
  describe('opening', () => {
    it('is a dialog named by its title', async () => {
      mount()
      await flushPromises()
      const dialog = body('[role=dialog]')
      expect(body(`#${dialog.getAttribute('aria-labelledby')}`).textContent).toBe('Floor plan')
    })

    it('shows the picture, and the tool to draw on it once it is loaded', async () => {
      mount()
      await flushPromises()
      expect(body('.map-image').getAttribute('src')).toBe('/api/plans/1/attachments/a1')
      expect(overlay()).toBe(null)
      expect(body('.map-apply').disabled).toBe(true)
      await loaded()
      expect(overlay().getAttribute('viewBox')).toBe('0 0 2000 1000')
      expect(body('.map-apply').disabled).toBe(false)
    })

    it('says when the picture cannot be loaded', async () => {
      mount()
      await flushPromises()
      body('.map-image').dispatchEvent(new Event('error'))
      await flushPromises()
      expect(body('.map-stage .map-error').textContent).toContain('Error loading image')
    })

    it('shows the areas the picture has, the first one on top: an address by its title and its address, a record by its name', async () => {
      await open({ imageMap: { areas: [KITCHEN, LAMP, DOOR] } })
      expect(rows()).toEqual(['1Kitchen/kitchen', '2Lamphttps://example.com/lamp', '3About'])
      // drawn last first, so that the first is over the others
      expect(all('.map-overlay .map-area').map(group => group.querySelector('.map-number').textContent)).toEqual(['3', '2', '1'])
      expect(all('.map-overlay .map-area rect, .map-overlay .map-area circle, .map-overlay .map-area polygon').map(shape => shape.tagName.toLowerCase())).toEqual(['polygon', 'circle', 'rect'])
    })

    it('has nothing selected when it opens, and says there is no area when there is none', async () => {
      await open({ imageMap: { areas: [KITCHEN] } })
      expect(body('.map-properties')).toBe(null)
      wrapper.unmount()
      await open()
      expect(body('.map-empty').textContent).toContain('No area yet')
    })

    it('takes the map kept with the picture each time it opens, and not what was left unfinished', async () => {
      await open({ imageMap: { areas: [KITCHEN] } })
      await click('.map-delete')
      expect(wrapper.vm.areas).toHaveLength(0)
      await wrapper.setProps({ modelValue: false })
      await wrapper.setProps({ modelValue: true })
      await flushPromises()
      expect(wrapper.vm.areas).toHaveLength(1)
    })
  })

  describe('the picture on the stage', () => {
    const canvas = () => body('.map-canvas')

    it('is shown to fill the room the stage has, whatever its size', async () => {
      await open()
      // 2000 x 1000 in a room of 1000 x 500
      expect(canvas().getAttribute('style')).toContain('width: 1000px')
      expect(canvas().getAttribute('style')).toContain('height: 500px')
      expect(canvas().classList.contains('is-fitted')).toBe(true)
      expect(wrapper.vm.fit).toBe(0.5)
      expect(wrapper.vm.shownWidth).toBe(1000)
    })

    it('is shown larger than it is when it is small, up to four times', async () => {
      mount()
      await flushPromises()
      await loaded(200, 100)
      expect(wrapper.vm.fit).toBe(4)
      expect(canvas().getAttribute('style')).toContain('width: 800px')
      expect(canvas().getAttribute('style')).toContain('height: 400px')
    })

    it('keeps its shape in a room of another shape, the side that is short deciding', async () => {
      mount()
      await flushPromises()
      room.width = 300
      room.height = 900
      await loaded(600, 300)
      expect(wrapper.vm.fit).toBe(0.5)
      expect(canvas().getAttribute('style')).toContain('width: 300px')
      expect(canvas().getAttribute('style')).toContain('height: 150px')
    })

    it('is fitted again when the window changes size', async () => {
      await open()
      room.width = 500
      room.height = 500
      window.dispatchEvent(new Event('resize'))
      await flushPromises()
      expect(wrapper.vm.fit).toBe(0.25)
      expect(canvas().getAttribute('style')).toContain('width: 500px')
      expect(canvas().getAttribute('style')).toContain('height: 250px')
    })

    it('is not fitted before the picture is there, or when the stage has no room', async () => {
      mount()
      await flushPromises()
      expect(wrapper.vm.fit).toBe(0)
      expect(canvas().classList.contains('is-fitted')).toBe(false)
      room.width = 0
      await loaded()
      expect(wrapper.vm.fit).toBe(0)
      expect(canvas().getAttribute('style') || '').not.toContain('width')
    })

    it('draws where the pointer is on the picture as it is shown: the same point at any size', async () => {
      await open()
      await click('.map-tool-rect')
      await drag([0.2, 0.2], [0.6, 0.7])
      expect(coords()).toEqual([0.2, 0.2, 0.6, 0.7])
      wrapper.vm.clear()
      room.width = 400
      room.height = 200
      window.dispatchEvent(new Event('resize'))
      await flushPromises()
      await click('.map-tool-rect')
      await drag([0.2, 0.2], [0.6, 0.7])
      expect(coords()).toEqual([0.2, 0.2, 0.6, 0.7])
    })
  })

  describe('the tools', () => {
    it('has Select first, and says which is chosen and what it does', async () => {
      await open()
      expect(all('.map-tool').map(button => button.textContent.trim())).toEqual(['Select', 'Rectangle', 'Circle', 'Polygon'])
      expect(all('.map-tool[aria-pressed=true]').map(button => button.textContent.trim())).toEqual(['Select'])
      expect(body('.map-hint').textContent).toContain('Click an area to select it')
      await click('.map-tool-rect')
      expect(all('.map-tool[aria-pressed=true]').map(button => button.textContent.trim())).toEqual(['Rectangle'])
      expect(body('.map-hint').textContent).toContain('Drag on the picture to draw a rectangle')
      await click('.map-tool-circle')
      expect(body('.map-hint').textContent).toContain('from the centre')
      await click('.map-tool-poly')
      expect(body('.map-hint').textContent).toContain('Click for each corner')
    })

    it('cannot be used before the picture is there', async () => {
      mount()
      await flushPromises()
      expect(all('.map-tool').every(button => button.disabled)).toBe(true)
    })
  })

  describe('drawing', () => {
    it('draws a rectangle by dragging, in whichever direction, and selects it, ready for its title', async () => {
      await open()
      await click('.map-tool-rect')
      await drag([0.6, 0.7], [0.2, 0.1])
      expect(wrapper.vm.areas).toHaveLength(1)
      expect(wrapper.vm.areas[0]).toMatchObject({ shape: 'rect', coords: [0.2, 0.1, 0.6, 0.7], title: '', href: '', target: '_self' })
      expect(wrapper.vm.areas[0].id).toBe('area-1')
      expect(wrapper.vm.selected).toBe(0)
      expect(wrapper.vm.tool).toBe('select')
      expect(document.activeElement.getAttribute('name')).toBe('map-title')
    })

    it('shows the shape while it is drawn, and keeps nothing of a click', async () => {
      await open()
      await click('.map-tool-rect')
      down(0.2, 0.2)
      move(0.5, 0.6)
      await flushPromises()
      expect(body('.map-area.is-draft rect')).not.toBe(null)
      up(0.5, 0.6)
      await flushPromises()
      expect(body('.map-area.is-draft')).toBe(null)
      await click('.map-tool-rect')
      await drag([0.3, 0.3], [0.3, 0.3])
      await drag([0.3, 0.3], [0.305, 0.9])
      expect(wrapper.vm.areas).toHaveLength(1)
    })

    it('draws a circle from its centre, round whatever the shape of the picture', async () => {
      await open()
      await click('.map-tool-circle')
      // 0.1 of the width is 200 px of the picture: the point 0.2 of the height below is as far
      await drag([0.5, 0.5], [0.5, 0.7])
      expect(wrapper.vm.areas[0]).toMatchObject({ shape: 'circle', coords: [0.5, 0.5, 0.1] })
    })

    it('puts a new area on top of the others, and names an id nobody has', async () => {
      await open({ imageMap: { areas: [KITCHEN] } })
      await click('.map-tool-rect')
      await drag([0.5, 0.5], [0.8, 0.8])
      expect(wrapper.vm.areas.map(area => area.id)).toEqual(['area-2', 'kitchen'])
      expect(wrapper.vm.selected).toBe(0)
    })

    it('draws a polygon by clicking each corner and Finish', async () => {
      await open()
      await click('.map-tool-poly')
      for (const [x, y] of [[0.1, 0.1], [0.5, 0.1], [0.3, 0.6]]) {
        down(x, y)
        up(x, y)
      }
      await flushPromises()
      expect(body('.map-finish').disabled).toBe(false)
      expect(body('.map-area.is-draft polyline')).not.toBe(null)
      await click('.map-finish')
      expect(wrapper.vm.areas[0]).toMatchObject({ shape: 'poly', coords: [0.1, 0.1, 0.5, 0.1, 0.3, 0.6] })
      expect(wrapper.vm.points).toEqual([])
      expect(wrapper.vm.selected).toBe(0)
    })

    it('finishes a polygon with a click on its first point, with Enter, or with a double click (which adds the last point twice)', async () => {
      const draw = async (finish) => {
        await open()
        await click('.map-tool-poly')
        for (const [x, y] of [[0.1, 0.1], [0.5, 0.1], [0.3, 0.6]]) {
          down(x, y)
        }
        await finish()
        await flushPromises()
        expect(wrapper.vm.areas[0].coords, 'three points').toEqual([0.1, 0.1, 0.5, 0.1, 0.3, 0.6])
        wrapper.unmount()
      }
      await draw(async () => down(0.1, 0.1))
      await draw(async () => key('Enter'))
      await draw(async () => {
        down(0.3, 0.6)
        fire(overlay(), 'dblclick', at(0.3, 0.6))
      })
    })

    it('has no polygon with fewer than three points, and Backspace takes the last point back', async () => {
      await open()
      await click('.map-tool-poly')
      down(0.1, 0.1)
      down(0.5, 0.1)
      await flushPromises()
      expect(body('.map-finish').disabled).toBe(true)
      await key('Enter')
      expect(wrapper.vm.areas).toHaveLength(0)
      down(0.1, 0.1)
      down(0.5, 0.1)
      down(0.3, 0.6)
      await key('Backspace')
      expect(wrapper.vm.points).toHaveLength(2)
    })

    it('stops what is drawn on Escape or Cancel, without closing the dialog', async () => {
      await open()
      await click('.map-tool-poly')
      down(0.1, 0.1)
      down(0.5, 0.1)
      const event = await key('Escape')
      expect(event.defaultPrevented).toBe(true)
      expect(wrapper.vm.points).toEqual([])
      down(0.1, 0.1)
      await flushPromises()
      await click('.map-cancel-drawing')
      expect(wrapper.vm.points).toEqual([])
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('stops drawing when another tool is chosen', async () => {
      await open()
      await click('.map-tool-poly')
      down(0.1, 0.1)
      await click('.map-tool-rect')
      expect(wrapper.vm.points).toEqual([])
    })

    it('adds an area without a pointer, in the middle of the picture, to be placed with the numbers or the arrow keys', async () => {
      await open()
      body('.map-add').click()
      await flushPromises()
      for (const [shape, expected] of [['rect', [0.35, 0.35, 0.65, 0.65]], ['circle', [0.5, 0.5, 0.1]], ['poly', [0.5, 0.3, 0.7, 0.7, 0.3, 0.7]]]) {
        wrapper.vm.addDefault(shape)
        expect(wrapper.vm.areas[0]).toMatchObject({ shape, coords: expected })
      }
      expect(wrapper.vm.areas).toHaveLength(3)
    })
  })

  describe('selecting, moving and reshaping', () => {
    const three = { imageMap: { areas: [KITCHEN, LAMP, DOOR] } }

    it('selects the area that is clicked, the first one where several overlap, and nothing on the bare picture', async () => {
      await open({ imageMap: { areas: [{ ...LAMP, coords: [0.25, 0.3, 0.05] }, KITCHEN] } })
      down(0.25, 0.3)
      expect(wrapper.vm.selected).toBe(0)
      up(0.25, 0.3)
      down(0.15, 0.4)
      expect(wrapper.vm.selected).toBe(1)
      up(0.15, 0.4)
      down(0.9, 0.1)
      expect(wrapper.vm.selected).toBe(-1)
      expect(body('.map-properties')).toBe(null)
    })

    it('moves an area by dragging it, and keeps it in the picture', async () => {
      await open(three)
      await drag([0.2, 0.3], [0.3, 0.4])
      expect(coords(0)).toEqual([0.2, 0.2, 0.5, 0.6])
      await drag([0.3, 0.4], [3, 3])
      // (0.4 high, so its top stops at 0.6)
      expect(coords(0)).toEqual([0.7, 0.6, 1, 1])
    })

    it('moves from where it was when the drag began, not by what the pointer did on the way', async () => {
      await open(three)
      down(0.2, 0.3)
      move(0.6, 0.6)
      move(0.3, 0.4)
      up(0.3, 0.4)
      await flushPromises()
      expect(coords(0)).toEqual([0.2, 0.2, 0.5, 0.6])
    })

    it('shows the handles of the selected area: the corners of a rectangle, the radius of a circle, the points of a polygon', async () => {
      await open(three)
      await click('.map-pick')
      expect(all('.map-handle[data-handle]').map(handle => handle.getAttribute('data-handle'))).toEqual(['nw', 'ne', 'se', 'sw'])
      wrapper.vm.select(1)
      await flushPromises()
      expect(all('.map-handle[data-handle]').map(handle => handle.getAttribute('data-handle'))).toEqual(['r'])
      wrapper.vm.select(2)
      await flushPromises()
      expect(all('.map-handle[data-handle]').map(handle => handle.getAttribute('data-handle'))).toEqual(['p0', 'p1', 'p2'])
    })

    it('reshapes an area by dragging a handle', async () => {
      await open(three)
      wrapper.vm.select(0)
      await flushPromises()
      const handle = () => body('.map-handle[data-handle=se]')
      down(0.4, 0.5, handle())
      move(0.7, 0.9)
      up(0.7, 0.9)
      await flushPromises()
      expect(coords(0)).toEqual([0.1, 0.1, 0.7, 0.9])
      wrapper.vm.select(1)
      await flushPromises()
      down(0.8, 0.3, body('.map-handle[data-handle=r]'))
      move(0.9, 0.3)
      up(0.9, 0.3)
      await flushPromises()
      expect(coords(1)).toEqual([0.7, 0.3, 0.2])
      wrapper.vm.select(2)
      await flushPromises()
      down(0.75, 0.95, body('.map-handle[data-handle=p2]'))
      move(0.5, 0.8)
      up(0.5, 0.8)
      await flushPromises()
      expect(coords(2)).toEqual([0.6, 0.6, 0.9, 0.6, 0.5, 0.8])
    })

    it('takes a point of a polygon away with a double click on it, but not below three', async () => {
      await open({ imageMap: { areas: [{ ...DOOR, coords: [0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9] }] } })
      wrapper.vm.select(0)
      await flushPromises()
      fire(body('.map-handle[data-handle=p3]'), 'dblclick', at(0.1, 0.9))
      await flushPromises()
      expect(coords(0)).toEqual([0.1, 0.1, 0.9, 0.1, 0.9, 0.9])
      fire(body('.map-handle[data-handle=p2]'), 'dblclick', at(0.9, 0.9))
      await flushPromises()
      expect(coords(0)).toHaveLength(6)
    })

    it('moves the selected area with the arrow keys, ten times as far with Shift', async () => {
      await open(three)
      wrapper.vm.select(0)
      await flushPromises()
      await key('ArrowRight')
      expect(coords(0)[0]).toBeCloseTo(0.105)
      await key('ArrowDown', { shiftKey: true })
      expect(coords(0)[1]).toBeCloseTo(0.15)
      await key('ArrowLeft')
      await key('ArrowUp')
      expect(coords(0)[0]).toBeCloseTo(0.1)
    })

    it('removes the selected area with Delete, and lets go of it with Escape', async () => {
      await open(three)
      wrapper.vm.select(1)
      await flushPromises()
      await key('Escape')
      expect(wrapper.vm.selected).toBe(-1)
      expect(wrapper.vm.areas).toHaveLength(3)
      wrapper.vm.select(1)
      await key('Delete')
      expect(wrapper.vm.areas.map(area => area.id)).toEqual(['kitchen', 'door'])
      expect(wrapper.vm.selected).toBe(-1)
    })

    it('can be reached from the keyboard: the picture takes the focus, and says what it is', async () => {
      await open()
      expect(overlay().getAttribute('tabindex')).toBe('0')
      expect(overlay().getAttribute('aria-label')).toContain('Arrow keys move the selected area')
    })
  })

  describe('the list of areas', () => {
    const three = { imageMap: { areas: [KITCHEN, LAMP, DOOR] } }

    it('selects an area, and says which it is', async () => {
      await open(three)
      all('.map-pick')[1].click()
      await flushPromises()
      expect(wrapper.vm.selected).toBe(1)
      expect(all('.map-pick')[1].getAttribute('aria-current')).toBe('true')
      expect(all('.map-row.is-selected')).toHaveLength(1)
    })

    it('puts an area above or below the others, the selection following it', async () => {
      await open(three)
      wrapper.vm.select(1)
      await flushPromises()
      all('.map-up')[1].click()
      await flushPromises()
      expect(wrapper.vm.areas.map(area => area.id)).toEqual(['lamp', 'kitchen', 'door'])
      expect(wrapper.vm.selected).toBe(0)
      all('.map-down')[0].click()
      await flushPromises()
      expect(wrapper.vm.areas.map(area => area.id)).toEqual(['kitchen', 'lamp', 'door'])
      expect(wrapper.vm.selected).toBe(1)
      // another area that was selected moves too, when the one beside it is moved over it
      all('.map-up')[2].click()
      await flushPromises()
      expect(wrapper.vm.selected).toBe(2)
    })

    it('cannot move the first one up or the last one down', async () => {
      await open(three)
      expect(all('.map-up')[0].disabled).toBe(true)
      expect(all('.map-down')[2].disabled).toBe(true)
      wrapper.vm.move(0, -1)
      wrapper.vm.move(2, 1)
      expect(wrapper.vm.areas.map(area => area.id)).toEqual(['kitchen', 'lamp', 'door'])
    })

    it('deletes an area, and keeps the selection on the same one', async () => {
      await open(three)
      wrapper.vm.select(2)
      all('.map-delete')[0].click()
      await flushPromises()
      expect(wrapper.vm.areas.map(area => area.id)).toEqual(['lamp', 'door'])
      expect(wrapper.vm.selected).toBe(1)
      all('.map-delete')[1].click()
      await flushPromises()
      expect(wrapper.vm.selected).toBe(-1)
    })

    it('removes all the areas', async () => {
      await open(three)
      await click('.map-clear')
      expect(wrapper.vm.areas).toEqual([])
      expect(body('.map-clear')).toBe(null)
    })

    it('names its buttons', async () => {
      await open(three)
      expect([body('.map-up'), body('.map-down'), body('.map-delete')].map(button => button.getAttribute('aria-label'))).toEqual(['Move up (above the others)', 'Move down', 'Delete the area'])
    })
  })

  describe('the properties of an area', () => {
    it('are its title, its address and where it opens', async () => {
      await open({ imageMap: { areas: [KITCHEN] } })
      await click('.map-pick')
      expect(body('input[name=map-title]').value).toBe('Kitchen')
      expect(body('input[name=map-href]').value).toBe('/kitchen')
      await type('input[name=map-title]', 'Big kitchen')
      await type('input[name=map-href]', 'https://example.com/k')
      wrapper.vm.current.target = '_blank'
      expect(wrapper.vm.areas[0]).toMatchObject({ title: 'Big kitchen', href: 'https://example.com/k', target: '_blank' })
      expect(rows()[0]).toContain('Big kitchen')
      expect(body('.map-heading-row + .map-list, .map-list').textContent).toContain('https://example.com/k')
    })

    it('shows an area with no title as untitled', async () => {
      await open({ imageMap: { areas: [{ ...KITCHEN, title: '' }] } })
      expect(rows()[0]).toContain('Untitled')
    })

    it('refuses a link that could run a script: it is shown in red, and the map cannot be applied', async () => {
      await open({ imageMap: { areas: [KITCHEN, LAMP] } })
      await click('.map-pick')
      await type('input[name=map-href]', 'javascript:alert(1)')
      expect(body('.map-properties [role=alert]').textContent).toContain('Start with https://')
      expect(body('.map-row.has-problem')).not.toBe(null)
      expect(body('.map-apply').disabled).toBe(true)
      expect(body('.map-foot [role=alert]').textContent).toContain('Fix the links in red')
      body('.map-apply').click()
      await flushPromises()
      expect(wrapper.emitted('apply')).toBeUndefined()
      await type('input[name=map-href]', '/kitchen')
      expect(body('.map-apply').disabled).toBe(false)
      expect(body('.map-row.has-problem')).toBe(null)
    })

    it('takes the position of a rectangle in percent, keeping it inside the picture', async () => {
      await open({ imageMap: { areas: [KITCHEN] } })
      await click('.map-pick')
      const field = (key) => body(`.map-position-${key} input`)
      expect(['left', 'top', 'width', 'height'].map(key => field(key).value)).toEqual(['10', '10', '30', '40'])
      const set = async (key, value) => {
        field(key).value = value
        field(key).dispatchEvent(new Event('change', { bubbles: true }))
        await flushPromises()
      }
      await set('left', '50')
      expect(coords()).toEqual([0.5, 0.1, 0.8, 0.5])
      await set('left', '95')
      expect(coords()[0]).toBeCloseTo(0.7)
      expect(coords()[2]).toBeCloseTo(1)
      await set('width', '80')
      expect(coords()[2]).toBeCloseTo(1)
      await set('top', '20')
      await set('height', '10')
      expect(coords()[1]).toBeCloseTo(0.2)
      expect(coords()[3]).toBeCloseTo(0.3)
    })

    it('takes the position of a circle, and ignores what is not a number', async () => {
      await open({ imageMap: { areas: [LAMP] } })
      await click('.map-pick')
      expect(['x', 'y', 'radius'].map(key => body(`.map-position-${key} input`).value)).toEqual(['70', '30', '10'])
      for (const [key, value] of [['x', '40'], ['y', '60'], ['radius', '25'], ['x', ''], ['y', 'abc']]) {
        const input = body(`.map-position-${key} input`)
        input.value = value
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
      await flushPromises()
      expect(coords()).toEqual([0.4, 0.6, 0.25])
    })

    it('says how many points a polygon has, and has no numbers for them', async () => {
      await open({ imageMap: { areas: [DOOR] } })
      await click('.map-pick')
      expect(body('.map-grid')).toBe(null)
      expect(body('.map-properties .map-hint').textContent).toContain('3 points')
    })

    it('has real labels on its fields, ids and names, whatever the kind of link (what the browser checks in DevTools Issues)', async () => {
      await open({ imageMap: { areas: [KITCHEN] }, schema: { input: 'imagemap', references: REFERENCES, openIn: true, links: ['url', 'record', 'value'] } })
      await click('.map-pick')
      for (const kind of ['url', 'record', 'value']) {
        await click(`.map-kind-${kind}`)
        const inputs = all('.map-field input:not([type=hidden])')
        expect(inputs.length, kind).toBeGreaterThanOrEqual(4)
        for (const input of inputs) {
          expect(input.id, 'an id').toBeTruthy()
          expect(input.getAttribute('name') || input.getAttribute('role'), `${input.id} has a name`).toBeTruthy()
          const label = body(`label[for="${input.id}"]`)
          expect(label, `${input.id} has a label for it`).not.toBe(null)
          expect(body(`#${input.getAttribute('aria-labelledby')}`), `${input.id} labelled by something that exists`).toBe(label)
        }
      }
      expect(all('.v-field-label')).toEqual([])
    })
  })

  describe('a link to a record', () => {
    const referencing = (extra = {}) => ({ schema: { input: 'imagemap', locale: 'enUS', references: REFERENCES }, ...extra })

    it('is offered when the field lists resources, and not otherwise', async () => {
      await open({ imageMap: { areas: [KITCHEN] } })
      await click('.map-pick')
      expect(body('.map-link-kind')).toBe(null)
      wrapper.unmount()
      await open({ imageMap: { areas: [KITCHEN] }, ...referencing() })
      await click('.map-pick')
      expect(all('.map-link-kind .v-btn').map(button => button.textContent.trim())).toEqual(['Address', 'Record'])
      expect(body('.map-kind-url').getAttribute('aria-pressed')).toBe('true')
    })

    it('switches the link between an address and a record, one at a time', async () => {
      await open({ imageMap: { areas: [KITCHEN] }, ...referencing() })
      await click('.map-pick')
      await click('.map-kind-record')
      expect(wrapper.vm.areas[0].href).toBe('')
      expect(wrapper.vm.areas[0].ref).toEqual({ resource: 'pages', id: '' })
      expect(body('input[name=map-href]')).toBe(null)
      expect(body('.map-kind-record').getAttribute('aria-pressed')).toBe('true')
      await click('.map-kind-url')
      expect(wrapper.vm.areas[0]).not.toHaveProperty('ref')
      expect(body('input[name=map-href]')).not.toBe(null)
    })

    it('lists the records of the resource by their name, in the language of the person, in order', async () => {
      await open({ imageMap: { areas: [{ ...KITCHEN, href: '' }] }, ...referencing() })
      await click('.map-pick')
      await click('.map-kind-record')
      await flushPromises()
      expect(wrapper.vm.recordItems).toEqual([{ value: 'p2', title: 'About' }, { value: 'p3', title: 'Contact' }, { value: 'p1', title: 'Pricing' }])
      expect(ResourceService.get).toHaveBeenCalledWith('pages')
    })

    it('loads the records of a resource the admin has not cached, once', async () => {
      ResourceService.get.mockReturnValue(undefined)
      await open({ imageMap: { areas: [KITCHEN] }, ...referencing() })
      await click('.map-pick')
      await click('.map-kind-record')
      await flushPromises()
      expect(ResourceService.cache).toHaveBeenCalledTimes(1)
      expect(wrapper.vm.recordItems).toHaveLength(3)
      await click('.map-kind-url')
      await click('.map-kind-record')
      expect(ResourceService.cache).toHaveBeenCalledTimes(1)
    })

    it('has no records, and says so in the console, when they cannot be loaded', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      ResourceService.get.mockReturnValue(undefined)
      ResourceService.cache.mockRejectedValue(new Error('down'))
      await open({ imageMap: { areas: [KITCHEN] }, ...referencing() })
      await click('.map-pick')
      await click('.map-kind-record')
      await flushPromises()
      expect(wrapper.vm.recordItems).toEqual([])
      expect(error).toHaveBeenCalled()
    })

    it('shows the record an area points to by its name in the list, and by its id before the records are there', async () => {
      ResourceService.get.mockReturnValue(undefined)
      let resolve
      ResourceService.cache.mockReturnValue(new Promise((done) => { resolve = done }))
      await open({ imageMap: { areas: [DOOR] }, ...referencing() })
      expect(rows()[0]).toContain('pages: p2')
      resolve(PAGES)
      await flushPromises()
      expect(rows()[0]).toContain('About')
      expect(rows()[0]).not.toContain('p2')
    })

    it('shows a record that is gone, by its id, so that the link is not lost unseen', async () => {
      await open({ imageMap: { areas: [{ ...DOOR, ref: { resource: 'pages', id: 'gone' } }] }, ...referencing() })
      await click('.map-pick')
      await flushPromises()
      expect(wrapper.vm.recordItems[0]).toEqual({ value: 'gone', title: 'gone (not found)' })
    })

    it('chooses the resource when the field lists several, and asks for the record again', async () => {
      const posts = [{ _id: 'b1', name: 'First post' }]
      ResourceService.get.mockImplementation(resource => resource === 'posts' ? posts : PAGES)
      ResourceService.cache.mockImplementation(async resource => resource === 'posts' ? posts : PAGES)
      await open({ imageMap: { areas: [DOOR] }, schema: { input: 'imagemap', locale: 'enUS', references: [{ resource: 'pages', label: '{{title}}' }, { resource: 'posts', label: '{{name}}' }] } })
      await click('.map-pick')
      expect(body('.map-resource-field')).not.toBe(null)
      wrapper.vm.setReferenceResource('posts')
      await flushPromises()
      expect(wrapper.vm.areas[0].ref).toEqual({ resource: 'posts', id: '' })
      expect(wrapper.vm.recordItems).toEqual([{ value: 'b1', title: 'First post' }])
    })

    it('has no choice of resource when the field lists one', async () => {
      await open({ imageMap: { areas: [DOOR] }, ...referencing() })
      await click('.map-pick')
      expect(body('.map-resource-field')).toBe(null)
    })

    it('is kept by its resource and its id, and an empty choice is no link', async () => {
      await open({ imageMap: { areas: [DOOR] }, ...referencing() })
      body('.map-apply').click()
      await flushPromises()
      expect(wrapper.emitted('apply')[0][0].areas[0].ref).toEqual({ resource: 'pages', id: 'p2' })
      wrapper.vm.areas[0].ref.id = ''
      body('.map-apply').click()
      await flushPromises()
      expect(wrapper.emitted('apply')[1][0].areas[0]).not.toHaveProperty('ref')
    })
  })

  describe('applying', () => {
    it('gives back the areas as they are kept, flagged as new, and closes', async () => {
      await open({ imageMap: { areas: [KITCHEN, LAMP] } })
      wrapper.vm.select(0)
      await flushPromises()
      await type('input[name=map-title]', '  Kitchen two  ')
      body('.map-apply').click()
      await flushPromises()
      const [map] = wrapper.emitted('apply')[0]
      expect(map.updated).toBe(true)
      expect(map.areas.map(area => [area.id, area.shape, area.title])).toEqual([['kitchen', 'rect', 'Kitchen two'], ['lamp', 'circle', 'Lamp']])
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })

    it('gives back an empty map when every area was taken away', async () => {
      await open({ imageMap: { areas: [KITCHEN] } })
      await click('.map-clear')
      body('.map-apply').click()
      await flushPromises()
      expect(wrapper.emitted('apply')[0][0]).toEqual({ areas: [], updated: true })
    })

    it('closes with Cancel, keeping nothing', async () => {
      await open({ imageMap: { areas: [KITCHEN] } })
      await click('.map-clear')
      await click('.map-cancel')
      expect(wrapper.emitted('apply')).toBeUndefined()
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })
  })
})

// What an area links to: an address (with a title, and where it opens), a record of one resource or of several (named by the record, and where
// it opens only when the field asks), or a value the person types (nothing else). The field says which, and changes the words.
describe('ImageMapDialog: the kinds of link', () => {
  const schema = (extra = {}) => ({ schema: { input: 'imagemap', locale: 'enUS', ...extra } })
  // (the fields of the link, not the numbers of the position)
  const names = () => all('.map-properties .map-field:not([class*=map-position]) input:not([type=hidden])').map(input => input.getAttribute('name') || input.getAttribute('role'))
  const buttons = () => all('.map-link-kind .v-btn').map(button => button.textContent.trim())

  describe('which are offered', () => {
    it('is an address alone when the field has no resource, and there is nothing to choose', async () => {
      await open({ imageMap: { areas: [KITCHEN] }, ...schema() })
      await click('.map-pick')
      expect(body('.map-link-kind')).toBe(null)
      expect(names()).toEqual(['map-title', 'map-href', 'combobox'])
    })

    it('is an address and a record when the field has resources', async () => {
      await open({ imageMap: { areas: [KITCHEN] }, ...schema({ references: REFERENCES }) })
      await click('.map-pick')
      expect(buttons()).toEqual(['Address', 'Record'])
    })

    it('is the kinds the field lists, in the usual order', async () => {
      await open({ imageMap: { areas: [KITCHEN] }, ...schema({ references: REFERENCES, links: ['value', 'record', 'url'] }) })
      await click('.map-pick')
      expect(buttons()).toEqual(['Address', 'Record', 'Value'])
    })

    it('has nothing to choose when it lists one, and the area starts as that kind', async () => {
      await open(schema({ references: REFERENCES, links: 'record' }))
      wrapper.vm.addDefault('rect')
      await flushPromises()
      expect(body('.map-link-kind')).toBe(null)
      expect(wrapper.vm.areas[0]._kind).toBe('record')
      expect(wrapper.vm.areas[0].ref).toEqual({ resource: 'pages', id: '' })
      expect(body('.map-record-field')).not.toBe(null)
      expect(body('input[name=map-title]')).toBe(null)
      expect(body('input[name=map-href]')).toBe(null)
    })

    it('starts as a value when the field has only values', async () => {
      await open(schema({ links: 'value' }))
      wrapper.vm.addDefault('circle')
      await flushPromises()
      expect(wrapper.vm.areas[0]._kind).toBe('value')
      expect(body('.map-value-field')).not.toBe(null)
    })

    it('offers an address when records are wanted and there is no resource to take them from', async () => {
      await open({ imageMap: { areas: [KITCHEN] }, ...schema({ links: 'record' }) })
      await click('.map-pick')
      expect(body('input[name=map-href]')).not.toBe(null)
    })

    it('shows an area by what it has, whatever the field offers now', async () => {
      await open({ imageMap: { areas: [KITCHEN] }, ...schema({ references: REFERENCES, links: 'record' }) })
      await click('.map-pick')
      expect(wrapper.vm.areas[0]._kind).toBe('url')
      expect(body('input[name=map-href]').value).toBe('/kitchen')
    })
  })

  describe('an address', () => {
    it('has a title, an address and where it opens', async () => {
      await open({ imageMap: { areas: [KITCHEN] }, ...schema({ links: ['url', 'value'] }) })
      await click('.map-pick')
      expect(names()).toEqual(['map-title', 'map-href', 'combobox'])
      expect(body('.map-target-field')).not.toBe(null)
    })
  })

  describe('a record', () => {
    const area = { ...DOOR, title: '' }

    it('has no title, and no choice of where it opens, unless the field asks', async () => {
      await open({ imageMap: { areas: [area] }, ...schema({ references: REFERENCES }) })
      await click('.map-pick')
      expect(body('input[name=map-title]')).toBe(null)
      expect(body('.map-target-field')).toBe(null)
      expect(body('.map-record-field')).not.toBe(null)
    })

    it('says where it opens when the field asks', async () => {
      await open({ imageMap: { areas: [area] }, ...schema({ references: REFERENCES, openIn: true }) })
      await click('.map-pick')
      expect(body('.map-target-field')).not.toBe(null)
      expect(body('input[name=map-title]')).toBe(null)
      wrapper.vm.current.target = '_blank'
      body('.map-apply').click()
      await flushPromises()
      expect(wrapper.emitted('apply')[0][0].areas[0].target).toBe('_blank')
    })

    it('opens in the same tab when the field does not ask, whatever the area had', async () => {
      await open({ imageMap: { areas: [{ ...area, target: '_blank' }] }, ...schema({ references: REFERENCES }) })
      body('.map-apply').click()
      await flushPromises()
      expect(wrapper.emitted('apply')[0][0].areas[0].target).toBe('_self')
    })

    it('can be of one resource or of several, each by the title the field gives it', async () => {
      const posts = [{ _id: 'b1', name: 'First post' }]
      ResourceService.get.mockImplementation(resource => resource === 'posts' ? posts : PAGES)
      ResourceService.cache.mockImplementation(async resource => resource === 'posts' ? posts : PAGES)
      await open({ imageMap: { areas: [area] }, ...schema({ references: [{ resource: 'pages', label: '{{title}}', title: 'Page' }, { resource: 'posts', label: '{{name}}', title: 'Blog post' }] }) })
      await click('.map-pick')
      expect(wrapper.vm.resourceItems).toEqual([{ value: 'pages', title: 'Page' }, { value: 'posts', title: 'Blog post' }])
      expect(body('.map-resource-field')).not.toBe(null)
      expect(body('.map-record-field label').textContent).toBe('Page')
      wrapper.vm.setReferenceResource('posts')
      await flushPromises()
      expect(body('.map-record-field label').textContent).toBe('Blog post')
      expect(wrapper.vm.recordItems).toEqual([{ value: 'b1', title: 'First post' }])
    })

    it('is called what the field says: the title of its resource on the picker and on the button', async () => {
      await open({ imageMap: { areas: [KITCHEN] }, ...schema({ references: [{ resource: 'pages', label: '{{title}}', title: 'Product page' }] }) })
      await click('.map-pick')
      expect(buttons()).toEqual(['Address', 'Product page'])
      await click('.map-kind-record')
      expect(body('.map-record-field label').textContent).toBe('Product page')
    })

    it('has no record to pick when the resource has none, and says which resource', async () => {
      ResourceService.get.mockReturnValue([])
      ResourceService.cache.mockResolvedValue([])
      await open({ imageMap: { areas: [{ ...area, ref: { resource: 'pages', id: '' } }] }, ...schema({ references: [{ resource: 'pages', title: 'Page' }] }) })
      await click('.map-pick')
      expect(wrapper.vm.recordItems).toEqual([])
      expect(wrapper.vm.recordFieldLabel).toBe('Page')
    })

    it('is named in the list by the record', async () => {
      await open({ imageMap: { areas: [area] }, ...schema({ references: REFERENCES }) })
      expect(rows()[0]).toBe('1About')
    })

    it('is kept with its record and nothing of an address or a value', async () => {
      await open({ imageMap: { areas: [{ ...area, href: '/old', value: 'x' }] }, ...schema({ references: REFERENCES }) })
      body('.map-apply').click()
      await flushPromises()
      const kept = wrapper.emitted('apply')[0][0].areas[0]
      expect(kept.ref).toEqual({ resource: 'pages', id: 'p2' })
      expect(kept).not.toHaveProperty('href')
      expect(kept).not.toHaveProperty('value')
      expect(kept).not.toHaveProperty('_kind')
    })
  })

  describe('a value', () => {
    const area = { id: 'room', shape: 'rect', coords: [0.1, 0.1, 0.4, 0.5], value: 'room-12' }

    it('is a text the person types: no title, no choice of where it opens, nothing to check', async () => {
      await open({ imageMap: { areas: [area] }, ...schema({ links: 'value' }) })
      await click('.map-pick')
      expect(names()).toEqual(['map-value'])
      expect(body('.map-target-field')).toBe(null)
      await type('input[name=map-value]', '  javascript:whatever  ')
      expect(body('.map-apply').disabled).toBe(false)
      expect(body('.map-row.has-problem')).toBe(null)
      body('.map-apply').click()
      await flushPromises()
      expect(wrapper.emitted('apply')[0][0].areas[0].value).toBe('javascript:whatever')
    })

    it('is named in the list by the value', async () => {
      await open({ imageMap: { areas: [area, { ...area, id: 'empty', value: '' }] }, ...schema({ links: 'value' }) })
      expect(rows()).toEqual(['1room-12', '2Untitled'])
    })

    it('never says where it opens, even when the field asks for records', async () => {
      await open({ imageMap: { areas: [{ ...area, target: '_blank' }] }, ...schema({ references: REFERENCES, links: ['record', 'value'], openIn: true }) })
      await click('.map-pick')
      expect(body('.map-target-field')).toBe(null)
      body('.map-apply').click()
      await flushPromises()
      expect(wrapper.emitted('apply')[0][0].areas[0].target).toBe('_self')
    })

    it('is kept with nothing of an address or a record', async () => {
      await open({ imageMap: { areas: [{ ...area, href: '/old', title: 'T' }] }, ...schema({ links: ['url', 'value'] }) })
      await click('.map-pick')
      await click('.map-kind-value')
      body('.map-apply').click()
      await flushPromises()
      const kept = wrapper.emitted('apply')[0][0].areas[0]
      expect(kept.value).toBe('room-12')
      expect(kept).not.toHaveProperty('href')
      expect(kept).not.toHaveProperty('ref')
    })
  })

  describe('changing the kind of an area', () => {
    const all3 = { references: REFERENCES, links: ['url', 'record', 'value'], openIn: true }

    it('lets go of what it linked to before: one kind at a time', async () => {
      await open({ imageMap: { areas: [{ ...KITCHEN, value: 'old' }] }, ...schema(all3) })
      await click('.map-pick')
      await click('.map-kind-record')
      expect(wrapper.vm.areas[0]).toMatchObject({ _kind: 'record', href: '', value: '', ref: { resource: 'pages', id: '' } })
      await click('.map-kind-value')
      expect(wrapper.vm.areas[0]).toMatchObject({ _kind: 'value', href: '', value: '' })
      expect(wrapper.vm.areas[0]).not.toHaveProperty('ref')
      await type('input[name=map-value]', 'abc')
      await click('.map-kind-url')
      expect(wrapper.vm.areas[0]).toMatchObject({ _kind: 'url', value: '' })
      expect(body('input[name=map-href]')).not.toBe(null)
    })

    it('says which kind it has, on the button', async () => {
      await open({ imageMap: { areas: [KITCHEN] }, ...schema(all3) })
      await click('.map-pick')
      expect(all('.map-link-kind .v-btn[aria-pressed=true]').map(button => button.textContent.trim())).toEqual(['Address'])
      await click('.map-kind-value')
      expect(all('.map-link-kind .v-btn[aria-pressed=true]').map(button => button.textContent.trim())).toEqual(['Value'])
    })

    it('refuses an address only while the area is an address', async () => {
      await open({ imageMap: { areas: [{ ...KITCHEN, href: 'javascript:1' }] }, ...schema(all3) })
      expect(body('.map-apply').disabled).toBe(true)
      await click('.map-pick')
      await click('.map-kind-value')
      expect(body('.map-apply').disabled).toBe(false)
    })
  })

  describe('the words the field changes', () => {
    it('takes the word of each kind from labels, on the buttons and on the fields', async () => {
      await open({
        imageMap: { areas: [{ id: 'a', shape: 'rect', coords: [0.1, 0.1, 0.4, 0.5], value: 'x' }] },
        ...schema({ references: REFERENCES, links: ['url', 'record', 'value'], labels: { url: 'Web page', record: 'Product', value: 'Room number' } })
      })
      await click('.map-pick')
      expect(buttons()).toEqual(['Web page', 'Product', 'Room number'])
      expect(body('.map-value-field label').textContent).toBe('Room number')
      await click('.map-kind-record')
      expect(body('.map-record-field label').textContent).toBe('Product')
    })

    it('takes a word per language', async () => {
      await open({ imageMap: { areas: [KITCHEN] }, ...schema({ references: REFERENCES, links: ['url', 'value'], labels: { value: { enUS: 'Code', zhCN: '代码' } } }) })
      await click('.map-pick')
      expect(buttons()).toEqual(['Address', 'Code'])
    })

    it('puts the title of the resource before the word of labels on the picker', async () => {
      await open({ imageMap: { areas: [{ ...DOOR, title: '' }] }, ...schema({ references: [{ resource: 'pages', label: '{{title}}', title: 'Page' }], labels: { record: 'Target' } }) })
      await click('.map-pick')
      expect(body('.map-record-field label').textContent).toBe('Page')
    })
  })

  describe('the records of a resource', () => {
    const area = { ...DOOR, title: '' }

    it('are asked for again each time the tool opens, since what the admin kept can be old or empty', async () => {
      ResourceService.get.mockReturnValue([])
      ResourceService.cache.mockResolvedValue(PAGES)
      await open({ imageMap: { areas: [area] }, ...schema({ references: REFERENCES }) })
      await click('.map-pick')
      expect(ResourceService.cache).toHaveBeenCalledTimes(1)
      expect(wrapper.vm.recordItems).toHaveLength(3)
      await wrapper.setProps({ modelValue: false })
      await wrapper.setProps({ modelValue: true })
      await flushPromises()
      expect(ResourceService.cache).toHaveBeenCalledTimes(2)
    })

    it('are there at once from what the admin kept, and replaced by the answer', async () => {
      let resolve
      ResourceService.get.mockReturnValue([PAGES[0]])
      ResourceService.cache.mockReturnValue(new Promise((done) => { resolve = done }))
      await open({ imageMap: { areas: [area] }, ...schema({ references: REFERENCES }) })
      await click('.map-pick')
      expect(wrapper.vm.recordItems.map(item => item.title)).toContain('Pricing')
      expect(wrapper.vm.loadingRecords).toBe(true)
      resolve(PAGES)
      await flushPromises()
      expect(wrapper.vm.recordItems.map(item => item.title)).toEqual(['About', 'Contact', 'Pricing'])
      expect(wrapper.vm.loadingRecords).toBe(false)
    })

    it('stay as the admin kept them when they cannot be asked for', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      ResourceService.get.mockReturnValue(PAGES)
      ResourceService.cache.mockRejectedValue(new Error('down'))
      await open({ imageMap: { areas: [area] }, ...schema({ references: REFERENCES }) })
      await click('.map-pick')
      expect(wrapper.vm.recordItems).toHaveLength(3)
    })
  })
})
