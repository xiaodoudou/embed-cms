<template>
  <div class="top-bar-locale-list" :class="{hidden: !locales || locales.length === 0}">
    <v-btn class="back" elevation="0" variant="text" size="small" :aria-label="$filters.translate('TL_BACK')" @click="back">
      <v-icon icon="$chevronLeft" /> {{ $filters.translate("TL_BACK") }}
    </v-btn>
    <div
      v-if="locales && locales.length > 0" class="locales" role="group" :aria-label="$filters.translate('TL_CONTENT_LANGUAGE')"
      :title="$filters.translate('TL_LOCALE_LEGEND')"
    >
      <button
        v-for="(item, i) in locales" :key="i" type="button" class="locale-btn" :class="{selected: item === locale}"
        :aria-pressed="item === locale ? 'true' : 'false'" @click="selectLocale(item)"
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

  export default {
    props: {
      locales: { type: Array, default: () => [] },
      locale: { type: String, default: '' },
      back: { type: Function, default: () => {} },
      selectLocale: { type: Function, default: () => {} },
      dirtyLocales: { type: Array, default: () => [] },
      missing: { type: Object, default: () => ({}) }
    },
    methods: {
      isDirty (locale) {
        return _.includes(this.dirtyLocales, locale)
      },
      missingCount (locale) {
        return _.get(this.missing, locale, 0)
      },
      dirtyLabel (locale) {
        return TranslateService.get('TL_UNSAVED_IN_LOCALE', { locale: this.getLocaleTranslation(locale) })
      },
      missingLabel (locale) {
        const count = this.missingCount(locale)
        return TranslateService.get(count === 1 ? 'TL_REQUIRED_MISSING_IN_LOCALE_ONE' : 'TL_REQUIRED_MISSING_IN_LOCALE_MANY', { num: count, locale: this.getLocaleTranslation(locale) })
      },
      getLocaleTranslation (locale) {
        return TranslateService.get('TL_' + locale.toUpperCase())
      },
      toggleLocale () {
        this.selectLocale(_.find(this.locales, (l) => l !== this.locale))
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
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 2px;
    border: 1px solid $locales-border-color;
    border-radius: var(--cms-radius-md);
    background: var(--cms-surface-2);
  }

  .locale-btn {
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

    // the active locale is a white segment with a primary outline
    &.selected {
      color: $locales-selected-color;
      background: $locales-selected-background;
      box-shadow: inset 0 0 0 1.5px var(--cms-primary), var(--cms-shadow-1);

      &:hover {
        background: var(--cms-surface);
      }

      .locale-dirty {
        box-shadow: 0 0 0 2px var(--cms-surface);
      }

      .locale-missing-icon {
        box-shadow: 0 0 0 2px var(--cms-surface);
      }
    }

    // Amber dot: this locale has unsaved edits
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

    // Red circle with an exclamation mark (plus a count): required fields missing in this locale
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
  }

  &.hidden {
    display: none;
  }
}
</style>
