import _ from 'lodash'

// The groups of a form: the fields that share the first part of a dotted key (`address.city`, `address.zip`) are drawn together under a title (see SchemaService.getNestedGroups).
// A resource describes a group in `groups`, by its path: `{ label, collapsible, collapsed, layout }`.

/** The event a field sends up the page to the closed groups around it: they open (see Group.vue). */
export const REVEAL_EVENT = 'cms-reveal-group'

/**
 * @param {Array<Object>} items the fields and the groups inside a group
 * @param {string} name how a line names one: its field name, the name inside its group, or the key of a group inside it
 * @param {string} path the dotted path of the group
 * @param {string} prefix what the keys of the fields start with and the path does not (the fields of a block)
 * @returns {Object|undefined} the item it names
 */
function findItem (items, name, path, prefix) {
  const full = path ? `${path}.${name}` : name
  return _.find(items, (item) => item.model === name || item.originalModel === name || item.originalModel === `${prefix}${full}` || (item.type === 'group' && item.key === name))
}

/**
 * Places what a group holds on the lines of its `layout` (the same lines, slots and widths as the layout of a resource; see docs/reference/FORM_LAYOUT.md). What no line names goes
 * on a line of its own at the end, so that nothing is lost; what a line names twice is shown once; what is not in the group is reported and left out.
 * @param {Array<Object>} items the fields and the groups inside the group
 * @param {Object} [layout] `{ lines: [{ slots, fields: [{ model, width }] }] }`
 * @param {string} [path] the dotted path of the group
 * @param {string} [prefix] see findItem
 * @returns {{lines: Array<Object>}|undefined} the lines, each field with its schema; nothing when the group has no layout
 */
export function placeGroupLayout (items, layout, path = '', prefix = '') {
  const lines = _.get(layout, 'lines')
  if (!_.isArray(lines) || lines.length === 0) {
    return undefined
  }
  const placed = new Set()
  const placedLines = []
  _.each(lines, (line) => {
    const fields = []
    _.each(_.get(line, 'fields'), (entry) => {
      const name = _.get(entry, 'model')
      const item = findItem(items, name, path, prefix)
      if (!item) {
        console.error(`Couldn't find field ${name} in the layout of the group ${path}`)
      } else if (!placed.has(item)) {
        placed.add(item)
        fields.push({ model: item.model || item.key, width: entry.width, schema: item })
      }
    })
    if (fields.length > 0) {
      placedLines.push({ slots: _.get(line, 'slots') || _.get(line, 'fields.length', 1), fields })
    }
  })
  _.each(items, (item) => {
    if (!placed.has(item)) {
      placedLines.push({ fields: [{ model: item.model || item.key, schema: item }] })
    }
  })
  return { lines: placedLines }
}

/**
 * Opens the closed groups around an element, so that it can be seen and focused.
 * @param {Element|null} element
 * @returns {boolean} whether some group was closed: the page needs a tick before the element is shown
 */
export function revealField (element) {
  if (!element || !element.closest || !element.closest('.group.is-collapsed')) {
    return false
  }
  element.dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true }))
  return true
}
