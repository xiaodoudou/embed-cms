const _ = require('lodash')

/**
 * @param {*} value
 * @returns {boolean} a string, a number or a boolean: what can be looked for as text
 */
const isPrimitive = (value) => _.isString(value) || _.isNumber(value) || _.isBoolean(value)
// a regular expression that is a plain run of characters that need no escaping in json text
const LITERAL = /^\^?([A-Za-z0-9 _-]{3,})$/

/**
 * The text of a value as it appears in the json of a record that holds it.
 * @param {string|number|boolean} value
 * @returns {string}
 */
const token = (value) => JSON.stringify(value)

/**
 * Alternatives for one condition on a field: the record text must hold at least one of them, or undefined when
 * the condition cannot be expressed as text to look for.
 * @param {*} condition - the value in { field: condition }
 * @returns {string[]|undefined}
 */
function needlesOfCondition (condition) {
  if (isPrimitive(condition)) {
    return [token(condition)]
  }
  if (!_.isPlainObject(condition)) {
    return undefined
  }
  const alternatives = []
  if (isPrimitive(condition.$eq)) {
    alternatives.push([token(condition.$eq)])
  }
  if (_.isArray(condition.$in) && condition.$in.length && _.every(condition.$in, isPrimitive)) {
    alternatives.push(condition.$in.map(token))
  }
  // a case sensitive expression made of one literal run: the run is in the text of every record it matches
  const literal = _.isString(condition.$regex) && !_.get(condition, '$options', '') ? LITERAL.exec(condition.$regex) : null
  if (literal) {
    alternatives.push([literal[1]])
  }
  // every alternative is a necessary condition: the smallest set of needles is the most selective
  return _.minBy(alternatives, 'length')
}

/**
 * Turns a query into groups of text a record must contain to be able to match it: at least one needle of every
 * group. It is a necessary condition, never a filter of its own: the query still runs on the records it lets
 * through, so a query that cannot be expressed this way just yields no groups and every record is looked at.
 * @param {object} query - a MongoDB style query
 * @returns {string[][]}
 */
function queryNeedles (query) {
  if (!_.isPlainObject(query)) {
    return []
  }
  const groups = []
  _.forOwn(query, (condition, key) => {
    if (key === '$and' && _.isArray(condition)) {
      condition.forEach(part => groups.push(...queryNeedles(part)))
    } else if (!key.startsWith('$')) {
      const needles = needlesOfCondition(condition)
      if (needles) {
        groups.push(needles)
      }
    }
  })
  return groups
}

module.exports = queryNeedles
