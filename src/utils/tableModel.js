import _ from 'lodash'
import dayjs from 'dayjs'
import { markdownToPlain } from '@u/markdown'

/**
 * Pure logic behind the table view: column derivation (which locales are shown),
 * remembered column preferences, sorting. No Vue, no DOM.
 */

const KIND_BY_INPUT = {
  checkbox: 'boolean',
  switch: 'boolean',
  number: 'number',
  integer: 'number',
  double: 'number',
  date: 'date',
  datetime: 'datetime',
  daterange: 'daterange',
  geopoint: 'geopoint',
  time: 'time',
  image: 'image',
  cropimage: 'image',
  imagemap: 'image',
  file: 'file',
  select: 'select',
  radio: 'select',
  segmented: 'select',
  multiselect: 'multi',
  pillbox: 'multi',
  wysiwyg: 'richtext',
  text: 'text',
  json: 'json',
  object: 'json',
  paragraph: 'paragraph',
  url: 'link',
  email: 'link',
  color: 'color',
  rating: 'rating',
  duration: 'duration',
  money: 'money',
  phone: 'phone',
  markdown: 'markdown'
}

// Fixed or flexible widths per kind (px). Flexible text columns have a min and a max and truncate.
const WIDTHS = {
  boolean: { width: 84 },
  number: { width: 116 },
  date: { width: 124 },
  datetime: { width: 164 },
  daterange: { width: 236 },
  geopoint: { width: 176 },
  time: { width: 92 },
  image: { width: 104 },
  color: { width: 96 },
  rating: { width: 116 },
  duration: { width: 116 },
  money: { width: 132 },
  phone: { width: 168 },
  select: { min: 140, max: 240 },
  multi: { min: 160, max: 280 },
  link: { min: 160, max: 280 },
  file: { min: 140, max: 240 },
  json: { min: 140, max: 240 },
  paragraph: { min: 120, max: 180 },
  richtext: { min: 180, max: 340 },
  markdown: { min: 180, max: 340 },
  text: { min: 160, max: 340 }
}

/**
 * The attachment shown in an image or file cell. The API puts the attachments of a field in the field itself
 * (`record.photo = [{url, _filename, ...}]`, per locale `record.photo.enUS`); older records list them in `_attachments`.
 */
export function attachmentOf (record, column) {
  const value = _.get(record, column.model)
  const inField = _.find(_.isArray(value) ? value : [], (item) => _.isObject(item) && (item.url || item._filename))
  if (inField) {
    return inField
  }
  return _.find(_.get(record, '_attachments', []), (attachment) => {
    if (attachment._name !== column.originalModel) {
      return false
    }
    return !_.get(column, 'field.localised') || _.get(attachment, '_fields.locale', false) === column.locale
  })
}

/**
 * @param {string} input
 * @returns {string} text by default
 */
export function fieldKind (input) {
  return KIND_BY_INPUT[input] || 'text'
}

/**
 * @param {string} kind
 * @param {string} [rawAlign] wins
 * @returns {string}
 */
export function columnAlign (kind, rawAlign) {
  if (rawAlign) {
    return rawAlign
  }
  return kind === 'number' || kind === 'duration' || kind === 'money' ? 'right' : 'left'
}

/**
 * Columns of the table for a resource.
 * @param {object[]} fields schema fields (SchemaService.getSchemaFields), localised ones carry the current locale in `model`
 * @param {object} resource resource definition (`schema`, `locales`)
 * @param {{showAllLocales?: boolean, labelOf?: Function}} options
 */
export function buildColumns (fields, resource, options = {}) {
  const { showAllLocales = false, labelOf = (raw) => raw.label || raw.field } = options
  const locales = _.get(resource, 'locales', [])
  const columns = []
  _.each(fields, (field) => {
    if (!field || field.type === 'group' || !field.originalModel) {
      return
    }
    const raw = _.find(_.get(resource, 'schema', []), { field: field.originalModel }) || {}
    const kind = fieldKind(raw.input)
    const localised = !!field.localised
    const base = {
      originalModel: field.originalModel,
      label: labelOf(raw) || field.originalModel,
      kind,
      input: raw.input,
      align: columnAlign(kind, _.get(field, 'options.align')),
      sortable: !_.includes(['image', 'file', 'paragraph'], kind),
      index: _.isNumber(_.get(field, 'options.index')) ? field.options.index : null,
      field,
      raw,
      ...WIDTHS[kind]
    }
    if (localised && showAllLocales && locales.length > 1) {
      _.each(locales, (locale) => {
        columns.push({ ...base, key: `${field.originalModel}.${locale}`, model: `${field.originalModel}.${locale}`, locale })
      })
    } else {
      columns.push({ ...base, key: field.model, model: field.model, locale: localised ? _.last(_.split(field.model, '.')) : null })
    }
  })
  // Resource authors can pick and order the table columns with `options.index`; the rest keep schema order after them
  return _.sortBy(columns, (column) => (column.index === null ? Infinity : column.index))
}

