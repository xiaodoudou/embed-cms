import _ from 'lodash'

/**
 * @param {string} value
 * @param {number|string} params the length
 * @returns {string}
 */
export default function (value, params) {
  return _.truncate(value, { length: _.isString(params) ? _.toNumber(params) : params })
}
