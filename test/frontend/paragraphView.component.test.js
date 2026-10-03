import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import ParagraphView from '@c/fields/ParagraphView.vue'
import ResourceService from '@s/ResourceService'
import FieldSelectorService from '@s/FieldSelectorService'
import { mountField } from './helpers/mountField.js'

vi.mock('@s/ResourceService', () => ({
  default: { getParagraphSchema: vi.fn(), get: vi.fn(), cache: vi.fn(async () => []), getSchema: vi.fn(() => ({})) }
}))
// the schema of a nested form is built by SchemaService from every field component: the nested form itself is stood in for
vi.mock('@s/SchemaService', () => ({
  default: { getSchemaFields: vi.fn(() => []), getNestedGroups: vi.fn(() => []) }
}))

const draggable = { props: ['list'], template: '<div class="draggable"><slot /></div>' }
const customForm = { props: ['schema', 'model', 'paragraphIndex', 'paragraphLevel'], template: '<div class="form-stub" />' }
const jsonViewer = { props: ['value'], template: '<pre class="json-viewer-stub" />' }

const PARAGRAPHS = {
  block_text: { title: 'block_text', displayname: { enUS: 'Text block' }, schema: [{ field: 'heading', input: 'string', label: 'Heading' }, { field: 'body', input: 'wysiwyg', label: 'Body' }] },
  block_media: { title: 'block_media', displayname: { enUS: 'Media block' }, schema: [{ field: 'picture', input: 'image', label: 'Picture' }] },
  block_group: { title: 'block_group', displayname: { enUS: 'Group block' }, schema: [{ field: 'name', input: 'string', label: 'Name' }] }
}

