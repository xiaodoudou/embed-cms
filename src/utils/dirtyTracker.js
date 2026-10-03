import _ from 'lodash'

/**
 * Central dirty tracking for the record editor. Pure functions, no Vue, no DOM.
 *
 * The editor keeps a snapshot of the record taken when it loads (or is saved) and
 * compares the current model against it, so every field type is covered no matter
 * how it mutates the model (events, in-place edits of nested arrays or objects...).
 * Values are normalised before comparing so equivalent "empty" values match:
 * undefined, null, "", "   ", "<p></p>", "<p><br></p>", [], {} and false.
 */

// Empty rich text as produced by tiptap or missing altogether
const EMPTY_RICH_TEXT = /^(?:\s|&nbsp;|<p(?:\s[^>]*)?>(?:\s|&nbsp;|<br(?:\s[^>]*)?\/?>)*<\/p>)*$/i

/**
 * @param {*} value
 * @returns {boolean}
 */
export function isEmptyRichText (value) {
  return _.isString(value) && EMPTY_RICH_TEXT.test(value)
}

/**
 * @param {*} value
 * @returns {boolean} a File or a Blob
 */
function isFileLike (value) {
  return (typeof File !== 'undefined' && value instanceof File) || (typeof Blob !== 'undefined' && value instanceof Blob)
}

/**
 * Canonical form of a value for comparison; "empty" values become undefined.
 */
export function normalizeValue (value) {
  if (_.isNil(value) || value === false) {
    return undefined
  }
  if (_.isString(value)) {
    return isEmptyRichText(value) ? undefined : value
  }
  if (isFileLike(value)) {
    return { __file: true, name: value.name, size: value.size, type: value.type, lastModified: value.lastModified }
  }
  if (_.isDate(value)) {
    return value.toISOString()
  }
  if (_.isArray(value)) {
    // positions matter (reordering is a change), holes are kept as null
    const items = _.map(value, (item) => {
      const normalized = normalizeValue(item)
      return _.isUndefined(normalized) ? null : normalized
    })
    return _.every(items, _.isNull) ? undefined : items
  }
  if (_.isPlainObject(value)) {
    const result = {}
    _.each(_.keys(value).sort(), (key) => {
      const normalized = normalizeValue(value[key])
      if (!_.isUndefined(normalized)) {
        result[key] = normalized
      }
    })
    return _.isEmpty(result) ? undefined : result
  }
  return value
}

/** Snapshot of a model (the record id is not part of the comparison) */
export function createSnapshot (model) {
  return normalizeValue(_.omit(model, ['_id'])) || {}
}

/**
 * @param {Object} snapshot
 * @param {Object} model
 * @returns {boolean}
 */
export function isDirty (snapshot, model) {
  return !_.isEqual(snapshot || {}, createSnapshot(model))
}

/**
 * @param {Object} resource
 * @param {Object} field
 * @returns {boolean} the resource has locales and the field does not opt out
 */
export function isLocalisedField (resource, field) {
  return !!_.get(resource, 'locales.length', 0) && (!!field.localised || _.isUndefined(field.localised))
}

/**
 * @param {Object} snapshot
 * @param {Object} model
 * @param {string} path
 * @returns {boolean}
 */
function pathChanged (snapshot, model, path) {
  return !_.isEqual(_.get(snapshot, path), normalizeValue(_.get(model, path)))
}

/**
 * Which parts of the record changed since the snapshot:
 * - locales: locales whose own (localised) values differ
 * - shared: names of non-localised fields that differ
 * - paths: every changed field path (`title.enUS`, `rate`...)
 */
export function changedParts (snapshot, model, resource) {
  const result = { locales: [], shared: [], paths: [] }
  const locales = _.get(resource, 'locales', [])
  _.each(_.get(resource, 'schema', []), (field) => {
    if (isLocalisedField(resource, field)) {
      _.each(locales, (locale) => {
        const path = `${field.field}.${locale}`
        if (pathChanged(snapshot, model, path)) {
          result.paths.push(path)
          result.locales.push(locale)
        }
      })
    } else if (pathChanged(snapshot, model, field.field)) {
      result.paths.push(field.field)
      result.shared.push(field.field)
    }
  })
  result.locales = _.uniq(result.locales)
  return result
}

/** Empty for the purpose of a "required" rule (false and 0 are real answers) */
export function isEmptyRequiredValue (value) {
  if (_.isNil(value)) {
    return true
  }
  if (_.isString(value)) {
    return value.trim() === '' || isEmptyRichText(value)
  }
  if (_.isArray(value)) {
    return value.length === 0
  }
  if (_.isPlainObject(value)) {
    return _.isEmpty(value)
  }
  return false
}

/**
 * Required fields that are still empty, per locale (localised fields) and shared
 * (non-localised fields, not tied to any locale).
 * Returns { byLocale: { enUS: ['title'] }, shared: ['type'], total: 2 }.
 */
export function missingRequired (model, resource) {
  const byLocale = {}
  const shared = []
  const locales = _.get(resource, 'locales', [])
  let total = 0
  _.each(_.get(resource, 'schema', []), (field) => {
    // a switch always shows an answer (off when nothing was chosen), so it is never "missing"; see unsetSwitchesToFalse
    if (!field.required || field.input === 'checkbox') {
      return
    }
    if (isLocalisedField(resource, field)) {
      _.each(locales, (locale) => {
        if (isEmptyRequiredValue(_.get(model, `${field.field}.${locale}`))) {
          byLocale[locale] = [...(byLocale[locale] || []), field.field]
          total++
        }
      })
    } else if (isEmptyRequiredValue(_.get(model, field.field))) {
      shared.push(field.field)
      total++
    }
  })
  return { byLocale, shared, total }
}

/**
 * A switch that nobody touched shows "No" but holds nothing (undefined or null): a save writes that as an explicit false,
 * so the stored record has two values, not three. Mutates and returns the model.
 */
export function unsetSwitchesToFalse (model, resource) {
  const locales = _.get(resource, 'locales', [])
  _.each(_.get(resource, 'schema', []), (field) => {
    // locked switches keep what they hold
    if (field.input !== 'checkbox' || _.get(field, 'options.readonly') || _.get(field, 'options.disabled') || field.readonly || field.disabled) {
      return
    }
    const paths = isLocalisedField(resource, field) ? _.map(locales, (locale) => `${field.field}.${locale}`) : [field.field]
    _.each(paths, (path) => {
      if (_.isNil(_.get(model, path))) {
        _.set(model, path, false)
      }
    })
  })
  return model
}

export default { normalizeValue, createSnapshot, isDirty, changedParts, missingRequired, isEmptyRichText, isEmptyRequiredValue, isLocalisedField }

/**
 * Accepts the current value of the given field paths as the saved state (mutates and returns the snapshot).
 * Used while a form is still settling: fields fill in their own defaults when they appear (a colour, an object
 * editor, a slug...), and until the user has touched something those values are not edits.
 */
export function absorbPaths (snapshot, model, paths) {
  _.each(paths, (path) => {
    const value = normalizeValue(_.get(model, path))
    if (_.isUndefined(value)) {
      _.unset(snapshot, path)
    } else {
      _.set(snapshot, path, value)
    }
  })
  return snapshot
}
