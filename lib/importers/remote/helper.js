const Dayjs = require('dayjs')
const duration = require('dayjs/plugin/duration')
Dayjs.extend(duration)
const _ = require('lodash')

/**
 * @param {*} value a cell
 * @returns {number|null} the number of a string or of a number, else null
 */
const toNumber = function (value) {
  if (_.isString(value)) {
    return _.toNumber(value)
  } else if (_.isNumber(value)) {
    return value
  }
  return null
}

/**
 * @param {*} value a cell
 * @param {string} type the input of the field
 * @returns {*} the value of the field: a list for a multiselect or a pillbox, a number for a number field, and so on
 */
const convertData = function (value, type) {
  if (_.includes(['multiselect', 'pillbox'], type)) {
    if (!_.isString(value)) {
      return []
    }
    value = value.split(',')
    return _.compact(_.map(value, _.trim))
  } else if (_.includes(['number', 'integer'], type)) {
    return toNumber(value)
  } else if (type === 'checkbox') {
    return _.isString(value) ? _.includes(['TRUE', 'true', 'True'], value) : value
  } else if (_.includes(['datetime', 'date'], type)) {
    return Dayjs(value, 'DD/MM/YYYY').valueOf() || Dayjs(value, 'YYYY-MM-DD').valueOf()
  } else if (type === 'time') {
    return value
  }
  return _.trim(value)
}

module.exports = {
  convertData: convertData
}

