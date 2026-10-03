import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import ImageView from '@c/fields/ImageView.vue'
import AttachmentView from '@c/fields/AttachmentView.vue'
import { mountField } from './helpers/mountField.js'

// The image field and the file field share their rules and their upload handling (src/mixins/FileInputField.js): one set of
// tests runs against both, then what only the image field does.

const draggable = { props: ['list'], template: '<div class="draggable"><slot /></div>' }
const Cropper = { name: 'Cropper', template: '<div class="cropper-stub" />' }

const file = (name, type, size = 10) => new File([new Uint8Array(size)], name, { type })
const png = (name = 'a.png') => file(name, 'image/png')
const SAVED = { _id: 'a1', _filename: 'lamp.jpg', url: '/api/products/1/attachments/a1', _contentType: 'image/jpeg', _size: 2048 }

let wrapper
const field = (component, schema = {}, model = {}, props = {}) => {
  wrapper = mountField(component, {
    model,
    schema: { model: 'photo', label: 'Photo', type: component === ImageView ? 'ImageView' : 'AttachmentView', ...schema },
    props,
    global: { components: { draggable }, stubs: { Cropper } },
    attachTo: document.body
  })
  return wrapper
}
const upload = async (files) => {
  await wrapper.vm.onUploadChanged(files)
  await flushPromises()
}
// what a browser does when a person picks files in the box: the files are put on the input, then it says it changed
const choose = async (files) => {
  const input = wrapper.get('input[type=file]').element
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 30))
  await flushPromises()
}
const previews = () => wrapper.findAll('.preview-attachment')

afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe.each([
  ['ImageView', ImageView, 'IMAGE', 'image'],
  ['AttachmentView', AttachmentView, 'FILE', 'file']
])('%s (the upload rules)', (name, component, kind, noun) => {
  describe('the box', () => {
    it('shows the label, the required mark and what the field requires', () => {
      field(component, { required: true, options: { hint: 'One picture' } })
      expect(wrapper.find('.field-label').text()).toContain('Photo')
      expect(wrapper.find('.required-mark').exists()).toBe(true)
      expect(wrapper.find('.file-input-errors').text()).toContain('One picture')
    })

    it('invites to add one file when it takes one, several when it takes any number', () => {
      field(component, { options: { maxCount: 1 } })
      expect(wrapper.vm.getPlaceholder()).toBe(`Click or drag & drop to add ${noun}`)
      wrapper.unmount()
      field(component)
      expect(wrapper.vm.getPlaceholder()).toBe(`Click or drag & drop to add ${noun}s`)
    })

    it('takes several files unless it has a maximum of one or a fixed size', () => {
      field(component)
      expect(wrapper.vm.isForMultipleImages()).toBe(true)
      wrapper.unmount()
      field(component, { options: { maxCount: 1 } })
      expect(wrapper.vm.isForMultipleImages()).toBe(false)
      wrapper.unmount()
      field(component, { width: 800, height: 600 })
      expect(wrapper.vm.isForMultipleImages()).toBe(false)
      wrapper.unmount()
      field(component, { options: { maxCount: 3 } })
      expect(wrapper.vm.isForMultipleImages()).toBe(true)
    })
  })

  describe('what is already saved', () => {
    it('shows a preview for each saved file', async () => {
      field(component, {}, { photo: [SAVED, { ...SAVED, _id: 'a2', _filename: 'mug.png' }] })
      await flushPromises()
      expect(previews()).toHaveLength(2)
      expect(previews()[0].text()).toContain('lamp.jpg')
    })

    it('shows the upload box while the field has room, and hides it when it is full or locked', async () => {
      field(component, { options: { maxCount: 1 } }, { photo: [SAVED] })
      await flushPromises()
      expect(wrapper.find('.file-input-card').exists()).toBe(false)
      wrapper.unmount()
      field(component, { options: { maxCount: 2 } }, { photo: [SAVED] })
      await flushPromises()
      expect(wrapper.find('.file-input-card').exists()).toBe(true)
      wrapper.unmount()
      field(component, { readonly: true }, { photo: [SAVED] })
      await flushPromises()
      expect(wrapper.find('.file-input-card').exists()).toBe(false)
    })

    it('keeps the files of a locked field, without a way to remove them', async () => {
      field(component, { disabled: true }, { photo: [SAVED] })
      await flushPromises()
      expect(previews()).toHaveLength(1)
      expect(wrapper.findComponent({ name: 'VChip' }).props('closable')).toBe(false)
    })
  })

  describe('adding files', () => {
    it('reads a chosen file into the field, with what the server needs to store it', async () => {
      const model = {}
      field(component, {}, model)
      await upload([png('new.png')])
      expect(model.photo).toHaveLength(1)
      const added = model.photo[0]
      expect(added).toMatchObject({ _isAttachment: true, _filename: 'new.png', field: 'photo' })
      expect(added.file).toBeInstanceOf(File)
      expect(added.data).toMatch(/^data:image\/png;base64,/)
    })

    it('adds to the files already there, and numbers them for the order', async () => {
      const model = { photo: [SAVED] }
      field(component, {}, model)
      await flushPromises()
      await upload([png('one.png'), png('two.png')])
      expect(model.photo.map((item) => item._filename)).toEqual(['lamp.jpg', 'one.png', 'two.png'])
      expect(model.photo.map((item) => item.order)).toEqual([1, 2, 3])
      expect(model.photo.every((item) => item.orderUpdated)).toBe(true)
    })

    it('keeps the language of a field that has one per locale', async () => {
      const model = {}
      field(component, { localised: true, locale: 'zhCN', model: 'photo.zhCN', originalModel: 'photo' }, model)
      await upload([png()])
      expect(model.photo.zhCN[0]._fields).toEqual({ locale: 'zhCN' })
    })

    it('takes only as many files as the field has room for', async () => {
      const model = {}
      field(component, { options: { maxCount: 2 } }, model)
      await upload([png('1.png'), png('2.png'), png('3.png')])
      expect(model.photo.map((item) => item._filename)).toEqual(['1.png', '2.png'])
    })

    it('takes one file only when the field has a fixed size', async () => {
      const model = {}
      field(component, { width: 100, height: 100 }, model)
      await upload([png('1.png'), png('2.png')])
      expect(model.photo).toHaveLength(1)
    })

    it('ignores an empty choice', async () => {
      const model = {}
      field(component, {}, model)
      await upload([])
      await upload(null)
      expect(model.photo).toBeUndefined()
    })

    it('accepts a single file that is not in a list', async () => {
      const model = {}
      field(component, {}, model)
      await upload(png('alone.png'))
      expect(model.photo.map((item) => item._filename)).toEqual(['alone.png'])
    })

    it('takes the last file when several are dropped on a field that takes one', async () => {
      const model = {}
      field(component, { options: { maxCount: 1 } }, model)
      wrapper.vm.onDrop({ dataTransfer: { files: [png('first.png'), png('last.png')] } })
      await flushPromises()
      await vi.waitFor(() => expect(model.photo).toBeTruthy())
      expect(model.photo.map((item) => item._filename)).toEqual(['last.png'])
    })

    it('adds every file dropped on a field that takes several', async () => {
      const model = {}
      field(component, {}, model)
      wrapper.vm.onDrop({ dataTransfer: { files: [png('a.png'), png('b.png')] } })
      await vi.waitFor(() => expect(model.photo).toHaveLength(2))
      expect(wrapper.vm.dragover).toBe(false)
    })
  })

  describe('refusing files', () => {
    it('refuses a file that is too big, and says so', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const model = {}
      field(component, { options: { limit: 100 } }, model)
      await choose([file('big.png', 'image/png', 500)])
      expect(model.photo).toBeUndefined()
      expect(error).toHaveBeenCalled()
      expect(wrapper.vm.getRules().length).toBeGreaterThan(0)
      const message = wrapper.vm.getRules().map((rule) => rule([file('big.png', 'image/png', 500)])).find((result) => result !== true)
      expect(message).toBe(`${kind[0]}${kind.slice(1).toLowerCase()} is too big`)
    })

    it('accepts a file within the size limit', () => {
      field(component, { options: { limit: 100 } })
      expect(wrapper.vm.getRules().every((rule) => rule([file('ok.png', 'image/png', 50)]) === true)).toBe(true)
    })

    it.each([
      ['an extension, whatever its case', '.png', 'photo.PNG', 'image/png', true],
      ['an extension', '.png', 'photo.jpg', 'image/jpeg', false],
      ['a group of types', 'image/*', 'photo.jpg', 'image/jpeg', true],
      ['a group of types, refused', 'image/*', 'notes.pdf', 'application/pdf', false],
      ['an exact type', 'application/pdf', 'manual.pdf', 'application/pdf', true],
      ['an exact type, refused', 'application/pdf', 'photo.png', 'image/png', false],
      ['several accepted types', '.png, .svg, application/pdf', 'logo.svg', 'image/svg+xml', true]
    ])('checks the type of a file against %s', (label, accept, fileName, type, accepted) => {
      field(component, { options: { accept } })
      const results = wrapper.vm.getRules().map((rule) => rule([file(fileName, type)]))
      expect(results.every((result) => result === true)).toBe(accepted)
    })

    it('refuses to read files that do not meet the rules, and keeps what it had', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const model = { photo: [SAVED] }
      field(component, { options: { accept: '.png' } }, model)
      await flushPromises()
      await choose([file('notes.pdf', 'application/pdf')])
      expect(model.photo).toHaveLength(1)
    })

    it('reads files that meet the rules, when they are chosen in the box', async () => {
      const model = {}
      field(component, { options: { accept: '.png', limit: 100 } }, model)
      await choose([file('ok.png', 'image/png', 50)])
      expect(model.photo.map((item) => item._filename)).toEqual(['ok.png'])
    })

    it('has no rule when the field has no requirement', () => {
      field(component, { options: { maxCount: 1 } })
      expect(wrapper.vm.getRules()).toEqual([])
    })
  })

  describe('a required field', () => {
    it('asks for a file while it has none, in the words of its kind', () => {
      field(component, { required: true })
      const rule = wrapper.vm.getRules()[0]
      expect(rule([])).toBe(`${kind[0]}${kind.slice(1).toLowerCase()} is mandatory`)
      expect(rule(undefined)).toContain('mandatory')
    })

    it('is satisfied by a file that was just chosen', () => {
      field(component, { required: true })
      expect(wrapper.vm.getRules()[0](png())).toBe(true)
    })

    it('is satisfied by a file that is already saved', async () => {
      field(component, { required: true }, { photo: [SAVED] })
      await flushPromises()
      expect(wrapper.vm.getRules()[0]([])).toBe(true)
    })
  })

  describe('removing and ordering', () => {
    it('removes the file at a position and reports the others', async () => {
      const model = { photo: [SAVED, { ...SAVED, _id: 'a2', _filename: 'mug.png' }] }
      field(component, {}, model)
      await flushPromises()
      wrapper.vm.removeImage(model.photo[0], 0)
      await flushPromises()
      expect(model.photo.map((item) => item._id)).toEqual(['a2'])
    })

    it('renumbers the files after one is dragged to another place', async () => {
      const model = { photo: [{ ...SAVED, order: 2 }, { ...SAVED, _id: 'a2', order: 1 }] }
      field(component, {}, model)
      await flushPromises()
      wrapper.vm.onEndDrag()
      expect(model.photo.map((item) => item.order)).toEqual([1, 2])
      expect(model.photo.every((item) => item.orderUpdated)).toBe(true)
    })

    it('leaves the files that are already in place alone', async () => {
      const model = { photo: [{ ...SAVED, order: 1 }, { ...SAVED, _id: 'a2', order: 2 }] }
      field(component, {}, model)
      await flushPromises()
      wrapper.vm.onEndDrag()
      expect(model.photo.some((item) => item.orderUpdated)).toBe(false)
    })
  })

  describe('telling an image from another file', () => {
    it('knows an image by its name, or by the type the server stored', async () => {
      field(component)
      expect(wrapper.vm.isImage({ _filename: 'a.jpg' })).toBe(true)
      expect(wrapper.vm.isImage({ _filename: 'blob', _contentType: 'image/webp' })).toBe(true)
      expect(wrapper.vm.isImage({ _filename: 'manual.pdf', _contentType: 'application/pdf' })).toBe(false)
      expect(wrapper.vm.isImage({ _filename: 'blob', file: { type: 'image/gif' } })).toBe(true)
    })

    it('shows a picture from its data when it was just chosen, or from the server resized', () => {
      field(component)
      expect(wrapper.vm.getImageSrc({ data: 'data:image/png;base64,AA', url: '/x' })).toBe('data:image/png;base64,AA')
      expect(wrapper.vm.getImageSrc({ url: '/api/p/1/attachments/a1' })).toBe('/api/p/1/attachments/a1?resize=autox100')
    })

    it('does not resize an SVG', () => {
      field(component)
      expect(wrapper.vm.getImageSrc({ url: '/x.svg', _contentType: 'image/svg+xml' })).toBe('/x.svg')
    })

    it('writes the size of a file for people', () => {
      field(component)
      expect(wrapper.vm.imageSize({ _size: 2048 })).toBe('2 KB')
      expect(wrapper.vm.imageSize({ file: { size: 1048576 } })).toBe('1 MB')
    })
  })
})

