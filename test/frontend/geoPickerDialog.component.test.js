import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import GeoPickerDialog from '@c/fields/GeoPickerDialog.vue'
import { createMapAdapter } from '@u/maps'
import { mountComponent, TranslateService } from './helpers/mountField.js'

// The dialog where a point is picked on a map. Leaflet's map is replaced by one that records what is asked of it.

vi.mock('@u/maps', async (importOriginal) => ({ ...(await importOriginal()), createMapAdapter: vi.fn() }))

const PARIS = { lat: 48.8566, lng: 2.3522 }
const CONFIG = { enabled: true, tiles: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: { text: '© OpenStreetMap contributors' }, maxZoom: 19 }, search: { url: 'https://nominatim.openstreetmap.org/search' } }
const t = key => TranslateService.get(key)

let wrapper
let adapter
let silenced

/** A map that records its pin, what is searched, and gives back what the test makes it find. */
const fakeAdapter = () => ({
  setPoint: vi.fn(),
  search: vi.fn().mockResolvedValue(null),
  destroy: vi.fn()
})

const mount = async (props = {}, { open = true, begin = true } = {}) => {
  wrapper = mountComponent(GeoPickerDialog, {
    props: { modelValue: false, config: CONFIG, options: { precision: 6, zoom: 12 }, ...props },
    attachTo: document.body
  })
  if (open) {
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    if (begin) {
      // the dialog has finished appearing
      wrapper.findComponent({ name: 'VDialog' }).vm.$emit('after-enter')
      await flushPromises()
    }
  }
  return wrapper
}
const body = selector => document.body.querySelector(selector)
const options = () => createMapAdapter.mock.calls.at(-1)[0]
const click = async (selector) => {
  body(selector).click()
  await flushPromises()
}

beforeEach(() => {
  adapter = fakeAdapter()
  createMapAdapter.mockReset()
  createMapAdapter.mockResolvedValue(adapter)
  silenced = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  wrapper?.unmount()
  silenced.mockRestore()
})

