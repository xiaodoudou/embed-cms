<template>
  <div class="top-bar-locale-list" :class="{hidden: !locales || locales.length === 0}">
    <v-btn class="back" elevation="0" variant="text" size="small" :aria-label="$filters.translate('TL_BACK')" @click="back">
      <v-icon icon="$chevronLeft" /> {{ $filters.translate("TL_BACK") }}
    </v-btn>
    <!-- a phone: one button with the language, which changes it (two languages), or opens the list of them: the tabs of ten languages would take the screen -->
    <template v-if="compact && locales && locales.length > 1">
      <v-btn
        v-if="locales.length === 2" class="locale-compact" variant="outlined" :aria-label="switchLabel" :title="$filters.translate('TL_LOCALE_LEGEND')" @click="toggleLocale"
      >
        <v-icon start icon="$translate" />{{ getLocaleTranslation(locale) }}
        <span v-if="isDirty(locale)" class="locale-dirty" aria-hidden="true" />
        <span v-if="missingCount(locale) > 0" class="locale-missing" aria-hidden="true"><span class="locale-missing-icon">!</span></span>
        <span v-if="othersNeedAttention" class="locale-others" aria-hidden="true" />
        <v-icon end icon="$swapHorizontal" />
      </v-btn>
      <v-menu v-else v-model="menuOpen" content-class="locale-menu" location="bottom start">
        <template #activator="{ props }">
          <v-btn
            v-bind="props" class="locale-compact" variant="outlined" aria-haspopup="menu" :aria-expanded="menuOpen ? 'true' : 'false'" :aria-label="menuLabel"
            :title="$filters.translate('TL_LOCALE_LEGEND')"
          >
            <v-icon start icon="$translate" />{{ getLocaleTranslation(locale) }}
            <span v-if="isDirty(locale)" class="locale-dirty" aria-hidden="true" />
            <span v-if="missingCount(locale) > 0" class="locale-missing" aria-hidden="true"><span class="locale-missing-icon">!</span></span>
            <span v-if="othersNeedAttention" class="locale-others" aria-hidden="true" />
            <v-icon end icon="$chevronDown" />
          </v-btn>
        </template>
        <v-list density="comfortable" class="locale-list" :aria-label="$filters.translate('TL_CONTENT_LANGUAGE')">
          <v-list-item
            v-for="item in locales" :key="item" class="locale-item" :class="{ selected: item === locale }" :active="item === locale" :aria-current="item === locale ? 'true' : undefined"
            @click="onPickLocale(item)"
          >
            <v-list-item-title>{{ getLocaleTranslation(item) }}</v-list-item-title>
            <template #append>
              <span v-if="isDirty(item)" class="locale-dirty" role="img" :title="dirtyLabel(item)" :aria-label="dirtyLabel(item)" />
              <span v-if="missingCount(item) > 0" class="locale-missing" role="img" :title="missingLabel(item)" :aria-label="missingLabel(item)">
                <span class="locale-missing-icon" aria-hidden="true">!</span>
                <span v-if="missingCount(item) > 1" class="locale-missing-count" aria-hidden="true">{{ missingCount(item) }}</span>
              </span>
              <v-icon v-if="item === locale" class="locale-check" size="small" icon="$check" />
            </template>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>
    <div
      v-else-if="locales && locales.length > 0" ref="group" class="locales" :class="{ready: indicatorReady}" role="group" :aria-label="$filters.translate('TL_CONTENT_LANGUAGE')"
      :title="$filters.translate('TL_LOCALE_LEGEND')" @click.self="toggleLocale"
    >
      <span class="locale-indicator" aria-hidden="true" :style="indicatorStyle" />
      <button
        v-for="(item, i) in locales" :key="i" ref="buttons" type="button" class="locale-btn" :class="{selected: item === locale}"
        :aria-pressed="item === locale ? 'true' : 'false'" @click="onClickLocale(item)"
      >
        {{ getLocaleTranslation(item) }}
        <span
          v-if="isDirty(item)" class="locale-dirty" role="img" :title="dirtyLabel(item)" :aria-label="dirtyLabel(item)"
        />
        <span
          v-if="missingCount(item) > 0" class="locale-missing" role="img" :title="missingLabel(item)" :aria-label="missingLabel(item)"
        >
          <span class="locale-missing-icon" aria-hidden="true">!</span>
          <span v-if="missingCount(item) > 1" class="locale-missing-count" aria-hidden="true">{{ missingCount(item) }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import TranslateService from '@s/TranslateService'
  import { PHONE_QUERY } from '@u/phoneLayout'

  export default {
    props: {
      locales: { type: Array, default: () => [] },
      locale: { type: String, default: '' },
      back: { type: Function, default: () => {} },
      selectLocale: { type: Function, default: () => {} },
      dirtyLocales: { type: Array, default: () => [] },
      missing: { type: Object, default: () => ({}) }
    },
    data () {
      return { indicatorStyle: { opacity: 0 }, indicatorReady: false, compact: this.onPhone(), menuOpen: false }
    },
    computed: {
      /** @returns {boolean} another language than the one shown has unsaved edits or a missing required field: the button says so with a dot */
      othersNeedAttention () {
        return _.some(this.locales, (item) => item !== this.locale && (this.isDirty(item) || this.missingCount(item) > 0))
      },
      /** @returns {string} what the button of two languages does */
      switchLabel () {
        const other = _.find(this.locales, (item) => item !== this.locale)
        return `${TranslateService.get('TL_CONTENT_LANGUAGE')}: ${this.getLocaleTranslation(this.locale)}. ${TranslateService.get('TL_SWITCH_TO_LOCALE', { locale: this.getLocaleTranslation(other) })}`
      },
      /** @returns {string} what the button that opens the list of languages says */
      menuLabel () {
        return `${TranslateService.get('TL_CONTENT_LANGUAGE')}: ${this.getLocaleTranslation(this.locale)}${this.othersNeedAttention ? `. ${TranslateService.get('TL_OTHER_LANGUAGES_ATTENTION')}` : ''}`
      }
    },
    watch: {
      locale () {
        this.$nextTick(this.moveIndicator)
      },
      locales () {
        this.$nextTick(this.moveIndicator)
      },
      // a dot or a count on a button changes its width
      dirtyLocales () {
        this.$nextTick(this.moveIndicator)
      },
      missing: {
        deep: true,
        handler () {
          this.$nextTick(this.moveIndicator)
        }
      }
    },
    mounted () {
      if (typeof window !== 'undefined' && window.matchMedia) {
        this.phoneMedia = window.matchMedia(PHONE_QUERY)
        this.phoneMedia.addEventListener('change', this.onPhoneChange)
      }
      this.moveIndicator()
      if (typeof ResizeObserver !== 'undefined' && this.$refs.group) {
        this.resizeObserver = new ResizeObserver(() => this.moveIndicator())
        this.resizeObserver.observe(this.$refs.group)
      }
      // the box appears where it belongs, then moves from there: no slide in from the corner on the first paint
      requestAnimationFrame(() => {
        this.indicatorReady = true
      })
    },
    beforeUnmount () {
      if (this.phoneMedia) {
        this.phoneMedia.removeEventListener('change', this.onPhoneChange)
      }
      if (this.resizeObserver) {
        this.resizeObserver.disconnect()
      }
    },
    methods: {
      /** @returns {boolean} the screen is a phone's (see utils/phoneLayout.js) */
      onPhone () {
        return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE_QUERY).matches
      },
      /** The screen became a phone, or stopped being one. */
      onPhoneChange () {
        this.compact = this.phoneMedia.matches
        this.$nextTick(this.moveIndicator)
      },
      /** @param {string} item the language chosen in the list */
      onPickLocale (item) {
        this.menuOpen = false
        this.selectLocale(item)
      },
      // the selected box is one element that slides and stretches to the selected button, whatever the number of languages
      moveIndicator () {
        const index = _.indexOf(this.locales, this.locale)
        const button = _.get(this.$refs, ['buttons', index])
        if (!button || index < 0) {
          this.indicatorStyle = { opacity: 0 }
          return
        }
        this.indicatorStyle = {
          opacity: 1,
          width: `${button.offsetWidth}px`,
          height: `${button.offsetHeight}px`,
          transform: `translate(${button.offsetLeft}px, ${button.offsetTop}px)`
        }
      },
      /**
       * @param {string} locale
       * @returns {boolean}
       */
      isDirty (locale) {
        return _.includes(this.dirtyLocales, locale)
      },
      /**
       * @param {string} locale
       * @returns {number} the required fields without a value in it
       */
      missingCount (locale) {
        return _.get(this.missing, locale, 0)
      },
      /**
       * @param {string} locale
       * @returns {string}
       */
      dirtyLabel (locale) {
        return TranslateService.get('TL_UNSAVED_IN_LOCALE', { locale: this.getLocaleTranslation(locale) })
      },
      /**
       * @param {string} locale
       * @returns {string} singular or plural
       */
      missingLabel (locale) {
        const count = this.missingCount(locale)
        return TranslateService.get(count === 1 ? 'TL_REQUIRED_MISSING_IN_LOCALE_ONE' : 'TL_REQUIRED_MISSING_IN_LOCALE_MANY', { num: count, locale: this.getLocaleTranslation(locale) })
      },
      /**
       * @param {string} locale
       * @returns {string} its translated name
       */
      getLocaleTranslation (locale) {
        return TranslateService.localeName(locale)
      },
      // with two languages the switch is a toggle: a click on either button, or anywhere on the switch, goes to the other one
      onClickLocale (locale) {
        if (this.locales.length === 2) {
          this.toggleLocale()
        } else {
          this.selectLocale(locale)
        }
      },
      /** With two locales, goes to the other one. */
      toggleLocale () {
        if (this.locales.length === 2) {
          this.selectLocale(_.find(this.locales, (l) => l !== this.locale))
        }
      }
    }
  }
