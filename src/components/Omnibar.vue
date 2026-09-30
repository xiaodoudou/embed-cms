<template>
  <Teleport to="body">
    <div id="omnibar" v-shortkey="getShortcuts()" @shortkey="interactiveSearch">
      <div id="omnibar-backdrop" :class="{displayed: showOmnibar}" @click="showHideOmnibar(false)" />
      <v-card v-show="showOmnibar" elevation="0" role="dialog" aria-modal="true" :aria-label="$filters.translate('TL_SEARCH_RESOURCES')">
        <v-card-title class="search">
          <v-text-field
            ref="search"
            :model-value="search" clearable clear-icon="$close" class="search-bar"
            flat variant="solo-filled" hide-details prepend-inner-icon="$magnify" density="comfortable" :placeholder="$filters.translate('TL_INSERT_KEYWORDS')" :aria-label="$filters.translate('TL_INSERT_KEYWORDS')" type="text" @update:model-value="search = $event || ''" autocomplete="off"
            name="search" :prefix="searchMode === 'all' ? '' : `${searchMode}:`" @keydown.ctrl.prevent.p="showHideOmnibar(false)" @keydown.prevent.escape="showHideOmnibar(false)"
          />
        </v-card-title>
        <template v-if="results && results.length > 0">
          <v-divider />
          <div ref="scrollWrapper" class="scroll-wrapper" :class="{'scrolled-to-bottom': scrolledToBottom || results.length < 20}" @scroll="onScroll">
            <v-list density="compact">
              <v-list-item v-for="(item, i) in results" :id="'result-' + i" :key="i" class="list" :class="{highlighted: highlightedItem === i}" :ripple="false" @click="selectResult(i)">
                <v-list-item-title>
                  <v-icon size="small" :icon="getIconForResult(item)" />
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
  import fuzzysort from 'fuzzysort'
  import FieldSelectorService from '@s/FieldSelectorService'
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
        resourcesList: [],
        results: [],
        highlightedItem: 0,
        searchModes: ['all', 'resource', 'field'],
        searchMode: 'all',
        shortcutsWhenClosed: {
          'open': ['ctrl', 'p']
        },
        shortcuts: {
          'esc': ['esc'],
          'open': ['ctrl', 'p'],
          'arrow-up': ['arrowup'],
          'arrow-down': ['arrowdown'],
          'enter': ['enter'],
          'all': ['shift', 'a'],
          'resource': ['shift', 'r'],
          'field': ['shift', 'f']
        },
        searchOptions: {
          keys: ['displayname'],
          scoreFn: a => {
            if (!a[0]) {
              return -10000000
            }
            return a[0].score + (this.isResultInCurrentResource(a) ? 10000000 : 0)
          }
        }
      }
    },
    watch: {
      search () {
        this.highlightedItem = 0
        this.results = []
        const results = fuzzysort.go(this.search, this.getDataForSearch(), this.searchOptions)
        this.results = _.compact(_.map(results, (result) => {
          if (_.isNull(_.get(result, '[0]', null))) {
            return false
          }
          result.obj.html = fuzzysort.highlight(result[0])
          result.obj.score = result.score
          return result.obj
        }))
      }
    },
    mounted () {
      this.resourcesList = _.map(_.flatten(_.map(this.groupedList, 'list')), (resource) => {
        if (_.isString(resource)) {
          return resource
        }
        resource.type = 'resource'
        resource.displayname = _.get(resource, 'displayname.enUS', _.get(resource, 'displayname', resource.title))
        return resource
      })
      this.fieldsList = _.flatten(_.map(_.cloneDeep(this.resourcesList), (resource) => {
        return _.map(resource.schema, (field) => {
          field.resource = resource
          field.displayname = `${resource.displayname}.${_.get(field, 'label.enUS', _.get(field, 'label', field.field))}`
          field.type = 'field'
          return field
        })
      }))
    },
    methods: {
      sanitizeHtml,
      getShortcuts () {
        return this.showOmnibar ? this.shortcuts : this.shortcutsWhenClosed
      },
      onScroll ({ target: { scrollTop, clientHeight, scrollHeight } }) {
        this.scrolledToBottom = scrollTop + clientHeight >= scrollHeight - 50
      },
      isResultInCurrentResource (result) {
        return _.startsWith(_.get(result[0], 'target', ''), _.get(this.selectedItem, 'displayname', ''))
      },
      getDataForSearch () {
        if (this.searchMode === 'all') {
          return _.concat(this.resourcesList, this.fieldsList)
        }
        return this.searchMode === 'resource' ? this.resourcesList : this.fieldsList
      },
      getIconForResult (result) {
        return this.getIcon(this.searchMode === 'all' ? result.type : this.searchMode)
      },
      getIcon (type) {
        return `$${type === 'resource' ? 'package' : 'cursorText'}`
      },
      isCharHighlighted (result, i) {
        return _.includes(_.values(result._indexes), i)
      },
      showHideOmnibar (display) {
        this.showOmnibar = display
        this.setSearchMode('all')
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
        const resultResource = _.includes(['resource', 'plugin'], result.type) ? result : result.resource
        if (resultResource !== this.selectedItem) {
          console.info(`Switching to resource ${resultResource.title}`)
          this.selectResourceCallback(resultResource)
        } else if (result.type === 'field') {
          FieldSelectorService.events.emit('select', _.omit(result, 'resource'))
        }
        this.showHideOmnibar(false)
      },
      setSearchMode (mode) {
        this.searchMode = mode
        this.search = ''
      },
      scrollToResult () {
        const elem = document.getElementById(`result-${this.highlightedItem}`)
        if (elem) {
          elem.scrollIntoView()
        }
      },
      async interactiveSearch (event) {
        const action = _.get(event, 'srcKey', false)
        if (!action) {
          return
        }
        if (!this.showOmnibar) {
          if (_.startsWith(action, 'open')) {
            this.showHideOmnibar(true)
          }
          return
        }
        if (action === 'esc' || _.startsWith(action, 'open')) {
          this.showHideOmnibar(false)
        } else if (action === 'arrow-up') {
          this.highlightedItem = this.highlightedItem > 0 ? this.highlightedItem - 1 : 0
          this.scrollToResult()
        } else if (action === 'arrow-down') {
          this.highlightedItem = this.highlightedItem < this.results.length ? this.highlightedItem + 1 : this.results.length - 1
          this.scrollToResult()
        } else if (action === 'enter') {
          this.selectResult()
        } else if (_.includes(this.searchModes, action)) {
          this.setSearchMode(action)
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
