/**
 * Static check of a regular expression that comes from a client, against patterns that make the JavaScript regex
 * engine (a backtracking one) run for seconds or minutes on a short input.
 *
 * Rejected:
 * - a group repeated more than once that itself contains an unbounded repetition: (a+)+  (.*a){20}  (\w+\s?)*
 * - an unbounded repetition of a group with alternatives: (a|aa)+  (a|a?)+
 * - back references
 * - more than MAX_UNBOUNDED unbounded repetitions in one pattern (.*.*.*.*!: polynomial time of a high degree)
 * - repetition counts above MAX_COUNT
 *
 * The check is conservative: a few harmless patterns such as (foo|bar)+ are refused. The alternative, running the
 * expression with a time limit, is not possible for a synchronous match in Node.
 */
const MAX_UNBOUNDED = 3
const MAX_COUNT = 1000
const RANGE = /\{(\d+)(?:(,)(\d*))?\}/y

const unsafe = (reason) => Object.assign(new Error(`Regular expression refused: ${reason}`), { code: 400 })

/**
 * @param {string} source - the pattern
 * @param {string} [flags] - the $options value
 * @throws {Error} with code 400 when the pattern or its flags are refused
 */
function assertSafeRegex (source, flags = '') {
  if (!/^[ims]*$/.test(flags)) {
    throw unsafe('$options may only contain i, m and s')
  }
  try {
    new RegExp(source, flags)
  } catch {
    throw unsafe('the pattern is not valid')
  }
  const stack = [{ unbounded: false, alternation: false }]
  let last = null
  let unboundedTotal = 0
  let i = 0
  while (i < source.length) {
    const c = source[i]
    if (c === '\\') {
      const next = source[i + 1]
      if (/[1-9]/.test(next) || next === 'k') {
        throw unsafe('back references are not supported')
      }
      i += 2
      last = { simple: true }
    } else if (c === '[') {
      i++
      while (i < source.length && source[i] !== ']') {
        i += source[i] === '\\' ? 2 : 1
      }
      i++
      last = { simple: true }
    } else if (c === '(') {
      stack.push({ unbounded: false, alternation: false })
      i++
      if (source[i] === '?') {
        i++
        if (source[i] === '<' && source[i + 1] !== '=' && source[i + 1] !== '!') {
          i = source.indexOf('>', i) + 1
        } else {
          i += source[i] === '<' ? 2 : 1
        }
      }
      last = null
    } else if (c === ')') {
      const group = stack.pop()
      const parent = stack[stack.length - 1]
      parent.unbounded = parent.unbounded || group.unbounded
      parent.alternation = parent.alternation || group.alternation
      last = { group }
      i++
    } else if (c === '|') {
      stack[stack.length - 1].alternation = true
      last = null
      i++
    } else {
      let min
      let max
      if (c === '*') {
        [min, max] = [0, Infinity]
      } else if (c === '+') {
        [min, max] = [1, Infinity]
      } else if (c === '?') {
        [min, max] = [0, 1]
      } else if (c === '{') {
        RANGE.lastIndex = i
        const range = RANGE.exec(source)
        if (range) {
          min = Number(range[1])
          max = range[2] ? (range[3] === '' ? Infinity : Number(range[3])) : min
          i = RANGE.lastIndex - 1
        }
      }
      if (max === undefined || !last) {
        // an ordinary character (or a quantifier with nothing to repeat, which the engine treats as an error)
        last = { simple: true }
        i++
        continue
      }
      if ((min > MAX_COUNT) || (max !== Infinity && max > MAX_COUNT)) {
        throw unsafe(`repetition counts above ${MAX_COUNT} are not supported`)
      }
      if (last.group) {
        if (max > 1 && last.group.unbounded) {
          throw unsafe('a repeated group contains a repetition')
        }
        if (max === Infinity && last.group.alternation) {
          throw unsafe('a repeated group contains alternatives')
        }
      }
      if (max === Infinity) {
        stack[stack.length - 1].unbounded = true
        unboundedTotal++
        if (unboundedTotal > MAX_UNBOUNDED) {
          throw unsafe(`more than ${MAX_UNBOUNDED} unbounded repetitions`)
        }
      }
      i++
      if (source[i] === '?') {
        i++
      }
      last = null
    }
  }
}

module.exports = assertSafeRegex
