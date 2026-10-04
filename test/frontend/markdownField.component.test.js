import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import MarkdownField from '@c/fields/MarkdownField.vue'
import { mountField, TranslateService } from './helpers/mountField.js'

// The markdown field: a box to write in, a toolbar that writes the signs, and a preview.

let wrapper
const mount = (schema = {}, model = {}) => {
  wrapper = mountField(MarkdownField, { model, schema: { model: 'body', label: 'Body', input: 'markdown', ...schema }, attachTo: document.body })
  return wrapper
}
const area = () => wrapper.get('textarea')
const tab = (name) => wrapper.get(`[role=tab][id$="-tab-${name}"]`)
const preview = () => wrapper.get('.markdown-preview')
const shown = (element) => element.element.style.display !== 'none'
const write = async (text) => {
  area().element.value = text
  await area().trigger('input')
  await flushPromises()
}
const select = (start, end = start) => {
  area().element.focus()
  area().element.setSelectionRange(start, end)
}
const press = async (name, options = {}) => {
  await area().trigger('keydown', { key: name, ...options })
  await flushPromises()
}
const click = async (tool) => {
  await wrapper.get(`.markdown-${tool}`).trigger('click')
  await flushPromises()
}

afterEach(() => wrapper?.unmount())

describe('MarkdownField', () => {
  describe('what it shows', () => {
    it('has the label, the box with its text, a toolbar, two tabs and the hint', () => {
      mount({ options: { hint: 'Write in Markdown' } }, { body: '# Title' })
      expect(wrapper.text()).toContain('Body')
      expect(area().element.value).toBe('# Title')
      expect(wrapper.findAll('.markdown-toolbar button')).toHaveLength(9)
      expect(wrapper.findAll('[role=tab]').map(one => one.text())).toEqual(['Write', 'Preview'])
      expect(wrapper.get('.help-block').text()).toBe('Write in Markdown')
    })

    it('has a real label that is for the box, and names its buttons', () => {
      mount()
      const id = area().attributes('id')
      expect(wrapper.get(`label[for="${id}"]`).text()).toContain('Body')
      expect(wrapper.get('[role=toolbar]').attributes('aria-label')).toBe('Formatting')
      expect(wrapper.findAll('.markdown-toolbar button').map(button => button.attributes('aria-label'))).toEqual(['Bold', 'Italic', 'Strikethrough', 'Heading', 'Quote', 'Bulleted list', 'Numbered list', 'Code', 'Link'])
    })

    it('says the keys of the buttons that have some', () => {
      mount()
      expect(wrapper.get('.markdown-bold').attributes('title')).toBe('Bold (Ctrl+B)')
      expect(wrapper.get('.markdown-italic').attributes('title')).toBe('Italic (Ctrl+I)')
      expect(wrapper.get('.markdown-link').attributes('title')).toBe('Link (Ctrl+K)')
      expect(wrapper.get('.markdown-quote').attributes('title')).toBe('Quote')
    })

    it('marks a required field with a star', () => {
      mount({ required: true })
      expect(wrapper.find('.required-mark').exists()).toBe(true)
    })

    it('shows another text when the record changes', async () => {
      mount({}, { body: 'one' })
      await wrapper.setProps({ model: { body: 'two' } })
      expect(area().element.value).toBe('two')
    })
  })

  describe('typing', () => {
    it('writes the text to the record, and tells the form', async () => {
      const model = {}
      mount({}, model)
      await write('**hello**')
      expect(model.body).toBe('**hello**')
      expect(wrapper.emitted('input').at(-1)).toEqual(['**hello**', 'body'])
    })

    it('writes at the path of a locale', async () => {
      const model = { body: { enUS: 'x' } }
      mount({ model: 'body.enUS' }, model)
      expect(area().element.value).toBe('x')
      await write('y')
      expect(model.body.enUS).toBe('y')
    })

    it('does not write when it is read-only', async () => {
      const model = { body: 'kept' }
      mount({ readonly: true }, model)
      expect(area().attributes('readonly')).toBeDefined()
      expect(wrapper.find('.markdown-toolbar').exists()).toBe(false)
    })

    it('is greyed out when disabled', () => {
      mount({ disabled: true })
      expect(area().attributes('disabled')).toBeDefined()
      expect(wrapper.find('.markdown-toolbar').exists()).toBe(false)
    })
  })

  describe('the preview', () => {
    it('is in a tab: the box first, and what the text makes after a click on Preview', async () => {
      mount({}, { body: '# Title\n\nSome **bold** text.' })
      expect(shown(wrapper.get('.markdown-write'))).toBe(true)
      expect(shown(preview())).toBe(false)
      await tab('preview').trigger('click')
      expect(shown(wrapper.get('.markdown-write'))).toBe(false)
      expect(shown(preview())).toBe(true)
      expect(preview().get('h1').text()).toBe('Title')
      expect(preview().get('strong').text()).toBe('bold')
      await tab('write').trigger('click')
      expect(shown(wrapper.get('.markdown-write'))).toBe(true)
    })

    it('follows what is typed', async () => {
      mount({}, { body: 'one' })
      await tab('preview').trigger('click')
      expect(preview().text()).toBe('one')
      await tab('write').trigger('click')
      await write('- a\n- b')
      await tab('preview').trigger('click')
      expect(preview().findAll('li').map(item => item.text())).toEqual(['a', 'b'])
    })

    it('says there is nothing to preview for an empty text', async () => {
      mount()
      await tab('preview').trigger('click')
      expect(preview().text()).toBe(TranslateService.get('TL_MARKDOWN_NOTHING'))
    })

    it('shows a hostile text as text, and runs nothing', async () => {
      mount({}, { body: '<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))\n\n<script>alert(1)</script>' })
      await tab('preview').trigger('click')
      expect(preview().find('img').exists()).toBe(false)
      expect(preview().find('script').exists()).toBe(false)
      expect(preview().find('a').exists()).toBe(false)
      expect(preview().text()).toContain('<script>alert(1)</script>')
    })

    it('has the roles of a tab list, and moves between the tabs with the arrows', async () => {
      mount()
      expect(wrapper.get('[role=tablist]').exists()).toBe(true)
      expect(tab('write').attributes('aria-selected')).toBe('true')
      expect(tab('preview').attributes('aria-selected')).toBe('false')
      expect(tab('write').attributes('aria-controls')).toBe(wrapper.get('.markdown-write').attributes('id'))
      expect(wrapper.get('.markdown-write').attributes('role')).toBe('tabpanel')
      await tab('write').trigger('keydown', { key: 'ArrowRight' })
      expect(tab('preview').attributes('aria-selected')).toBe('true')
      await tab('preview').trigger('keydown', { key: 'ArrowRight' })
      expect(tab('write').attributes('aria-selected')).toBe('true')
      await tab('write').trigger('keydown', { key: 'ArrowLeft' })
      expect(tab('preview').attributes('aria-selected')).toBe('true')
    })

    it('hides the toolbar while the preview is shown', async () => {
      mount()
      await tab('preview').trigger('click')
      expect(wrapper.find('.markdown-toolbar').exists()).toBe(false)
    })

    it('is beside the box when the field says so, with no tabs', () => {
      mount({ options: { preview: 'split' } }, { body: '**x**' })
      expect(wrapper.find('[role=tablist]').exists()).toBe(false)
      expect(shown(wrapper.get('.markdown-write'))).toBe(true)
      expect(shown(preview())).toBe(true)
      expect(preview().get('strong').text()).toBe('x')
      expect(wrapper.classes()).toContain('is-split')
    })

    it('is nowhere when the field says so', () => {
      mount({ options: { preview: false } })
      expect(wrapper.find('.markdown-preview').exists()).toBe(false)
      expect(wrapper.find('[role=tablist]').exists()).toBe(false)
    })

    it('opens a read-only text on what it says, and the box is one click away', async () => {
      mount({ readonly: true }, { body: '## Read me' })
      expect(shown(preview())).toBe(true)
      expect(preview().get('h2').text()).toBe('Read me')
      await tab('write').trigger('click')
      expect(area().element.value).toBe('## Read me')
    })
  })

  describe('the toolbar', () => {
    it('writes the signs around the selection', async () => {
      const model = { body: 'a word here' }
      mount({}, model)
      select(2, 6)
      await click('bold')
      expect(model.body).toBe('a **word** here')
    })

    it('selects what it wrote, so that the next button works on it', async () => {
      const model = { body: 'word' }
      mount({}, model)
      select(0, 4)
      await click('bold')
      expect(area().element.value.slice(area().element.selectionStart, area().element.selectionEnd)).toBe('word')
      await click('italic')
      expect(model.body).toBe('**_word_**')
    })

    it('writes a heading, a quote, the lists, code and a link', async () => {
      const model = { body: 'line' }
      mount({}, model)
      select(0, 4)
      await click('heading')
      expect(model.body).toBe('## line')
      await write('line')
      select(0, 4)
      await click('quote')
      expect(model.body).toBe('> line')
      await write('line')
      select(0, 4)
      await click('ul')
      expect(model.body).toBe('- line')
      await write('line')
      select(0, 4)
      await click('ol')
      expect(model.body).toBe('1. line')
      await write('line')
      select(0, 4)
      await click('code')
      expect(model.body).toBe('`line`')
      await write('line')
      select(0, 4)
      await click('link')
      expect(model.body).toBe('[line](https://)')
    })

    it('does what its button does with Ctrl+B, Ctrl+I and Ctrl+K (and Cmd on a Mac)', async () => {
      const model = { body: 'word' }
      mount({}, model)
      select(0, 4)
      await press('b', { ctrlKey: true })
      expect(model.body).toBe('**word**')
      await write('word')
      select(0, 4)
      await press('i', { metaKey: true })
      expect(model.body).toBe('_word_')
      await write('word')
      select(0, 4)
      await press('k', { ctrlKey: true })
      expect(model.body).toBe('[word](https://)')
    })

    it('leaves a key that is not one of its own to the browser', async () => {
      const model = { body: 'word' }
      mount({}, model)
      select(0, 4)
      await press('u', { ctrlKey: true })
      await press('b')
      expect(model.body).toBe('word')
    })

    it('starts the next item when Enter is pressed at the end of an item of a list, and ends the list at an empty one', async () => {
      const model = { body: '- one' }
      mount({}, model)
      select(5)
      await press('Enter')
      expect(model.body).toBe('- one\n- ')
      select(8)
      await press('Enter')
      expect(model.body).toBe('- one\n')
    })

    it('leaves Enter alone anywhere else', async () => {
      const model = { body: 'plain' }
      mount({}, model)
      select(5)
      await press('Enter')
      expect(model.body).toBe('plain')
    })

    it('has the buttons the field names, in the order of the toolbar', () => {
      mount({ options: { toolbar: ['link', 'bold', 'nothing'] } })
      expect(wrapper.findAll('.markdown-toolbar button').map(button => button.attributes('aria-label'))).toEqual(['Bold', 'Link'])
    })

    it('has none when the field says so, and then has no key either', async () => {
      const model = { body: 'word' }
      mount({ options: { toolbar: false } }, model)
      expect(wrapper.find('.markdown-toolbar').exists()).toBe(false)
      select(0, 4)
      await press('b', { ctrlKey: true })
      expect(model.body).toBe('word')
    })
  })

  describe('the size of the box', () => {
    it('is eight lines by default, and the number the field says, within reason', () => {
      mount()
      expect(wrapper.findComponent({ name: 'VTextarea' }).props('rows')).toBe(8)
      wrapper.unmount()
      mount({ options: { rows: 3 } })
      expect(wrapper.findComponent({ name: 'VTextarea' }).props('rows')).toBe(3)
      wrapper.unmount()
      mount({ options: { rows: 1000 } })
      expect(wrapper.findComponent({ name: 'VTextarea' }).props('rows')).toBe(60)
      wrapper.unmount()
      mount({ options: { rows: 'many' } })
      expect(wrapper.findComponent({ name: 'VTextarea' }).props('rows')).toBe(8)
    })

    it('grows to the lines the field says before it scrolls', () => {
      mount({ options: { rows: 4, maxRows: 12 } })
      expect(wrapper.vm.maxRows).toBe(12)
      wrapper.unmount()
      mount({ options: { rows: 4, maxRows: 2 } })
      expect(wrapper.vm.maxRows).toBeUndefined()
    })
  })

  describe('the rules', () => {
    it('refuses an empty text when required, and is not red before anyone has touched it', async () => {
      mount({ required: true })
      await flushPromises()
      expect(wrapper.find('.v-input--error').exists()).toBe(false)
      expect(wrapper.vm.rule('')).toBe(TranslateService.get('TL_FIELD_IS_REQUIRED'))
      expect(wrapper.vm.rule('text')).toBe(true)
    })

    it('has nothing to say about an empty text that is not required', () => {
      mount()
      expect(wrapper.vm.rule('')).toBe(true)
      expect(wrapper.vm.rule(undefined)).toBe(true)
    })

    it('keeps the text within the least and the most the field says, signs included', () => {
      mount({ max: 10, min: 3 })
      expect(wrapper.vm.rule('**abc**')).toBe(true)
      expect(wrapper.vm.rule('**abcdefgh**')).toBe(TranslateService.get('TL_TEXT_TOO_BIG', { current: 12, max: 10 }))
      expect(wrapper.vm.rule('ab')).toBe(TranslateService.get('TL_TEXT_TOO_SMALL', { current: 2, min: 3 }))
    })

    it('says so under the box when it is left', async () => {
      mount({ max: 3 })
      await write('abcdef')
      await area().trigger('focus')
      await area().trigger('blur')
      await flushPromises()
      expect(wrapper.findAll('.v-messages__message').map(message => message.text())).toEqual([TranslateService.get('TL_TEXT_TOO_BIG', { current: 6, max: 3 })])
    })
  })
})
