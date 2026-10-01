<template>
  <div v-if="localeList && localeList.length > 1" class="locale-list" role="group" :aria-label="$filters.translate('TL_LANGUAGE')">
    <button
      v-for="(locale, index) in localeList" :key="index" type="button" class="locale" :class="{active: TranslateService.locale == locale }"
      :aria-pressed="TranslateService.locale == locale ? 'true' : 'false'" @click="TranslateService.setLocale(locale)"
    >
      {{ $filters.translate('TL_' + locale.toUpperCase()) }}
    </button>
  </div>
</template>

<script>

  import TranslateService from '@s/TranslateService'

  export default {
    props: {
      localeList: { type: Array, default: () => [] }
    },
    data () {
      return {
        TranslateService
      }
    }
  }
</script>
