import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import FieldLabel from '@c/fields/FieldLabel.vue'
import Group from '@c/fields/Group.vue'
import CustomTreeView from '@c/fields/CustomTreeView.vue'
import CustomCode from '@c/fields/CustomCode.vue'
import { mountComponent, mountField } from './helpers/mountField.js'

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('FieldLabel (the name of a field)', () => {
  it('shows the label', () => {
    wrapper = mountComponent(FieldLabel, { props: { schema: { label: 'Title' } } })
    expect(wrapper.text()).toBe('Title')
    expect(wrapper.find('.required-mark').exists()).toBe(false)
  })

  it('marks a required field for the eyes, and says so for a screen reader', () => {
    wrapper = mountComponent(FieldLabel, { props: { schema: { label: 'Title', required: true } } })
    expect(wrapper.get('.required-mark').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.cms-visually-hidden').text()).toBe('(required)')
  })

  it('gives the hint of the schema', () => {
    wrapper = mountComponent(FieldLabel, { props: { schema: { label: 'x', hint: 'About x' } } })
    expect(wrapper.vm.getHint()).toBe('About x')
    wrapper.unmount()
    wrapper = mountComponent(FieldLabel, { props: { schema: { label: 'x' } } })
    expect(wrapper.vm.getHint()).toBe('')
  })
})

describe('Group (fields that belong together)', () => {
  const CustomForm = {
    name: 'CustomForm',
    props: ['model', 'schema', 'paragraphLevel'],
    emits: ['error', 'input', 'update:model'],
    methods: { validate: vi.fn(async () => []), debouncedValidate: vi.fn(() => 'debounced'), clearValidationErrors: vi.fn(() => 'cleared') },
    template: '<div class="form-stub" />'
  }
  const group = (props = {}, schema = {}) => {
    wrapper = mountField(Group, {
      model: { a: 1 },
      schema: { label: 'SEO', groupOptions: { fields: [{ model: 'a' }] }, ...schema },
      props,
      global: { components: { CustomForm } }
    })
    return wrapper
  }

  it('shows its name, and the form of its fields one level deeper', () => {
    group({ paragraphLevel: 2 })
    expect(wrapper.get('.field-label').text()).toBe('SEO')
    expect(wrapper.classes()).toContain('nested-level-2')
    const form = wrapper.findComponent({ name: 'CustomForm' })
    expect(form.props('schema')).toEqual({ fields: [{ model: 'a' }] })
    expect(form.props('paragraphLevel')).toBe(3)
    expect(form.props('model')).toEqual({ a: 1 })
  })

  it('starts at the first level', () => {
    group()
    expect(wrapper.classes()).toContain('nested-level-0')
  })

  it('passes up the changes of its form', () => {
    group()
    wrapper.findComponent({ name: 'CustomForm' }).vm.$emit('input', 'v', { a: 2 })
    expect(wrapper.emitted('input')).toEqual([['v', { a: 2 }]])
  })

  it('says when its form could not be built, and goes on', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    group()
    wrapper.findComponent({ name: 'CustomForm' }).vm.$emit('error', new Error('bad'))
    expect(error).toHaveBeenCalled()
  })

  it('is valid when its form is', async () => {
    group()
    expect(await wrapper.vm.validate()).toBe(true)
  })

  it('hands the debounced validation and the clearing of errors to its form', () => {
    group()
    expect(wrapper.vm.debouncedValidate()).toBe('debounced')
    expect(wrapper.vm.clearValidationErrors()).toBe('cleared')
  })
})

