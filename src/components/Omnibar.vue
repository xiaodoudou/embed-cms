<template>
  <Teleport to="body">
    <div id="omnibar" v-shortkey="getShortcuts()" @shortkey="interactiveSearch">
      <div id="omnibar-backdrop" :class="{displayed: showOmnibar}" @click="showHideOmnibar(false)" />
      <v-card v-show="showOmnibar" elevation="0" role="dialog" aria-modal="true" :aria-label="$filters.translate('TL_SEARCH_RESOURCES')">
        <v-card-title class="search">
          <v-text-field
            ref="search"
            :model-value="search" clearable clear-icon="$close" class="search-bar"
            flat variant="solo-filled" hide-details prepend-inner-icon="$magnify" density="comfortable" :placeholder="$filters.translate('TL_INSERT_KEYWORDS')" :aria-label="$filters.translate('TL_INSERT_KEYWORDS')" type="text" autocomplete="off" name="search"
            role="combobox" aria-expanded="true" aria-controls="omnibar-results" :aria-activedescendant="results.length > 0 ? 'result-' + highlightedItem : undefined" @update:model-value="search = $event || ''" @keydown="onSearchKeydown"
          />
        </v-card-title>
        <template v-if="results && results.length > 0">
          <v-divider />
          <div ref="scrollWrapper" class="scroll-wrapper" :class="{'scrolled-to-bottom': scrolledToBottom || results.length < 20}" @scroll="onScroll">
            <v-list id="omnibar-results" density="compact" role="listbox">
              <v-list-item v-for="(item, i) in results" :id="'result-' + i" :key="i" class="list" :class="{highlighted: highlightedItem === i}" role="option" :aria-selected="highlightedItem === i ? 'true' : 'false'" :ripple="false" @click="selectResult(i)">
                <v-list-item-title>
                  <v-icon size="small" :icon="getIcon(item.type)" />
                  <span v-html="sanitizeHtml(item.html)" />
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </div>
        </template>
        <div v-else-if="!search" class="omnibar-empty omnibar-hint">{{ $filters.translate('TL_QUICK_SWITCHER_HINT') }}</div>
        <div v-else-if="search" class="omnibar-empty">{{ $filters.translate('TL_NO_RESULTS') }}</div>
      </v-card>
    </div>
  </Teleport>
</template>

<script>
  import _ from 'lodash'
  import { sanitizeHtml } from '@u/sanitizeHtml'
  import { buildEntries, searchEntries, moveHighlight } from '@u/switcherModel'
  import { getResourceLabel } from '@u/recordLabel'
  import Notification from '@m/Notification'

  export default {
    mixins: [Notification],
    props: {
      selectResourceCallback: { type: Function, default: () => {} },
      groupedList: { type: Array, default: () => [] },
      selectedItem: { type: Object, default: () => {} }
    },
    data () {
      return {
        showOmnibar: false,
        search: null,
        scrolledToBottom: false,
        entries: [],
        results: [],
        highlightedItem: 0,
        // Ctrl+K is handled by the top bar; this one opens it too while it is closed
        shortcutsWhenClosed: {
          'open': ['ctrl', 'p']
        }
      }
    },
    watch: {
      groupedList: {
        immediate: true,
        handler () {
          this.entries = buildEntries(this.groupedList, this.labelOf)
        }
      },
      search () {
        this.highlightedItem = 0
        this.results = searchEntries(this.entries, this.search, this.currentLabel())
      }
    },
    methods: {
      sanitizeHtml,
      labelOf (item) {
        return getResourceLabel(item)
      },
      currentLabel () {
        return this.selectedItem ? this.labelOf(this.selectedItem) : ''
      },
      getShortcuts () {
        return this.showOmnibar ? {} : this.shortcutsWhenClosed
      },
      onScroll ({ target: { scrollTop, clientHeight, scrollHeight } }) {
        this.scrolledToBottom = scrollTop + clientHeight >= scrollHeight - 50
      },
      getIcon (type) {
        return type === 'plugin' ? '$cogOutline' : '$package'
      },
      showHideOmnibar (display) {
        this.showOmnibar = display
        this.search = ''
        if (display) {
          this.$nextTick(() => {
            const elem = _.get(this.$refs, '[\'search\']', false)
            elem.focus()
          })
        }
        this.sendOmnibarDisplayStatus(display)
      },
      selectResult (i = -1) {
        const result = _.get(this.results, `[${i === -1 ? this.highlightedItem : i}]`, false)
        if (!result) {
          return
        }
        if (result.ref !== this.selectedItem) {
          this.selectResourceCallback(result.ref)
        }
        this.showHideOmnibar(false)
      },
      scrollToResult () {
        const elem = document.getElementById(`result-${this.highlightedItem}`)
        if (elem) {
          elem.scrollIntoView({ block: 'nearest' })
        }
      },
      // keys typed in the search field: arrows move, Enter opens, Escape closes
      onSearchKeydown (event) {
        if (event.key === 'Escape' || (event.ctrlKey && _.toLower(event.key) === 'p')) {
          event.preventDefault()
          this.showHideOmnibar(false)
        } else if (_.includes(['ArrowDown', 'ArrowUp'], event.key)) {
          event.preventDefault()
          this.highlightedItem = moveHighlight(this.highlightedItem, event.key, this.results.length)
          this.scrollToResult()
        } else if (event.key === 'Enter') {
          event.preventDefault()
          this.selectResult()
        }
      },
      // the shortcut library only opens the switcher (Ctrl+P); everything else is typed in the field
      interactiveSearch (event) {
        if (!this.showOmnibar && _.startsWith(_.get(event, 'srcKey', ''), 'open')) {
          this.showHideOmnibar(true)
        }
      }
    }
  }
