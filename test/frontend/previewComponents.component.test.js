import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import FileInputErrors from '@c/attachments/FileInputErrors.vue'
import ShowAttachment from '@c/attachments/ShowAttachment.vue'
import PreviewAttachment from '@c/attachments/PreviewAttachment.vue'
import PreviewMultiple from '@c/attachments/PreviewMultiple.vue'
import CropDialog from '@c/attachments/CropDialog.vue'
import ImageMapDialog from '@c/attachments/ImageMapDialog.vue'
import ImageMapOverlay from '@c/attachments/ImageMapOverlay.vue'
import RequestService from '@s/RequestService'
import { mountComponent } from './helpers/mountField.js'

const draggable = { props: ['list'], template: '<div class="draggable"><slot /></div>' }

const IMAGE = { _id: 'a1', _filename: 'lamp.jpg', url: '/api/products/1/attachments/a1', _contentType: 'image/jpeg' }
const PDF = { _id: 'a2', _filename: 'manual.pdf', url: '/api/products/1/attachments/a2', _contentType: 'application/pdf' }
const NEW_IMAGE = { _filename: 'new.png', data: 'data:image/png;base64,AAAA', file: { name: 'new.png' } }

const isImage = (attachment) => /\.(jpe?g|png|svg)$/i.test(attachment._filename || '')
const getImageSrc = (attachment) => attachment.data || `${attachment.url}?resize=autox100`

