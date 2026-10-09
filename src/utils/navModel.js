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
 * @returns {number} rounded and clamped; the default when not a number
 */
export function clampNavWidth (value) {
  const width = Number(value)
  return Number.isFinite(width) ? _.clamp(Math.round(width), NAV_MIN_WIDTH, NAV_MAX_WIDTH) : NAV_DEFAULT_WIDTH
}

/** Keyboard resize of the separator: arrows move by step, Home and End jump to the limits */
export function resizeByKey (width, key, step = 16) {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp': return clampNavWidth(width - step)
    case 'ArrowRight':
    case 'ArrowDown': return clampNavWidth(width + step)
    case 'Home': return NAV_MIN_WIDTH
    case 'End': return NAV_MAX_WIDTH
    default: return clampNavWidth(width)
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
 * @returns {string} kebab-case of its English name
 */
export function groupKey (group) {
  const name = _.get(group, 'name.enUS', _.get(group, 'name'))
  return _.kebabCase(_.isString(name) ? name : JSON.stringify(name))
}

/** Whether the selected resource or plugin belongs to the group */
export function groupHoldsItem (group, item) {
  if (!item) {
    return false
  }
  const itemGroup = _.get(item, 'group.enUS', _.get(item, 'group', false))
  const name = _.get(group, 'name.enUS', _.get(group, 'name'))
  return name === OTHERS && !itemGroup ? true : name === itemGroup
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
  return [...groups].sort((a, b) => rank(a) - rank(b) || collator.compare(_.toString(labelOf(a.name)), _.toString(labelOf(b.name))))
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

