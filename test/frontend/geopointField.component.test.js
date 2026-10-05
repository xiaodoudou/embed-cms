import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import GeopointField from '@c/fields/GeopointField.vue'
import MapService from '@s/MapService'
import { mountField, TranslateService } from './helpers/mountField.js'

// The geopoint field: a latitude box and a longitude box, kept as { lat, lng }, with a map to pick on.

const NO_MAPS = { enabled: false }
const MAPS = { enabled: true, tiles: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: { text: '© OpenStreetMap contributors' }, maxZoom: 19 }, search: { url: 'https://nominatim.openstreetmap.org/search' } }

let wrapper
const mount = async (schema = {}, model = {}, maps = NO_MAPS) => {
  vi.spyOn(MapService, 'load').mockResolvedValue(maps)
  wrapper = mountField(GeopointField, { model, schema: { model: 'place', label: 'Place', ...schema }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const lat = () => wrapper.get('input[name="place-lat"]')
const lng = () => wrapper.get('input[name="place-lng"]')
const type = async (input, text) => {
  input.element.value = text
  await input.trigger('input')
  await flushPromises()
}
const leave = async (input) => {
  await input.trigger('blur')
  await flushPromises()
}
const t = key => TranslateService.get(key)

beforeEach(() => vi.restoreAllMocks())
afterEach(() => wrapper?.unmount())

describe('GeopointField', () => {
  describe('what it shows', () => {
    it('has a box for the latitude and one for the longitude, with the label and the hint', async () => {
      await mount({ options: { hint: 'Where it is' } })
      expect(wrapper.text()).toContain('Place')
      expect(lat().attributes('placeholder')).toBe('Latitude')
      expect(lng().attributes('placeholder')).toBe('Longitude')
      expect(wrapper.get('.help-block').text()).toBe('Where it is')
    })

    it('has real labels: the latitude has the one of the field too, the longitude its own, and the pair is a group named by the field', async () => {
      await mount({})
      const latId = lat().attributes('id')
      const lngId = lng().attributes('id')
      expect(wrapper.get(`label[for="${latId}"].field-label`).text()).toContain('Place')
      expect(wrapper.findAll(`label[for="${latId}"]`).map(label => label.text()).join(' ')).toContain('Latitude')
      expect(wrapper.get(`label[for="${lngId}"]`).text()).toBe('Longitude')
      const group = wrapper.get('[role="group"]')
      expect(wrapper.get(`#${group.attributes('aria-labelledby')}`).text()).toContain('Place')
    })

    it('points every aria-labelledby at an element that is there, and gives every box a label', async () => {
      await mount({}, {})
      for (const element of wrapper.element.querySelectorAll('[aria-labelledby]')) {
        for (const id of element.getAttribute('aria-labelledby').split(/\s+/)) {
          expect(document.getElementById(id), id).not.toBeNull()
        }
      }
      for (const input of wrapper.element.querySelectorAll('input')) {
        expect(input.labels.length + (input.getAttribute('aria-label') ? 1 : 0), input.name).toBeGreaterThan(0)
      }
    })

    it('shows a value as its two numbers, without zeros at the end', async () => {
      await mount({}, { place: { lat: 48.8566, lng: 2.3 } })
      expect(lat().element.value).toBe('48.8566')
      expect(lng().element.value).toBe('2.3')
    })

    it('shows nothing for no value, and 0 for a point on the equator', async () => {
      await mount({}, {})
      expect(lat().element.value).toBe('')
      wrapper.unmount()
      await mount({}, { place: { lat: 0, lng: 0 } })
      expect(lat().element.value).toBe('0')
      expect(lng().element.value).toBe('0')
    })

    it('does not show a value that is not a point', async () => {
      await mount({}, { place: { lat: 100, lng: 0 } })
      expect(lat().element.value).toBe('')
    })

    it('marks a required field with a star', async () => {
      await mount({ required: true })
      expect(wrapper.find('.required-mark').exists()).toBe(true)
    })

    it('shows the value of another record when the record changes', async () => {
      await mount({}, { place: { lat: 1, lng: 2 } })
      await wrapper.setProps({ model: { place: { lat: 3.5, lng: -4.25 } } })
      expect(lat().element.value).toBe('3.5')
      expect(lng().element.value).toBe('-4.25')
    })

    it('shows with the decimals of the field', async () => {
      await mount({ options: { precision: 2 } }, { place: { lat: 48.856601, lng: 2.352222 } })
      expect(lat().element.value).toBe('48.86')
      expect(lng().element.value).toBe('2.35')
    })
  })

  describe('typing', () => {
    it('writes the point to the record, and tells the form', async () => {
      const model = {}
      await mount({}, model)
      await type(lat(), '48.8566')
      expect(model.place).toBeUndefined()
      await type(lng(), '2.3522')
      expect(model.place).toEqual({ lat: 48.8566, lng: 2.3522 })
      expect(wrapper.emitted('input').at(-1)).toEqual([{ lat: 48.8566, lng: 2.3522 }, 'place'])
    })

    it('holds nothing while one of the boxes is empty or is not a number', async () => {
      const model = { place: { lat: 1, lng: 2 } }
      await mount({}, model)
      await type(lng(), '')
      expect(model.place).toBeUndefined()
      await type(lng(), '2')
      expect(model.place).toEqual({ lat: 1, lng: 2 })
      await type(lat(), 'abc')
      expect(model.place).toBeUndefined()
    })

    it('rounds to the decimals of the field', async () => {
      const model = {}
      await mount({ options: { precision: 3 } }, model)
      await type(lat(), '48.856601')
      await type(lng(), '2.352222')
      expect(model.place).toEqual({ lat: 48.857, lng: 2.352 })
    })

    it('reads the sides and the degrees, minutes and seconds', async () => {
      const model = {}
      await mount({}, model)
      await type(lat(), '33.9 S')
      await type(lng(), '2°21\'8"W')
      expect(model.place.lat).toBe(-33.9)
      expect(model.place.lng).toBeCloseTo(-2.352222, 5)
    })

    it('fills both boxes from a pair pasted in the latitude box', async () => {
      const model = {}
      await mount({}, model)
      await type(lat(), '48.8566, 2.3522')
      expect(lat().element.value).toBe('48.8566')
      expect(lng().element.value).toBe('2.3522')
      expect(model.place).toEqual({ lat: 48.8566, lng: 2.3522 })
    })

    it('fills both boxes from a pair pasted in the longitude box, with its sides', async () => {
      const model = {}
      await mount({}, model)
      await type(lng(), 'N 48.8566 E 2.3522')
      expect(lat().element.value).toBe('48.8566')
      expect(lng().element.value).toBe('2.3522')
      expect(model.place).toEqual({ lat: 48.8566, lng: 2.3522 })
    })

    it('does not take a comma as a pair when it is the decimal mark of one number', async () => {
      const model = {}
      await mount({}, model)
      await type(lat(), '48,8566')
      expect(lat().element.value).toBe('48,8566')
      expect(lng().element.value).toBe('')
      await type(lng(), '2,3522')
      expect(model.place).toEqual({ lat: 48.8566, lng: 2.3522 })
    })

    it('writes what was typed as it is kept, when the box is left', async () => {
      await mount({}, {})
      await type(lat(), '33.900 S')
      await leave(lat())
      expect(lat().element.value).toBe('-33.9')
    })

    it('does not change what is typed while it is wrong', async () => {
      await mount({}, {})
      await type(lat(), '12x')
      await leave(lat())
      expect(lat().element.value).toBe('12x')
    })

    it('does nothing when the field is locked', async () => {
      const model = {}
      await mount({}, model)
      wrapper.vm.isLocked = () => true
      await type(lat(), '5')
      await type(lng(), '5')
      expect(model.place).toBeUndefined()
    })
  })

  describe('what is wrong', () => {
    it('says which box is not right, when it is left', async () => {
      await mount({}, {})
      await type(lat(), '95')
      await leave(lat())
      expect(wrapper.get('.geopoint-error').text()).toBe(t('TL_INVALID_LATITUDE'))
      expect(wrapper.get('.geopoint-error').attributes('role')).toBe('alert')
      await type(lat(), '45')
      // (the longitude is still missing)
      expect(wrapper.get('.geopoint-error').text()).toBe(t('TL_GEOPOINT_BOTH'))
      await type(lng(), '20')
      expect(wrapper.find('.geopoint-error').exists()).toBe(false)
      await type(lng(), '200')
      await leave(lng())
      expect(wrapper.get('.geopoint-error').text()).toBe(t('TL_INVALID_LONGITUDE'))
    })

    it('wants both boxes when one is filled', async () => {
      await mount({}, {})
      await type(lat(), '45')
      await leave(lat())
      expect(wrapper.get('.geopoint-error').text()).toBe(t('TL_GEOPOINT_BOTH'))
      await type(lng(), '7')
      expect(wrapper.find('.geopoint-error').exists()).toBe(false)
    })

    it('says nothing of an empty field that is required, until the form is saved', async () => {
      await mount({ required: true }, {})
      expect(wrapper.find('.geopoint-error').exists()).toBe(false)
      expect(wrapper.vm.rule('lat')).toBe(t('TL_FIELD_IS_REQUIRED'))
      expect(wrapper.vm.rule('lng')).toBe(t('TL_FIELD_IS_REQUIRED'))
      expect(wrapper.find('.geopoint-error').exists()).toBe(false)
    })

    it('reddens the box that is wrong and not the other', async () => {
      await mount({}, {})
      await type(lat(), '95')
      await type(lng(), '2')
      expect(wrapper.vm.rule('lat')).toBe(t('TL_INVALID_LATITUDE'))
      expect(wrapper.vm.rule('lng')).toBe(true)
      await type(lat(), '45')
      await type(lng(), '')
      expect(wrapper.vm.rule('lat')).toBe(true)
      expect(wrapper.vm.rule('lng')).toBe(t('TL_GEOPOINT_BOTH'))
    })

    it('does not leave the latitude red because the longitude was missing when it was left', async () => {
      await mount({}, {})
      await type(lat(), '33.9 S')
      await leave(lat())
      expect(wrapper.get('.geopoint-error').text()).toBe(t('TL_GEOPOINT_BOTH'))
      expect(wrapper.findAll('.v-field--error')).toHaveLength(0)
      await type(lng(), '18.4')
      expect(wrapper.find('.geopoint-error').exists()).toBe(false)
      expect(wrapper.findAll('.v-field--error')).toHaveLength(0)
    })

    it('is fine for a point', async () => {
      await mount({ required: true }, { place: { lat: 1, lng: 2 } })
      expect(wrapper.vm.rule('lat')).toBe(true)
      expect(wrapper.vm.rule('lng')).toBe(true)
    })
  })

  describe('clearing', () => {
    it('has a button that takes the point away, only when there is one', async () => {
      const model = { place: { lat: 1, lng: 2 } }
      await mount({}, model)
      await wrapper.get('.geopoint-clear').trigger('click')
      expect(model.place).toBeUndefined()
      expect(lat().element.value).toBe('')
      expect(lng().element.value).toBe('')
      expect(wrapper.find('.geopoint-clear').exists()).toBe(false)
      expect(wrapper.emitted('input').at(-1)).toEqual([undefined, 'place'])
    })

    it('has a name for the button', async () => {
      await mount({}, { place: { lat: 1, lng: 2 } })
      expect(wrapper.get('.geopoint-clear').attributes('aria-label')).toBe('Clear the point')
    })
  })

  describe('the map', () => {
    it('has no button to pick on a map when the server turns the map off', async () => {
      await mount({}, {}, NO_MAPS)
      expect(wrapper.find('.geopoint-pick').exists()).toBe(false)
      expect(wrapper.findComponent({ name: 'GeoPickerDialog' }).exists()).toBe(false)
    })

    it('has one when the server has a map', async () => {
      await mount({}, {}, MAPS)
      expect(wrapper.get('.geopoint-pick').text()).toBe('Pick on map')
    })

    it('gives the dialog the map of the server, and the options of the field', async () => {
      await mount({ options: { zoom: 9, precision: 3 } }, {}, MAPS)
      const dialog = wrapper.findComponent({ name: 'GeoPickerDialog' })
      expect(dialog.props('config')).toEqual(MAPS)
      expect(dialog.props('options')).toMatchObject({ zoom: 9, precision: 3 })
    })

    it('opens the dialog with the point of the field, and writes the point that is picked', async () => {
      const model = { place: { lat: 1, lng: 2 } }
      await mount({}, model, MAPS)
      await wrapper.get('.geopoint-pick').trigger('click')
      const dialog = wrapper.findComponent({ name: 'GeoPickerDialog' })
      expect(dialog.props('modelValue')).toBe(true)
      expect(dialog.props('point')).toEqual({ lat: 1, lng: 2 })
      dialog.vm.$emit('pick', { lat: 31.230416, lng: 121.473701 })
      await flushPromises()
      expect(model.place).toEqual({ lat: 31.230416, lng: 121.473701 })
      expect(lat().element.value).toBe('31.230416')
      expect(lng().element.value).toBe('121.473701')
    })

    it('clears what was wrong when a point is picked', async () => {
      await mount({}, {}, MAPS)
      await type(lat(), '999')
      await leave(lat())
      expect(wrapper.find('.geopoint-error').exists()).toBe(true)
      wrapper.findComponent({ name: 'GeoPickerDialog' }).vm.$emit('pick', { lat: 1, lng: 2 })
      await flushPromises()
      expect(wrapper.find('.geopoint-error').exists()).toBe(false)
    })

    it('does not ask the server for the map for a field that cannot be changed', async () => {
      await mount({ readonly: true }, { place: { lat: 1, lng: 2 } }, MAPS)
      expect(MapService.load).not.toHaveBeenCalled()
      expect(wrapper.find('.geopoint-pick').exists()).toBe(false)
    })
  })

  describe('read-only and disabled', () => {
    it('shows the point and offers no way to change it', async () => {
      await mount({ readonly: true }, { place: { lat: 1, lng: 2 } }, MAPS)
      expect(lat().element.value).toBe('1')
      expect(lat().attributes('readonly')).toBeDefined()
      expect(lat().attributes('aria-readonly')).toBe('true')
      expect(wrapper.find('.geopoint-pick').exists()).toBe(false)
      expect(wrapper.find('.geopoint-clear').exists()).toBe(false)
      expect(wrapper.classes()).toContain('is-readonly')
    })

    it('greys it out', async () => {
      await mount({ disabled: true }, { place: { lat: 1, lng: 2 } }, MAPS)
      expect(lat().attributes('disabled')).toBeDefined()
      expect(wrapper.find('.geopoint-pick').exists()).toBe(false)
      expect(wrapper.classes()).toContain('is-disabled')
    })
  })
})
