import _ from 'lodash'

/**
 * `v-shortkey`: keyboard shortcuts that work on the whole page while their element is mounted.
 *
 *   <div v-shortkey="{open: ['ctrl', 'p'], jump: ['/']}" @shortkey="onShortkey">
 *
 * The value names the shortcuts, each a list of keys pressed together. A list alone (`['ctrl', 'a']`) is one shortcut
 * named ''; `false` or `{}` binds nothing, and the value may change at any time. When a shortcut is pressed, the
 * element receives a `shortkey` event whose `srcKey` is the name of the shortcut, and the browser's own meaning of the
 * keys is prevented.
 *
 * Keys: `ctrl` is the Control key, or the Command key on a Mac; `shift` and `alt` are themselves; any other key is
 * `event.key` in lower case: a letter, a digit, `/`, `esc`, `enter`, `tab`, `space`, `arrowup`, `f2`... Shift is not
 * checked for a character that is not a letter (`/` needs it on a French keyboard).
 *
 * A shortcut is left to the field while a person types in an input, a textarea, a select or an editable element,
 * unless the binding has the `.anywhere` modifier (`v-shortkey.anywhere`). A key event the page already took
 * (`defaultPrevented`) is left alone too: when two elements bind the same shortcut, the first mounted one fires.
 *
 * Replaces vue3-shortkey (MIT, Fagner Araujo and Rodrigo Peña): its npm release prints its debug output, and it never
 * knew the Command key.
 */

const MODIFIERS = ['ctrl', 'shift', 'alt']
const KEY_NAMES = { Escape: 'esc', ' ': 'space', Delete: 'del' }
const TEXT_FIELDS = ['input', 'textarea', 'select']
const states = new WeakMap()

/**
 * The shortcuts of a binding value, by name.
 * @param {object|Array|false} value
 * @returns {Object<string, {ctrl: boolean, shift: boolean, alt: boolean, key: string}>}
 */
export function parseShortcuts (value) {
  const named = _.isArray(value) ? { '': value } : _.isPlainObject(value) ? value : {}
  return _.mapValues(named, (keys) => {
    const names = _.map(keys, _.toLower)
    return {
      ctrl: _.includes(names, 'ctrl'),
      shift: _.includes(names, 'shift'),
      alt: _.includes(names, 'alt'),
      key: _.find(names, (name) => !_.includes(MODIFIERS, name)) || ''
    }
  })
}

/**
 * Whether a key event is a shortcut.
 * @param {KeyboardEvent} event
 * @param {{ctrl: boolean, shift: boolean, alt: boolean, key: string}} shortcut
 * @returns {boolean}
 */
export function matches (event, shortcut) {
  const key = KEY_NAMES[event.key] || _.toLower(event.key)
  if (key !== shortcut.key || shortcut.ctrl !== (event.ctrlKey || event.metaKey) || shortcut.alt !== event.altKey) {
    return false
  }
  if (shortcut.shift === event.shiftKey) {
    return true
  }
  // a character that is not a letter may need Shift on some keyboards: it matches whatever Shift does
  return !shortcut.shift && key.length === 1 && !/[a-z]/.test(key)
}

/**
 * @param {EventTarget} target
 * @returns {boolean} an input, a textarea, a select or a contenteditable
 */
function inTextField (target) {
  return _.includes(TEXT_FIELDS, _.toLower(_.get(target, 'tagName', ''))) || _.get(target, 'isContentEditable', false) === true
}

/**
 * @param {Object} state of the directive
 * @param {Object} binding its value, the shortcuts; the anywhere modifier
 */
function read (state, binding) {
  state.shortcuts = parseShortcuts(binding.value)
  state.anywhere = binding.modifiers.anywhere === true
}

export default {
  mounted (el, binding) {
    const state = { shortcuts: {}, anywhere: false }
    state.listener = (event) => {
      if (event.defaultPrevented || (!state.anywhere && inTextField(event.target))) {
        return
      }
      const name = _.findKey(state.shortcuts, (shortcut) => matches(event, shortcut))
      if (name === undefined) {
        return
      }
      event.preventDefault()
      const fired = new CustomEvent('shortkey')
      fired.srcKey = name
      el.dispatchEvent(fired)
    }
    read(state, binding)
    states.set(el, state)
    document.addEventListener('keydown', state.listener)
  },
  updated (el, binding) {
    read(states.get(el), binding)
  },
  unmounted (el) {
    const state = states.get(el)
    if (state) {
      document.removeEventListener('keydown', state.listener)
      states.delete(el)
    }
  }
}