let wrapper
const paragraph = async (schema = {}, model = {}, props = {}) => {
  wrapper = mountField(ParagraphView, {
    model,
    schema: { model: 'blocks', label: 'Blocks', types: ['block_text', 'block_media'], resource: { title: 'pages' }, locale: 'enUS', userLocale: 'enUS', ...schema },
    props,
    global: { components: { draggable, CustomForm: customForm, JsonViewer: jsonViewer } },
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}
const cards = () => wrapper.findAll('.v-card.item')
const lastEmitted = () => {
  const calls = wrapper.emitted('input')
  return calls[calls.length - 1]
}

beforeEach(() => {
  ResourceService.getParagraphSchema.mockReset().mockImplementation((type) => (PARAGRAPHS[type] ? JSON.parse(JSON.stringify(PARAGRAPHS[type])) : false))
  ResourceService.get.mockReset().mockReturnValue([])
  ResourceService.cache.mockReset().mockResolvedValue([])
})
afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('ParagraphView (blocks)', () => {
  describe('the box', () => {
    it('shows the label and the hint above the box', async () => {
      await paragraph({ options: { hint: 'Mix text and media' } })
      expect(wrapper.find('.paragraph-label').text()).toContain('Blocks')
      expect(wrapper.find('.paragraph-hint').text()).toBe('Mix text and media')
    })

    it('marks a required field with a star', async () => {
      await paragraph({ required: true })
      expect(wrapper.find('.paragraph-label .required-mark').exists()).toBe(true)
    })

    it('offers the allowed types, starting with the first', async () => {
      await paragraph()
      expect(wrapper.vm.types.map((type) => type.title)).toEqual(['block_text', 'block_media'])
      expect(wrapper.vm.selectedType.title).toBe('block_text')
    })

    it('says so when a type has no schema, and leaves it out', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      await paragraph({ types: ['block_text', 'block_unknown'] })
      expect(wrapper.vm.types.map((type) => type.title)).toEqual(['block_text'])
      expect(error).toHaveBeenCalled()
    })
  })

  describe('adding and removing blocks', () => {
    it('adds a block of the chosen type with its label, and reports it with its type', async () => {
      await paragraph()
      await wrapper.get('.add-new-item').trigger('click')
      await flushPromises()
      expect(cards()).toHaveLength(1)
      expect(cards()[0].find('.paragraph-title').text()).toBe('Text block')
      expect(lastEmitted()[0]).toEqual([{ _type: 'block_text' }])
      expect(lastEmitted()[1]).toBe('blocks')
    })

    it('adds another type once it is chosen', async () => {
      await paragraph()
      wrapper.vm.selectedType = wrapper.vm.types[1]
      await wrapper.get('.add-new-item').trigger('click')
      await flushPromises()
      expect(cards()[0].find('.paragraph-title').text()).toBe('Media block')
      expect(lastEmitted()[0][0]._type).toBe('block_media')
    })

    it('shows the blocks the record already has, with their values', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'Hello' }, { _type: 'block_media' }] })
      expect(cards().map((card) => card.find('.paragraph-title').text())).toEqual(['Text block', 'Media block'])
      expect(wrapper.vm.items[0]._value.heading).toBe('Hello')
    })

    it('removes a block and reports the others', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'one' }, { _type: 'block_media' }] })
      await cards()[0].get('.remove-item').trigger('click')
      await flushPromises()
      expect(cards()).toHaveLength(1)
      expect(lastEmitted()[0].map((item) => item._type)).toEqual(['block_media'])
    })

    it('drops the files of a removed media block from the record', async () => {
      const model = {
        blocks: [{ _type: 'block_media', id: 'f1' }],
        _attachments: [{ _id: 'a1', _fields: { fileItemId: 'f1' } }, { _id: 'a2', _fields: { fileItemId: 'f2' } }]
      }
      await paragraph({}, model)
      const media = wrapper.vm.items[0]
      wrapper.vm.onClickRemoveItem({ ...media, input: 'group', id: 'f1' })
      expect(model._attachments.map((attachment) => attachment._id)).toEqual(['a2'])
    })

    it('does not add anything while no type is chosen', async () => {
      await paragraph()
      wrapper.vm.selectedType = false
      await wrapper.vm.onClickAddNewItem()
      expect(cards()).toHaveLength(0)
    })

    it('never reports a block that has no type', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      await paragraph()
      wrapper.vm.items.push({ _value: { x: 1 } })
      wrapper.vm.updateItems()
      expect(lastEmitted()[0]).toEqual([])
      expect(error).toHaveBeenCalled()
    })

    it('reports a value changed inside a block', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'one' }] })
      wrapper.vm.onModelUpdated('two', '_value.heading', 0)
      expect(lastEmitted()[0][0]).toMatchObject({ _type: 'block_text', heading: 'two' })
    })

    it('ignores a DOM event reported as a value', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text' }] })
      wrapper.vm.onModelUpdated(new Event('input'), '_value.heading', 0)
      expect(wrapper.emitted('input')).toBeUndefined()
    })
  })

  describe('limits and locking', () => {
    it('hides the add bar once maxCount is reached', async () => {
      await paragraph({ options: { maxCount: 1 } }, { blocks: [{ _type: 'block_text' }] })
      expect(wrapper.find('.paragraph-header-bar').exists()).toBe(false)
      expect(wrapper.vm.blockMoreItems()).toBe(true)
    })

    it('keeps the add bar while under maxCount', async () => {
      await paragraph({ options: { maxCount: 2 } }, { blocks: [{ _type: 'block_text' }] })
      expect(wrapper.find('.paragraph-header-bar').exists()).toBe(true)
    })

    it('has no limit by default', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text' }, { _type: 'block_text' }, { _type: 'block_text' }] })
      expect(wrapper.vm.blockMoreItems()).toBe(false)
    })

    it('cannot add or remove when disabled', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text' }] }, { disabled: true })
      expect(wrapper.find('.paragraph-header-bar').exists()).toBe(false)
      expect(cards()[0].get('.remove-item').attributes('disabled')).toBeDefined()
    })

    it('is invalid when required and empty, valid otherwise', async () => {
      await paragraph({ required: true })
      expect(wrapper.vm.validateField()).toBe(false)
      wrapper.vm.items.push({ title: 'block_text' })
      expect(wrapper.vm.validateField()).toBe(true)
      await paragraph({})
      expect(wrapper.vm.validateField()).toBe(true)
    })
  })

  describe('blocks of a type that is no longer allowed', () => {
    it('offers to convert them to the first allowed type', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await paragraph({}, { blocks: [{ _type: 'block_group', name: 'old' }] })
      expect(cards()).toHaveLength(1)
      expect(cards()[0].find('.convert-paragraph').exists()).toBe(true)
      expect(wrapper.vm.items[0].showConvert).toBe('block_text')
    })

    it('converts it on request', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await paragraph({}, { blocks: [{ _type: 'block_group', name: 'old' }] })
      wrapper.vm.convertParagraph(wrapper.vm.items[0])
      await flushPromises()
      expect(wrapper.vm.items[0].showConvert).toBeUndefined()
      // the block is rebuilt from the schema of its new type, keeping its values
      expect(wrapper.vm.items[0].title).toBe('block_text')
      expect(wrapper.vm.items[0]._value.name).toBe('old')
    })

    it('says it cannot convert when the field allows no type at all', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await paragraph({ types: [] }, { blocks: [{ _type: 'block_group' }] })
      expect(wrapper.vm.items[0].cannotConvert).toBe(true)
      expect(cards()[0].find('.error-message').text()).toContain('cannot')
    })
  })

  describe('dynamic layout', () => {
    it('gives each block a share of the row according to its slots', async () => {
      await paragraph({ options: { dynamicLayout: true } }, { blocks: [{ _type: 'block_text', slots: 6 }, { _type: 'block_text', slots: 12 }] }, {})
      expect(wrapper.vm.isDynamicLayoutContainer).toBe(true)
      const classes = cards().map((card) => card.classes())
      expect(classes[0]).toContain('dynamic-layout-item')
      expect(classes[0]).toContain('slots-6')
      expect(classes[1]).toContain('slots-12')
      expect(wrapper.vm.getItemStyles({ slots: 12 }).flexBasis).toBe('calc(100% - 0px)')
      expect(wrapper.vm.getItemStyles({ slots: 6 }).flexBasis).toContain('50%')
    })

    it('falls back to two slots when nothing says how many', async () => {
      await paragraph({ options: { dynamicLayout: true } }, { blocks: [{ _type: 'block_text' }] })
      expect(cards()[0].classes()).toContain('slots-2')
    })

    it('marks blocks of a quarter of the row or less, which tablets widen to a third', async () => {
      await paragraph({ options: { dynamicLayout: true } }, { blocks: [{ _type: 'block_text', slots: 1 }, { _type: 'block_text', slots: 3 }, { _type: 'block_text', slots: 4 }] })
      expect(cards().map((card) => card.classes().includes('slots-narrow'))).toEqual([true, true, false])
    })

    it('measures narrow blocks against the row, not against 12', async () => {
      await paragraph({ options: { dynamicLayout: true } }, { slots: 6, blocks: [{ _type: 'block_text', slots: 1 }, { _type: 'block_text', slots: 2 }] })
      expect(wrapper.vm.parentSlots).toBe(6)
      expect(cards().map((card) => card.classes().includes('slots-narrow'))).toEqual([true, false])
    })

    it('widens narrow blocks on tablets by class: the inline width is never matched as text', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/fields/ParagraphView.vue'), 'utf8')
      const tablet = source.slice(source.indexOf('@media (max-width: 1024px) and (min-width: 769px)'))
      expect(tablet).toContain('&.slots-narrow')
      expect(source).not.toMatch(/\[style\*=/)
    })

    it('shows no width badge on the blocks: the arrangement is the information', async () => {
      await paragraph({ options: { dynamicLayout: true } }, { blocks: [{ _type: 'block_text', slots: 3 }, { _type: 'block_text' }] })
      expect(wrapper.find('.slots-badge').exists()).toBe(false)
      expect(wrapper.text()).not.toMatch(/\d+\/\d+/)
      expect(cards()[0].attributes('data-index')).toBeUndefined()
    })

    it('is a plain list otherwise', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text' }] })
      expect(wrapper.vm.isDynamicLayoutContainer).toBe(false)
      expect(wrapper.vm.getItemStyles({ slots: 6 })).toEqual({})
    })
  })

  describe('adding files', () => {
    const mapping = {
      'jpg, png': { _type: 'block_media', field: 'picture' },
      '.pdf': { _type: 'block_text', field: 'body' },
      default: { _type: 'block_text', field: 'body' }
    }

    it('offers adding several files only when the field maps file types', async () => {
      await paragraph()
      expect(wrapper.find('.add-multiple-items').exists()).toBe(false)
      await paragraph({ options: { mapping } })
      expect(wrapper.find('.add-multiple-items').exists()).toBe(true)
    })

    it('lists the accepted extensions, each with its dot, lower case', async () => {
      await paragraph({ options: { mapping } })
      expect(wrapper.vm.getAllAcceptedTypes()).toBe('.jpg,.png,.pdf')
      expect(wrapper.vm.getSupportedExtensions()).toBe('.jpg, .png, .pdf')
    })

    it('maps each extension to the block type that takes it', async () => {
      await paragraph({ options: { mapping } })
      expect(wrapper.vm.fileImageTypesMap['.png']).toEqual([{ type: 'block_media', field: 'picture' }])
      expect(wrapper.vm.fileImageTypesMap['.pdf'][0].type).toBe('block_text')
    })

    it('shows the drop zone when asked, and hides it again', async () => {
      await paragraph({ options: { mapping } })
      await wrapper.get('.add-multiple-items').trigger('click')
      expect(wrapper.find('.multiple-drop-zone').exists()).toBe(true)
      await wrapper.get('.add-multiple-items').trigger('click')
      expect(wrapper.find('.multiple-drop-zone').exists()).toBe(false)
    })

    it('tells the parent when no block type takes a file, and adds nothing', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      await paragraph({ options: { mapping: { 'jpg': mapping['jpg, png'] } } })
      await wrapper.vm.processSingleFile({ name: 'notes.txt' })
      expect(wrapper.emitted('notify')[0][0]).toContain('.txt')
      expect(cards()).toHaveLength(0)
    })

    it('tells the parent when the mapped block type is not one of the field types', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      await paragraph({ options: { mapping: { jpg: { _type: 'block_missing', field: 'picture' } } } })
      await wrapper.vm.processSingleFile({ name: 'photo.jpg' })
      expect(wrapper.emitted('notify')[0][0]).toContain('block_missing')
    })
  })

  describe('highlighting', () => {
    it('marks the block the outline points at, and dims the others', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text' }, { _type: 'block_media' }] }, { paragraphLevel: 1 })
      FieldSelectorService.events.emit('highlight-paragraph', 1, 1)
      await flushPromises()
      expect(cards()[1].classes()).toContain('highlighted')
      expect(cards()[0].classes()).toContain('not-highlighted')
    })

    it('stops listening when it goes away', async () => {
      await paragraph()
      wrapper.unmount()
      expect(() => FieldSelectorService.events.emit('highlight-paragraph', 1, 0)).not.toThrow()
      wrapper = undefined
    })
  })

  it('numbers its nesting level from zero for the first level', async () => {
    await paragraph({}, {}, { paragraphLevel: 1 })
    expect(wrapper.vm.getParagraphLevel()).toBe(0)
    await paragraph({}, {}, { paragraphLevel: 3 })
    expect(wrapper.vm.getParagraphLevel()).toBe(2)
  })
})