/**
 * Minimal field descriptors straight from the resource schema (no Vue services), enough for buildColumns.
 * A localised field carries the current locale in its model, like SchemaService does.
 */
export function fieldsFromSchema (resource, locale, labelOf = (raw) => raw.label || raw.field) {
  const locales = _.get(resource, 'locales')
  return _.map(_.get(resource, 'schema', []), (raw) => {
    const localised = !!(locales && (raw.localised || _.isUndefined(raw.localised)))
    return {
      originalModel: raw.field,
      model: localised ? `${raw.field}.${locale}` : raw.field,
      localised,
      label: labelOf(raw),
      options: raw.options
    }
  })
}

/**
 * Compact default set for wide schemas: at most `visibleCount` columns stay visible. When the resource author
 * numbered columns (`options.index`) only those are shown by default, the others stay available in the column menu.
 */
export function defaultHiddenKeys (columns, visibleCount = 8) {
  const indexed = _.filter(columns, (column) => _.isNumber(column.index))
  if (indexed.length > 0) {
    const shown = indexed.length > visibleCount + 2 ? _.take(indexed, visibleCount) : indexed
    return _.map(_.difference(columns, shown), 'key')
  }
  return columns.length <= visibleCount + 2 ? [] : _.map(_.drop(columns, visibleCount), 'key')
}

const PREF_PREFIX = 'embed-cms.table.columns.'

/**
 * @param {Storage} storage
 * @param {string} resourceName
 * @returns {Object}
 */
export function loadPrefs (storage, resourceName) {
  try {
    const parsed = JSON.parse(storage.getItem(PREF_PREFIX + resourceName))
    return _.isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * @param {Storage} storage
 * @param {string} resourceName
 * @param {Object} prefs hidden, order, showAllLocales, sortBy
 * @returns {boolean}
 */
export function savePrefs (storage, resourceName, prefs) {
  try {
    storage.setItem(PREF_PREFIX + resourceName, JSON.stringify(_.pick(prefs, ['hidden', 'order', 'showAllLocales', 'sortBy'])))
    return true
  } catch {
    return false
  }
}

/**
 * @param {Storage} storage
 * @param {string} resourceName
 */
export function clearPrefs (storage, resourceName) {
  try {
    storage.removeItem(PREF_PREFIX + resourceName)
  } catch {
    // storage unavailable
  }
}

/** Columns in the remembered order, without the hidden ones. Unknown keys in the prefs are ignored, new columns go last. */
export function applyPrefs (columns, prefs = {}) {
  const hidden = _.has(prefs, 'hidden') ? prefs.hidden : defaultHiddenKeys(columns)
  const order = _.get(prefs, 'order', [])
  const ranked = _.sortBy(columns, (column) => {
    const index = _.indexOf(order, column.key)
    return index === -1 ? order.length + _.indexOf(columns, column) : index
  })
  return _.reject(ranked, (column) => _.includes(hidden, column.key))
}

/** Ordering of all columns (visible and hidden) for the column menu */
export function orderedColumns (columns, prefs = {}) {
  const order = _.get(prefs, 'order', [])
  return _.sortBy(columns, (column) => {
    const index = _.indexOf(order, column.key)
    return index === -1 ? order.length + _.indexOf(columns, column) : index
  })
}

/**
 * @param {Array<Object>} columns
 * @param {Object} prefs
 * @param {string} key
 * @returns {boolean} by the saved hidden keys, else the default hidden ones
 */
export function isColumnHidden (columns, prefs, key) {
  const hidden = _.has(prefs, 'hidden') ? prefs.hidden : defaultHiddenKeys(columns)
  return _.includes(hidden, key)
}

const collator = typeof Intl !== 'undefined' ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }) : null

