import _ from 'lodash'

/**
 * Pure logic of the sidebar: rail state, width, group badges and flyout keyboard moves. No Vue, no DOM.
 */

export const NAV_DEFAULT_WIDTH = 248
export const NAV_MIN_WIDTH = 200
export const NAV_MAX_WIDTH = 360
export const NAV_TINT_COUNT = 6

/**
 * How the navigation is shown: 'drawer' (phones, off-canvas), 'rail' (icons only) or 'expanded'.
 * pref is the remembered choice ('rail' | 'expanded' | null); without one the rail is the default below 1280px.
 */
export function resolveNavMode ({ pref = null, wide = true, drawer = false } = {}) {
  if (drawer) {
    return 'drawer'
  }
  if (pref === 'rail' || pref === 'expanded') {
    return pref
  }
  return wide ? 'expanded' : 'rail'
}

/**
 * @param {string} mode
 * @returns {string} the other one
 */
export function toggledPref (mode) {
  return mode === 'rail' ? 'expanded' : 'rail'
}

/**
 * @param {*} value
 * @param {number} max the widest it may be (the content decides, see navMaxWidth); never above NAV_MAX_WIDTH
 * @returns {number} rounded and clamped; the default when not a number
 */
export function clampNavWidth (value, max = NAV_MAX_WIDTH) {
  const width = Number(value)
  const limit = _.clamp(Number(max) || NAV_MAX_WIDTH, NAV_MIN_WIDTH, NAV_MAX_WIDTH)
  return Number.isFinite(width) ? _.clamp(Math.round(width), NAV_MIN_WIDTH, limit) : NAV_DEFAULT_WIDTH
}

/**
 * The widest the sidebar is worth being: enough for the longest name that is shown, and no more.
 * @param {Array<number>} rights where each name ends, counted from the left edge of the sidebar, in its full length
 * @param {number} gutter room kept after the longest name (the padding of the row and the scrollbar)
 * @returns {number} between NAV_MIN_WIDTH and NAV_MAX_WIDTH; the maximum when nothing is shown
 */
export function navMaxWidth (rights, gutter = 32) {
  const widest = _.max(rights)
  return _.isFinite(widest) ? _.clamp(Math.ceil(widest + gutter), NAV_MIN_WIDTH, NAV_MAX_WIDTH) : NAV_MAX_WIDTH
}

/** Keyboard resize of the separator: arrows move by step, Home and End jump to the limits */
export function resizeByKey (width, key, step = 16, max = NAV_MAX_WIDTH) {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp': return clampNavWidth(width - step, max)
    case 'ArrowRight':
    case 'ArrowDown': return clampNavWidth(width + step, max)
    case 'Home': return NAV_MIN_WIDTH
    case 'End': return clampNavWidth(NAV_MAX_WIDTH, max)
    default: return clampNavWidth(width, max)
  }
}

/** Up to two capital letters for a badge. Leading numbering such as "2. " is ignored: "2. Exploration App" is "EA". */
export function groupInitials (name) {
  const words = _.filter(_.words(_.toString(name), /[\p{L}\p{N}]+/gu), (word) => /\p{L}/u.test(word))
  if (words.length === 0) {
    const fallback = _.toString(name).replace(/[^\p{L}\p{N}]/gu, '')
    return _.toUpper(fallback.slice(0, 2)) || '?'
  }
  const letters = words.length === 1 ? _.filter(Array.from(words[0]), (c) => /\p{L}/u.test(c)).slice(0, 2).join('') : words.slice(0, 2).map((word) => Array.from(word)[0]).join('')
  return _.toUpper(letters)
}

/** Deterministic tint (1..NAV_TINT_COUNT) for a group name: the same name always gets the same colour */
export function groupTint (name, count = NAV_TINT_COUNT) {
  let hash = 0
  for (const char of _.toString(name)) {
    hash = (hash * 31 + char.codePointAt(0)) >>> 0
  }
  return (hash % count) + 1
}

/**
 * Next focus index inside a flyout list: Down/Up wrap around, Home and End jump. Returns the same index for other keys.
 */
export function moveInList (index, key, count) {
  if (count <= 0) {
    return -1
  }
  switch (key) {
    case 'ArrowDown': return index < 0 ? 0 : (index + 1) % count
    case 'ArrowUp': return index < 0 ? count - 1 : (index - 1 + count) % count
    case 'Home': return 0
    case 'End': return count - 1
    default: return index
  }
}

