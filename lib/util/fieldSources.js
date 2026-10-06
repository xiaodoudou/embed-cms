const _ = require('lodash')

// A select or a multiselect takes its choices from the records of one resource (`source: 'authors'`), or of several (`sources: ['authors', 'editors']`).
// The value of a one-resource field is the id of a record; the value of a several-resource field is `{ resource, id }`, since an id alone does not say
// which resource it is of.

/**
 * @param {object} field
 * @returns {boolean} a select or a multiselect that takes its records from several resources
 */
function isMultiSource (field) {
  return _.includes(['select', 'multiselect'], _.get(field, 'input')) && _.isArray(field.sources) && !_.isEmpty(field.sources)
}

/**
 * @param {object} field
 * @returns {Array<{resource: string, customLabel?: string, title?: *}>} the resources of a several-resource field, in the order the field lists them: `'authors'`
 *   and `{ resource: 'authors', customLabel, title }` are the same thing written two ways; the ones that are neither are left out
 */
function sourcesOf (field) {
  if (!isMultiSource(field)) {
    return []
  }
  const sources = _.map(field.sources, source => _.isString(source) ? { resource: source } : source)
  return _.uniqBy(_.filter(sources, source => _.isPlainObject(source) && _.isString(source.resource) && source.resource !== ''), 'resource')
}

/**
 * @param {*} value
 * @returns {boolean} a reference to a record of a resource: `{ resource, id }`
 */
function isRef (value) {
  return _.isPlainObject(value) && _.isString(value.resource) && value.resource !== '' && _.isString(value.id) && value.id !== ''
}

/**
 * Turns the references of a field of several resources: the id of the record they point to becomes its unique value (way `export`, what a file or another CMS
 * is told), and the other way back (`import`), since ids are not the same on two CMS. A list keeps its positions, a value per language its languages; a reference
 * to a record or a resource that is not there becomes undefined, in its place.
 * @param {*} value a reference, a list of them, or one of those per language
 * @param {Object<string, {list: object[], key: string}>} lists the records of each resource, with its unique key
 * @param {'export'|'import'} way
 * @returns {*}
 */
function mapRefs (value, lists, way) {
  if (_.isArray(value)) {
    return _.map(value, one => mapRefs(one, lists, way))
  }
  if (isRef(value)) {
    const { list, key } = lists[value.resource] || {}
    const found = list && (way === 'export' ? _.find(list, { _id: value.id }) : _.find(list, { [key]: value.id }))
    return found ? { resource: value.resource, id: way === 'export' ? found[key] : found._id } : undefined
  }
  return _.isPlainObject(value) ? _.mapValues(value, one => mapRefs(one, lists, way)) : value
}

module.exports = { isMultiSource, sourcesOf, isRef, mapRefs }
