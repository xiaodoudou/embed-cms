import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import FileInputErrors from '@c/attachments/FileInputErrors.vue'
import ShowAttachment from '@c/attachments/ShowAttachment.vue'
import PreviewAttachment from '@c/attachments/PreviewAttachment.vue'
import PreviewMultiple from '@c/attachments/PreviewMultiple.vue'
import { mountComponent } from './helpers/mountField.js'

// The cropper is a library of its own and needs a real canvas: a stand-in keeps these tests on what the components do around it.
const Cropper = { name: 'Cropper', props: ['src', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'defaultSize', 'imageRestriction'], methods: { refresh () {} }, template: '<div class="cropper-stub" />' }
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
  const show = (attachment, extra = {}) => mount(ShowAttachment, { attachment, isImage, getImageSrc, schema: {}, ...extra }, { global: { components: { Cropper }, stubs: { Cropper } } })

  it('shows an image as a picture, from the address the field gives', () => {
    show(IMAGE)
    expect(wrapper.find('.image-wrapper').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'VImg' }).props('src')).toBe('/api/products/1/attachments/a1?resize=autox100')
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
    const crop = { width: 400, height: 300 }

    it('offers to edit the crop only when the field has one', () => {
      show(IMAGE)
      expect(wrapper.find('.edit-crop').exists()).toBe(false)
      wrapper.unmount()
      show(IMAGE, { schema: { label: 'Cover', crop } })
      expect(wrapper.find('.edit-crop').exists()).toBe(true)
    })

    it('uses the fixed size of the crop, or the size typed when it is not fixed', () => {
      show(IMAGE, { schema: { crop } })
      expect(wrapper.vm.getCurrentWidth()).toBe(400)
      expect(wrapper.vm.getCurrentHeight()).toBe(300)
      wrapper.unmount()
      show(IMAGE, { schema: { crop: {} } })
      expect(wrapper.vm.getCurrentWidth()).toBe(500)
      wrapper.vm.customWidth = 640
      expect(wrapper.vm.getCurrentWidth()).toBe(640)
    })

    it('starts from the size the schema asks for, in the middle of the picture', () => {
      show(IMAGE, { schema: { crop } })
      expect(wrapper.vm.getDefaultCropSize()).toEqual({ width: 400, height: 300 })
      const position = wrapper.vm.getDefaultCropPosition({ imageSize: { width: 1000, height: 800 }, visibleArea: null, coordinates: { width: 400, height: 300 } })
      expect(position).toEqual({ left: 300, top: 250 })
    })

    it('starts from the crop that was saved with the picture', () => {
      show({ ...IMAGE, cropOptions: { left: 12, top: 34 } }, { schema: { crop } })
      expect(wrapper.vm.getDefaultCropPosition({ imageSize: { width: 1000, height: 800 }, coordinates: { width: 1, height: 1 } })).toEqual({ left: 12, top: 34 })
    })

    it('takes the first move of the cropper as its starting point, and then follows the size when it is free', () => {
      show(IMAGE, { schema: { crop: {} } })
      wrapper.vm.onCropperChangeForAttachment({ coordinates: { width: 111.4, height: 99.6 } })
      expect(wrapper.vm.customWidth).toBe(500)
      wrapper.vm.onCropperChangeForAttachment({ coordinates: { width: 111.4, height: 99.6 } })
      expect(wrapper.vm.customWidth).toBe(111)
      expect(wrapper.vm.customHeight).toBe(100)
    })

    it('keeps a fixed width or height whatever the cropper says', () => {
      show(IMAGE, { schema: { crop: { width: 400 } } })
      wrapper.vm.onCropperChangeForAttachment({ coordinates: { width: 1, height: 1 } })
      wrapper.vm.onCropperChangeForAttachment({ coordinates: { width: 50, height: 60 } })
      expect(wrapper.vm.customWidth).toBe(400)
      expect(wrapper.vm.customHeight).toBe(60)
    })

    it('hands the crop to the field when it is applied, and closes', () => {
      const onCropperChange = vi.fn()
      show(IMAGE, { schema: { crop }, onCropperChange })
      wrapper.vm.cropData = { coordinates: { left: 1, top: 2, width: 3, height: 4 } }
      const isActive = { value: true }
      wrapper.vm.apply(isActive)
      expect(isActive.value).toBe(false)
      expect(onCropperChange).toHaveBeenCalledWith({ coordinates: { left: 1, top: 2, width: 3, height: 4 } })
    })

    it('reads the options of the crop (move and resize the picture)', () => {
      show(IMAGE, { schema: { crop: { ...crop, moveImage: true } } })
      expect(wrapper.vm.hasOpt('moveImage')).toBe(true)
      expect(wrapper.vm.hasOpt('resizeImage')).toBe(false)
    })
  })
})

describe('PreviewAttachment (one file with its name)', () => {
  const preview = (attachment, extra = {}) => mount(PreviewAttachment, { attachment, isImage, getImageSrc, schema: {}, ...extra }, { global: { stubs: { ShowAttachment: true } } })

  it('shows the name of the file in a chip that can be closed', () => {
    preview(IMAGE)
    expect(wrapper.get('.filename').text()).toContain('lamp.jpg')
    expect(wrapper.get('.filename').props?.closable ?? wrapper.findComponent({ name: 'VChip' }).props('closable')).toBeTruthy()
  })

  it('cannot be closed when the field is locked', () => {
    preview(IMAGE, { locked: true })
    expect(wrapper.findComponent({ name: 'VChip' }).props('closable')).toBe(false)
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

  it('marks a field that can crop', () => {
    preview(IMAGE, { schema: { crop: { width: 1, height: 1 } } })
    expect(wrapper.classes()).toContain('can-crop')
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

  it('tells the field which file was cropped, by its position', () => {
    const onCropperChange = vi.fn()
    preview(IMAGE, { index: 3, onCropperChange })
    wrapper.vm.onCropperChangeForAttachment({ coordinates: { left: 1 }, zoom: 2 })
    expect(onCropperChange).toHaveBeenCalledWith(3, { coordinates: { left: 1 } })
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

  it('starts a drag from the grip of a preview alone', () => {
    list([IMAGE, PDF])
    expect(wrapper.findComponent(draggable).attributes('handle')).toBe('.drag-grip')
    expect(wrapper.findAll('.drag-grip')).toHaveLength(2)
    expect(wrapper.find('.move-buttons').exists()).toBe(false)
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
