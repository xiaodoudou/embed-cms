import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import Wysiwyg from '@c/fields/Wysiwyg.vue'
import TiptapMenuItem from '@c/fields/TiptapMenuItem.vue'
import { mountField, mountComponent } from './helpers/mountField.js'

let wrapper
// the editor shows icons of the app; the test set has only some of them
const global = { config: { warnHandler: () => {} } }
const editor = async (model = {}, schema = {}, props = {}) => {
  wrapper = mountField(Wysiwyg, { model, schema: { model: 'body', label: 'Body', ...schema }, props, global, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const tiptap = () => wrapper.vm.editor
const button = (title) => wrapper.findAll('.toolbar .menu-item').find((item) => item.attributes('title') === title)
const titles = () => wrapper.findAll('.toolbar .menu-item').map((item) => item.attributes('title'))

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('Wysiwyg (rich text)', () => {
  describe('the text', () => {
    it('shows the label and the text of the model', async () => {
      await editor({ body: '<p>Hello <strong>world</strong></p>' })
      expect(wrapper.get('.field-label').text()).toBe('Body')
      expect(wrapper.get('.ProseMirror').html()).toContain('<strong>world</strong>')
    })

    it('writes what is typed into the model as HTML, and tells the page', async () => {
      const model = { body: '<p>Hello</p>' }
      await editor(model)
      tiptap().commands.insertContentAt(tiptap().state.doc.content.size - 1, ' there')
      await flushPromises()
      expect(model.body).toBe('<p>Hello there</p>')
      expect(wrapper.emitted('change').at(-1)[0]).toBe('<p>Hello there</p>')
    })

    it('shows an empty editor when there is no text yet', async () => {
      await editor({})
      expect(tiptap().getText()).toBe('')
    })

    it('shows its hint', async () => {
      await editor({}, { options: { hint: 'Write something' } })
      expect(wrapper.get('.help-block').text()).toBe('Write something')
    })
  })

  describe('being required', () => {
    it('says so when it is emptied', async () => {
      await editor({ body: '<p>Text</p>' }, { required: true })
      tiptap().commands.clearContent(true)
      await flushPromises()
      expect(wrapper.get('.error-message').text()).toBe('This field is required!')
      expect(wrapper.find('.help-block').exists()).toBe(false)
    })

    it('says nothing while there is text', async () => {
      await editor({ body: '<p>Text</p>' }, { required: true })
      tiptap().commands.insertContent('!')
      await flushPromises()
      expect(wrapper.find('.error-message').exists()).toBe(false)
    })

    it('does not complain when it is not required', async () => {
      await editor({ body: '<p>Text</p>' })
      tiptap().commands.clearContent(true)
      await flushPromises()
      expect(wrapper.find('.error-message').exists()).toBe(false)
    })

    it('exposes its text for the form to check', async () => {
      await editor({ body: '<p>Text</p>' }, { required: true })
      expect(wrapper.attributes('data-val')).toBe('<p>Text</p>')
      wrapper.unmount()
      await editor({ body: '<p>Text</p>' })
      expect(wrapper.attributes('data-val')).toBe('not-required')
    })
  })

  describe('locking', () => {
    it('can be edited normally', async () => {
      await editor({ body: '<p>a</p>' })
      expect(tiptap().isEditable).toBe(true)
      expect(wrapper.get('.editor__header').classes()).not.toContain('locked')
    })

    it.each([['readonly', { readonly: true }], ['disabled', { disabled: true }]])('cannot be edited when %s', async (name, schema) => {
      await editor({ body: '<p>a</p>' }, schema)
      expect(tiptap().isEditable).toBe(false)
      expect(wrapper.get('.editor__header').classes()).toContain('locked')
    })

    it('follows the field being disabled or enabled', async () => {
      await editor({ body: '<p>a</p>' })
      await wrapper.setProps({ disabled: true })
      expect(tiptap().isEditable).toBe(false)
      await wrapper.setProps({ disabled: false })
      expect(tiptap().isEditable).toBe(true)
    })
  })

  describe('the click on the empty area', () => {
    it('puts the cursor at the end of the text', async () => {
      await editor({ body: '<p>a</p>' })
      tiptap().commands.setTextSelection(1)
      await wrapper.get('.editor-content').trigger('click')
      expect(tiptap().state.selection.from).toBe(tiptap().state.doc.content.size - 1)
    })

    it('leaves a click on the text itself alone', async () => {
      await editor({ body: '<p>a</p>' })
      tiptap().commands.setTextSelection(1)
      await wrapper.get('.ProseMirror p').trigger('click')
      expect(tiptap().state.selection.from).toBe(1)
    })
  })

  describe('the toolbar', () => {
    it('offers every tool when the schema does not choose', async () => {
      await editor()
      expect(titles()).toEqual([
        'Bold', 'Italic', 'Strike through', 'Paragraph', 'Bullet List', 'Ordered List', 'Superscript', 'Heading 1', 'Heading 2', 'Heading 3',
        'Underline', 'Link', 'Quote', 'Code', 'Clear Format', 'Horizontal Rule', 'Undo', 'Redo'
      ])
    })

    it('offers only the tools the schema names', async () => {
      await editor({}, { options: { buttons: ['bold', 'strike-through', 'undo'] } })
      expect(titles()).toEqual(['Bold', 'Strike through', 'Undo'])
    })

    it('has a name for a screen reader', async () => {
      await editor()
      expect(wrapper.get('.toolbar').attributes('role')).toBe('toolbar')
      expect(wrapper.get('.toolbar').attributes('aria-label')).toBe('Formatting')
    })

    it.each([
      ['Bold', '<strong>', '<p>x</p>'],
      ['Italic', '<em>', '<p>x</p>'],
      ['Strike through', '<s>', '<p>x</p>'],
      ['Superscript', '<sup>', '<p>x</p>'],
      ['Heading 1', '<h1>', '<p>x</p>'],
      ['Heading 2', '<h2>', '<p>x</p>'],
      ['Heading 3', '<h3>', '<p>x</p>'],
      ['Bullet List', '<ul>', '<p>x</p>'],
      ['Ordered List', '<ol>', '<p>x</p>'],
      ['Quote', '<blockquote>', '<p>x</p>'],
      ['Code', '<pre>', '<p>x</p>'],
      ['Horizontal Rule', '<hr', '<p>x</p>']
    ])('%s formats the selected text', async (title, tag, content) => {
      await editor({ body: content })
      tiptap().commands.selectAll()
      await button(title).trigger('click')
      await flushPromises()
      expect(tiptap().getHTML()).toContain(tag)
    })

    it('Underline formats the selected text', async () => {
      await editor({ body: '<p>x</p>' })
      tiptap().commands.selectAll()
      await button('Underline').trigger('click')
      expect(tiptap().getHTML()).toContain('<u>')
    })

    it('shows which formats the cursor is in', async () => {
      await editor({ body: '<p>x</p>' })
      tiptap().commands.selectAll()
      await button('Bold').trigger('click')
      await vi.waitFor(() => expect(button('Bold').attributes('aria-pressed')).toBe('true'))
      expect(button('Italic').attributes('aria-pressed')).toBe('false')
    })

    it('goes back with Undo and forward with Redo', async () => {
      await editor({ body: '<p>x</p>' })
      tiptap().commands.selectAll()
      await button('Bold').trigger('click')
      await button('Undo').trigger('click')
      expect(tiptap().getHTML()).not.toContain('<strong>')
      await button('Redo').trigger('click')
      expect(tiptap().getHTML()).toContain('<strong>')
    })

    it('clears the formats', async () => {
      await editor({ body: '<h2><strong>x</strong></h2>' })
      tiptap().commands.selectAll()
      await button('Clear Format').trigger('click')
      expect(tiptap().getHTML()).not.toMatch(/<h2>|<strong>/)
      expect(tiptap().getText()).toContain('x')
    })
  })

  describe('links', () => {
    const linkTo = async (answer, body = '<p>x</p>') => {
      await editor({ body })
      vi.spyOn(window, 'prompt').mockReturnValue(answer)
      tiptap().commands.selectAll()
      await button('Link').trigger('click')
      await flushPromises()
    }

    it('adds a link to the selected text', async () => {
      await linkTo('https://example.com')
      expect(tiptap().getHTML()).toContain('href="https://example.com"')
    })

    it('changes nothing when the person cancels', async () => {
      await linkTo(null)
      expect(tiptap().getHTML()).toBe('<p>x</p>')
    })

    it('takes the link away when the address is emptied', async () => {
      await linkTo('', '<p><a href="https://old.example">x</a></p>')
      expect(tiptap().getHTML()).not.toContain('href')
    })

    it('offers the address that is already there', async () => {
      await linkTo('https://new.example', '<p><a href="https://old.example">x</a></p>')
      expect(window.prompt).toHaveBeenCalledWith('URL', 'https://old.example')
    })
  })

  it('stops the editor when it goes away', async () => {
    await editor({ body: '<p>a</p>' })
    const instance = tiptap()
    wrapper.unmount()
    wrapper = undefined
    expect(instance.isDestroyed).toBe(true)
  })
})

describe('TiptapMenuItem (one tool)', () => {
  const item = (props) => (wrapper = mountComponent(TiptapMenuItem, { props: { icon: '$formatBold', title: 'Bold', action: () => {}, ...props }, global }))

  it('is a button named by its title', () => {
    item()
    expect(wrapper.get('button').attributes('aria-label')).toBe('Bold')
    expect(wrapper.get('button').attributes('title')).toBe('Bold')
  })

  it('runs its action, and keeps the click away from the page', async () => {
    const action = vi.fn()
    item({ action })
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    wrapper.get('button').element.dispatchEvent(event)
    expect(action).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('says whether it is on, when it can be', () => {
    item({ isActive: () => true })
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('button').classes()).toContain('is-active')
    wrapper.unmount()
    item({ isActive: () => false })
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false')
    wrapper.unmount()
    item()
    expect(wrapper.get('button').attributes('aria-pressed')).toBeUndefined()
  })
})