describe('CustomTreeView (a read only view of a value)', () => {
  const JsonViewer = {
    name: 'JsonViewer',
    props: ['value', 'copyable'],
    template: '<div class="json-stub">{{ JSON.stringify(value) }}</div>'
  }
  const tree = (model, schema = {}) => {
    wrapper = mountField(CustomTreeView, { model, schema: { model: 'data', label: 'Data', ...schema }, global: { components: { JsonViewer } } })
    return wrapper
  }

  it('shows the label and the value of the model, with a copy button', () => {
    tree({ data: { a: [1, 2] } })
    expect(wrapper.get('.field-label').text()).toBe('Data')
    expect(wrapper.get('.json-stub').text()).toBe('{"a":[1,2]}')
    expect(wrapper.findComponent({ name: 'JsonViewer' }).props('copyable')).toBe(true)
  })

  it('shows false when there is no value', () => {
    tree({})
    expect(wrapper.get('.json-stub').text()).toBe('false')
  })

  it('shows a nested value', () => {
    tree({ a: { b: { c: 1 } } }, { model: 'a.b' })
    expect(wrapper.get('.json-stub').text()).toBe('{"c":1}')
  })

  it('shows its hint', () => {
    tree({ data: {} }, { options: { hint: 'Read only' } })
    expect(wrapper.get('.help-block').text()).toBe('Read only')
  })
})

describe('CustomCode (a code editor)', () => {
  const code = async (model, schema = {}) => {
    wrapper = mountField(CustomCode, { model, schema: { model: 'script', label: 'Script', ...schema }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }
  const editor = () => wrapper.find('.CodeMirror').element.CodeMirror

  it('shows the label and the code of the model', async () => {
    await code({ script: 'let a = 1' })
    expect(wrapper.get('.field-label').text()).toBe('Script')
    expect(editor().getValue()).toBe('let a = 1')
  })

  it('uses the theme made of tokens, so it follows the light and dark themes', async () => {
    await code({ script: 'let a = 1' })
    expect(wrapper.find('.CodeMirror').classes()).toContain('cm-s-cms')
  })

  it('says it is read-only with an eye after the label, and disabled with a lock', async () => {
    await code({ script: 'a' }, { readonly: true })
    expect(wrapper.classes()).toContain('is-readonly')
    expect(wrapper.find('.field-label .cms-field-readonly').exists()).toBe(true)
    wrapper.unmount()
    await code({ script: 'a' }, { disabled: true })
    expect(wrapper.classes()).toContain('is-disabled')
    expect(wrapper.find('.field-label .cms-field-lock').exists()).toBe(true)
  })

  it('writes the edits into the model', async () => {
    const model = { script: 'a' }
    await code(model)
    editor().setValue('b')
    await flushPromises()
    expect(model.script).toBe('b')
  })

  it('shows an empty editor for a value that is not text', async () => {
    await code({ script: { not: 'text' } })
    expect(editor().getValue()).toBe('')
  })

  it('edits json as javascript', async () => {
    await code({ script: '{}' }, { options: { mode: 'json' } })
    expect(editor().getOption('mode')).toBe('javascript')
  })

  it('takes the mode and tab size of the schema', async () => {
    await code({ script: '' }, { options: { mode: 'css', tabSize: 4 } })
    expect(editor().getOption('mode')).toBe('css')
    expect(editor().getOption('tabSize')).toBe(4)
  })

  it('cannot be edited when read only, and loses its cursor when disabled', async () => {
    await code({ script: 'a' }, { readonly: true })
    expect(editor().getOption('readOnly')).toBe(true)
    wrapper.unmount()
    await code({ script: 'a' }, { disabled: true })
    expect(editor().getOption('readOnly')).toBe('nocursor')
  })

  it('can be edited otherwise', async () => {
    await code({ script: 'a' })
    expect(editor().getOption('readOnly')).toBe(false)
  })

  it('sizes itself from the options, and takes extra css', async () => {
    await code({ script: '' }, { options: { height: '300px', css: { border: '1px solid red' } } })
    expect(wrapper.vm.getStyle()).toEqual({ height: '300px', width: '100%', border: '1px solid red' })
  })

  it('shows its hint', async () => {
    await code({ script: '' }, { options: { hint: 'JavaScript' } })
    expect(wrapper.get('.help-block').text()).toBe('JavaScript')
  })
})