let wrapper
const mount = (component, props = {}, options = {}) => {
  wrapper = mountComponent(component, { props, attachTo: document.body, ...options })
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('FileInputErrors (what a file field requires)', () => {
  const notes = () => wrapper.findAll('.help-block span').map((span) => span.text())
  const errors = (schema = {}, props = {}) => mount(FileInputErrors, {
    schema, isForMultipleImages: () => false, getMaxCount: () => -1, ...props
  })

  it('shows nothing when the field has no requirement', () => {
    errors()
    expect(notes()).toEqual([])
  })

  it('says how many files at most when the field takes several and has a limit', () => {
    errors({}, { isForMultipleImages: () => true, getMaxCount: () => 3 })
    expect(notes()).toEqual(['Maximum number of images: 3'])
  })

  it('says the number is unlimited when the field takes any number', () => {
    errors({}, { isForMultipleImages: () => true, getMaxCount: () => -1 })
    expect(notes()[0]).toMatch(/unlimited/i)
  })

  it('names files instead of images for a file field', () => {
    errors({}, { fileType: 'file', isForMultipleImages: () => true, getMaxCount: () => 2 })
    expect(notes()[0]).toContain('files')
  })

  it('shows the hint of the field', () => {
    errors({ options: { hint: 'A thumbnail' } })
    expect(notes()).toEqual(['A thumbnail'])
  })

  it('shows the size an image must have', () => {
    errors({ width: 800, height: 600, options: { width: 800, height: 600 } })
    expect(notes()[0]).toContain('800x600')
  })

  it.each([
    [500, '500 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [2 * 1024 * 1024, '2 MB'],
    [2.5 * 1024 * 1024, '2.5 MB']
  ])('writes a size limit of %s bytes as %s', (limit, text) => {
    errors({ limit })
    expect(notes()[0]).toContain(text)
  })

  it('lists the accepted types', () => {
    errors({ accept: '.png,.svg' })
    expect(notes()[0]).toContain('.png,.svg')
  })

  it('shows every requirement together, in order', () => {
    errors({ options: { hint: 'Cover' }, limit: 1024, accept: 'image/*' }, { isForMultipleImages: () => true, getMaxCount: () => 2 })
    expect(notes()).toHaveLength(4)
  })
})

describe('ShowAttachment (one file in the preview)', () => {
  // the crop tool has its own tests (cropDialog.component.test.js): a stand-in keeps these on what the preview does around it
  const show = (attachment, extra = {}) => mount(ShowAttachment, { attachment, isImage, getImageSrc, schema: {}, ...extra }, { global: { stubs: { CropDialog: true, ImageMapDialog: true } } })

  it('shows an image as a picture, from the address the field gives', () => {
    show(IMAGE)
    expect(wrapper.find('.image-wrapper').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'VImg' }).props('src')).toBe('/api/products/1/attachments/a1?resize=autox100')
  })

  it('has no View button under a picture, whatever the field can do with it (the picture opens with a click)', () => {
    for (const schema of [{}, { input: 'cropimage', label: 'Cover' }]) {
      show(IMAGE, { schema })
      expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('View')
      wrapper.unmount()
    }
  })

  it('shows a file that is not an image as a View button', () => {
    show(PDF)
    expect(wrapper.find('.image-wrapper').exists()).toBe(false)
    expect(wrapper.get('button').text()).toBe('View')
  })

  it('has no View button for a file that is not saved yet', () => {
    show({ ...PDF, _id: undefined })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('shows a picture that was just chosen, from its data', () => {
    show(NEW_IMAGE)
    expect(wrapper.findComponent({ name: 'VImg' }).props('src')).toBe(NEW_IMAGE.data)
  })

  it('says when the picture cannot be loaded', async () => {
    show(IMAGE)
    wrapper.findComponent({ name: 'VImg' }).vm.$emit('error')
    await flushPromises()
    expect(wrapper.find('.loading-error').text()).toContain('Error loading image')
    wrapper.findComponent({ name: 'VImg' }).vm.$emit('load')
    await flushPromises()
    expect(wrapper.find('.loading-error').exists()).toBe(false)
  })

  describe('opening the file', () => {
    it('opens it in a new tab with its extension on the address', () => {
      const win = { focus: vi.fn() }
      const open = vi.spyOn(window, 'open').mockReturnValue(win)
      show(PDF)
      wrapper.vm.viewFile()
      expect(open).toHaveBeenCalledWith(`${window.origin}/api/products/1/attachments/a2.pdf`, '_blank')
      expect(win.focus).toHaveBeenCalled()
    })

    it('adds no extension to a file name that has none', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      show({ ...PDF, _filename: 'README' })
      wrapper.vm.viewFile()
      expect(open).toHaveBeenCalledWith(`${window.origin}/api/products/1/attachments/a2`, '_blank')
    })

    it('opens with a click on the picture of a saved image', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      show(IMAGE)
      wrapper.findComponent({ name: 'VImg' }).vm.$emit('click')
      expect(open).toHaveBeenCalledTimes(1)
    })
  })

  describe('cropping', () => {
    const CROP_IMAGE = { label: 'Cover', input: 'cropimage', resource: { title: 'products' } }
    const dialog = () => wrapper.findComponent(CropDialog)

    it('offers the crop tool only to a field that has it, and for a picture it can cut', () => {
      show(IMAGE)
      expect(wrapper.find('.edit-crop').exists()).toBe(false)
      expect(dialog().exists()).toBe(false)
      wrapper.unmount()
      // a crop image field, and an image field with the crop option of the first crop tool
      show(IMAGE, { schema: CROP_IMAGE })
      expect(wrapper.find('.edit-crop').exists()).toBe(true)
      wrapper.unmount()
      show(IMAGE, { schema: { label: 'Cover', crop: { width: 400, height: 300 } } })
      expect(wrapper.find('.edit-crop').exists()).toBe(true)
      wrapper.unmount()
      // a drawing is not cut, and a file that is not a picture has no tool
      show({ ...IMAGE, _filename: 'logo.svg', _contentType: 'image/svg+xml' }, { schema: CROP_IMAGE })
      expect(wrapper.find('.edit-crop').exists()).toBe(false)
      wrapper.unmount()
      show(PDF, { schema: CROP_IMAGE })
      expect(wrapper.find('.edit-crop').exists()).toBe(false)
    })

    it('puts the button outside the picture, whose box cuts what overflows it', () => {
      show(IMAGE, { schema: CROP_IMAGE })
      expect(wrapper.find('.image-wrapper .edit-crop').exists()).toBe(false)
      expect(wrapper.find('.row-handle > .edit-crop').exists()).toBe(true)
    })

    it('opens the tool with a click on the button, and not before', async () => {
      show(IMAGE, { schema: CROP_IMAGE })
      expect(dialog().props('modelValue')).toBe(false)
      await wrapper.get('.edit-crop').trigger('click')
      expect(dialog().props('modelValue')).toBe(true)
      dialog().vm.$emit('update:modelValue', false)
      await flushPromises()
      expect(dialog().props('modelValue')).toBe(false)
    })

    it('gives the tool the picture, the field, its title and the crop kept with the picture', () => {
      const cropOptions = { left: 12, top: 34, width: 56, height: 78 }
      show({ ...IMAGE, cropOptions }, { schema: CROP_IMAGE })
      expect(dialog().props()).toMatchObject({ src: IMAGE.url, title: 'Cover', cropOptions })
      expect(dialog().props('schema')).toBe(wrapper.props('schema'))
    })

    it('gives the tool the data of a picture that is not uploaded yet', () => {
      show(NEW_IMAGE, { schema: CROP_IMAGE })
      expect(dialog().props('src')).toBe(NEW_IMAGE.data)
    })

    it('hands the crop to the field when it is applied, with the small picture of the result', () => {
      const onCrop = vi.fn()
      show(IMAGE, { schema: CROP_IMAGE, onCrop })
      dialog().vm.$emit('apply', { left: 1, top: 2, width: 3, height: 4, updated: true }, 'data:image/jpeg;base64,BBBB')
      expect(onCrop).toHaveBeenCalledWith({ left: 1, top: 2, width: 3, height: 4, updated: true }, 'data:image/jpeg;base64,BBBB')
    })

    describe('opening a picture that has a crop', () => {
      const CROP = { left: 1, top: 2, width: 3, height: 4 }
      const click = () => wrapper.findComponent({ name: 'VImg' }).vm.$emit('click')

      it('opens the cut the API makes, not the original', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        show({ ...IMAGE, cropOptions: CROP }, { schema: CROP_IMAGE })
        click()
        expect(open).toHaveBeenCalledWith(`${window.origin}/api/products/1/attachments/a1/cropped`, '_blank')
      })

      it('opens the original when the crop cuts nothing, or the field has no crop tool', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        show({ ...IMAGE, cropOptions: { updated: true } }, { schema: CROP_IMAGE })
        click()
        wrapper.unmount()
        show({ ...IMAGE, cropOptions: CROP })
        click()
        expect(open.mock.calls.map(([address]) => address)).toEqual([`${window.origin}/api/products/1/attachments/a1.jpg`, `${window.origin}/api/products/1/attachments/a1.jpg`])
      })

      it('opens the small picture of a crop that is not saved yet', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        URL.createObjectURL = vi.fn(() => 'blob:small')
        URL.revokeObjectURL = vi.fn()
        show({ ...IMAGE, cropOptions: { ...CROP, updated: true }, cropPreview: 'data:image/jpeg;base64,PP' }, { schema: CROP_IMAGE })
        click()
        await flushPromises()
        // (decoded in the page: a fetch of a data url is refused by the security policy of the admin)
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
        expect(URL.createObjectURL.mock.calls[0][0].type).toBe('image/jpeg')
        expect(open).toHaveBeenCalledWith('blob:small', '_blank')
      })

      it('opens a new picture that was just cropped, which has no address yet, and nothing before it is', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        URL.createObjectURL = vi.fn(() => 'blob:small')
        URL.revokeObjectURL = vi.fn()
        show(NEW_IMAGE, { schema: CROP_IMAGE })
        expect(wrapper.findComponent({ name: 'VImg' }).classes()).not.toContain('clickable')
        click()
        await flushPromises()
        expect(open).not.toHaveBeenCalled()
        await wrapper.setProps({ attachment: { ...NEW_IMAGE, cropOptions: { ...CROP, updated: true }, cropPreview: 'data:image/jpeg;base64,PP' } })
        expect(wrapper.findComponent({ name: 'VImg' }).classes()).toContain('clickable')
        click()
        await flushPromises()
        expect(open).toHaveBeenCalledWith('blob:small', '_blank')
      })

      it('can be clicked when it is saved', () => {
        show(IMAGE, { schema: CROP_IMAGE })
        expect(wrapper.findComponent({ name: 'VImg' }).classes()).toContain('clickable')
      })
    })

    describe('the preview of a picture that has a crop', () => {
      it('has the shape of the crop, whole, and its card is as wide as the shape says', () => {
        show({ ...IMAGE, cropOptions: { left: 0, top: 0, width: 300, height: 300 } }, { schema: CROP_IMAGE })
        expect(wrapper.get('.image-wrapper').classes()).toContain('is-cropped')
        expect(wrapper.findComponent({ name: 'VImg' }).props('aspectRatio')).toBe(1)
        wrapper.unmount()
        show({ ...IMAGE, cropOptions: { left: 0, top: 0, width: 600, height: 200 } }, { schema: CROP_IMAGE })
        expect(wrapper.findComponent({ name: 'VImg' }).props('aspectRatio')).toBe(3)
        expect(wrapper.get('.image-wrapper').attributes('style')).toContain('max-width: 660px')
      })

      it('has the size of the output when the crop gives one', () => {
        show({ ...IMAGE, cropOptions: { left: 0, top: 0, width: 900, height: 900, output: { width: 200, height: 100 } } }, { schema: CROP_IMAGE })
        expect(wrapper.findComponent({ name: 'VImg' }).props('aspectRatio')).toBe(2)
      })

      it('is round when the crop is a circle', () => {
        show({ ...IMAGE, cropOptions: { left: 0, top: 0, width: 300, height: 300, shape: 'circle' } }, { schema: CROP_IMAGE })
        expect(wrapper.get('.image-wrapper').classes()).toContain('is-round')
      })

      it('keeps the shape of the card for a picture with no crop, and for a field with no crop tool', () => {
        show(IMAGE, { schema: CROP_IMAGE })
        expect(wrapper.get('.image-wrapper').classes()).not.toContain('is-cropped')
        expect(wrapper.findComponent({ name: 'VImg' }).props('aspectRatio')).toBe(16 / 10)
        wrapper.unmount()
        show({ ...IMAGE, cropOptions: { left: 0, top: 0, width: 300, height: 300 } })
        expect(wrapper.get('.image-wrapper').classes()).not.toContain('is-cropped')
      })
    })

    describe('the image map', () => {
      const MAP_FIELD = { label: 'Floor plan', input: 'imagemap', resource: { title: 'plans' } }
      const AREAS = [{ id: 'a', shape: 'rect', coords: [0.1, 0.1, 0.5, 0.5] }, { id: 'b', shape: 'circle', coords: [0.7, 0.3, 0.1] }]
      const dialog = () => wrapper.findComponent(ImageMapDialog)
      const picture = (width, height) => {
        vi.stubGlobal('Image', class {
          set src (value) {
            this.naturalWidth = width
            this.naturalHeight = height
            Promise.resolve().then(() => this.onload())
          }
        })
      }

      it('is offered to an image map field only, for a picture', () => {
        show(IMAGE)
        expect(wrapper.find('.edit-map').exists()).toBe(false)
        expect(dialog().exists()).toBe(false)
        wrapper.unmount()
        show(IMAGE, { schema: MAP_FIELD })
        expect(wrapper.find('.edit-map').exists()).toBe(true)
        expect(wrapper.find('.edit-crop').exists()).toBe(false)
        wrapper.unmount()
        show(PDF, { schema: MAP_FIELD })
        expect(wrapper.find('.edit-map').exists()).toBe(false)
      })

      it('opens the tool with a click, with the original picture, the field and the map kept with it', async () => {
        const imageMap = { areas: AREAS }
        show({ ...IMAGE, imageMap }, { schema: MAP_FIELD })
        expect(dialog().props('modelValue')).toBe(false)
        await wrapper.get('.edit-map').trigger('click')
        expect(dialog().props()).toMatchObject({ modelValue: true, src: IMAGE.url, title: 'Floor plan', imageMap })
        expect(dialog().props('schema')).toBe(wrapper.props('schema'))
      })

      it('gives the tool the data of a picture that is not uploaded yet', () => {
        show(NEW_IMAGE, { schema: MAP_FIELD })
        expect(dialog().props('src')).toBe(NEW_IMAGE.data)
      })

      it('hands the map to the field when it is applied', () => {
        const onMap = vi.fn()
        show(IMAGE, { schema: MAP_FIELD, onMap })
        dialog().vm.$emit('apply', { areas: AREAS, updated: true })
        expect(onMap).toHaveBeenCalledWith({ areas: AREAS, updated: true })
      })

      it('says how many areas it has, and draws them over the picture', () => {
        show({ ...IMAGE, imageMap: { areas: AREAS } }, { schema: MAP_FIELD })
        expect(wrapper.get('.map-count').text()).toBe('2 area(s)')
        expect(wrapper.findComponent(ImageMapOverlay).props('areas')).toEqual(AREAS)
        wrapper.unmount()
        show(IMAGE, { schema: MAP_FIELD })
        expect(wrapper.find('.map-count').exists()).toBe(false)
        expect(wrapper.findComponent(ImageMapOverlay).exists()).toBe(false)
      })

      it('draws no map for a field that is not an image map, whatever its picture has', () => {
        show({ ...IMAGE, imageMap: { areas: AREAS } })
        expect(wrapper.findComponent(ImageMapOverlay).exists()).toBe(false)
      })

      it('shows the picture whole, in its own shape, so that the areas are over the right parts of it', async () => {
        picture(1200, 600)
        show({ ...IMAGE, imageMap: { areas: AREAS } }, { schema: MAP_FIELD })
        await flushPromises()
        expect(wrapper.get('.image-wrapper').classes()).toContain('is-cropped')
        expect(wrapper.findComponent({ name: 'VImg' }).props('aspectRatio')).toBe(2)
        expect(wrapper.findComponent(ImageMapOverlay).props('aspect')).toBe(2)
        expect(wrapper.get('.image-wrapper').attributes('style')).toContain('max-width: 440px')
        vi.unstubAllGlobals()
      })

      it('takes the shape the server measured until the browser has measured the picture', () => {
        vi.stubGlobal('Image', class { set src (value) {} })
        show({ ...IMAGE, _meta: { width: 900, height: 600 }, imageMap: { areas: AREAS } }, { schema: MAP_FIELD })
        expect(wrapper.findComponent(ImageMapOverlay).props('aspect')).toBe(1.5)
        vi.unstubAllGlobals()
      })

      it('measures the picture again when it is another one', async () => {
        picture(400, 400)
        show({ ...IMAGE, imageMap: { areas: AREAS } }, { schema: MAP_FIELD })
        await flushPromises()
        expect(wrapper.findComponent(ImageMapOverlay).props('aspect')).toBe(1)
        picture(800, 200)
        await wrapper.setProps({ attachment: { ...IMAGE, url: '/api/plans/1/attachments/a9', imageMap: { areas: AREAS } } })
        await flushPromises()
        expect(wrapper.findComponent(ImageMapOverlay).props('aspect')).toBe(4)
        vi.unstubAllGlobals()
      })
    })

    describe('asking the server where to crop', () => {
      it('is offered for a picture that is saved, and for a file the browser can send, not for another', () => {
        show(IMAGE, { schema: CROP_IMAGE })
        expect(dialog().props('suggest')).toBeTypeOf('function')
        wrapper.unmount()
        show({ ...NEW_IMAGE, file: new File(['x'], 'new.png', { type: 'image/png' }) }, { schema: CROP_IMAGE })
        expect(dialog().props('suggest')).toBeTypeOf('function')
        wrapper.unmount()
        show(NEW_IMAGE, { schema: CROP_IMAGE })
        expect(dialog().props('suggest')).toBeUndefined()
      })

      it('asks for a saved picture through its address, with the shape and how it is turned', async () => {
        const get = vi.spyOn(RequestService, 'get').mockResolvedValue({ left: 1, top: 2, width: 3, height: 4 })
        show(IMAGE, { schema: CROP_IMAGE })
        const area = await dialog().props('suggest')(1.5, { rotate: 90, flipX: true, flipY: false })
        expect(area).toEqual({ left: 1, top: 2, width: 3, height: 4 })
        expect(get).toHaveBeenCalledWith('/api/products/1/attachments/a1/crop-suggestion?aspect=1.5&rotate=90&flipX=true&flipY=false')
      })

      it('sends a picture that is not saved with the question, to the resource of the field', async () => {
        const post = vi.spyOn(RequestService, 'post').mockResolvedValue({ left: 0, top: 0, width: 10, height: 10 })
        const file = new File(['x'], 'new.png', { type: 'image/png' })
        show({ ...NEW_IMAGE, file }, { schema: CROP_IMAGE })
        await dialog().props('suggest')(1, {})
        const [url, body] = post.mock.calls[0]
        expect(url).toBe('../api/products/attachments/crop-suggestion?aspect=1&rotate=0&flipX=false&flipY=false')
        expect(body).toBeInstanceOf(FormData)
        expect(body.get('image').name).toBe('new.png')
      })
    })
  })
})

