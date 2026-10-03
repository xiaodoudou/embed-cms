import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import shortkey, { parseShortcuts, matches } from '@u/shortkey'

// a component with the directive, the way the admin uses it: the value may change, the handler reads `srcKey`
const Host = {
  directives: { shortkey },
  props: { keys: { default: () => ({ open: ['ctrl', 'p'] }) }, anywhere: Boolean },
  emits: ['fired'],
  template: `
    <div>
      <div v-if="!anywhere" class="host" v-shortkey="keys" @shortkey="$emit('fired', $event.srcKey)" />
      <div v-else class="host" v-shortkey.anywhere="keys" @shortkey="$emit('fired', $event.srcKey)" />
    </div>`
}

let wrapper
const host = (props = {}) => {
  wrapper = mount(Host, { props, attachTo: document.body })
  return wrapper
}
const fired = () => (wrapper.emitted('fired') || []).map(([name]) => name)
const press = (init, target = document) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}
const field = (tag = 'input') => {
  const element = document.createElement(tag)
  document.body.appendChild(element)
  element.focus()
  return element
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('the shortcut directive (v-shortkey)', () => {
  describe('reading a binding', () => {
    it('names each shortcut, with its modifiers and its key', () => {
      expect(parseShortcuts({ open: ['ctrl', 'p'], jump: ['/'] })).toEqual({
        open: { ctrl: true, shift: false, alt: false, key: 'p' },
        jump: { ctrl: false, shift: false, alt: false, key: '/' }
      })
    })

    it('gives a list alone the empty name, and binds nothing for false or an empty object', () => {
      expect(parseShortcuts(['ctrl', 'a'])).toEqual({ '': { ctrl: true, shift: false, alt: false, key: 'a' } })
      expect(parseShortcuts(false)).toEqual({})
      expect(parseShortcuts({})).toEqual({})
    })

    it('reads the keys whatever their case', () => {
      expect(parseShortcuts({ nav: ['Ctrl', 'B'] }).nav).toEqual({ ctrl: true, shift: false, alt: false, key: 'b' })
    })
  })

  describe('matching a key event', () => {
    const shortcut = parseShortcuts({ it: ['ctrl', 'k'] }).it

    it('takes Ctrl or Command for ctrl, and a capital letter', () => {
      expect(matches(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }), shortcut)).toBe(true)
      expect(matches(new KeyboardEvent('keydown', { key: 'k', metaKey: true }), shortcut)).toBe(true)
      expect(matches(new KeyboardEvent('keydown', { key: 'K', metaKey: true }), shortcut)).toBe(true)
    })

    it('wants exactly the modifiers named', () => {
      expect(matches(new KeyboardEvent('keydown', { key: 'k' }), shortcut)).toBe(false)
      expect(matches(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true }), shortcut)).toBe(false)
      expect(matches(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, altKey: true }), shortcut)).toBe(false)
      expect(matches(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }), shortcut)).toBe(false)
    })

    it('does not mind Shift for a character that is not a letter (a French keyboard needs it for /)', () => {
      const slash = parseShortcuts({ it: ['ctrl', '/'] }).it
      expect(matches(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, shiftKey: true }), slash)).toBe(true)
      expect(matches(new KeyboardEvent('keydown', { key: '/', ctrlKey: true }), slash)).toBe(true)
      const shifted = parseShortcuts({ it: ['ctrl', 'shift', '/'] }).it
      expect(matches(new KeyboardEvent('keydown', { key: '/', ctrlKey: true }), shifted)).toBe(false)
    })

    it('knows the named keys', () => {
      expect(matches(new KeyboardEvent('keydown', { key: 'Escape' }), parseShortcuts(['esc'])[''])).toBe(true)
      expect(matches(new KeyboardEvent('keydown', { key: ' ' }), parseShortcuts(['space'])[''])).toBe(true)
      expect(matches(new KeyboardEvent('keydown', { key: 'ArrowUp' }), parseShortcuts(['arrowup'])[''])).toBe(true)
      expect(matches(new KeyboardEvent('keydown', { key: 'Enter' }), parseShortcuts(['enter'])[''])).toBe(true)
    })
  })

  describe('on an element', () => {
    it('sends the element a shortkey event named after the shortcut, and keeps the keys from the browser', () => {
      host({ keys: { open: ['ctrl', 'p'], jump: ['/'] } })
      expect(press({ key: 'p', ctrlKey: true }).defaultPrevented).toBe(true)
      expect(press({ key: '/' }).defaultPrevented).toBe(true)
      expect(fired()).toEqual(['open', 'jump'])
    })

    it('names a list alone with the empty name', () => {
      host({ keys: ['ctrl', 'a'] })
      press({ key: 'a', ctrlKey: true })
      expect(fired()).toEqual([''])
    })

    it('leaves other keys to the page', () => {
      host()
      expect(press({ key: 'p' }).defaultPrevented).toBe(false)
      expect(press({ key: 'p', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false)
      expect(fired()).toEqual([])
    })

    it('leaves the keys to a text field, an editable element or a drop-down that has the focus', () => {
      host()
      for (const tag of ['input', 'textarea', 'select']) {
        const element = field(tag)
        expect(press({ key: 'p', ctrlKey: true }, element).defaultPrevented).toBe(false)
      }
      const editable = field('div')
      editable.setAttribute('contenteditable', 'true')
      Object.defineProperty(editable, 'isContentEditable', { value: true })
      expect(press({ key: 'p', ctrlKey: true }, editable).defaultPrevented).toBe(false)
      expect(fired()).toEqual([])
    })

    it('fires from a text field too with the anywhere modifier', () => {
      host({ anywhere: true })
      expect(press({ key: 'p', ctrlKey: true }, field()).defaultPrevented).toBe(true)
      expect(fired()).toEqual(['open'])
    })

    it('leaves a key the page already took', () => {
      host()
      document.body.addEventListener('keydown', (event) => event.preventDefault(), { once: true })
      press({ key: 'p', ctrlKey: true }, document.body)
      expect(fired()).toEqual([])
    })

    it('follows the value when it changes, and binds nothing for false', async () => {
      host()
      await wrapper.setProps({ keys: { close: ['esc'] } })
      expect(press({ key: 'p', ctrlKey: true }).defaultPrevented).toBe(false)
      press({ key: 'Escape' })
      expect(fired()).toEqual(['close'])
      await wrapper.setProps({ keys: false })
      expect(press({ key: 'Escape' }).defaultPrevented).toBe(false)
      expect(fired()).toEqual(['close'])
    })

    it('stops listening when the element goes away', async () => {
      host()
      wrapper.unmount()
      wrapper = undefined
      await nextTick()
      expect(press({ key: 'p', ctrlKey: true }).defaultPrevented).toBe(false)
    })

    it('fires once when two elements bind the same keys: the first mounted one', () => {
      const first = host()
      const second = mount(Host, { attachTo: document.body })
      press({ key: 'p', ctrlKey: true })
      expect(first.emitted('fired')).toHaveLength(1)
      expect(second.emitted('fired')).toBeUndefined()
      second.unmount()
    })
  })
})
