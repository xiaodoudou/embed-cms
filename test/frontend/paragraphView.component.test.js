import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import ParagraphView from '@c/fields/ParagraphView.vue'
import ResourceService from '@s/ResourceService'
import FieldSelectorService from '@s/FieldSelectorService'
import { mountField } from './helpers/mountField.js'
import { takeFiles } from '@u/pendingFiles'

vi.mock('@s/ResourceService', () => ({
  default: { getParagraphSchema: vi.fn(), get: vi.fn(), cache: vi.fn(async () => []), getSchema: vi.fn(() => ({})) }
}))
// the schema of a nested form is built by SchemaService from every field component: the nested form itself is stood in for
vi.mock('@s/SchemaService', () => ({
  default: { getSchemaFields: vi.fn(() => []), getNestedGroups: vi.fn(() => []) }
}))

const draggable = { props: ['list'], template: '<div class="draggable"><slot /></div>' }
const customForm = { props: ['schema', 'model', 'paragraphIndex', 'paragraphLevel', 'formId'], template: '<div class="form-stub" />' }
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

    it('gives the form of every block an id of its own, so the fields of two blocks (or of two paragraph fields) never share one', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'a' }, { _type: 'block_text', heading: 'b' }] })
      const ids = wrapper.findAllComponents(customForm).map((form) => form.props('formId'))
      expect(ids).toHaveLength(2)
      expect(new Set(ids).size).toBe(2)
      wrapper.unmount()
      await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'c' }] })
      expect(ids).not.toContain(wrapper.findComponent(customForm).props('formId'))
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

    it('starts a drag from the grip alone, not from the whole title bar', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'one' }, { _type: 'block_media' }] })
      expect(cards()[0].find('.drag-grip').exists()).toBe(true)
      expect(wrapper.findComponent(draggable).attributes('handle')).toBe('.drag-grip')
    })

    it('puts each list of blocks in a group of its own, so a block cannot be dragged into another paragraph field', async () => {
      const blocks = [{ _type: 'block_text', heading: 'a' }, { _type: 'block_text', heading: 'b' }]
      await paragraph({ model: 'one' }, { one: blocks })
      const first = wrapper.findComponent(draggable).attributes('group')
      wrapper.unmount()
      await paragraph({ model: 'two' }, { two: blocks })
      const second = wrapper.findComponent(draggable).attributes('group')
      wrapper.unmount()
      await paragraph({ model: 'one' }, { one: blocks })
      const again = wrapper.findComponent(draggable).attributes('group')
      expect(first).toContain('one')
      expect(second).toContain('two')
      expect(new Set([first, second, again]).size).toBe(3)
    })

    it('hands the press on a grip and the end of a drag to the page and to the list: text is not selected on the way, the blocks are written back after the drop', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'a' }, { _type: 'block_text', heading: 'b' }] })
      const list = wrapper.findComponent(draggable)
      list.vm.$emit('choose', {})
      expect(document.body.classList.contains('cms-dragging')).toBe(true)
      list.vm.$emit('start', {})
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.paragraph-view').classes()).toContain('is-dragging')
      list.vm.$emit('end', { newIndex: 0 })
      list.vm.$emit('unchoose', {})
      await wrapper.vm.$nextTick()
      expect(document.body.classList.contains('cms-dragging')).toBe(false)
      expect(wrapper.find('.paragraph-view').classes()).not.toContain('is-dragging')
      expect(lastEmitted()[0].map((item) => item.heading)).toEqual(['a', 'b'])
    })

    it('drags a block to another place and writes the blocks in the new order', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'a' }, { _type: 'block_text', heading: 'b' }, { _type: 'block_text', heading: 'c' }] })
      // the library reorders the list it is given, then says the drag ended
      const moved = wrapper.vm.items.splice(0, 1)[0]
      wrapper.vm.items.splice(2, 0, moved)
      wrapper.findComponent(draggable).vm.$emit('end', { newIndex: 2 })
      await flushPromises()
      expect(lastEmitted()[0].map((item) => item.heading)).toEqual(['b', 'c', 'a'])
      expect(lastEmitted()[1]).toBe('blocks')
    })

    describe('what happens to the forms of the blocks when the blocks move', () => {
      const blocks = () => [{ _type: 'block_text', heading: 'a' }, { _type: 'block_text', heading: 'b' }, { _type: 'block_text', heading: 'c' }]
      const instances = () => wrapper.findAllComponents(customForm).map((form) => form.vm.$.uid)
      const headings = () => wrapper.findAllComponents(customForm).map((form) => form.props('model')._value.heading)

      it('moves the form of a block with it when it is moved with the buttons, instead of making every form again (the editors and the pictures would flash)', async () => {
        await paragraph({}, { blocks: blocks() })
        await wrapper.get('.reorder-toggle').trigger('click')
        const before = instances()
        await cards()[0].get('.move-down').trigger('click')
        await flushPromises()
        expect(headings()).toEqual(['b', 'a', 'c'])
        expect(instances()).toEqual([before[1], before[0], before[2]])
      })

      it('moves the forms the same way after a drag', async () => {
        await paragraph({}, { blocks: blocks() })
        const before = instances()
        const moved = wrapper.vm.items.splice(0, 1)[0]
        wrapper.vm.items.splice(2, 0, moved)
        wrapper.findComponent(draggable).vm.$emit('end', { newIndex: 2 })
        await flushPromises()
        expect(headings()).toEqual(['b', 'c', 'a'])
        expect(instances()).toEqual([before[1], before[2], before[0]])
      })

      it('leaves the forms of the other blocks as they are when a block is removed', async () => {
        await paragraph({}, { blocks: blocks() })
        const before = instances()
        await cards()[1].get('.remove-item').trigger('click')
        await flushPromises()
        expect(headings()).toEqual(['a', 'c'])
        expect(instances()).toEqual([before[0], before[2]])
      })

      it('shows each form with the block it belongs to, and the new position of the block, after a move', async () => {
        await paragraph({}, { blocks: blocks() })
        await wrapper.get('.reorder-toggle').trigger('click')
        await cards()[2].get('.move-up').trigger('click')
        await flushPromises()
        expect(wrapper.findAllComponents(customForm).map((form) => [form.props('model')._value.heading, form.props('paragraphIndex')])).toEqual([['a', 0], ['c', 1], ['b', 2]])
        expect(cards().map((card) => card.attributes('data-block-index'))).toEqual(['0', '1', '2'])
      })
    })

    it('scrolls the form by what the dropped block moved, so that it stays where it was dropped when the blocks unfold', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'a' }, { _type: 'block_text', heading: 'b' }] })
      const scroller = document.createElement('div')
      scroller.className = 'scroll-wrapper'
      wrapper.element.parentNode.insertBefore(scroller, wrapper.element)
      scroller.appendChild(wrapper.element)
      scroller.scrollTop = 50
      const item = document.createElement('div')
      document.body.appendChild(item)
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
        // folded, the dropped block was at 400; unfolded, it is at 700
        return { top: this === item ? 400 : (this.hasAttribute && this.hasAttribute('data-block-index') ? 700 : 0) }
      })
      wrapper.vm.onEndDrag({ item, newIndex: 1 })
      await flushPromises()
      expect(scroller.scrollTop).toBe(350)
    })

    it('does not scroll when the dropped block is not where it can be measured (the drag ended without an event)', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'a' }, { _type: 'block_text', heading: 'b' }] })
      const scroller = document.createElement('div')
      scroller.className = 'scroll-wrapper'
      wrapper.element.parentNode.insertBefore(scroller, wrapper.element)
      scroller.appendChild(wrapper.element)
      scroller.scrollTop = 50
      wrapper.vm.onEndDrag()
      await flushPromises()
      expect(scroller.scrollTop).toBe(50)
    })

    it('has no grip with a single block: there is nothing to put in order', async () => {
      await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'only' }] })
      expect(wrapper.find('.drag-grip').exists()).toBe(false)
      expect(wrapper.find('.reorder-toggle').exists()).toBe(false)
      expect(wrapper.find('.paragraph-header').classes()).toContain('no-grip')
      wrapper.unmount()
      await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'a' }, { _type: 'block_text', heading: 'b' }] })
      expect(wrapper.findAll('.drag-grip')).toHaveLength(2)
      expect(wrapper.find('.paragraph-header').classes()).not.toContain('no-grip')
    })

    it('has no grip, and no way to reorder, on a field that is locked', async () => {
      await paragraph({ disabled: true }, { blocks: [{ _type: 'block_text', heading: 'one' }, { _type: 'block_text', heading: 'two' }] })
      expect(wrapper.find('.drag-grip').exists()).toBe(false)
      expect(wrapper.find('.reorder-toggle').exists()).toBe(false)
    })

    describe('the compact list to reorder', () => {
      const three = [{ _type: 'block_text', heading: 'one' }, { _type: 'block_text', heading: 'two' }, { _type: 'block_text', heading: 'three' }]

      it('is offered with two blocks or more, and folds every block to its title bar, with the start of its first text', async () => {
        await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'only' }] })
        expect(wrapper.find('.reorder-toggle').exists()).toBe(false)
        wrapper.unmount()
        await paragraph({}, { blocks: three })
        expect(wrapper.find('.paragraph-view').classes()).not.toContain('is-reordering')
        expect(wrapper.find('.move-up').exists()).toBe(false)
        await wrapper.get('.reorder-toggle').trigger('click')
        expect(wrapper.find('.paragraph-view').classes()).toContain('is-reordering')
        expect(wrapper.get('.reorder-toggle').attributes('aria-pressed')).toBe('true')
        expect(wrapper.findAll('.paragraph-summary').map((el) => el.text())).toEqual(['one', 'two', 'three'])
        await wrapper.get('.reorder-toggle').trigger('click')
        expect(wrapper.find('.paragraph-view').classes()).not.toContain('is-reordering')
      })

      it('writes the start of the first text as it is, markup and runs of spaces apart', async () => {
        await paragraph({}, { blocks: [{ _type: 'block_text', heading: 'First' }, { _type: 'block_text', heading: '<b>Second</b>   block\n of  text' }, { _type: 'block_text', heading: 'x'.repeat(100) }] })
        await wrapper.get('.reorder-toggle').trigger('click')
        const summaries = wrapper.findAll('.paragraph-summary').map((el) => el.text())
        expect(summaries[0]).toBe('First')
        expect(summaries[1]).toBe('Second block of text')
        expect(summaries[2]).toHaveLength(60)
      })

      it('moves a block down and up with the buttons, reports the new order, and cannot go past the ends', async () => {
        await paragraph({}, { blocks: three })
        await wrapper.get('.reorder-toggle').trigger('click')
        expect(cards()[0].get('.move-up').attributes('disabled')).toBeDefined()
        expect(cards()[2].get('.move-down').attributes('disabled')).toBeDefined()
        await cards()[0].get('.move-down').trigger('click')
        await flushPromises()
        expect(lastEmitted()[0].map((item) => item.heading)).toEqual(['two', 'one', 'three'])
        expect(lastEmitted()[1]).toBe('blocks')
        await cards()[2].get('.move-up').trigger('click')
        await flushPromises()
        expect(lastEmitted()[0].map((item) => item.heading)).toEqual(['two', 'three', 'one'])
        wrapper.vm.moveItem(0, -1)
        wrapper.vm.moveItem(2, 1)
        expect(lastEmitted()[0].map((item) => item.heading)).toEqual(['two', 'three', 'one'])
      })

      it('tells a screen reader where the block went', async () => {
        await paragraph({}, { blocks: three })
        await wrapper.get('.reorder-toggle').trigger('click')
        await cards()[0].get('.move-down').trigger('click')
        await flushPromises()
        expect(wrapper.get('[role=status]').text()).toBe('Text block one moved to position 2 of 3')
      })

      it('keeps the list as long as it was, and gives it the space the blocks above the lifted one lose, so the lifted block stays under the pointer', async () => {
        await paragraph({}, { blocks: three })
        // a layout engine measures: the lifted block is at 500 px before the others fold, and at 100 after
        const tops = [500, 100]
        const item = { getBoundingClientRect: () => ({ top: tops.length > 1 ? tops.shift() : tops[0] }) }
        const content = wrapper.find('.paragraph-content').element
        wrapper.vm.onBlockDragStart({ item })
        expect(content.style.minHeight).not.toBe('')
        expect(content.style.paddingTop).toBe('400px')
        expect(wrapper.find('.paragraph-view').classes()).toContain('is-dragging')
        wrapper.vm.onEndDrag({ item: { isConnected: false }, newIndex: 1 })
        expect(content.style.minHeight).toBe('')
        expect(content.style.paddingTop).toBe('')
      })

      it('adds no space when the blocks above lose nothing (the first block is lifted)', async () => {
        await paragraph({}, { blocks: three })
        const item = { getBoundingClientRect: () => ({ top: 300 }) }
        wrapper.vm.onBlockDragStart({ item })
        expect(wrapper.find('.paragraph-content').element.style.paddingTop).toBe('')
      })

      it('folds the other blocks while one is carried, and unfolds them when it is dropped', async () => {
        await paragraph({}, { blocks: three })
        wrapper.vm.onBlockDragStart()
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.paragraph-view').classes()).toContain('is-dragging')
        wrapper.vm.onEndDrag()
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.paragraph-view').classes()).not.toContain('is-dragging')
      })
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

    it('drops the files of a removed crop image field from the record, as it does for an image', async () => {
      for (const input of ['image', 'cropimage', 'file']) {
        const model = {
          blocks: [{ _type: 'block_media', id: 'f1' }],
          _attachments: [{ _id: 'a1', _fields: { fileItemId: 'f1' } }, { _id: 'a2', _fields: { fileItemId: 'f2' } }]
        }
        await paragraph({}, model)
        wrapper.vm.onClickRemoveItem({ ...wrapper.vm.items[0], input, id: 'f1' })
        expect(model._attachments.map((attachment) => attachment._id), input).toEqual(['a2'])
        wrapper.unmount()
      }
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

describe('ParagraphView: a dropped file reaches the file field of its block', () => {
  const mapping = { jpg: { _type: 'block_media', field: 'picture' } }
  // a form whose file field takes what waits for it, as the real one does when it mounts (test/frontend/fileFields.component.test.js)
  const taken = []
  const takingForm = {
    props: ['schema', 'model', 'paragraphIndex', 'paragraphLevel'],
    template: '<div class="form-stub" />',
    mounted () {
      taken.push(...takeFiles(`blocks[${this.paragraphIndex}].picture`))
    }
  }

  it('makes the block and hands the file to its field, under the key the field gets', async () => {
    taken.length = 0
    wrapper = mountField(ParagraphView, {
      model: {},
      schema: { model: 'blocks', label: 'Blocks', types: ['block_text', 'block_media'], resource: { title: 'pages' }, locale: 'enUS', userLocale: 'enUS', options: { mapping } },
      global: { components: { draggable, CustomForm: takingForm, JsonViewer: jsonViewer } },
      attachTo: document.body
    })
    await flushPromises()
    const file = new File(['x'], 'photo.jpg')
    await wrapper.vm.processSingleFile(file)
    await flushPromises()
    expect(cards()).toHaveLength(1)
    expect(lastEmitted()[0][0]._type).toBe('block_media')
    expect(taken).toEqual([file])
    expect(wrapper.emitted('notify')).toBeUndefined()
  })

  it('tells the parent when the block shows no such field, and keeps no file waiting', async () => {
    await paragraph({ options: { mapping } })
    await wrapper.vm.processSingleFile(new File(['x'], 'photo.jpg'))
    await flushPromises()
    expect(cards()).toHaveLength(1)
    expect(wrapper.emitted('notify')[0][0]).toContain('picture')
    expect(takeFiles('blocks[0].picture')).toEqual([])
  })
})