/** Position of a flyout next to a rail badge, kept inside the viewport */
export function flyoutPosition (rect, viewportHeight, flyoutHeight, gap = 8) {
  const top = _.clamp(rect.top, gap, Math.max(gap, viewportHeight - flyoutHeight - gap))
  return { left: Math.round(rect.right + gap), top: Math.round(top) }
}

const OTHERS = 'TL_OTHERS'

/**
 * @param {Object} group
 * @returns {boolean}
 */
export function isOthersGroup (group) {
  return _.get(group, 'name', '') === OTHERS
}

/** Stable key of a group (its name may be a string or a per-locale object) */
/** The name a group is known by in Settings: its English name, or the name itself when it is plain text */
export function groupSettingsName (group) {
  const name = _.get(group, 'name')
  return _.isString(name) ? name : _.get(name, 'enUS', _.first(_.values(name)))
}

/**
 * The name a group is known by in Settings and for its icon: its own name, and for a group inside another the names down
 * to it joined by " / " (`Content / Blog`).
 * @param {Object} group
 * @returns {string}
 */
export function groupMenuName (group) {
  return _.size(_.get(group, 'path')) > 1 ? group.path.join(' / ') : groupSettingsName(group)
}

/**
 * The menu icons chosen in Settings, as { group name: image url } (entries without a group or an image are skipped).
 * @param {object} settings the Settings record
 */
export function menuIconMap (settings) {
  const map = {}
  _.each(_.get(settings, 'menuGroups', []), (item) => {
    const url = _.get(item, 'icon[0].url')
    if (_.isString(item.group) && item.group && _.isString(url) && url) {
      map[item.group] = url
    }
  })
  return map
}

/**
 * @param {Object} group
 * @returns {string} kebab-case of its English name; a nested group adds the names above it
 */
export function groupKey (group) {
  if (_.size(_.get(group, 'path')) > 1) {
    return _.map(group.path, _.kebabCase).join('--')
  }
  const name = _.get(group, 'name.enUS', _.get(group, 'name'))
  return _.kebabCase(_.isString(name) ? name : JSON.stringify(name))
}

/**
 * The levels of the `group` of a resource: a name (a string, or one per language) is one level, a list of names is a path
 * from the heading down to the group the resource sits in.
 * @param {string|object|Array<string|object>} group
 * @returns {Array<string|object>}
 */
export function groupLevels (group) {
  return _.isArray(group) ? _.reject(group, _.isEmpty) : (_.isEmpty(group) ? [] : [group])
}

/**
 * @param {*} group the `group` of a resource or plugin
 * @returns {Array<string>} the English (or only) name of each level
 */
export function groupNames (group) {
  return _.map(groupLevels(group), (name) => groupSettingsName({ name }))
}

/**
 * @param {Object} group a menu group
 * @returns {Array<Object>} everything in it, the sub-groups included
 */
export function groupItems (group) {
  return [..._.get(group, 'list', []), ..._.flatMap(_.get(group, 'groups', []), groupItems)]
}

/**
 * The menu as a tree: every resource and plugin is filed under the levels of its `group`. Those without one go to Others
 * (resources) or Plugins; groups with nothing in them are dropped.
 * @param {Array<Object>} items resources and plugins
 * @returns {Array<{name: string|object, path: Array<string>, list: Array<Object>, groups?: Array}>} the top groups, unordered
 */
export function buildGroupTree (items) {
  const others = { name: OTHERS, path: [OTHERS], list: [] }
  const plugins = { name: 'TL_PLUGINS', path: ['TL_PLUGINS'], list: [] }
  const top = [others, plugins]
  _.each(items, (item) => {
    const levels = groupLevels(item.group)
    if (levels.length === 0) {
      (item.type === 'plugin' ? plugins : others).list.push(item)
      return
    }
    const names = groupNames(levels)
    let siblings = top
    let node = null
    _.each(levels, (name, depth) => {
      node = _.find(siblings, (one) => groupSettingsName(one) === names[depth])
      if (!node) {
        node = { name, path: _.take(names, depth + 1), list: [] }
        siblings.push(node)
      }
      if (depth < levels.length - 1) {
        node.groups = node.groups || []
        siblings = node.groups
      }
    })
    node.list.push(item)
  })
  const prune = (groups) => _.filter(_.map(groups, (group) => (group.groups ? { ...group, groups: prune(group.groups) } : group)), (group) => groupItems(group).length > 0)
  return prune(top)
}

