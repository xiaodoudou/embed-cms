import { createVuetify } from 'vuetify'
import { mdi } from 'vuetify/iconsets/mdi-svg'
import { iconAliases } from '@u/iconAliases'
import 'vuetify/styles'

/*
 * Vuetify palette. Keep in sync with src/styles/tokens.scss (which is the source
 * of truth for the hand written CSS). Every foreground/background pair here
 * meets WCAG AA. Custom keys are exposed as --v-theme-<name> and as
 * `bg-<name>` / `text-<name>` utility classes.
 */
const lightColors = {
  background: '#EEF0F5',
  surface: '#FFFFFF',
  'surface-bright': '#FFFFFF',
  'surface-light': '#F4F5F9',
  'surface-variant': '#1E2330', // used by Vuetify for tooltips (inverse surface)
  'on-surface-variant': '#FFFFFF',
  primary: '#4540a8',
  'primary-darken-1': '#37338c',
  secondary: '#4540a8',
  'secondary-darken-1': '#37338c',
  error: '#A8362F',
  info: '#2C5DA3',
  success: '#2D6B52',
  warning: '#85560A',
  'on-primary': '#FFFFFF',
  'on-secondary': '#FFFFFF',
  'on-error': '#FFFFFF',
  'on-info': '#FFFFFF',
  'on-success': '#FFFFFF',
  'on-warning': '#FFFFFF',
  'on-background': '#161B26',
  'on-surface': '#161B26',
  'surface-2': '#F4F5F9',
  'primary-soft': '#EDEFFA',
  'on-primary-soft': '#2e2a8a'
}

const darkColors = {
  background: '#0F1116',
  surface: '#171A21',
  'surface-bright': '#292E3A',
  'surface-light': '#1F232C',
  'surface-variant': '#E3E6F6',
  'on-surface-variant': '#161A2E',
  primary: '#a9a4ff',
  'primary-darken-1': '#c0bcff',
  secondary: '#a9a4ff',
  'secondary-darken-1': '#c0bcff',
  error: '#F09A93',
  info: '#8DB4F0',
  success: '#7BCBA5',
  warning: '#E6B565',
  'on-primary': '#0B1033',
  'on-secondary': '#062B28',
  'on-error': '#3A0A07',
  'on-info': '#06213F',
  'on-success': '#052B1D',
  'on-warning': '#2E1A00',
  'on-background': '#E8EAF6',
  'on-surface': '#E8EAF6',
  'surface-2': '#1F232C',
  'primary-soft': '#232842',
  'on-primary-soft': '#D6DBFF'
}

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: lightColors,
        variables: {
          'border-color': '#6B7290',
          'border-opacity': 0.5,
          'high-emphasis-opacity': 0.92,
          'medium-emphasis-opacity': 0.72,
          'disabled-opacity': 0.42,
          'focus-opacity': 0.12,
          'hover-opacity': 0.06
        }
      },
      dark: {
        dark: true,
        colors: darkColors,
        variables: {
          'border-color': '#8089A0',
          'border-opacity': 0.5,
          'high-emphasis-opacity': 0.94,
          'medium-emphasis-opacity': 0.74,
          'disabled-opacity': 0.42,
          'focus-opacity': 0.16,
          'hover-opacity': 0.1
        }
      }
    }
  },
  defaults: {
    VBtn: { elevation: 0 },
    VCard: { elevation: 0 },
    VTooltip: { openDelay: 300 },
    VMenu: { transition: 'fade-transition', offset: 6 },
    VSelect: { menuProps: { offset: 6, maxHeight: 320, transition: 'fade-transition' }, menuIcon: '$chevronDown' },
    VAutocomplete: { menuProps: { offset: 6, maxHeight: 320, transition: 'fade-transition' }, menuIcon: '$chevronDown' },
    VCombobox: { menuProps: { offset: 6, maxHeight: 320, transition: 'fade-transition' }, menuIcon: '$chevronDown' },
    VChip: { size: 'default' }
  },
  icons: {
    defaultSet: 'mdi',
    aliases: iconAliases,
    sets: {
      mdi
    }
  }
})

export default vuetify