</script>
<style lang="scss">
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;
.top-bar-locale-list {
  display: flex;
  align-items: center;
  gap: var(--cms-space-2);
  min-width: 0;

  .locales {
    position: relative;
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 2px;
    border: 1px solid $locales-border-color;
    border-radius: var(--cms-radius-md);
    background: var(--cms-surface-2);
  }

  // the active locale is a white box with a primary outline, under the buttons; it moves and stretches to the selected one
  .locale-indicator {
    position: absolute;
    top: 0;
    left: 0;
    border-radius: var(--cms-radius-sm);
    background: $locales-selected-background;
    box-shadow: inset 0 0 0 1.5px var(--cms-primary), var(--cms-shadow-1);
    pointer-events: none;
  }

  .locales.ready .locale-indicator {
    transition: transform var(--cms-motion-base) var(--cms-ease), width var(--cms-motion-base) var(--cms-ease), height var(--cms-motion-base) var(--cms-ease), opacity var(--cms-motion-fast) var(--cms-ease);
  }

  .locale-btn {
    position: relative;
    min-width: 40px;
    height: 32px;
    padding: 0 var(--cms-space-3);
    border: 0;
    border-radius: var(--cms-radius-sm);
    background: transparent;
    color: $locales-color;
    font: inherit;
    font-size: var(--cms-fs-sm);
    font-weight: var(--cms-fw-semibold);
    cursor: pointer;
    user-select: none;
    transition: background-color var(--cms-motion-fast) var(--cms-ease);

    &:hover {
      background: var(--cms-surface-3);
    }

    // the box under the selected button is the indicator: the button itself only changes its text colour
    &.selected {
      color: $locales-selected-color;
      background: transparent;

      &:hover {
        background: transparent;
      }

      .locale-dirty {
        box-shadow: 0 0 0 2px var(--cms-surface);
      }

      .locale-missing-icon {
        box-shadow: 0 0 0 2px var(--cms-surface);
      }
    }
  }

  // the button of a phone: the language, its markers, and what changes it
  .locale-compact {
    position: relative;
    min-height: var(--cms-touch-target);
    padding: 0 var(--cms-space-3);
    border-color: var(--cms-border-strong);
    background: var(--cms-surface-2);
    color: var(--cms-text);
    font-weight: var(--cms-fw-semibold);
    text-transform: none;
    letter-spacing: 0;
  }

  &.hidden {
    display: none;
  }
}

