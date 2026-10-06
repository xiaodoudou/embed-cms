import _ from 'lodash'
import TranslateService from '@s/TranslateService'
import ResourceService from '@s/ResourceService'
import { recordLabel } from '@u/imageMap'

// A select or a multiselect of several resources (`sources: ['authors', 'editors']`): its choices are the records of all of them, in groups, and what
// it keeps is `{ resource, id }`, since an id alone does not say which resource it is of. The server (lib/util/fieldSources.js) says the same.

/**
 * @param {Object} field a select or a multiselect
 * @returns {boolean} it takes its records from several resources
 */
export function isMultiSource (field) {
  return _.includes(['select', 'multiselect'], _.get(field, 'input')) && _.isArray(field.sources) && !_.isEmpty(field.sources)
}

/**
 * @param {Object} field
 * @returns {Array<{resource: string, customLabel?: string, title?: string|Object}>} its resources in the order it lists them, a name or an object with `customLabel` (a
 *   Mustache template that names a record) and `title` (what the kind of record is called, translatable)
 */
export function sourcesOf (field) {
  if (!isMultiSource(field)) {
    return []
  }
  const sources = _.map(field.sources, source => _.isString(source) ? { resource: source } : source)
  return _.uniqBy(_.filter(sources, source => _.isPlainObject(source) && _.isString(source.resource) && source.resource !== ''), 'resource')
}

/**
 * @param {*} value
 * @returns {boolean} a reference to a record: `{ resource, id }`
 */
export function isRef (value) {
  return _.isPlainObject(value) && _.isString(value.resource) && value.resource !== '' && _.isString(value.id) && value.id !== ''
}

/**
 * @param {{resource: string, id: string}} ref
 * @returns {string} the reference as one text, which a list can hold as the value of a choice (`authors:mus3k2`)
 */
export function refKey (ref) {
  return `${ref.resource}:${ref.id}`
}

/**
 * @param {*} value a reference, or its key
 * @returns {string|undefined} the key; nothing for what is neither
 */
export function toKey (value) {
  if (isRef(value)) {
    return refKey(value)
  }
  return _.isString(value) && value.includes(':') ? value : undefined
}

/**
 * @param {*} key the text refKey made
 * @returns {{resource: string, id: string}|undefined} the reference
 */
export function keyRef (key) {
  const at = _.isString(key) ? key.indexOf(':') : -1
  return at > 0 && at < key.length - 1 ? { resource: key.slice(0, at), id: key.slice(at + 1) } : undefined
}

/**
 * @param {{resource: string, title?: *}} source
 * @returns {string} what the kind of record is called: the title the field gives, else the name of the resource in the admin, else its name
 */
export function sourceTitle (source) {
  const given = source.title ? TranslateService.get(source.title) : ''
  const displayname = _.get(ResourceService.getSchema(source.resource), 'displayname')
  return given || (displayname ? TranslateService.get(displayname) : '') || source.resource
}

/**
 * @param {Object} record a record of the resource
 * @param {{resource: string, customLabel?: string}} source
 * @param {string} locale
 * @returns {string} what the record is called: the label the field gives, else the first field of the resource, else its id
 */
function labelOf (record, source, locale) {
  return recordLabel(record, ResourceService.getSchema(source.resource), source.customLabel || '', locale)
}

/**
 * @param {Object} field
 * @param {string} locale the language the records are named in
 * @returns {Array<Object>} the choices: the records of every resource of the field, each with its key (`_id`), what it is called (`_label`), what kind of record it is
 *   (`_title`, which groups them) and its resource (`_resource`); the resources are in the order of the field, the records of each by name
 */
export function sourceItems (field, locale) {
  return _.flatMap(sourcesOf(field), (source) => {
    const title = sourceTitle(source)
    const items = _.map(ResourceService.get(source.resource), record => ({ _id: refKey({ resource: source.resource, id: record._id }), _label: labelOf(record, source, locale), _title: title, _resource: source.resource, _record: record }))
    return _.sortBy(items, item => _.toLower(item._label))
  })
}

/**
 * @param {{resource: string, id: string}} ref
 * @param {Object} field
 * @param {string} locale
 * @returns {string} what the record is called; the id of a record that is not there
 */
export function refLabel (ref, field, locale) {
  const source = _.find(sourcesOf(field), { resource: ref.resource }) || { resource: ref.resource }
  const record = _.find(ResourceService.get(ref.resource), { _id: ref.id })
  return record ? labelOf(record, source, locale) : ref.id
}
