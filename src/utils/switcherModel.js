import _ from 'lodash'
import fuzzysort from 'fuzzysort'
import { groupItems } from '@u/navModel'

/**
 * Pure logic of the quick switcher (Ctrl+K): what can be searched, how it is ranked, how the arrow keys move.
 * It finds resources and plugins by name; fields are not searched.
 */

/**
 * The entries to search, one per resource or plugin of the menu.
 * @param {Array} groupedList the menu groups, each with a `list` of resources and plugins, and the groups inside it
 * @param {Function} labelOf gives the display name of a resource or plugin (already translated)
 * @returns {Array<{ref: object, type: string, displayname: string}>}
 */
export function buildEntries (groupedList, labelOf) {
  const seen = new Set()
  const entries = []
  _.each(groupedList, (group) => {
    _.each(groupItems(group), (item) => {
      if (!item || _.isString(item) || seen.has(item)) {
        return
      }
      seen.add(item)
      entries.push({
        ref: item,
        type: item.type === 'plugin' ? 'plugin' : 'resource',
        displayname: labelOf(item) || _.get(item, 'title', '')
      })
    })
  })
  return entries
}

/**
 * Fuzzy search on the display names. The entry of the page you are on is ranked first.
 * @returns {Array<{ref: object, type: string, displayname: string, html: string}>}
 */
export function searchEntries (entries, query, currentLabel = '') {
  if (_.isEmpty(_.trim(query))) {
    return []
  }
  const results = fuzzysort.go(query, entries, {
    keys: ['displayname'],
    // fuzzysort 3 and later hide weak matches unless told otherwise; an abbreviation ("stg" for Settings) is a weak match and is
    // what a quick switcher is for: any name that contains the letters in order is a result, as it was with fuzzysort 2
    threshold: 0,
    scoreFn: (a) => (a[0] ? a[0].score + (currentLabel && a[0].target === currentLabel ? 10000000 : 0) : -10000000)
  })
  return _.compact(_.map(results, (result) => {
    if (_.isNull(_.get(result, '[0]', null))) {
      return null
    }
    return { ..._.pick(result.obj, ['ref', 'type', 'displayname']), html: fuzzysort.highlight(result[0]) }
  }))
}

/** The highlighted row after an arrow key, Home or End (it stops at both ends) */
export function moveHighlight (current, key, length) {
  if (length <= 0) {
    return 0
  }
  if (key === 'ArrowDown') {
    return Math.min(current + 1, length - 1)
  }
  if (key === 'ArrowUp') {
    return Math.max(current - 1, 0)
  }
  if (key === 'Home') {
    return 0
  }
  if (key === 'End') {
    return length - 1
  }
  return current
}