describe('PreviewAttachment (one file with its name)', () => {
  const preview = (attachment, extra = {}) => mount(PreviewAttachment, { attachment, isImage, getImageSrc, schema: {}, ...extra }, { global: { stubs: { ShowAttachment: true } } })

  it('shows the position at the top, the name of the file and its size at the foot', () => {
    preview(IMAGE, { index: 2, count: 4, imageSize: () => '6.85 MB' })
    expect(wrapper.get('.preview-position').text()).toBe('3/4')
    expect(wrapper.get('.filename-text').text()).toBe('lamp.jpg')
    expect(wrapper.get('.filename-size').text()).toBe('6.85 MB')
    // the top row comes first, and the name follows it, under the picture
    const follows = (first, second) => !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(wrapper.get('.preview-top').element, wrapper.get('.filename').element)).toBe(true)
    expect(follows(wrapper.get('.preview-top').element, wrapper.get('show-attachment-stub').element)).toBe(true)
    expect(follows(wrapper.get('show-attachment-stub').element, wrapper.get('.filename').element)).toBe(true)
  })

  it('shows no top row for a single file (no grip, no position), and still has its cross: there is no empty space above the picture', () => {
    preview(IMAGE, { index: 0, count: 1 })
    expect(wrapper.find('.preview-top').exists()).toBe(false)
    expect(wrapper.find('.preview-position').exists()).toBe(false)
    expect(wrapper.find('.preview-remove').exists()).toBe(true)
  })

  it('has a cross in the corner of the picture that removes the file, by its position', async () => {
    const removeImage = vi.fn()
    preview(IMAGE, { index: 1, count: 3, removeImage })
    expect(wrapper.get('.preview-picture .preview-remove').exists()).toBe(true)
    expect(wrapper.find('.preview-top .preview-remove').exists()).toBe(false)
    await wrapper.get('.preview-remove').trigger('click')
    expect(removeImage).toHaveBeenCalledWith(IMAGE, 1)
  })

  it('removes a file that has no picture with a button that has its word, beside the View button (a bin has nothing to sit on)', async () => {
    const removeImage = vi.fn()
    preview(PDF, { index: 0, count: 2, removeImage, schema: {} })
    const area = wrapper.get('.preview-picture')
    expect(area.classes()).toContain('is-file')
    const remove = area.get('.preview-remove')
    expect(remove.classes()).toContain('is-text')
    expect(remove.text()).toBe('Remove')
    expect(remove.find('svg, .v-icon').exists()).toBe(false)
    await remove.trigger('click')
    expect(removeImage).toHaveBeenCalledWith(PDF, 0)
  })

  it('removes a picture with the bin in its corner, no word', () => {
    preview(IMAGE)
    const area = wrapper.get('.preview-picture')
    expect(area.classes()).not.toContain('is-file')
    expect(area.get('.preview-remove').classes()).not.toContain('is-text')
    expect(area.get('.preview-remove').text()).toBe('')
    expect(area.get('.preview-remove').attributes('aria-label')).toBe('Remove')
  })

  it('cannot be removed when the field is locked', () => {
    preview(IMAGE, { locked: true })
    expect(wrapper.find('.preview-remove').exists()).toBe(false)
  })

  it('marks a file that was changed, and says why', () => {
    preview({ ...IMAGE, dirty: 'crop-updated' })
    expect(wrapper.get('.filename').classes()).toContain('is-dirty')
    expect(wrapper.vm.getDirtyReason()).toBe('TL_CROP_UPDATED')
  })

  it('names the reason from the way the file was changed, with a general one as a fallback', () => {
    preview(IMAGE)
    expect(wrapper.vm.getDirtyReason()).toBe('TL_DIRTY')
  })

  it('alternates its look from one file to the next', () => {
    preview(IMAGE, { index: 1 })
    expect(wrapper.classes()).toContain('odd')
    wrapper.unmount()
    preview(IMAGE, { index: 2 })
    expect(wrapper.classes()).not.toContain('odd')
  })

  it('names a file for the list by its name and its id, or its position when it has none yet', () => {
    preview(IMAGE)
    expect(wrapper.vm.getKey(IMAGE)).toBe('lamp.jpg-a1')
    expect(wrapper.vm.getKey({ _filename: 'x.png' })).toBe('x.png-0')
  })

  it('reads the name of a file from its fields when it has none of its own', () => {
    preview(IMAGE)
    expect(wrapper.vm.getAttachmentFilename({ _fields: { _filename: 'from-fields.png' } })).toBe('from-fields.png')
    expect(wrapper.vm.getAttachmentFilename({})).toBe('')
  })

  it('copies the name of the file', () => {
    const writeText = vi.fn()
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true })
    preview(IMAGE)
    wrapper.vm.copyFilenameToClipboard()
    expect(writeText).toHaveBeenCalledWith('lamp.jpg')
    delete window.navigator.clipboard
  })

  it('tells the field which file got a map, by its position', () => {
    const onMap = vi.fn()
    preview(IMAGE, { index: 2, onMap })
    wrapper.vm.onMapAt({ areas: [], updated: true })
    expect(onMap).toHaveBeenCalledWith(2, { areas: [], updated: true })
  })

  it('tells the field which file was cropped, by its position', () => {
    const onCrop = vi.fn()
    preview(IMAGE, { index: 3, onCrop })
    wrapper.vm.onCropAt({ left: 1, updated: true }, 'data:image/jpeg;base64,CC')
    expect(onCrop).toHaveBeenCalledWith(3, { left: 1, updated: true }, 'data:image/jpeg;base64,CC')
  })
})

