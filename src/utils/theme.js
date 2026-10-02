/**
 * Applies a theme name ('light' | 'dark') to the document so that the CSS
 * tokens in src/styles/tokens.scss switch for everything, including content
 * teleported outside the Vuetify application root (menus, omnibar, dialogs).
 */
export function applyThemeToDocument (name) {
  const theme = name === 'dark' ? 'dark' : 'light'
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  document.body.classList.remove('v-theme--dark', 'v-theme--light')
  document.body.classList.add(`v-theme--${theme}`)
  return theme
}

/**
 * The theme to show, the same way on the login page and in the admin: light when dark mode is turned off
 * (disableDarkMode, the server default, also when the configuration could not be read), otherwise the preference given
 * ('dark' or 'light': the system's on the login page, the user's in the admin).
 * @param {object} [config] the admin configuration (/admin/config)
 * @param {string} [preferred]
 * @returns {'light'|'dark'}
 */
export function pickTheme (config, preferred) {
  const darkModeOff = !config || config.disableDarkMode !== false
  return !darkModeOff && preferred === 'dark' ? 'dark' : 'light'
}

/**
 * The theme to apply right after a user record is saved: the one just saved, when it is the record of the person who is logged in
 * and differs from what they see. Anything else (another resource, another user, the same theme) is null.
 * @param {string} resource - name of the resource the record belongs to
 * @param {object} record - the saved record
 * @param {object} user - the logged in user (username, theme)
 * @param {object} [config] - the admin configuration (dark mode may be turned off)
 * @returns {string|null} 'light' or 'dark'
 */
export function savedUserTheme (resource, record, user, config) {
  if (resource !== '_users' || !record || !user || !user.username || record.username !== user.username) {
    return null
  }
  const theme = pickTheme(config, record.theme === 'dark' ? 'dark' : 'light')
  return theme === pickTheme(config, user.theme) ? null : theme
}

export default { applyThemeToDocument, pickTheme, savedUserTheme }