// Markers of a language, in the tabs, in the button of a phone and in the list of languages (which is drawn in the overlay, outside the bar)
.locale-dirty {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-left: var(--cms-space-2);
  border-radius: var(--cms-radius-pill);
  background: var(--cms-warning);
  box-shadow: 0 0 0 2px var(--cms-warning-soft);
  vertical-align: middle;
}

// required fields missing in a language: a red circle with an exclamation mark, and a count
.locale-missing {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: var(--cms-space-2);
  vertical-align: middle;
  .locale-missing-icon {
    display: inline-grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: var(--cms-radius-pill);
    background: var(--cms-error);
    color: var(--cms-on-error);
    font-size: 11px;
    font-weight: var(--cms-fw-bold);
    line-height: 1;
  }
  .locale-missing-count {
    min-width: 16px;
    padding: 0 4px;
    border-radius: var(--cms-radius-pill);
    background: var(--cms-error-soft);
    border: 1px solid var(--cms-error);
    color: var(--cms-error);
    font-size: 11px;
    font-weight: var(--cms-fw-bold);
    line-height: 14px;
    text-align: center;
  }
}

// another language than the one shown needs a look (unsaved edits, a missing required field): a dot on the corner of the button of a phone
.locale-compact .locale-others {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 10px;
  height: 10px;
  border-radius: var(--cms-radius-pill);
  background: var(--cms-warning);
  box-shadow: 0 0 0 2px var(--cms-surface);
}

.locale-menu .locale-item {
  min-height: var(--cms-touch-target);
  &.selected {
    color: var(--cms-primary);
    font-weight: var(--cms-fw-semibold);
  }
  .locale-check {
    margin-left: var(--cms-space-3);
  }
}
</style>
