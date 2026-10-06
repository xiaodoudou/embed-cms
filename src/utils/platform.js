/**
 * Whether the keyboard has a Command key: the shortcuts are shown with ⌘ there, with Ctrl elsewhere.
 * @param {Navigator} [nav]
 * @returns {boolean}
 */
export function isMacLike (nav = typeof navigator !== 'undefined' ? navigator : {}) {
  const platform = (nav.userAgentData && nav.userAgentData.platform) || nav.platform || ''
  return /Mac|iPhone|iPad/.test(platform)
}

/**
 * A shortcut as it is shown: `⌘ K` on a Mac, `Ctrl K` elsewhere.
 * @param {string} key
 * @returns {string}
 */
export function shortcutLabel (key) {
  return `${isMacLike() ? '⌘' : 'Ctrl'} ${key}`
}
