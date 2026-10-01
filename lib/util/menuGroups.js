const _ = require('lodash')

/**
 * The menu groups that appear more than once in the menu icons of the Settings record.
 * @param {Array<{group: string}>} menuGroups the `menuGroups` paragraphs
 * @returns {string[]} each repeated group name, once
 */
function duplicateMenuGroups (menuGroups) {
  const counts = _.countBy(_.filter(_.map(menuGroups, 'group'), _.isString))
  return _.keys(_.pickBy(counts, (count) => count > 1))
}

module.exports = { duplicateMenuGroups }