/**
 * @param {*} value
 * @returns {*} a value for sorting; undefined for empty
 */
function comparable (value) {
  if (_.isNil(value) || value === '') {
    return undefined
  }
  if (_.isArray(value)) {
    return value.length
  }
  if (_.isBoolean(value)) {
    return value ? 1 : 0
  }
  return value
}

/** Comparator for two cell values: empty values always sort last, numbers numerically, text naturally */
export function compareValues (a, b) {
  const x = comparable(a)
  const y = comparable(b)
  if (_.isUndefined(x) && _.isUndefined(y)) {
    return 0
  }
  if (_.isUndefined(x)) {
    return 1
  }
  if (_.isUndefined(y)) {
    return -1
  }
  if (_.isNumber(x) && _.isNumber(y)) {
    return x - y
  }
  const sx = _.toString(x)
  const sy = _.toString(y)
  return collator ? collator.compare(sx, sy) : sx.localeCompare(sy)
}

/**
 * Multi-column sort. sortBy: [{key, order: 'asc'|'desc'}], first entry has priority.
 * Empty values stay last in both directions. The input array is not mutated.
 */
export function sortRows (rows, sortBy, getValue) {
  if (_.isEmpty(sortBy)) {
    return rows
  }
  const entries = _.map(rows, (row, index) => ({ row, index }))
  entries.sort((left, right) => {
    for (const { key, order } of sortBy) {
      const a = getValue(left.row, key)
      const b = getValue(right.row, key)
      const emptyA = _.isUndefined(comparable(a))
      const emptyB = _.isUndefined(comparable(b))
      let result = compareValues(a, b)
      if (result !== 0 && order === 'desc' && !emptyA && !emptyB) {
        result = -result
      }
      if (result !== 0) {
        return result
      }
    }
    return left.index - right.index
  })
  return _.map(entries, 'row')
}

/** Next sort state after a header click: none -> asc -> desc -> none; shift adds a secondary key */
export function nextSort (sortBy, key, additive = false) {
  const current = _.find(sortBy, { key })
  const nextOrder = !current ? 'asc' : current.order === 'asc' ? 'desc' : null
  const others = additive ? _.reject(sortBy, { key }) : []
  if (!nextOrder) {
    return additive ? others : []
  }
  return additive && current ? _.map(sortBy, (entry) => (entry.key === key ? { key, order: nextOrder } : entry)) : [...others, { key, order: nextOrder }]
}