describe('GeoPickerDialog', () => {
  it('draws nothing while it is closed', async () => {
    await mount({}, { open: false })
    expect(createMapAdapter).not.toHaveBeenCalled()
    expect(body('.geo-card')).toBeNull()
  })

  it('draws the map in the dialog once it has appeared, with the tiles and the search of the server', async () => {
    await mount({ point: PARIS })
    expect(createMapAdapter).toHaveBeenCalledTimes(1)
    const asked = options()
    expect(asked.config).toEqual(CONFIG)
    expect(asked.container).toBe(body('.geo-stage'))
    expect(asked.view).toEqual({ center: PARIS, zoom: 12 })
    expect(asked.lang).toBe('en')
    expect(adapter.setPoint).toHaveBeenCalledWith(PARIS, { pan: false })
  })

  it('has a title, a stage with a name, and says it is loading until the map is there', async () => {
    createMapAdapter.mockReturnValue(new Promise(() => {}))
    await mount()
    expect(body('.geo-title').textContent).toBe('Pick a point on the map')
    expect(body('.geo-stage').getAttribute('aria-label')).toBe('Map')
    expect(body('.geo-state').textContent).toBe(t('TL_GEOPOINT_LOADING'))
    expect(body('.geo-state').getAttribute('role')).toBe('status')
  })

  it('begins at the centre of the field when there is no point', async () => {
    await mount({ options: { precision: 6, zoom: 9, center: { lat: 31.2, lng: 121.5 } } })
    expect(options().view).toEqual({ center: { lat: 31.2, lng: 121.5 }, zoom: 9 })
    expect(adapter.setPoint).toHaveBeenCalledWith(undefined, { pan: false })
  })

  it('says so when the map cannot be drawn, in the log and under the title', async () => {
    createMapAdapter.mockRejectedValue(new Error('chunk failed'))
    await mount()
    expect(body('.geo-state').textContent).toBe(t('TL_GEOPOINT_LOAD_ERROR'))
    expect(body('.geo-state').getAttribute('role')).toBe('alert')
    expect(silenced).toHaveBeenCalled()
  })

  it('speaks Chinese to the map when the admin does', async () => {
    const before = TranslateService.locale
    TranslateService.locale = 'zhCN'
    try {
      await mount()
      expect(options().lang).toBe('zh')
    } finally {
      TranslateService.locale = before
    }
  })

  describe('picking', () => {
    it('has nothing to use until a point is picked', async () => {
      await mount()
      expect(body('.geo-point').textContent).toBe(t('TL_GEOPOINT_NO_POINT'))
      expect(body('.geo-use').disabled).toBe(true)
    })

    it('shows the point of the click, with the pin, rounded to the decimals of the field', async () => {
      await mount({ options: { precision: 3, zoom: 12 } })
      options().onPick({ lat: 48.856601, lng: 2.352222 })
      await flushPromises()
      expect(body('.geo-point').textContent).toBe('48.857, 2.352')
      expect(adapter.setPoint).toHaveBeenLastCalledWith({ lat: 48.857, lng: 2.352 }, { pan: false })
      expect(body('.geo-use').disabled).toBe(false)
    })

    it('gives the point to the field and closes, when it is used', async () => {
      await mount()
      options().onPick(PARIS)
      await flushPromises()
      await click('.geo-use')
      expect(wrapper.emitted('pick')).toEqual([[PARIS]])
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })

    it('gives nothing, and closes, when it is cancelled', async () => {
      await mount()
      options().onPick(PARIS)
      await flushPromises()
      await click('.geo-cancel')
      expect(wrapper.emitted('pick')).toBeUndefined()
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })

    it('begins again with the point of the field each time it is opened', async () => {
      await mount({ point: PARIS })
      options().onPick({ lat: 1, lng: 2 })
      await flushPromises()
      await wrapper.setProps({ modelValue: false })
      await wrapper.setProps({ modelValue: true })
      await flushPromises()
      expect(body('.geo-point').textContent).toBe('48.8566, 2.3522')
    })
  })

  describe('searching', () => {
    it('looks for the address that is typed, and puts the pin there', async () => {
      await mount()
      adapter.search.mockResolvedValue({ lat: 51.50735, lng: -0.127758 })
      const box = body('.geo-search input')
      box.value = 'London'
      box.dispatchEvent(new Event('input'))
      await flushPromises()
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await flushPromises()
      expect(adapter.search).toHaveBeenCalledWith('London')
      expect(adapter.setPoint).toHaveBeenLastCalledWith({ lat: 51.50735, lng: -0.127758 }, { pan: true })
      expect(body('.geo-point').textContent).toBe('51.50735, -0.127758')
    })

    it('says when there is no such place', async () => {
      await mount()
      adapter.search.mockResolvedValue(null)
      wrapper.findComponent({ name: 'VDialog' })
      const box = body('.geo-search input')
      box.value = 'nowhere'
      box.dispatchEvent(new Event('input'))
      await flushPromises()
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await flushPromises()
      expect(body('.geo-message').textContent).toBe(t('TL_GEOPOINT_NO_RESULT'))
    })

    it('says when the search fails', async () => {
      await mount()
      adapter.search.mockRejectedValue(new Error('denied'))
      const box = body('.geo-search input')
      box.value = 'London'
      box.dispatchEvent(new Event('input'))
      await flushPromises()
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await flushPromises()
      expect(body('.geo-message').textContent).toBe(t('TL_GEOPOINT_SEARCH_ERROR'))
      expect(silenced).toHaveBeenCalled()
    })

    it('does not search for nothing', async () => {
      await mount()
      body('.geo-search input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await flushPromises()
      expect(adapter.search).not.toHaveBeenCalled()
    })
  })

  describe('a map without a search', () => {
    it('has no search box when the server has none', async () => {
      await mount({ config: { ...CONFIG, search: null } })
      expect(body('.geo-search')).toBeNull()
      expect(body('.geo-stage')).not.toBeNull()
    })
  })

  describe('closing', () => {
    it('takes the map down when the dialog has gone', async () => {
      await mount()
      wrapper.findComponent({ name: 'VDialog' }).vm.$emit('after-leave')
      await flushPromises()
      expect(adapter.destroy).toHaveBeenCalledTimes(1)
    })

    it('takes the map down when the component goes', async () => {
      await mount()
      wrapper.unmount()
      expect(adapter.destroy).toHaveBeenCalledTimes(1)
    })

    it('takes down a map that arrives after the dialog has gone', async () => {
      let arrive
      createMapAdapter.mockReturnValue(new Promise((resolve) => { arrive = resolve }))
      await mount()
      wrapper.findComponent({ name: 'VDialog' }).vm.$emit('after-leave')
      arrive(adapter)
      await flushPromises()
      expect(adapter.destroy).toHaveBeenCalledTimes(1)
      expect(adapter.setPoint).not.toHaveBeenCalled()
    })

    it('does not fail when the map cannot be taken down', async () => {
      await mount()
      adapter.destroy.mockImplementation(() => { throw new Error('gone') })
      expect(() => wrapper.unmount()).not.toThrow()
      expect(silenced).toHaveBeenCalled()
    })

    it('asks to close when the dialog does (Escape, a click outside)', async () => {
      await mount()
      wrapper.findComponent({ name: 'VDialog' }).vm.$emit('update:modelValue', false)
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })
  })
})
