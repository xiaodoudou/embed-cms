import _ from 'lodash'

// The language switch of the record editor is a row of tabs when the languages fit the bar, and one button (see TopBarLocaleList) when they do not: on a phone, and where the editor is
// too narrow for the tabs of its languages. A tab is as wide as its name and its markers (the amber dot of unsaved edits, the red circle of a missing required field and its count),
// and the tabs may take half of the bar: the other half is for what is missing after a failed save and for the buttons.

export const TAB_WIDTH = 60
export const DIRTY_WIDTH = 18
export const MISSING_WIDTH = 30
export const COUNT_WIDTH = 26
export const TABS_SHARE = 0.5

/**
 * @param {{dirty?: boolean, missing?: number}} [state] what a language carries
 * @returns {number} about how wide its tab is, in pixels
 */
export function tabWidth ({ dirty = false, missing = 0 } = {}) {
  return TAB_WIDTH + (dirty ? DIRTY_WIDTH : 0) + (missing > 0 ? MISSING_WIDTH : 0) + (missing > 1 ? COUNT_WIDTH : 0)
}

/**
 * @param {Array<{dirty?: boolean, missing?: number}>} states one for each language
 * @param {number} width how wide the bar of the editor is, in pixels; nothing known (0) leaves the tabs
 * @returns {boolean} the tabs of the languages fit the bar
 */
export function tabsFit (states, width) {
  if (!_.isFinite(width) || width <= 0) {
    return true
  }
  return _.sumBy(states, tabWidth) <= width * TABS_SHARE
}