/**
 * @param {Array<Object>} groups the menu groups
 * @param {Object} item a resource or plugin
 * @param {Function} same tells whether a listed item is that item
 * @returns {Array<Object>} the groups from the top one down to the one that lists the item; empty when none does
 */
export function groupTrail (groups, item, same = (listed) => listed === item) {
  for (const group of _.isArray(groups) ? groups : []) {
    if (_.some(group.list, same)) {
      return [group]
    }
    const deeper = groupTrail(_.get(group, 'groups', []), item, same)
    if (deeper.length > 0) {
      return [group, ...deeper]
    }
  }
  return []
}

/**
 * Whether the selected resource or plugin is in the group, or in one of its sub-groups
 * @param {Object} group
 * @param {Object} item
 */
export function groupHoldsItem (group, item) {
  if (!item) {
    return false
  }
  const names = groupNames(item.group)
  if (isOthersGroup(group)) {
    return names.length === 0
  }
  const path = _.get(group, 'path', [groupSettingsName(group)])
  return path.length <= names.length && _.every(path, (name, i) => name === names[i])
}

/**
 * Whether the selected resource or plugin is listed in this very group, not in one below it
 * @param {Object} group
 * @param {Object} item
 */
export function groupOwnsItem (group, item) {
  const depth = _.size(_.get(group, 'path', [groupSettingsName(group)]))
  return groupHoldsItem(group, item) && (isOthersGroup(group) || depth === groupNames(item.group).length)
}

/**
 * Menu groups in menu order: CMS (users, groups, settings) first, the catch-all Others last, and every other group
 * alphabetically by the name it is shown with in the admin language. CMS is recognised by its English name, which
 * holds whether the group was given as plain text or per language.
 * @param {Array} groups groups as { name, list }
 * @param {Function} labelOf the displayed name of a group name (TranslateService.get)
 * @param {string} locale the admin language, as enUS or zhCN
 */
export function orderGroups (groups, labelOf, locale = 'enUS') {
  const rank = (group) => (groupSettingsName(group) === 'CMS' ? 0 : isOthersGroup(group) ? 2 : 1)
  let collator
  try {
    collator = new Intl.Collator(_.replace(locale, /^([a-z]{2})([A-Z]{2})$/, '$1-$2'), { sensitivity: 'base', numeric: true })
  } catch {
    // not a language tag the browser knows: its default order
    collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
  }
  return [...groups]
    .sort((a, b) => rank(a) - rank(b) || collator.compare(_.toString(labelOf(a.name)), _.toString(labelOf(b.name))))
    .map((group) => (group.groups ? { ...group, groups: orderGroups(group.groups, labelOf, locale) } : group))
}

/** Resources of a group in natural, case-insensitive order (same as the expanded tree) */
export function orderResources (list, titleOf) {
  const collator = new Intl.Collator('en', { sensitivity: 'base', caseFirst: 'upper', usage: 'sort', ignorePunctuation: true, numeric: true })
  return [...list].sort((a, b) => collator.compare(titleOf(a), titleOf(b)))
}

/**
 * The rail shows one badge per group; the resources of the regular "Others" group are ungrouped resources and appear as
 * their own badges in a separate bottom section.
 */
export function railSections (groups) {
  return {
    groups: _.reject(groups, isOthersGroup),
    loose: _.flatMap(_.filter(groups, isOthersGroup), (group) => _.get(group, 'list', []))
  }
}

/**
 * The rows of a flyout or a tree: the group itself, then its resources, then each sub-group the same way, one level in.
 * @param {Object} group
 * @param {Function} orderList puts the resources of a group in order
 * @param {Array<Object>} parents the groups above it, the top one first
 * @returns {Array<{group: Object, depth: number, parents: Array<Object>, list: Array<Object>}>}
 */
export function groupRows (group, orderList = _.identity, parents = []) {
  const row = { group, depth: parents.length, parents, list: orderList(_.get(group, 'list', [])) }
  return [row, ..._.flatMap(_.get(group, 'groups', []), (child) => groupRows(child, orderList, [...parents, group]))]
}


/**
 * @param {Array<Object>} groups the menu groups
 * @param {Object} item a resource or plugin
 * @returns {Object|undefined} the group its own `group` names, however deep; Others when it names none
 */
export function groupOf (groups, item) {
  for (const group of _.isArray(groups) ? groups : []) {
    if (groupOwnsItem(group, item)) {
      return group
    }
    const deeper = groupOf(group.groups, item)
    if (deeper) {
      return deeper
    }
  }
  return undefined
}
