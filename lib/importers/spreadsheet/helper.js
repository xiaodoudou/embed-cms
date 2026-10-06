const util = require('util')
const logger = require('../../logger')
const Dayjs = require('dayjs')
const duration = require('dayjs/plugin/duration')
Dayjs.extend(duration)
const _ = require('lodash')

/**
 * Logs a step (printf-style arguments) and starts its clock.
 * @returns {function(): void} logs the end of the step with the time it took
 */
const startProcess = function () {
  const label = util.format.apply(util, arguments)
  logger.info(label)
  const start = Date.now()
  return function () {
    const totalTime = Date.now() - start
    // Use dayjs.duration to format elapsed time as hh:mm:ss
    const dur = Dayjs.duration(totalTime)
    const formatted = util.format('%s:%s:%s',
      String(dur.hours()).padStart(2, '0'),
      String(dur.minutes()).padStart(2, '0'),
      String(dur.seconds()).padStart(2, '0'))
    const totalTimeStr = util.format('(%s.%s)', formatted, totalTime % 1000)
    return logger.info(label, util.format.apply(util, arguments), totalTimeStr)
  }
}

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
  }
  return _.trim(value)
}

/**
 * @param {string[]|null} errors collects a message when no record holds the value
 * @param {object[]} records
 * @param {string} uniqueKey
 * @param {string} name the resource, for the message
 * @param {*} value
 * @returns {string|undefined} the id of the record
 */
const findRecordByUniqueKey = function (errors, records, uniqueKey, name, value) {
  const v = _.find(records, {[uniqueKey]: value})
  if (!v && !_.isNil(errors)) {
    errors.push('record (' + value + ') not found in resource ' + name)
  }
  return _.get(v, '_id')
}

/**
 * @param {*} value a unique value, or a list of them
 * @param {string} type select or multiselect
 * @param {object[]} records
 * @param {string} name the resource
 * @param {string[]} uniqueKeys
 * @param {string[]} errors
 * @returns {*} the id, or the ids, of the records; the value as it is for another type
 */
const convertKeyToId = function (value, type, records, name, uniqueKeys, errors) {
  const uniqueKey = _.first(uniqueKeys)
  if (type === 'select') {
    return findRecordByUniqueKey(errors, records, uniqueKey, name, value)
  } else if (type === 'multiselect') {
    return _.compact(_.map(value, (key)=> findRecordByUniqueKey(errors, records, uniqueKey, key)))
  }
  return value
}

module.exports = {
  startProcess: startProcess,
  convertData: convertData,
  convertKeyToId: convertKeyToId
}

