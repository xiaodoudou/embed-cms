import _ from 'lodash'
import fuzzysort from 'fuzzysort'

// The search box of the "Jump to field" menu: the rows (see utils/outline.js) that contain the letters typed, in order, best match first, with the letters that matched marked.

/**
 * @param {string} text
 * @param {Array<number>} [indexes] the places of the letters that matched
 * @returns {Array<{text: string, hit: boolean}>} the text cut in runs, the matched letters apart
 */
export function highlightParts (text, indexes = []) {
  const hits = new Set(indexes)
  const parts = []
  _.each(Array.from(text), (letter, index) => {
    const hit = hits.has(index)
    const last = _.last(parts)
    if (last && last.hit === hit) {
      last.text += letter
    } else {
      parts.push({ text: letter, hit })
    }
  })
  return parts
}

/**
 * The rows to show for what was typed. A row of a field of a block is searched with the name of its block in front (`Contact block · Team lead City`), so that a block can be told
 * from another by what is typed, and only the letters in the name of the field itself are marked.
 * @param {Array<{key: string, label: string, block?: number, blockField?: string}>} entries the rows of the menu, in the order of the form
 * @param {string} query what was typed; nothing keeps every row, in the order of the form
 * @returns {Array<{entry: object, parts: Array<{text: string, hit: boolean}>}>}
 */
export function searchOutline (entries, query) {
  const text = _.trim(query)
  if (text === '') {
    return _.map(entries, (entry) => ({ entry, parts: [{ text: entry.label, hit: false }] }))
  }
  let blockLabel = ''
  const targets = _.map(entries, (entry) => {
    if (entry.block !== undefined && !entry.blockField) {
      blockLabel = entry.label
    }
    const prefix = entry.blockField ? `${blockLabel} ` : ''
    return { entry, prefix, searchText: `${prefix}${entry.label}` }
  })
  // (fuzzysort 3 hides weak matches unless told otherwise: any label that holds the letters in order is a result)
  return _.map(fuzzysort.go(text, targets, { key: 'searchText', threshold: 0 }), (result) => {
    const { entry, prefix } = result.obj
    const indexes = _.filter(_.map(result.indexes, (index) => index - prefix.length), (index) => index >= 0)
    return { entry, parts: highlightParts(entry.label, indexes) }
  })
}
