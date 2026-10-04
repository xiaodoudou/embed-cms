<template>
  <v-btn
    class="theme-switch" icon variant="text" role="switch" :aria-checked="isDark() ? 'true' : 'false'"
    :aria-label="$filters.translate('TL_DARK_THEME')" :title="$filters.translate(isDark() ? 'TL_SWITCH_TO_LIGHT' : 'TL_SWITCH_TO_DARK')" @click="toggleTheme()"
  >
    <v-icon :icon="isDark() ? '$weatherNight' : '$weatherSunny'" />
  </v-btn>
</template>
<script setup>
  import LoginService from '@s/LoginService'
  import _ from 'lodash'
  import { ref, watch } from 'vue'
  import { useTheme } from 'vuetify'
  import { applyThemeToDocument, withoutTransitions } from '@u/theme'
  const theme = useTheme()
  const currentTheme = ref(theme.global.name.value)

  /** @returns {boolean} */
  function isDark () {
    return currentTheme.value === 'dark'
  }

  /** @param {string} name the theme to show, right now */
  function show (name) {
    withoutTransitions(() => {
      theme.change(name)
      currentTheme.value = name
      applyThemeToDocument(name)
    })
  }

  /** Shows the other theme at once, and has the server keep it; when the server cannot, the page goes back (the click is not made to wait for the answer). */
  async function toggleTheme () {
    if (!_.isFunction(theme.change)) {
      console.error(`Cannot call theme change:`, theme)
      return
    }
    const before = currentTheme.value
    const wanted = before === 'dark' ? 'light' : 'dark'
    show(wanted)
    if (!(await LoginService.changeTheme(wanted))) {
      show(before)
    }
  }

  // Keep the button and the document in sync when the theme changes elsewhere
  watch(() => theme.global.name.value, (newVal) => {
    currentTheme.value = newVal
    applyThemeToDocument(newVal)
  })
</script>