describe('what only the image field does', () => {
  it('shows a file of an unknown kind as an image, since an image field holds images', () => {
    field(ImageView)
    expect(wrapper.vm.isImage({ _filename: 'blob' })).toBe(true)
  })

  it('does not take such a file for an image in the file field', () => {
    field(AttachmentView)
    expect(wrapper.vm.isImage({ _filename: 'blob' })).toBe(false)
  })

  it('keeps the crop made on a picture, by its position', async () => {
    const model = { photo: [SAVED, { ...SAVED, _id: 'a2' }] }
    field(ImageView, { crop: { width: 100, height: 100 } }, model)
    await flushPromises()
    wrapper.vm.onCropperChange(1, { coordinates: { left: 5, top: 6, width: 100, height: 100 } })
    expect(model.photo[1].cropOptions).toEqual({ data: { coordinates: { left: 5, top: 6, width: 100, height: 100 } }, updated: true })
    expect(model.photo[0].cropOptions).toBeUndefined()
  })
})

describe('files dropped on the paragraph field of the block', () => {
  // the paragraph field queues the file under the paragraphKey of the field (see ParagraphView); the field takes it when it mounts
  it('takes the files waiting under its paragraphKey when it mounts, as if they were dropped on it', async () => {
    const { queueFiles } = await import('@u/pendingFiles')
    queueFiles('blocks[0].picture', [png('dropped.png')])
    field(ImageView, { paragraphKey: 'blocks[0].picture', model: '_value.picture' })
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 30))
    await flushPromises()
    expect(wrapper.vm.attachments.map((a) => a._filename)).toEqual(['dropped.png'])
    expect(previews()).toHaveLength(1)
  })

  it('leaves the files of another field alone', async () => {
    const { queueFiles, takeFiles } = await import('@u/pendingFiles')
    queueFiles('blocks[1].picture', [png('other.png')])
    field(ImageView, { paragraphKey: 'blocks[0].picture', model: '_value.picture' })
    await flushPromises()
    expect(wrapper.vm.attachments).toEqual([])
    expect(takeFiles('blocks[1].picture')).toHaveLength(1)
  })
})

describe('a required field that has nothing yet', () => {
  // the rules run against the files that arrive, not against the box (which only knows the files picked in it)
  it('takes the files dropped on it', async () => {
    const model = {}
    field(ImageView, { required: true }, model)
    wrapper.vm.onDrop({ dataTransfer: { files: [png('first.png')] } })
    await vi.waitFor(() => expect(model.photo).toHaveLength(1))
  })

  it('takes the file handed over by the paragraph field', async () => {
    const { queueFiles } = await import('@u/pendingFiles')
    queueFiles('blocks[3].picture', [png('handed.png')])
    field(ImageView, { required: true, paragraphKey: 'blocks[3].picture', model: '_value.picture' })
    await vi.waitFor(() => expect(wrapper.vm.attachments.map((a) => a._filename)).toEqual(['handed.png']))
  })
})
