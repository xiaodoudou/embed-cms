import { describe, it, expect, vi, afterEach } from 'vitest'
import { pickTheme, savedUserTheme, withoutTransitions } from '@u/theme'

// The login page and the admin decide their theme the same way: with dark mode turned off (disableDarkMode, the default),
// both are light; otherwise each follows the preference it has (the system's on the login page, the user's in the admin).
describe('withoutTransitions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.classList.remove('theme-switching')
  })

  it('turns the transitions off while the change is made, and back on two frames later', () => {
    const frames = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.push(callback); return frames.length })
    let during
    withoutTransitions(() => { during = document.documentElement.classList.contains('theme-switching') })
    expect(during).toBe(true)
    expect(document.documentElement.classList.contains('theme-switching')).toBe(true)
    frames.shift()()
    expect(document.documentElement.classList.contains('theme-switching')).toBe(true)
    frames.shift()()
    expect(document.documentElement.classList.contains('theme-switching')).toBe(false)
  })
})

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

// Saving the user record of the person who is logged in shows the new theme at once.
describe('savedUserTheme', () => {
  const on = { disableDarkMode: false }
  const me = { username: 'edouard', theme: 'light' }

  it('is the theme just saved on the own user record', () => {
    expect(savedUserTheme('_users', { username: 'edouard', theme: 'dark' }, me, on)).toBe('dark')
    expect(savedUserTheme('_users', { username: 'edouard', theme: 'light' }, { ...me, theme: 'dark' }, on)).toBe('light')
  })

  it('is null when nothing changes for this person', () => {
    expect(savedUserTheme('_users', { username: 'edouard', theme: 'light' }, me, on)).toBe(null)
    expect(savedUserTheme('_users', { username: 'someone', theme: 'dark' }, me, on)).toBe(null)
    expect(savedUserTheme('articles', { username: 'edouard', theme: 'dark' }, me, on)).toBe(null)
    expect(savedUserTheme('_users', { username: 'edouard', theme: 'dark' }, undefined, on)).toBe(null)
  })

  it('stays light when dark mode is turned off', () => {
    expect(savedUserTheme('_users', { username: 'edouard', theme: 'dark' }, me, { disableDarkMode: true })).toBe(null)
  })
})
