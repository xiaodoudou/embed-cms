import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { CircleStencil, RectangleStencil } from 'vue-advanced-cropper'
import CropDialog from '@c/attachments/CropDialog.vue'
import { renderPreview } from '@u/cropPreview'
import { mountComponent } from './helpers/mountField.js'

// The crop tool in its modal. The cropper is a library of its own (it needs a real canvas and layout): a stand-in with the same props, events and
// methods keeps these tests on what the tool does around it. How a crop becomes a recipe is in cropRecipe.test.js, and the server cuts by it
// (test/unit/cropRecipe.test.js); the cropper and the server were also compared pixel by pixel in the real admin.

vi.mock('@u/cropPreview', () => ({ renderPreview: vi.fn(async () => 'data:image/jpeg;base64,PREVIEW') }))

// what the stand-in answers to getResult, and the calls its methods get
const api = { rotate: vi.fn(), flip: vi.fn(), zoom: vi.fn(), reset: vi.fn(), setCoordinates: vi.fn(), result: null }
const CropperStub = defineComponent({
  // the name the dialog registers it by
  // eslint-disable-next-line vue/multi-word-component-names
  name: 'Cropper',
  // eslint-disable-next-line vue/require-default-prop
  props: { src: String, stencilComponent: Object, stencilProps: Object, defaultSize: Object, defaultPosition: Object, defaultTransforms: Object, debounce: [Boolean, Number], transitions: Boolean, imageRestriction: String, defaultBoundaries: String },
  emits: ['change', 'ready', 'error'],
  methods: {
    rotate: (...args) => api.rotate(...args),
    flip: (...args) => api.flip(...args),
    zoom: (...args) => api.zoom(...args),
    reset: (...args) => api.reset(...args),
    setCoordinates: (...args) => api.setCoordinates(...args),
    getResult: () => api.result
  },
  render () {
    return h('div', { class: 'cropper-stub' })
  }
})

const PICTURE = { width: 800, height: 500 }
const result = (coordinates = { left: 10, top: 20, width: 300, height: 200 }, transforms = { rotate: 0, flip: { horizontal: false, vertical: false } }) => ({
  coordinates, image: { ...PICTURE, transforms }
})

let wrapper
const mount = (props = {}) => {
  wrapper = mountComponent(CropDialog, {
    props: { modelValue: true, title: 'Cover', src: '/api/products/1/attachments/a1', schema: { input: 'cropimage' }, ...props },
    attachTo: document.body,
    global: { stubs: { Cropper: CropperStub }, components: { Cropper: CropperStub } }
  })
  return wrapper
}
const body = (selector) => document.body.querySelector(selector)
const all = (selector) => [...document.body.querySelectorAll(selector)]
const cropper = () => wrapper.findComponent(CropperStub)
// what the cropper says when the picture is loaded and the frame is placed
const placed = async (coordinates, transforms) => {
  const state = result(coordinates, transforms)
  api.result = state
  cropper().vm.$emit('change', state)
  cropper().vm.$emit('ready')
  await flushPromises()
}
const click = async (selector) => {
  body(selector).click()
  await flushPromises()
}
const chips = () => all('.crop-ratio').map(chip => chip.textContent.trim())
const pressed = () => all('.crop-ratio[aria-pressed=true]').map(chip => chip.textContent.trim())

beforeEach(() => {
  Object.values(api).forEach(fn => fn && fn.mockReset && fn.mockReset())
  api.result = result()
})

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  vi.mocked(renderPreview).mockClear()
})

