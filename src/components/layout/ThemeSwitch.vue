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
  import { applyThemeToDocument } from '@u/theme'
  const theme = useTheme()
  const currentTheme = ref(theme.global.name.value)

  /** @returns {boolean} */
  function isDark () {
    return currentTheme.value === 'dark'
  }

  /** Asks the server for the other theme and applies it. */
  async function toggleTheme () {
    if (_.isFunction(theme.change)) {
      const newTheme = await LoginService.changeTheme()
      if (!newTheme) {
        return
      }
      theme.change(newTheme)
      currentTheme.value = newTheme
      applyThemeToDocument(newTheme)
    } else {
      console.error(`Cannot call theme change:`, theme)
    }
  }

  // Keep the button and the document in sync when the theme changes elsewhere
  watch(() => theme.global.name.value, (newVal) => {
    currentTheme.value = newVal
    applyThemeToDocument(newVal)
  })
</script>
