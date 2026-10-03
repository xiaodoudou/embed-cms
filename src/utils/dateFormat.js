/**
 * The schema describes date formats with dayjs tokens (YYYY-MM-DD HH:mm:ss); the date picker parses typed text with
 * date-fns tokens (yyyy-MM-dd HH:mm:ss). Only the tokens that differ are translated.
 */
const TOKENS = { YYYY: 'yyyy', YY: 'yy', DD: 'dd', D: 'd', A: 'a' }

/**
 * @param {string} format a dayjs format
 * @returns {string} the date-fns one
 */
export function toDateFnsFormat (format) {
  return String(format || '').replace(/YYYY|YY|DD|D|A/g, (token) => TOKENS[token])
}

/** True when a picker format shows seconds / minutes (used to enable the matching time inputs) */
export function formatHas (format, token) {
  return String(format || '').includes(token)
}

export default { toDateFnsFormat, formatHas }