describe('CropDialog (the crop tool)', () => {
  describe('opening', () => {
    it('is a dialog named by its title', async () => {
      mount()
      await flushPromises()
      const dialog = body('[role=dialog]')
      expect(body(`#${dialog.getAttribute('aria-labelledby')}`).textContent).toBe('Cover')
    })

    it('has no cropper while it is closed, and one with the picture when it opens', async () => {
      mount({ modelValue: false })
      await flushPromises()
      expect(wrapper.findComponent(CropperStub).exists()).toBe(false)
      await wrapper.setProps({ modelValue: true })
      await flushPromises()
      expect(cropper().props('src')).toBe('/api/products/1/attachments/a1')
    })

    it('says when the picture cannot be loaded', async () => {
      mount()
      await flushPromises()
      expect(body('.crop-error')).toBe(null)
      cropper().vm.$emit('error')
      await flushPromises()
      expect(body('.crop-stage .crop-error').textContent).toContain('Error loading image')
    })

    it('cannot be applied before the picture is there', async () => {
      mount()
      await flushPromises()
      expect(body('.crop-apply').disabled).toBe(true)
      expect(body('.crop-reset').disabled).toBe(true)
      await placed()
      expect(body('.crop-apply').disabled).toBe(false)
    })

    it('starts from the cropper\'s own frame when nothing is kept, and from the kept crop and its turn otherwise', async () => {
      mount()
      await flushPromises()
      expect(cropper().props('defaultSize')).toBeUndefined()
      expect(cropper().props('defaultPosition')).toBeUndefined()
      expect(cropper().props('defaultTransforms')).toEqual({ rotate: 0, flip: { horizontal: false, vertical: false } })
      wrapper.unmount()
      mount({ cropOptions: { left: 12, top: 34, width: 56, height: 78, rotate: 90, flipX: true } })
      await flushPromises()
      expect(cropper().props('defaultSize')).toEqual({ width: 56, height: 78 })
      expect(cropper().props('defaultPosition')).toEqual({ left: 12, top: 34 })
      expect(cropper().props('defaultTransforms')).toEqual({ rotate: 90, flip: { horizontal: true, vertical: false } })
    })

    it('takes the state from the crop kept with the picture each time it opens', async () => {
      mount({ modelValue: false })
      await flushPromises()
      await wrapper.setProps({ cropOptions: { left: 1, top: 2, width: 3, height: 4, shape: 'circle', ratio: '4:3', output: { format: 'webp', quality: 60, maxWidth: 300 } } })
      await wrapper.setProps({ modelValue: true })
      await flushPromises()
      expect(pressed()).toEqual(['4:3'])
      expect(wrapper.vm.shape).toBe('circle')
      expect([wrapper.vm.format, wrapper.vm.quality, wrapper.vm.maxWidth]).toEqual(['webp', 60, 300])
    })
  })

  describe('the form fields (what the browser checks in DevTools Issues)', () => {
    // (the select also has a hidden input that carries its value, with a name and nothing to label)
    const controls = () => all('.crop-field input:not([type=hidden])')

    it('gives every field a real label that points at it, with the id Vuetify points the input back to, and a name', async () => {
      mount()
      await flushPromises()
      await click('.crop-custom')
      expect(controls().length).toBeGreaterThanOrEqual(8)
      for (const input of controls()) {
        expect(input.id, 'an id').toBeTruthy()
        expect(input.getAttribute('name') || input.getAttribute('role'), `${input.id} has a name`).toBeTruthy()
        const label = body(`label[for="${input.id}"]`)
        expect(label, `${input.id} has a label for it`).not.toBe(null)
        expect(label.textContent.trim()).not.toBe('')
        // Vuetify names the input by `<id>-label`: it has to exist
        expect(body(`#${input.getAttribute('aria-labelledby')}`), `${input.id} labelled by something that exists`).toBe(label)
      }
    })

    it('has no label of Vuetify\'s own, which no input is for', async () => {
      mount()
      await flushPromises()
      expect(all('.v-field-label')).toEqual([])
    })

    it('gives the ids of two dialogs apart', async () => {
      mount()
      await flushPromises()
      const first = controls().map(input => input.id)
      wrapper.unmount()
      mount()
      await flushPromises()
      expect(controls().map(input => input.id).some(id => first.includes(id))).toBe(false)
    })
  })

  describe('the shape', () => {
    it('offers the usual shapes and a custom one, free first', async () => {
      mount()
      await flushPromises()
      expect(chips()).toEqual(['Free', 'Original', '1:1', '4:3', '3:2', '16:9', '3:4', '2:3', '9:16', 'Custom'])
      expect(pressed()).toEqual(['Free'])
      expect(cropper().props('stencilProps')).toEqual({})
    })

    it('offers the shapes of the field instead', async () => {
      mount({ schema: { input: 'cropimage', aspectRatios: ['free', { ratio: '4:5', label: 'Portrait 4:5' }, '1.91:1'] } })
      await flushPromises()
      expect(chips()).toEqual(['Free', 'Portrait 4:5', '1.91:1', 'Custom'])
    })

    it('starts on the first shape of the field when it has no free one', async () => {
      mount({ schema: { input: 'cropimage', aspectRatios: ['16:9', '1:1'] } })
      await flushPromises()
      expect(pressed()).toEqual(['16:9'])
      expect(cropper().props('stencilProps')).toEqual({ aspectRatio: 16 / 9 })
    })

    it('keeps the frame to the ratio that is chosen, and free again lets it go', async () => {
      mount()
      await flushPromises()
      await click('.crop-ratio:nth-child(3)')
      expect(pressed()).toEqual(['1:1'])
      expect(cropper().props('stencilProps')).toEqual({ aspectRatio: 1 })
      await click('.crop-ratio:nth-child(1)')
      expect(cropper().props('stencilProps')).toEqual({})
    })

    it('takes the ratio of the picture for Original, and the other way round once it is turned', async () => {
      mount()
      await flushPromises()
      await placed()
      await click('.crop-ratio:nth-child(2)')
      expect(cropper().props('stencilProps')).toEqual({ aspectRatio: 800 / 500 })
      await placed(undefined, { rotate: 90, flip: { horizontal: false, vertical: false } })
      expect(cropper().props('stencilProps')).toEqual({ aspectRatio: 500 / 800 })
    })

    it('takes a ratio typed in', async () => {
      mount()
      await flushPromises()
      await click('.crop-custom')
      expect(pressed()).toEqual(['Custom'])
      const [width, height] = all('.crop-custom-ratio input')
      width.value = '5'
      width.dispatchEvent(new Event('input'))
      height.value = '4'
      height.dispatchEvent(new Event('input'))
      await flushPromises()
      expect(cropper().props('stencilProps')).toEqual({ aspectRatio: 1.25 })
    })

    it('has nothing to choose when the field fixes the size, and keeps the frame to it', async () => {
      mount({ schema: { input: 'cropimage', width: 1200, height: 400 } })
      await flushPromises()
      expect(body('.crop-ratio')).toBe(null)
      expect(cropper().props('stencilProps')).toEqual({ aspectRatio: 3 })
      expect(body('.crop-fixed').textContent).toContain('1200 × 400 px')
      expect(body('.crop-max-width')).toBe(null)
    })

    it('has nothing to choose when the field fixes the ratio', async () => {
      mount({ schema: { input: 'cropimage', aspectRatio: '3:2' } })
      await flushPromises()
      expect(body('.crop-ratio')).toBe(null)
      expect(cropper().props('stencilProps')).toEqual({ aspectRatio: 1.5 })
      expect(body('.crop-max-width')).not.toBe(null)
    })
  })

  describe('the picture', () => {
    it('turns, flips, zooms and resets through the cropper', async () => {
      mount()
      await flushPromises()
      await placed()
      await click('.crop-rotate-left')
      await click('.crop-rotate-right')
      await click('.crop-flip-x')
      await click('.crop-flip-y')
      await click('.crop-zoom-in')
      await click('.crop-zoom-out')
      await click('.crop-reset')
      expect(api.rotate.mock.calls).toEqual([[-90], [90]])
      expect(api.flip.mock.calls).toEqual([[true, false], [false, true]])
      expect(api.zoom.mock.calls).toEqual([[1.25], [0.8]])
      expect(api.reset).toHaveBeenCalledTimes(1)
    })

    it('says which flips are on', async () => {
      mount()
      await flushPromises()
      await placed(undefined, { rotate: 0, flip: { horizontal: true, vertical: false } })
      expect(body('.crop-flip-x').getAttribute('aria-pressed')).toBe('true')
      expect(body('.crop-flip-y').getAttribute('aria-pressed')).toBe('false')
    })

    it('names its buttons', async () => {
      mount()
      await flushPromises()
      for (const [selector, name] of [['.crop-rotate-left', 'Rotate left'], ['.crop-rotate-right', 'Rotate right'], ['.crop-flip-x', 'Flip horizontally'], ['.crop-flip-y', 'Flip vertically'], ['.crop-zoom-in', 'Zoom in'], ['.crop-zoom-out', 'Zoom out']]) {
        expect(body(selector).getAttribute('aria-label'), selector).toBe(name)
      }
    })
  })

  describe('the area', () => {
    const field = (key) => body(`.crop-area-${key} input`)

    it('shows the frame in pixels of the picture', async () => {
      mount()
      await flushPromises()
      await placed({ left: 10.4, top: 20.6, width: 300.2, height: 199.5 })
      expect(['left', 'top', 'width', 'height'].map(key => field(key).value)).toEqual(['10', '21', '300', '200'])
    })

    it('moves the frame when a number is typed', async () => {
      mount()
      await flushPromises()
      await placed()
      field('left').value = '40'
      field('left').dispatchEvent(new Event('change', { bubbles: true }))
      field('width').value = '250'
      field('width').dispatchEvent(new Event('change', { bubbles: true }))
      expect(api.setCoordinates.mock.calls).toEqual([[{ left: 40 }], [{ width: 250 }]])
    })

    it('ignores what is not a number, and a frame with no size', async () => {
      mount()
      await flushPromises()
      await placed()
      for (const [key, value] of [['left', 'abc'], ['width', '0'], ['height', '-5']]) {
        field(key).value = value
        field(key).dispatchEvent(new Event('change', { bubbles: true }))
      }
      expect(api.setCoordinates).not.toHaveBeenCalled()
    })
  })

  describe('the result', () => {
    it('is the size of the frame, and follows the maximums', async () => {
      mount()
      await flushPromises()
      await placed({ left: 0, top: 0, width: 400, height: 200 })
      expect(body('.crop-result').textContent).toContain('400 × 200 px')
      wrapper.vm.maxWidth = 100
      await flushPromises()
      expect(body('.crop-result').textContent).toContain('100 × 50 px')
    })

    it('is the fixed size, with a note when the part kept is smaller', async () => {
      mount({ schema: { input: 'cropimage', width: 1200, height: 400 } })
      await flushPromises()
      await placed({ left: 0, top: 0, width: 600, height: 200 })
      expect(body('.crop-result').textContent).toContain('1200 × 400 px')
      expect(body('.crop-warning').textContent).toBe('enlarged from 600 × 200 px')
      await placed({ left: 0, top: 0, width: 2400, height: 800 })
      expect(body('.crop-warning')).toBe(null)
    })

    it('has a quality for a jpeg, a webp and the format of the picture, not for a png', async () => {
      mount()
      await flushPromises()
      expect(body('.crop-quality')).not.toBe(null)
      for (const [format, has] of [['jpeg', true], ['webp', true], ['png', false], ['', true]]) {
        wrapper.vm.format = format
        await flushPromises()
        expect(!!body('.crop-quality'), format).toBe(has)
      }
    })

    it('starts from what the field says: the maximums, the format and the quality', async () => {
      mount({ schema: { input: 'cropimage', output: { maxWidth: 256, maxHeight: 128, format: 'webp', quality: 70 } } })
      await flushPromises()
      expect([wrapper.vm.maxWidth, wrapper.vm.maxHeight, wrapper.vm.format, wrapper.vm.quality]).toEqual([256, 128, 'webp', 70])
    })

    it('can be a circle, which a jpeg cannot be (it has no transparency)', async () => {
      mount()
      await flushPromises()
      expect(cropper().props('stencilComponent')).toBe(RectangleStencil)
      wrapper.vm.format = 'jpeg'
      await click('.crop-shape-circle')
      expect(cropper().props('stencilComponent')).toBe(CircleStencil)
      expect(body('.crop-shape-circle').getAttribute('aria-pressed')).toBe('true')
      expect(wrapper.vm.format).toBe('png')
      await click('.crop-shape-rect')
      expect(cropper().props('stencilComponent')).toBe(RectangleStencil)
    })

    it('has no choice of shape when the field says it', async () => {
      mount({ schema: { input: 'cropimage', shape: 'circle' } })
      await flushPromises()
      expect(body('.crop-shape-circle')).toBe(null)
      expect(cropper().props('stencilComponent')).toBe(CircleStencil)
    })
  })

  describe('asking the server where to crop', () => {
    it('has no Auto button without a way to ask', async () => {
      mount()
      await flushPromises()
      expect(body('.crop-auto')).toBe(null)
    })

    it('asks for the ratio that is chosen, for the picture as it is turned, and puts the frame there', async () => {
      const suggest = vi.fn(async () => ({ left: 5, top: 6, width: 7, height: 8 }))
      mount({ suggest })
      await flushPromises()
      await placed(undefined, { rotate: 90, flip: { horizontal: true, vertical: false } })
      await click('.crop-ratio:nth-child(3)')
      await click('.crop-auto')
      expect(suggest).toHaveBeenCalledWith(1, { rotate: 90, flipX: true, flipY: false })
      expect(api.setCoordinates).toHaveBeenCalledWith({ left: 5, top: 6, width: 7, height: 8 })
    })

    it('asks for the shape of the frame when the shape is free', async () => {
      const suggest = vi.fn(async () => ({ left: 0, top: 0, width: 1, height: 1 }))
      mount({ suggest })
      await flushPromises()
      await placed({ left: 0, top: 0, width: 300, height: 200 })
      await click('.crop-auto')
      expect(suggest.mock.calls[0][0]).toBe(1.5)
    })

    it('says when it could not, and can be tried again', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const suggest = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ left: 1, top: 1, width: 2, height: 2 })
      mount({ suggest })
      await flushPromises()
      await placed()
      await click('.crop-auto')
      expect(body('.crop-foot .crop-error').textContent).toBe('Could not find where to crop')
      expect(api.setCoordinates).not.toHaveBeenCalled()
      await click('.crop-auto')
      expect(body('.crop-foot .crop-error')).toBe(null)
      expect(api.setCoordinates).toHaveBeenCalledTimes(1)
    })
  })

  describe('applying', () => {
    it('gives back the recipe of the frame, the turn, the shape and the output, and a small picture of the result', async () => {
      mount({ schema: { input: 'cropimage', output: { maxWidth: 256, format: 'png' } } })
      await flushPromises()
      api.result = result({ left: 10.4, top: 20, width: 300.4, height: 200 }, { rotate: 90, flip: { horizontal: true, vertical: false } })
      cropper().vm.$emit('ready')
      await click('.crop-shape-circle')
      await click('.crop-apply')
      const [event] = wrapper.emitted('apply')
      expect(event[0]).toEqual({ left: 10, top: 20, width: 300, height: 200, rotate: 90, flipX: true, shape: 'circle', output: { maxWidth: 256, format: 'png' }, ratio: 'free', updated: true })
      expect(event[1]).toBe('data:image/jpeg;base64,PREVIEW')
      expect(renderPreview).toHaveBeenCalledWith('/api/products/1/attachments/a1', event[0])
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })

    it('takes where the frame is now, even when its last move has not been told yet', async () => {
      mount()
      await flushPromises()
      await placed({ left: 0, top: 0, width: 100, height: 100 })
      api.result = result({ left: 7, top: 8, width: 90, height: 80 })
      await click('.crop-apply')
      expect(wrapper.emitted('apply')[0][0]).toMatchObject({ left: 7, top: 8, width: 90, height: 80 })
    })

    it('keeps a ratio typed in as it reads, for the next time', async () => {
      mount()
      await flushPromises()
      await placed()
      await click('.crop-custom')
      wrapper.vm.customWidth = 5
      wrapper.vm.customHeight = 4
      await click('.crop-apply')
      expect(wrapper.emitted('apply')[0][0].ratio).toBe('5:4')
      // and the tool knows it when it opens again
      await wrapper.setProps({ modelValue: false })
      await wrapper.setProps({ cropOptions: wrapper.emitted('apply')[0][0] })
      await wrapper.setProps({ modelValue: true })
      await flushPromises()
      expect(pressed()).toEqual(['Custom'])
      expect([wrapper.vm.customWidth, wrapper.vm.customHeight]).toEqual([5, 4])
    })

    it('sets the fixed size of the field as the output', async () => {
      mount({ schema: { input: 'cropimage', width: 1200, height: 400 } })
      await flushPromises()
      await placed()
      await click('.crop-apply')
      expect(wrapper.emitted('apply')[0][0].output).toEqual({ width: 1200, height: 400 })
    })

    it('still applies when the small picture cannot be drawn, with none', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(renderPreview).mockRejectedValueOnce(new Error('no canvas'))
      mount()
      await flushPromises()
      await placed()
      await click('.crop-apply')
      expect(wrapper.emitted('apply')[0][1]).toBe('')
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })
  })

  describe('leaving', () => {
    it('closes without a crop on Cancel', async () => {
      mount()
      await flushPromises()
      await click('.crop-cancel')
      expect(wrapper.emitted('apply')).toBeUndefined()
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })

    it('has a way to remove a crop only when the picture has one, and gives back an empty crop', async () => {
      mount()
      await flushPromises()
      expect(body('.crop-remove')).toBe(null)
      wrapper.unmount()
      mount({ cropOptions: { left: 1, top: 1, width: 5, height: 5 } })
      await flushPromises()
      await click('.crop-remove')
      expect(wrapper.emitted('apply')[0]).toEqual([{ updated: true }, ''])
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })

    it('has no way to remove what the tool keeps for "no crop"', async () => {
      mount({ cropOptions: { updated: true } })
      await flushPromises()
      expect(body('.crop-remove')).toBe(null)
    })
  })
})
