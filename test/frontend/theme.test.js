import { describe, it, expect } from 'vitest'
import { pickTheme } from '@u/theme'

// The login page and the admin decide their theme the same way: with dark mode turned off (disableDarkMode, the default),
// both are light; otherwise each follows the preference it has (the system's on the login page, the user's in the admin).
describe('pickTheme', () => {
  it('is light whatever the preference when dark mode is turned off', () => {
    expect(pickTheme({ disableDarkMode: true }, 'dark')).toBe('light')
    expect(pickTheme({ disableDarkMode: true }, 'light')).toBe('light')
  })

  it('follows the preference when dark mode is on', () => {
    expect(pickTheme({ disableDarkMode: false }, 'dark')).toBe('dark')
    expect(pickTheme({ disableDarkMode: false }, 'light')).toBe('light')
  })

  it('is light for an unknown preference', () => {
    expect(pickTheme({ disableDarkMode: false }, undefined)).toBe('light')
    expect(pickTheme({ disableDarkMode: false }, 'sepia')).toBe('light')
  })

  it('treats a missing configuration as dark mode off, the server default', () => {
    expect(pickTheme(undefined, 'dark')).toBe('light')
    expect(pickTheme({}, 'dark')).toBe('light')
  })
})
