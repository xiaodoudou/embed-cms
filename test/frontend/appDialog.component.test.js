import { describe, it, expect, afterEach } from 'vitest'
import AppDialog from '@c/AppDialog.vue'
import { mountComponent } from './helpers/mountField.js'

// A Vuetify dialog teleports its content to the body: it is queried there
let wrapper
const dialog = (props = {}, options = {}) => {
  wrapper = mountComponent(AppDialog, { props: { modelValue: true, title: 'Discard changes?', message: 'Your edits are lost.', confirmText: 'Discard', cancelText: 'Keep editing', ...props }, attachTo: document.body, ...options })
  return wrapper
}
const inBody = (selector) => document.body.querySelector(selector)
const click = async (selector) => {
  inBody(selector).click()
  await wrapper.vm.$nextTick()
}

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('AppDialog', () => {
  it('shows its title, message and the two buttons', async () => {
    dialog()
    await wrapper.vm.$nextTick()
    expect(inBody('.cms-dialog-title').textContent).toBe('Discard changes?')
    expect(inBody('.cms-dialog-body').textContent).toContain('Your edits are lost.')
    expect(inBody('.cms-dialog-confirm').textContent).toContain('Discard')
    expect(inBody('.cms-dialog-cancel').textContent).toContain('Keep editing')
  })

  it('is named by its title and described by its body', async () => {
    dialog()
    await wrapper.vm.$nextTick()
    const root = inBody('[role=dialog], [role=alertdialog]')
    expect(inBody(`#${root.getAttribute('aria-labelledby')}`).textContent).toBe('Discard changes?')
    expect(inBody(`#${root.getAttribute('aria-describedby')}`).textContent).toContain('Your edits are lost.')
  })

  it('is an alertdialog when destructive, a dialog otherwise', async () => {
    dialog({ type: 'destructive' })
    await wrapper.vm.$nextTick()
    expect(inBody('[role=alertdialog]')).not.toBeNull()
    wrapper.unmount()
    document.body.innerHTML = ''
    dialog({ type: 'info' })
    await wrapper.vm.$nextTick()
    expect(inBody('[role=dialog]')).not.toBeNull()
  })

  it('confirms and cancels through its buttons', async () => {
    dialog()
    await wrapper.vm.$nextTick()
    await click('.cms-dialog-confirm')
    await click('.cms-dialog-cancel')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('renders its slot instead of the message when one is given', async () => {
    dialog({}, { slots: { default: '<p class="custom">Custom body</p>' } })
    await wrapper.vm.$nextTick()
    expect(inBody('.custom').textContent).toBe('Custom body')
    expect(inBody('.cms-dialog-body').textContent).not.toContain('Your edits are lost.')
  })

  it('colours the confirm button as an error only when destructive', async () => {
    dialog({ type: 'destructive' })
    await wrapper.vm.$nextTick()
    expect(inBody('.cms-dialog-confirm').className).toMatch(/error/)
  })

  it('tells the parent when it is dismissed from outside (Escape, click on the scrim)', async () => {
    dialog()
    await wrapper.vm.$nextTick()
    wrapper.findComponent({ name: 'VDialog' }).vm.$emit('update:modelValue', false)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })
})