describe('PreviewMultiple (the list of files of a field)', () => {
  const list = (attachments, extra = {}) => mount(PreviewMultiple, { attachments, isImage, getImageSrc, schema: { model: 'photos' }, ...extra }, { global: { components: { draggable }, stubs: { ShowAttachment: true } } })

  it('shows one preview per file, in order', () => {
    list([IMAGE, PDF, NEW_IMAGE])
    expect(wrapper.findAllComponents(PreviewAttachment)).toHaveLength(3)
    const chips = wrapper.findAll('.filename').map((chip) => chip.text())
    expect(chips).toHaveLength(3)
    expect(chips[0]).toContain('lamp.jpg')
    expect(chips[1]).toContain('manual.pdf')
    expect(chips[2]).toContain('new.png')
  })

  it('shows nothing for a field without files', () => {
    list([])
    expect(wrapper.findAllComponents(PreviewAttachment)).toHaveLength(0)
  })

  it('locks every preview when the field is disabled', () => {
    list([IMAGE, PDF], { disabled: true })
    expect(wrapper.findAllComponents(PreviewAttachment).every((item) => item.props('locked'))).toBe(true)
  })

  it('moves a preview with its file when the order changes, instead of giving the file to the preview that was in that place (the pictures would load again and blink)', async () => {
    const [a, b, c] = [{ ...IMAGE, _id: 'a' }, { ...PDF, _id: 'b' }, { ...NEW_IMAGE }]
    list([a, b, c])
    const instances = () => wrapper.findAllComponents(PreviewAttachment).map((preview) => preview.vm.$.uid)
    const before = instances()
    await wrapper.setProps({ attachments: [c, a, b] })
    expect(instances()).toEqual([before[2], before[0], before[1]])
    await wrapper.setProps({ attachments: [b, c, a] })
    expect(instances()).toEqual([before[1], before[2], before[0]])
    // the position each one shows follows the order
    expect(wrapper.findAllComponents(PreviewAttachment).map((preview) => preview.props('index'))).toEqual([0, 1, 2])
    expect(wrapper.findAll('.preview-position').map((position) => position.text())).toEqual(['1/3', '2/3', '3/3'])
  })

  it('makes a preview of a file that is added, and drops the one of a file that is removed, leaving the others as they are', async () => {
    const [a, b, c] = [{ ...IMAGE, _id: 'a' }, { ...PDF, _id: 'b' }, { ...NEW_IMAGE }]
    list([a, b])
    const before = wrapper.findAllComponents(PreviewAttachment).map((preview) => preview.vm.$.uid)
    await wrapper.setProps({ attachments: [a, b, c] })
    const added = wrapper.findAllComponents(PreviewAttachment).map((preview) => preview.vm.$.uid)
    expect(added.slice(0, 2)).toEqual(before)
    expect(added).toHaveLength(3)
    await wrapper.setProps({ attachments: [b, c] })
    expect(wrapper.findAllComponents(PreviewAttachment).map((preview) => preview.vm.$.uid)).toEqual([before[1], added[2]])
  })

  it('puts each list in a group of its own, so that a file cannot be dragged into the list of another field', () => {
    list([IMAGE, PDF], { schema: { model: 'photos' } })
    const first = wrapper.findComponent(draggable).attributes('group')
    wrapper.unmount()
    list([IMAGE, PDF], { schema: { model: 'photos' } })
    const second = wrapper.findComponent(draggable).attributes('group')
    wrapper.unmount()
    list([IMAGE, PDF], { schema: { model: 'documents' } })
    const third = wrapper.findComponent(draggable).attributes('group')
    expect(first).toContain('photos')
    expect(third).toContain('documents')
    // the same field on two records, or two instances of a field, never share one
    expect(new Set([first, second, third]).size).toBe(3)
  })

  it('keeps the group of a list for as long as the list lives (re-rendering it does not open it to the others)', async () => {
    list([IMAGE, PDF])
    const group = wrapper.findComponent(draggable).attributes('group')
    await wrapper.setProps({ attachments: [PDF, IMAGE] })
    expect(wrapper.findComponent(draggable).attributes('group')).toBe(group)
  })

  it('lets the library know a drag is on: the page stops selecting text from the press on a grip, and is let go on release', async () => {
    list([IMAGE, PDF])
    wrapper.findComponent(draggable).vm.$emit('choose', {})
    expect(document.body.classList.contains('cms-dragging')).toBe(true)
    wrapper.findComponent(draggable).vm.$emit('unchoose', {})
    expect(document.body.classList.contains('cms-dragging')).toBe(false)
  })

  it('reports the end of a drag to the field, which numbers the files again', () => {
    const onEndDrag = vi.fn()
    list([IMAGE, PDF], { onEndDrag })
    const event = { oldIndex: 0, newIndex: 1 }
    wrapper.findComponent(draggable).vm.$emit('end', event)
    expect(onEndDrag).toHaveBeenCalledWith(event)
  })

  it('takes the ids off the copy of a file that follows the pointer when a drag starts', () => {
    list([IMAGE, PDF])
    document.body.insertAdjacentHTML('beforeend', '<div class="sortable-fallback"><input id="cms-field-9"></div>')
    wrapper.findComponent(draggable).vm.$emit('start', {})
    expect(document.querySelectorAll('.sortable-fallback [id]')).toHaveLength(0)
  })

  it('starts a drag from the grip of a preview alone', () => {
    list([IMAGE, PDF])
    expect(wrapper.findComponent(draggable).attributes('handle')).toBe('.drag-grip')
    expect(wrapper.findAll('.drag-grip')).toHaveLength(2)
    expect(wrapper.find('.move-buttons').exists()).toBe(false)
  })

  it('shows no grip for a single file: there is nothing to put in order', () => {
    list([IMAGE])
    expect(wrapper.find('.drag-grip').exists()).toBe(false)
    expect(wrapper.find('.filename').exists()).toBe(true)
  })

  it('puts the grip in the top row with the position and the cross, and the name at the foot, so a long name cannot push anything out of the card', () => {
    list([IMAGE, PDF])
    const top = wrapper.find('.preview-top')
    expect(top.find('.drag-grip').exists()).toBe(true)
    expect(top.find('.preview-position').text()).toBe('1/2')
    expect(top.find('.preview-remove').exists()).toBe(false)
    expect(wrapper.find('.preview-picture .preview-remove').exists()).toBe(true)
    expect(top.find('.filename').exists()).toBe(false)
    expect(wrapper.find('.filename').exists()).toBe(true)
  })

  it('offers the compact mode with two files or more: the grips give way to the buttons that move a file, which report where', async () => {
    const moved = []
    list([IMAGE, PDF, NEW_IMAGE], { moveAttachment: (index, delta) => moved.push([index, delta]) })
    await wrapper.get('.reorder-toggle').trigger('click')
    expect(wrapper.findAll('.drag-grip')).toHaveLength(0)
    expect(wrapper.findAll('.move-buttons')).toHaveLength(3)
    expect(wrapper.findAll('.move-earlier')[0].attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('.move-later')[2].attributes('disabled')).toBeDefined()
    await wrapper.findAll('.move-later')[0].trigger('click')
    await wrapper.findAll('.move-earlier')[2].trigger('click')
    expect(moved).toEqual([[0, 1], [2, -1]])
  })

  it('offers no compact mode for one file or a locked field', () => {
    list([IMAGE])
    expect(wrapper.find('.reorder-toggle').exists()).toBe(false)
    wrapper.unmount()
    list([IMAGE, PDF], { disabled: true })
    expect(wrapper.find('.reorder-toggle').exists()).toBe(false)
    expect(wrapper.find('.drag-grip').exists()).toBe(false)
  })

  it('numbers its previews from zero, for the cropping', () => {
    list([IMAGE, PDF])
    expect(wrapper.findAllComponents(PreviewAttachment).map((item) => item.props('index'))).toEqual([0, 1])
  })
})
