import _ from 'lodash'

// The masks of the admin: a template that stays in the box while it is typed in, `__:__` or `(___) ___-____`. The template says what each character is:
//   `_` or `#`  a digit        `A`  a letter        `*`  a letter or a digit        `\`  the next character is itself, whatever it is (`\A`, `\_`)
// and anything else is written as it is. The duration field and the strings with `options.mask` use it, and so can any field that wants a template.
// A template can also force the case of the letters that are typed (`options.maskCase`: 'upper' or 'lower'): see parseMask.

const SLOTS = { _: 'digit', '#': 'digit', A: 'letter', '*': 'alnum' }
// the letters of a language that has them (accents included); the digits are the ones of the Latin script
const TESTS = { digit: /^[0-9]$/, letter: /^\p{L}$/u, alnum: /^[\p{L}0-9]$/u }

/**
 * @param {string} pattern the template, `(___) ___-____`
 * @param {string} [letterCase] 'upper' or 'lower': the letters typed or pasted are written in that case (anything else leaves them as they are)
 * @returns {{pattern: string, tokens: Array<{slot: string}|{literal: string}>, size: number, groups: Array<{start: number, size: number}>, letterCase?: string}|null} the template read: its
 *   characters (a slot, or a literal), how many characters can be typed, and the runs of slots between the literals (`__:__` has two of two); nothing when it has no slot
 */
export function parseMask (pattern, letterCase) {
  if (!_.isString(pattern)) {
    return null
  }
  const tokens = []
  for (let at = 0; at < pattern.length; at++) {
    const char = pattern[at]
    if (char === '\\' && at + 1 < pattern.length) {
      tokens.push({ literal: pattern[++at] })
    } else if (SLOTS[char]) {
      tokens.push({ slot: SLOTS[char] })
    } else {
      tokens.push({ literal: char })
    }
  }
  return fromTokens(tokens, pattern, letterCase)
}

/**
 * @param {Array<Object>} tokens
 * @param {string} [pattern]
 * @param {string} [letterCase] 'upper' or 'lower'
 * @returns {Object|null} the mask the tokens make; nothing when none is a slot
 */
function fromTokens (tokens, pattern, letterCase) {
  const groups = []
  let slots = 0
  _.each(tokens, (token, index) => {
    if (token.slot) {
      if (index > 0 && tokens[index - 1].slot) {
        _.last(groups).size++
      } else {
        groups.push({ start: slots, size: 1 })
      }
      slots++
    }
  })
  if (!slots) {
    return null
  }
  const mask = { pattern, tokens, size: slots, groups }
  if (letterCase === 'upper' || letterCase === 'lower') {
    mask.letterCase = letterCase
  }
  return mask
}

/**
 * @param {Object} mask
 * @param {number} index the group to widen
 * @param {number} extra how many slots to add to its end, of the type of its last
 * @returns {Object} a mask with the group wider
 */
export function widenGroup (mask, index, extra) {
  const group = mask.groups[index]
  const slots = _.reduce(mask.tokens, (found, token, at) => token.slot ? [...found, at] : found, [])
  const last = slots[group.start + group.size - 1]
  const added = _.times(extra, () => ({ slot: mask.tokens[last].slot }))
  return fromTokens([...mask.tokens.slice(0, last + 1), ...added, ...mask.tokens.slice(last + 1)], undefined, mask.letterCase)
}

/**
 * @param {string} char one character that fits a slot
 * @param {Object} mask
 * @returns {string} the character in the case the mask forces, if it has one. A letter that changes size in the other case (`ß` is `SS` in capitals) stays as it is: it must fill one place.
 */
function inCase (char, mask) {
  const changed = mask.letterCase === 'upper' ? char.toUpperCase() : mask.letterCase === 'lower' ? char.toLowerCase() : char
  return changed.length === char.length ? changed : char
}

/**
 * @param {string} type 'digit', 'letter' or 'alnum'
 * @param {string} char
 * @returns {boolean} the character fits a slot of that type
 */
export function fitsSlot (type, char) {
  return TESTS[type].test(char)
}

/**
 * @param {string} chars what is typed, one character for each slot filled
 * @param {Object} mask see parseMask
 * @returns {string} the template filled as far as the characters go, an underscore for each slot left (`(55_) ___-____`)
 */
export function maskText (chars, mask) {
  let at = 0
  return _.map(mask.tokens, token => token.slot ? (chars[at++] || '_') : token.literal).join('')
}

/**
 * @param {string} chars
 * @param {Object} mask
 * @returns {number} where the next character goes in the text of the template: the first slot left, else the end
 */
export function maskCaret (chars, mask) {
  const text = maskText(chars, mask)
  let at = 0
  for (let index = 0; index < mask.tokens.length; index++) {
    if (mask.tokens[index].slot && at++ === chars.length) {
      return index
    }
  }
  return text.length
}

/**
 * What a key does to the characters typed. A character that fits the next slot goes into it; the characters of the template itself, and what does not fit, are left alone.
 * With `pad`, anything that does not fit ends the group of digits that is being typed, which is filled from the left with zeros (`1` then `:` make `01`).
 * @param {string} chars
 * @param {Object} mask
 * @param {string} key one character
 * @param {{pad?: boolean}} [options]
 * @returns {string} the characters after it
 */
export function maskType (chars, mask, key, options = {}) {
  const slots = _.filter(mask.tokens, 'slot')
  if (chars.length < mask.size && fitsSlot(slots[chars.length].slot, key)) {
    return chars + inCase(key, mask)
  }
  if (options.pad) {
    const group = _.find(mask.groups, ({ start, size }) => chars.length < start + size)
    const typed = group ? chars.length - group.start : 0
    if (group && typed > 0 && _.every(slots.slice(group.start, group.start + group.size), { slot: 'digit' })) {
      return chars.slice(0, group.start) + _.repeat('0', group.size - typed) + chars.slice(group.start)
    }
  }
  return chars
}

/**
 * @param {string} chars
 * @param {Object} mask
 * @returns {string} what is typed, written with the characters of the template between them, as far as it goes: `(555) 12` for five digits and then two (nothing before the
 *   first character, nothing after the last); empty when nothing is typed
 */
export function maskValue (chars, mask) {
  if (chars === '') {
    return ''
  }
  let at = 0
  let out = ''
  let pending = ''
  for (const token of mask.tokens) {
    if (!token.slot) {
      pending += token.literal
    } else if (at < chars.length) {
      out += pending + chars[at++]
      pending = ''
    } else {
      break
    }
  }
  return out
}

/**
 * @param {string} text a value, or a text pasted: written with the template or not (`555-123-4567`, `5551234567`)
 * @param {Object} mask
 * @returns {string} the characters it holds, the ones that fit the slots in order, as many as the template takes; the characters of the template and what does not fit are left out
 */
export function maskFromText (text, mask) {
  const input = _.toString(text)
  let at = 0
  let chars = ''
  for (const token of mask.tokens) {
    if (!token.slot) {
      // the characters of the template, when the text has them, are not the ones typed
      if (input[at] === token.literal) {
        at++
      }
      continue
    }
    while (at < input.length && !fitsSlot(token.slot, input[at])) {
      at++
    }
    if (at >= input.length) {
      break
    }
    chars += inCase(input[at++], mask)
  }
  return chars
}

/**
 * @param {string} chars
 * @param {Object} mask
 * @returns {boolean} every slot is filled
 */
export function maskComplete (chars, mask) {
  return chars.length === mask.size
}
