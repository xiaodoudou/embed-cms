import _ from 'lodash'
import TranslateService from '@s/TranslateService'

/**
 * Human readable label of a record (first schema field, in the given locale),
 * falling back to the record id. Used by breadcrumbs and confirmation dialogs.
 * Returns an empty string for a record that has not been created yet.
 */
export function getRecordLabel (resource, record, locale = 'enUS') {
  if (!record || !_.get(record, '_id', false)) {
    return ''
  }
  const field = _.first(_.get(resource, 'schema', []))
  if (field) {
    const isLocalised = _.get(resource, 'locales') && (field.localised || _.isUndefined(field.localised))
    const candidates = isLocalised
      ? _.map(_.uniq([locale, ..._.get(resource, 'locales', [])]), (l) => _.get(record, `${field.field}.${l}`))
      : [_.get(record, field.field)]
    const value = _.find(candidates, (v) => _.isString(v) && v.trim().length > 0)
    if (value) {
      return value.trim()
    }
  }
  return record._id
}

/**
 * Toast text for a record action without exposing raw ids:
 * "<label> saved" when the record has a readable label, "Record saved" otherwise.
 * kind: 'SAVED' | 'CREATED' | 'DELETED'
 */
export function recordMessage (kind, resource, record, locale = 'enUS') {
  const label = getRecordLabel(resource, record, locale)
  const readable = label && label !== _.get(record, '_id')
  return readable
    ? TranslateService.get(`TL_RECORD_${kind}_NAMED`, { name: label })
    : TranslateService.get(`TL_RECORD_${kind}_GENERIC`)
}

/**
 * "3 created, 2 updated, 0 removed" (or "no changes") from an import/sync report:
 * either {create, update, remove} or a map of resource name to such an object.
 */
export function importCounts (report) {
  const items = _.has(report, 'create') || _.has(report, 'update') || _.has(report, 'remove') ? [report] : _.values(report)
  const total = (key) => _.sum(_.map(items, (item) => _.toNumber(_.get(item, key, 0)) || 0))
  const counts = { create: total('create'), update: total('update'), remove: total('remove') }
  if (counts.create + counts.update + counts.remove === 0) {
    return TranslateService.get('TL_IMPORT_NO_CHANGES')
  }
  return TranslateService.get('TL_IMPORT_COUNTS', counts)
}

/**
 * @param {Object} resource
 * @returns {string} its display name in the locale, else its title
 */
export function getResourceLabel (resource) {
  if (!resource) {
    return ''
  }
  // a plugin page has a `label` (a translation key) next to its `displayname`, which is what the rights of a group name
  const name = resource.label || resource.displayname
  return name ? TranslateService.get(name) : (resource.title || resource.name || '')
}

export default { getRecordLabel, getResourceLabel }
