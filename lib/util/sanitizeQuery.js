const _ = require('lodash')
const assertSafeRegex = require('./safeRegex')

// Operators a client may use in ?query=. Anything else starting with '$' is rejected,
// in particular $where, which sift evaluates with new Function().
const ALLOWED_OPERATORS = new Set([
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$all', '$size', '$mod',
  '$exists', '$type', '$regex', '$options', '$and', '$or', '$nor', '$not', '$elemMatch'
])
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_DEPTH = 10
const MAX_REGEX_LENGTH = 200

const queryError = (message) => Object.assign(new Error(message), { code: 400 })

function walk (query, options, depth) {
  if (depth > MAX_DEPTH) {
    throw queryError('Query is nested too deeply')
  }
  if (_.isArray(query)) {
    query.forEach(item => walk(item, options, depth + 1))
    return query
  }
  if (!_.isObject(query)) {
    return query
  }
  _.forOwn(query, (value, key) => {
    if (FORBIDDEN_KEYS.has(key)) {
      throw queryError(`Forbidden key '${key}' in query`)
    }
    if (key.startsWith('$') && !ALLOWED_OPERATORS.has(key)) {
      throw queryError(`Operator '${key}' is not allowed in queries`)
    }
    if (key === '$type' && !_.isFunction(value)) {
      // sift takes a constructor here, which a JSON query cannot hold: the operator would end in a TypeError
      throw queryError('$type is not supported in queries')
    }
    if (key === '$regex') {
      if (!_.isString(value) || value.length > MAX_REGEX_LENGTH) {
        throw queryError('$regex must be a string of at most 200 characters')
      }
      if (options.safeRegex) {
        assertSafeRegex(value, _.isString(query.$options) ? query.$options : '')
      }
    }
    walk(value, options, depth + 1)
  })
  return query
}

/**
 * Validates a client supplied MongoDB-style query and returns it unchanged.
 * @param {*} query - parsed query object
 * @param {object} [options]
 * @param {boolean} [options.safeRegex] - also refuse regular expressions that can backtrack catastrophically
 * @returns {*} the same query if it is safe
 * @throws {Error} with code 400 when the query uses a forbidden key or operator
 */
function sanitizeQuery (query, options = {}) {
  return walk(query, options, 0)
}

module.exports = sanitizeQuery
