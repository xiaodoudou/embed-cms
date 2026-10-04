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
