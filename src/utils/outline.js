import _ from 'lodash'
import { normalizeValue } from '@u/dirtyTracker'

// The rows of the "Jump to" menu of the record editor: the fields of the form, under each paragraph field one row for each block it
// holds, and under each block the fields of its type. The rows of blocks come from the record, not from the schema, so repeated
// blocks are listed as they are.

const TEXT_INPUTS = ['string', 'text', 'transliterate', 'email', 'url']
const MAX_TEXT = 40

/** A text, or one text per language, as a plain text for a locale (the first language when that one has none) */
const plain = (value, locale) => {
  if (_.isPlainObject(value)) {
    return plain(value[locale] || _.find(_.values(value), (item) => _.isString(item) && item !== ''), locale)
  }
  return _.isString(value) ? value : ''
}

/**
 * What names a block in the menu: its type, and the first text it holds, or its place when it holds none.
 * @param {object} block the block of the record
 * @param {number} index its place among the blocks, from 0
 * @param {object} [options]
 * @param {function(string): object|false} [options.paragraphSchema] the definition of a paragraph type
 * @param {function(*): string} [options.translate] makes a text of a name (a text, or one text per language)
 * @param {string} [options.locale]
 * @returns {string}
 */
export function blockLabel (block, index, { paragraphSchema = () => false, translate = (value) => plain(value, 'enUS'), locale = 'enUS' } = {}) {
  const type = _.get(block, '_type', '')
  const definition = paragraphSchema(type) || {}
  const name = translate(definition.displayname) || type || 'Block'
  const firstText = _.find(_.map(_.filter(definition.schema, (field) => _.includes(TEXT_INPUTS, field.input)), (field) => _.trim(plain(_.get(block, field.field), locale))), (text) => text !== '')
  if (!firstText) {
    return `${name} ${index + 1}`
  }
  return `${name} · ${firstText.length > MAX_TEXT ? `${firstText.slice(0, MAX_TEXT - 1)}…` : firstText}`
}

/**
 * The rows of the menu.
 * @param {object[]} fields the fields of the form that have a label (`model`, `label`, `input`, `originalModel`)
 * @param {object} record the record being edited
 * @param {object} [options] see blockLabel, and `snapshot`: the record as it was loaded or saved (see utils/dirtyTracker.js), which
 * the rows are compared with to say which of them changed
 * @returns {Array<{key: string, label: string, field: object, dirty: boolean, block?: number, blockField?: string}>} a field has no
 * `block`; a block of a paragraph field has its place among the blocks of that field; a field of a block also has `blockField`, its
 * name. `dirty` is true for a row whose value is not what the snapshot has (a block moved to another place counts as changed)
 */
export function outlineEntries (fields, record, options = {}) {
  const { paragraphSchema = () => false, translate = (value) => plain(value, 'enUS'), snapshot } = options
  // without a snapshot nothing is said to have changed
  const changed = (before, now) => !!snapshot && !_.isEqual(before, normalizeValue(now))
  const entries = []
  _.each(fields, (field) => {
    entries.push({ key: field.model, label: field.label, field, dirty: changed(_.get(snapshot, field.model), _.get(record, field.model)) })
    if (field.input === 'paragraph') {
      _.each(_.get(record, field.model), (block, index) => {
        const before = _.get(snapshot, `${field.model}[${index}]`)
        entries.push({ key: `${field.model}[${index}]`, label: blockLabel(block, index, options), field, block: index, dirty: changed(before, block) })
        _.each(_.get(paragraphSchema(_.get(block, '_type')), 'schema'), (inner) => {
          entries.push({
            key: `${field.model}[${index}].${inner.field}`,
            label: translate(inner.label) || inner.field,
            field,
            block: index,
            blockField: inner.field,
            dirty: changed(_.get(before, inner.field), _.get(block, inner.field))
          })
        })
      })
    }
  })
  return entries
}
