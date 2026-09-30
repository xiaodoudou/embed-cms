/**
 * Applies a theme name ('light' | 'dark') to the document so that the CSS
 * tokens in src/styles/tokens.css switch for everything, including content
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

export default { applyThemeToDocument }