/** Plain text of a rich text (HTML) value for a table cell, without touching the DOM */
export function richTextToPlain (html) {
  return _.toString(html).replace(/<\/(p|div|li|h[1-6])>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
}

/** Locales that are visible at the same time (the header shows a locale badge only when there are several) */
export function visibleLocales (columns) {
  return _.uniq(_.compact(_.map(columns, 'locale')))
}

/** Column menu: show or hide one column. The last visible column cannot be hidden. Returns the new prefs. */
export function toggleColumn (columns, prefs, key) {
  const hidden = _.has(prefs, 'hidden') ? [...prefs.hidden] : defaultHiddenKeys(columns)
  const isHidden = _.includes(hidden, key)
  const visibleCount = _.size(_.reject(columns, (column) => _.includes(hidden, column.key)))
  if (!isHidden && visibleCount <= 1) {
    return { ...prefs, hidden }
  }
  return { ...prefs, hidden: isHidden ? _.without(hidden, key) : [...hidden, key] }
}

/** Column menu: move one column up or down (delta -1 / +1) in the full column order. Returns the new prefs. */
export function moveColumn (columns, prefs, key, delta) {
  const keys = _.map(orderedColumns(columns, prefs), 'key')
  const from = _.indexOf(keys, key)
  const to = _.clamp(from + delta, 0, keys.length - 1)
  if (from === -1 || from === to) {
    return { ...prefs, order: keys }
  }
  keys.splice(to, 0, keys.splice(from, 1)[0])
  return { ...prefs, order: keys }
}

// ---- Selection -------------------------------------------------------------

/** 'none' | 'some' | 'all' for the header checkbox */
export function selectionState (selected, ids) {
  if (_.isEmpty(ids)) {
    return 'none'
  }
  const count = _.size(_.intersection(selected, ids))
  return count === 0 ? 'none' : count === ids.length ? 'all' : 'some'
}

/**
 * @param {Array<string>} selected
 * @param {string} id
 * @returns {Array<string>}
 */
export function toggleId (selected, id) {
  return _.includes(selected, id) ? _.without(selected, id) : [...selected, id]
}

/** Header checkbox: select every row, or clear them when all are selected */
export function toggleAllIds (selected, ids) {
  return selectionState(selected, ids) === 'all' ? _.difference(selected, ids) : _.union(selected, ids)
}

/** Shift-click: select every row between two ids (inclusive) */
export function selectRange (selected, ids, fromId, toId) {
  const a = _.indexOf(ids, fromId)
  const b = _.indexOf(ids, toId)
  if (a === -1 || b === -1) {
    return _.includes(selected, toId) ? selected : [...selected, toId]
  }
  return _.union(selected, _.slice(ids, Math.min(a, b), Math.max(a, b) + 1))
}

// ---- Windowing (fixed row height) -------------------------------------------

/** Rows to render for the current scroll position, plus the spacer heights above and below */
export function rowWindow ({ scrollTop = 0, viewportHeight = 0, rowHeight = 40, total = 0, overscan = 8 }) {
  if (total <= 0 || rowHeight <= 0) {
    return { start: 0, end: 0, padTop: 0, padBottom: 0 }
  }
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const visible = Math.ceil(Math.max(viewportHeight, rowHeight) / rowHeight) + 1
  const start = _.clamp(first - overscan, 0, total)
  const end = _.clamp(first + visible + overscan, 0, total)
  return { start, end, padTop: start * rowHeight, padBottom: (total - end) * rowHeight }
}

/** scrollTop that brings a row fully into view below a sticky header, or null when it already is */
export function scrollTopForRow ({ index, scrollTop, viewportHeight, rowHeight, headerHeight = 0 }) {
  const top = index * rowHeight
  const bottom = top + rowHeight
  const bodyHeight = viewportHeight - headerHeight
  if (top < scrollTop) {
    return top
  }
  if (bottom > scrollTop + bodyHeight) {
    return bottom - bodyHeight
  }
  return null
}

// ---- Keyboard navigation -----------------------------------------------------

/**
 * Grid navigation. position: {row, col}; col -1 is the row itself, 0..colCount-1 are the cells.
 * Returns the new position (the same object when the key does not move anything).
 */
export function moveFocus (position, key, { rowCount, colCount, pageSize = 10, ctrl = false }) {
  const lastRow = Math.max(0, rowCount - 1)
  const lastCol = Math.max(-1, colCount - 1)
  let { row, col } = position
  switch (key) {
    case 'ArrowDown': row = Math.min(row + 1, lastRow); break
    case 'ArrowUp': row = Math.max(row - 1, 0); break
    case 'ArrowRight': col = Math.min(col + 1, lastCol); break
    case 'ArrowLeft': col = Math.max(col - 1, -1); break
    case 'PageDown': row = Math.min(row + pageSize, lastRow); break
    case 'PageUp': row = Math.max(row - pageSize, 0); break
    case 'Home': col = col === -1 ? -1 : 0; row = ctrl ? 0 : row; break
    case 'End': col = lastCol; row = ctrl ? lastRow : row; break
    default: return position
  }
  return row === position.row && col === position.col ? position : { row, col }
}

// ---- Search ------------------------------------------------------------------

/** Plain, case-insensitive substring match (never a regular expression, so typing "(" is safe) */
export function matchesSearch (term, values) {
  const needle = _.toLower(_.trim(term))
  if (!needle) {
    return true
  }
  return _.some(values, (value) => !_.isNil(value) && _.includes(_.toLower(_.toString(value)), needle))
}

// ---- Cell values ---------------------------------------------------------------

export function isEmptyValue (value) {
  return _.isNil(value) || value === '' || (_.isArray(value) && value.length === 0) || (_.isPlainObject(value) && _.isEmpty(value))
}

/** Consistent dates: 2026-03-05, 2026-03-05 14:30, 14:30 (local time). Unparseable values are shown as they are. */
export function formatDateValue (value, kind = 'date') {
  if (isEmptyValue(value)) {
    return ''
  }
  const parsed = dayjs(value)
  if (!parsed.isValid()) {
    return _.toString(value)
  }
  return parsed.format(kind === 'datetime' ? 'YYYY-MM-DD HH:mm' : kind === 'time' ? 'HH:mm' : 'YYYY-MM-DD')
}

/**
 * @param {*} value
 * @returns {string} as it is when not a number
 */
export function formatNumberValue (value) {
  if (isEmptyValue(value) || !_.isFinite(Number(value))) {
    return _.toString(value)
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(Number(value))
}

/**
 * @param {Object} raw the field, as the resource declares it
 * @param {*} value a value of its static list (`source`: values, or `{ value, text }`)
 * @param {string} locale the language the labels are read in
 * @returns {string} what the value is called: its `text`, else its label (in the options of the field, or beside them; a text, or one per language), else the value itself
 */
export function staticOptionLabel (raw, value, locale) {
  const entry = _.find(_.isArray(_.get(raw, 'source')) ? raw.source : [], (item) => _.isObject(item) && item.value === value)
  if (entry) {
    return _.toString(entry.text || entry.value)
  }
  const label = _.get(raw, ['options', 'labels', value], _.get(raw, ['labels', value]))
  if (label) {
    return _.toString(_.isObject(label) ? _.get(label, locale, _.first(_.values(label))) : label)
  }
  return _.toString(value)
}

/** Chips of a multi value cell: at most `max` shown, the rest counted for a "+n" chip */
export function chipsFor (values, max = 2) {
  const list = _.compact(_.map(_.castArray(_.isNil(values) ? [] : values), (v) => (_.isObject(v) ? _.toString(v.text || v.name || v._id) : _.toString(v))))
  return { shown: _.take(list, max), more: Math.max(0, list.length - max), all: list }
}

/** Value used to sort a row by a column. options.labelOf(column) returns a function that turns an option value into its label. */
export function sortValue (record, column, options = {}) {
  const value = _.get(record, column.model)
  if (column.kind === 'richtext') {
    return richTextToPlain(value)
  }
  if (column.kind === 'markdown') {
    return markdownToPlain(value)
  }
  if (column.kind === 'daterange') {
    return _.get(value, 'start')
  }
  if (column.kind === 'geopoint') {
    return _.get(value, 'lat')
  }
  if (_.isFunction(options.labelOf) && (column.kind === 'select' || column.kind === 'multi')) {
    const label = options.labelOf(column)
    return _.isArray(value) ? _.map(value, label).join(', ') : label(value)
  }
  if (column.kind === 'money') {
    return _.get(value, 'amount')
  }
  if (column.kind === 'json') {
    return _.isEmpty(value) ? undefined : _.size(value)
  }
  return value
}

/** Width of a column in px: fixed kinds use their width, flexible ones a bit above their minimum */
export function columnWidth (column) {
  // a header label is never clipped: room for its text, the padding and the sort arrow
  const header = Math.min(240, Math.ceil(_.size(column.label) * 7.4) + 44)
  if (column.width) {
    return Math.max(column.width, header)
  }
  const min = _.get(column, 'min', 160)
  const max = _.get(column, 'max', 240)
  return Math.max(Math.round(min + (max - min) * 0.35), header)
}

/**
 * Column widths in px. Narrow tables stretch: the free space of the container goes to the flexible (text like)
 * columns in proportion to their width, or to the first column when every column has a fixed width.
 * `fixed` is the width of the checkbox and actions columns.
 */
export function distributeWidths (columns, available = 0, fixed = 0) {
  const base = _.map(columns, columnWidth)
  const extra = available - fixed - _.sum(base)
  if (extra <= 0 || columns.length === 0) {
    return base
  }
  const flexible = _.filter(_.range(columns.length), (index) => !columns[index].width)
  const targets = flexible.length > 0 ? flexible : [0]
  const total = _.sum(_.map(targets, (index) => base[index]))
  const widths = [...base]
  let given = 0
  targets.forEach((index, position) => {
    const share = position === targets.length - 1 ? extra - given : Math.floor((extra * base[index]) / total)
    widths[index] += share
    given += share
  })
  return widths
}

export const DENSITIES = ['compact', 'default', 'comfortable']
/** Row heights in px, mirrored by the --cms-table-row-* tokens (the CSS variable wins at runtime) */
export const DENSITY_ROW_HEIGHT = { compact: 32, default: 40, comfortable: 48 }

