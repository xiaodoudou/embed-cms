import { describe, it, expect, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import Transliterate from '@c/fields/Transliterate.vue'
import { mountField } from './helpers/mountField.js'

let wrapper
const field = (model, schema = {}) => {
  wrapper = mountField(Transliterate, { model, schema: { model: 'slug', options: { valueFrom: 'title' }, ...schema }, attachTo: document.body })
  return wrapper
}
// the model is a reactive object in the app: the page changes it, and the field follows
const retitle = async (title) => {
  wrapper.vm.model.title = title
  await flushPromises()
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('Transliterate (a slug made from another field)', () => {
  it('makes a slug from the field it follows', async () => {
    const model = { title: 'Hello World' }
    field(model)
    await flushPromises()
    expect(model.slug).toBe('hello-world')
    expect(wrapper.get('input').element.value).toBe('hello-world')
  })

  it('turns accents and other scripts into plain letters', async () => {
    const model = { title: 'Crème brûlée' }
    field(model)
    await flushPromises()
    expect(model.slug).toBe('creme-brulee')
  })

  it('follows the field as it changes', async () => {
    const model = { title: 'One' }
    field(model)
    await flushPromises()
    await retitle('Two Words')
    expect(wrapper.vm.model.slug).toBe('two-words')
  })

  it('empties the slug when the source is emptied', async () => {
    const model = { title: 'One' }
    field(model)
    await flushPromises()
    await retitle('')
    expect(wrapper.vm.model.slug).toBe('')
  })

  it('is read only unless told otherwise', async () => {
    field({ title: 'One' })
    await flushPromises()
    expect(wrapper.get('input').attributes('readonly')).toBeDefined()
  })

  it('can be edited when the schema says so, and then keeps what was typed', async () => {
    const model = { title: 'One' }
    field(model, { options: { valueFrom: 'title', readonly: false } })
    await flushPromises()
    expect(wrapper.get('input').attributes('readonly')).toBeUndefined()
    await wrapper.get('input').setValue('my-own-slug')
    await retitle('Changed')
    expect(wrapper.vm.model.slug).toBe('my-own-slug')
  })

  it('follows the source again when the typed slug is emptied', async () => {
    const model = { title: 'One' }
    field(model, { options: { valueFrom: 'title', readonly: false } })
    await flushPromises()
    await wrapper.get('input').setValue('mine')
    await wrapper.get('input').setValue('')
    await nextTick()
    await retitle('Back Again')
    expect(wrapper.vm.model.slug).toBe('back-again')
  })

  it('warns when the schema does not say which field to follow', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    field({ title: 'One' }, { options: {} })
    await flushPromises()
    expect(warn).toHaveBeenCalled()
  })

  describe('a source that has one text for each language', () => {
    const localised = { title: { enUS: 'English Title', zhCN: 'Other' } }

    it('uses the language of the field', async () => {
      const model = { ...localised, slug: {} }
      field(model, { model: 'slug.enUS', localised: true, resource: { locales: ['enUS', 'zhCN'] } })
      await flushPromises()
      expect(wrapper.vm.model.slug.enUS).toBe('english-title')
    })

    it('uses the first language for a field that is shared by all', async () => {
      const model = { ...localised }
      field(model, { resource: { locales: ['enUS', 'zhCN'] } })
      await flushPromises()
      expect(model.slug).toBe('english-title')
    })
  })

  it('shows its hint', async () => {
    field({ title: 'x' }, { options: { valueFrom: 'title', hint: 'Used in the address' } })
    await flushPromises()
    expect(wrapper.get('.help-block').text()).toBe('Used in the address')
  })
})
