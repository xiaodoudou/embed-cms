import _ from 'lodash'

// The language switch of the record editor is a row of tabs when the languages fit the bar, and one button (see TopBarLocaleList) when they do not: on a phone, and where the editor is
// too narrow for the tabs of its languages. A tab is about 84px wide with a marker on it (unsaved edits, a missing required field), and the tabs may take half of the bar: the
// other half is for what is missing after a failed save and for the buttons.

export const TAB_WIDTH = 84
export const TABS_SHARE = 0.5

/**
 * @param {number} count how many languages the resource has
 * @param {number} width how wide the bar of the editor is, in pixels; nothing known (0) leaves the tabs
 * @returns {boolean} the tabs of the languages fit the bar
 */
export function tabsFit (count, width) {
  if (!_.isFinite(width) || width <= 0) {
    return true
  }
  return count * TAB_WIDTH <= width * TABS_SHARE
}