</script>
<style lang="scss">
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;

#omnibar,
#omnibar-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  touch-action: none;
  z-index: var(--cms-z-omnibar);
}

#omnibar {
  color: var(--cms-text);

  .v-card {
    position: fixed;
    top: min(20vh, 160px);
    left: 50%;
    width: min(600px, calc(100vw - 32px));
    max-width: none;
    transform: translateX(-50%);
    pointer-events: auto;
    touch-action: auto;
    z-index: 1;
    background: var(--cms-surface);
    color: var(--cms-text);
    border: 1px solid var(--cms-border);
    border-radius: var(--cms-radius-lg);
    box-shadow: var(--cms-shadow-3);
    overflow: hidden;
  }

  .v-card-title.search {
    padding: var(--cms-space-3);
  }

  .v-list {
    padding: var(--cms-space-2);
    max-height: 60vh;
    background: transparent;
    border: 0;
    box-shadow: none;
  }

  .v-list-item {
    min-height: 40px;
    border-radius: var(--cms-radius-sm);
    .v-list-item-title {
      @include cta-text;
      font-weight: var(--cms-fw-regular);
      display: flex;
      align-items: center;
      gap: var(--cms-space-2);
    }
    .v-icon {
      color: var(--cms-text-muted);
      flex: 0 0 auto;
    }
    &.highlighted {
      background: var(--cms-primary-soft);
      color: var(--cms-on-primary-soft);
      .v-icon {
        color: var(--cms-on-primary-soft);
      }
    }
    &:hover:not(.highlighted) {
      background: var(--cms-surface-2);
    }
  }

  .v-text-field__prefix {
    font-size: var(--cms-fs-sm);
  }

  span b {
    color: var(--cms-primary);
    font-weight: var(--cms-fw-bold);
  }

  .omnibar-empty {
    padding: var(--cms-space-6);
    text-align: center;
    color: var(--cms-text-muted);
    border-top: 1px solid var(--cms-border);
  }

  #omnibar-backdrop {
    z-index: 0;
    background-color: var(--cms-scrim);
    opacity: 0;
    transition: opacity var(--cms-motion-base) var(--cms-ease);
    &.displayed {
      opacity: 1;
      pointer-events: auto;
      touch-action: auto;
    }
  }

  .scroll-wrapper {
    overflow: auto;
    @include custom-scrollbar;
  }
}
</style>
