import { describe, it, expect, afterEach } from 'vitest'
import RatingField from '@c/fields/RatingField.vue'
import { mountField } from './helpers/mountField.js'

// The rating field: icons filled up to the value, chosen with a click or the arrow keys, as a group of radio buttons.

let wrapper
const mount = (schema = {}, model = {}) => {
  wrapper = mountField(RatingField, { model, schema: { model: 'score', label: 'Score', ...schema }, attachTo: document.body })
  return wrapper
}
const steps = () => wrapper.findAll('[role=radio]')
const checked = () => steps().map((step, index) => (step.attributes('aria-checked') === 'true' ? index : -1)).filter(index => index >= 0)
const icons = () => wrapper.findAll('.rating-item')
const fills = () => icons().map(item => item.classes().find(name => /^is-(full|half|empty)$/.test(name)).replace('is-', ''))

afterEach(() => wrapper?.unmount())

describe('RatingField', () => {
  describe('what it shows', () => {
    it('has five empty stars, the label and the hint, and is a group of radio buttons named by the label', () => {
      mount({ options: { hint: 'How good it is' } })
      expect(icons()).toHaveLength(5)
      expect(fills()).toEqual(['empty', 'empty', 'empty', 'empty', 'empty'])
      expect(wrapper.text()).toContain('Score')
      expect(wrapper.get('.help-block').text()).toBe('How good it is')
      const group = wrapper.get('[role=radiogroup]')
      expect(group.attributes('aria-label')).toBe('Score')
      expect(steps()).toHaveLength(5)
    })

    it('fills the icons up to the value, and says it in numbers', () => {
      mount({}, { score: 3 })
      expect(fills()).toEqual(['full', 'full', 'full', 'empty', 'empty'])
      expect(checked()).toEqual([2])
      expect(wrapper.get('.rating-text').text()).toBe('3 / 5')
    })

    it('shows nothing for no rating, and for a value that is not one', () => {
      mount({}, { score: 'abc' })
      expect(fills()).toEqual(['empty', 'empty', 'empty', 'empty', 'empty'])
      expect(wrapper.get('.rating-text').text()).toBe('')
      expect(checked()).toEqual([])
    })

    it('has the number of icons the field says, from one to ten', () => {
      mount({ options: { max: 3 } })
      expect(icons()).toHaveLength(3)
      wrapper.unmount()
      mount({ options: { max: 40 } })
      expect(icons()).toHaveLength(10)
    })

    it('is made of the icon the field says, in its colour', () => {
      mount({ options: { icon: 'heart' } })
      expect(icons()[0].attributes('style')).toContain('--cms-error')
      wrapper.unmount()
      mount({ options: { icon: 'bolt', color: 'success' } })
      expect(icons()[0].attributes('style')).toContain('--cms-success')
    })

    it('marks a required rating with a star, as every field does', () => {
      mount({ required: true })
      expect(wrapper.find('.required-mark').exists()).toBe(true)
      expect(wrapper.get('[role=radiogroup]').attributes('aria-required')).toBe('true')
    })

    it('names each radio button by the label and its place', () => {
      mount({ options: { max: 3 } })
      expect(steps().map(step => step.attributes('aria-label'))).toEqual(['Score: 1 of 3', 'Score: 2 of 3', 'Score: 3 of 3'])
    })
  })

  describe('choosing', () => {
    it('writes the rating of the icon that is clicked, and tells the form', async () => {
      const model = {}
      mount({}, model)
      await steps()[3].trigger('click')
      expect(model.score).toBe(4)
      expect(wrapper.emitted('input')[0]).toEqual([4, 'score'])
      expect(fills()).toEqual(['full', 'full', 'full', 'full', 'empty'])
    })

    it('changes the rating with another click', async () => {
      const model = { score: 2 }
      mount({}, model)
      await steps()[4].trigger('click')
      expect(model.score).toBe(5)
    })

    it('takes the rating away when the same icon is clicked again, so that a required rating is missing again', async () => {
      const model = { score: 4 }
      mount({ required: true }, model)
      await steps()[3].trigger('click')
      expect(model.score).toBeUndefined()
      expect(wrapper.emitted('input').at(-1)).toEqual([undefined, 'score'])
      expect(wrapper.get('.rating-text').text()).toBe('')
    })

    it('keeps the rating when the field cannot be cleared', async () => {
      const model = { score: 4 }
      mount({ options: { clearable: false } }, model)
      await steps()[3].trigger('click')
      expect(model.score).toBe(4)
      expect(wrapper.find('.rating-clear').exists()).toBe(false)
    })

    it('has a button that takes the rating away, only when there is one', async () => {
      const model = { score: 2 }
      mount({}, model)
      expect(wrapper.get('.rating-clear').attributes('aria-label')).toBe('Clear the rating')
      await wrapper.get('.rating-clear').trigger('click')
      expect(model.score).toBeUndefined()
      expect(wrapper.find('.rating-clear').exists()).toBe(false)
    })

    it('previews the rating under the pointer, and goes back to the value when it leaves', async () => {
      mount({}, { score: 1 })
      await steps()[3].trigger('mouseenter')
      expect(fills()).toEqual(['full', 'full', 'full', 'full', 'empty'])
      await wrapper.get('.rating-items').trigger('mouseleave')
      expect(fills()).toEqual(['full', 'empty', 'empty', 'empty', 'empty'])
    })
  })

  describe('half steps', () => {
    it('has two radio buttons for each icon, one over each half', () => {
      mount({ options: { half: true, max: 3 } })
      expect(steps()).toHaveLength(6)
      expect(steps().map(step => step.attributes('aria-label'))).toEqual(['Score: 0.5 of 3', 'Score: 1 of 3', 'Score: 1.5 of 3', 'Score: 2 of 3', 'Score: 2.5 of 3', 'Score: 3 of 3'])
      expect(steps().filter(step => step.classes('is-left'))).toHaveLength(3)
      expect(icons()[0].classes()).toContain('has-half')
    })

    it('fills half an icon for a half, and writes it', async () => {
      const model = {}
      mount({ options: { half: true } }, model)
      await steps()[4].trigger('click')
      expect(model.score).toBe(2.5)
      expect(fills()).toEqual(['full', 'full', 'half', 'empty', 'empty'])
      expect(wrapper.get('.rating-text').text()).toBe('2.5 / 5')
    })

    it('takes a value in between to the nearest half', () => {
      mount({ options: { half: true } }, { score: 2.7 })
      expect(fills()).toEqual(['full', 'full', 'half', 'empty', 'empty'])
    })

    it('has none without the option, whatever the value', () => {
      mount({}, { score: 2.5 })
      expect(steps()).toHaveLength(5)
      expect(wrapper.get('.rating-text').text()).toBe('3 / 5')
    })
  })

  describe('the keyboard', () => {
    it('has one radio button in the tab order: the value, else the first', () => {
      mount({}, { score: 3 })
      expect(steps().map(step => step.attributes('tabindex'))).toEqual(['-1', '-1', '0', '-1', '-1'])
      wrapper.unmount()
      mount()
      expect(steps().map(step => step.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1'])
    })

    it('moves by a step with the arrows, and writes it', async () => {
      const model = { score: 2 }
      mount({}, model)
      await steps()[1].trigger('keydown', { key: 'ArrowRight' })
      expect(model.score).toBe(3)
      await steps()[2].trigger('keydown', { key: 'ArrowUp' })
      expect(model.score).toBe(4)
      await steps()[3].trigger('keydown', { key: 'ArrowLeft' })
      expect(model.score).toBe(3)
      await steps()[2].trigger('keydown', { key: 'ArrowDown' })
      expect(model.score).toBe(2)
    })

    it('stops at the ends, and Home and End go to them', async () => {
      const model = { score: 5 }
      mount({}, model)
      await steps()[4].trigger('keydown', { key: 'ArrowRight' })
      expect(model.score).toBe(5)
      await steps()[4].trigger('keydown', { key: 'Home' })
      expect(model.score).toBe(1)
      await steps()[0].trigger('keydown', { key: 'ArrowLeft' })
      expect(model.score).toBe(1)
      await steps()[0].trigger('keydown', { key: 'End' })
      expect(model.score).toBe(5)
    })

    it('moves by half with half steps', async () => {
      const model = { score: 2 }
      mount({ options: { half: true } }, model)
      await steps()[3].trigger('keydown', { key: 'ArrowRight' })
      expect(model.score).toBe(2.5)
    })

    it('takes the rating away with Delete or Backspace', async () => {
      const model = { score: 2 }
      mount({}, model)
      await steps()[1].trigger('keydown', { key: 'Delete' })
      expect(model.score).toBeUndefined()
      model.score = 3
      await wrapper.vm.$nextTick()
      await steps()[2].trigger('keydown', { key: 'Backspace' })
      expect(model.score).toBeUndefined()
    })

    it('leaves the other keys alone', async () => {
      const model = { score: 2 }
      mount({}, model)
      await steps()[1].trigger('keydown', { key: 'a' })
      await steps()[1].trigger('keydown', { key: 'Tab' })
      expect(model.score).toBe(2)
    })
  })

  describe('read-only and disabled', () => {
    it('shows the rating and changes nothing when it is read-only', async () => {
      const model = { score: 2 }
      mount({ readonly: true }, model)
      expect(wrapper.classes()).toContain('is-readonly')
      expect(steps().every(step => step.attributes('disabled') !== undefined)).toBe(true)
      await steps()[4].trigger('click')
      await steps()[1].trigger('keydown', { key: 'ArrowRight' })
      expect(model.score).toBe(2)
      expect(wrapper.find('.rating-clear').exists()).toBe(false)
      expect(wrapper.get('[role=radiogroup]').attributes('aria-readonly')).toBe('true')
    })

    it('does not preview a rating under the pointer when it is locked', async () => {
      mount({ readonly: true }, { score: 1 })
      await steps()[3].trigger('mouseenter')
      expect(fills()).toEqual(['full', 'empty', 'empty', 'empty', 'empty'])
    })

    it('is greyed out when it is disabled, and changes nothing', async () => {
      const model = { score: 3 }
      mount({ disabled: true }, model)
      expect(wrapper.classes()).toContain('is-disabled')
      expect(wrapper.get('[role=radiogroup]').attributes('aria-disabled')).toBe('true')
      await steps()[0].trigger('click')
      expect(model.score).toBe(3)
    })
  })

  describe('a record with a model path', () => {
    it('reads and writes the value at the path of the field, in a locale too', async () => {
      const model = { rating: { enUS: 4 } }
      mount({ model: 'rating.enUS' }, model)
      expect(fills()).toEqual(['full', 'full', 'full', 'full', 'empty'])
      await steps()[1].trigger('click')
      expect(model.rating.enUS).toBe(2)
    })
  })
})
