import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import DesignSystem from '@c/pages/DesignSystem.vue'
import CustomCheckbox from '@c/fields/CustomCheckbox.vue'
import NotificationsService from '@s/NotificationsService'
import DialogService from '@s/DialogService'
import { mountComponent } from './helpers/mountField.js'

// the page shows every icon the app has; the test set has only some of them
const quiet = { config: { warnHandler: () => {} } }
const DatePicker = { name: 'DatePicker', props: ['modelValue', 'readonly', 'disabled', 'clearable'], template: '<span class="date-stub" />' }

let wrapper
const page = async () => {
  wrapper = mountComponent(DesignSystem, { global: { ...quiet, components: { DatePicker, CustomCheckbox } }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const button = (text) => wrapper.findAll('button').find((item) => item.text() === text)

beforeEach(() => {
  window.DialogService = DialogService
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('DesignSystem (the living reference page)', () => {
  it('shows each section of the reference', async () => {
    await page()
    expect(wrapper.findAll('section h2').map((item) => item.text())).toEqual(['Buttons', 'Toggles, chips and tags', 'Dialogs and toasts', 'Form controls', 'Dropdown'])
  })

  it('shows every kind of button in every size and state', async () => {
    await page()
    expect(wrapper.findAll('.ds-table tbody tr')).toHaveLength(5)
    expect(wrapper.findAll('.ds-table thead th').map((item) => item.text())).toEqual(['Variant', 'Default', 'Compact', 'Icon + label', 'Icon only', 'Loading', 'Disabled'])
    expect(wrapper.findAll('.ds-table button[disabled]')).toHaveLength(5)
  })

  it('shows the five states of a control', async () => {
    await page()
    expect(wrapper.findAll('.ds-form-col h3').map((item) => item.element.firstChild.textContent)).toEqual(['Editable', 'Focus', 'Error', 'Read-only', 'Disabled'])
    expect(wrapper.text()).toContain('This field is required')
  })

  it('has a view switch and a chip that toggle', async () => {
    await page()
    const [edit, select] = wrapper.findAll('.toggle-mode-btn')
    expect(edit.attributes('aria-pressed')).toBe('true')
    await select.trigger('click')
    expect(select.attributes('aria-pressed')).toBe('true')
    expect(edit.attributes('aria-pressed')).toBe('false')
    const chip = wrapper.get('.filter-chip')
    expect(chip.attributes('aria-pressed')).toBe('false')
    await chip.trigger('click')
    expect(chip.attributes('aria-pressed')).toBe('true')
  })

  it.each([['Success toast', 'success'], ['Info toast', 'info'], ['Warning toast', 'warn'], ['Error toast', 'error']])('sends a %s', async (label, type) => {
    const send = vi.spyOn(NotificationsService, 'send').mockImplementation(() => {})
    await page()
    await button(label).trigger('click')
    expect(send.mock.calls[0][1]).toBe(type)
  })

  it('gives the error toast a Retry action, and the others a copyable detail', async () => {
    const send = vi.spyOn(NotificationsService, 'send').mockImplementation(() => {})
    await page()
    await button('Error toast').trigger('click')
    await button('Success toast').trigger('click')
    expect(send.mock.calls[0][2].actionLabel).toBe('Retry')
    expect(send.mock.calls[1][2].detail).toBe('mukx1234')
  })

  it('opens an info dialog and a destructive one', async () => {
    const shown = vi.fn()
    DialogService.events.on('dialog:show', shown)
    await page()
    await button('Info dialog').trigger('click')
    await button('Destructive dialog').trigger('click')
    DialogService.events.off('dialog:show', shown)
    expect(shown.mock.calls.map((call) => call[0].destructive)).toEqual([false, true])
    expect(shown.mock.calls[1][0].confirm).toBe('Delete')
  })

  it('writes a date as year-month-day', async () => {
    await page()
    expect(wrapper.vm.formatDate(1772668800000)).toBe('2026-03-05')
  })
})
