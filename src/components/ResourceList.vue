<template>
  <nav v-if="groupedList" class="resources-content" :aria-label="$filters.translate('TL_RESOURCES')" @keydown="onNavKeydown">
    <div class="nav-sticky" :class="{scrolled}">
      <div class="nav-head">
        <span class="nav-head-title">{{ $filters.translate('TL_RESOURCES') }}</span>
        <button
          v-if="!filter && collapsibleGroups.length > 1" type="button" class="nav-tool" :aria-label="$filters.translate(allOpen ? 'TL_COLLAPSE_ALL' : 'TL_EXPAND_ALL')"
          :title="$filters.translate(allOpen ? 'TL_COLLAPSE_ALL' : 'TL_EXPAND_ALL')" @click="toggleAll"
        >
          <v-icon size="small" :icon="allOpen ? '$unfoldLess' : '$unfoldMore'" />
        </button>
        <button
          v-if="collapsible" type="button" class="nav-tool" :aria-label="$filters.translate('TL_COLLAPSE_SIDEBAR')" :title="`${$filters.translate('TL_COLLAPSE_SIDEBAR')} (${shortcutLabel})`"
          aria-expanded="true" aria-controls="cms-nav" @click="$emit('collapse')"
        >
          <v-icon size="small" icon="$chevronDoubleLeft" />
        </button>
      </div>
      <div class="nav-filter">
        <search-field
          ref="filterField" v-model="filter" variant="chrome" name="filter-resources" :placeholder="$filters.translate('TL_FILTER_RESOURCES')"
          :aria-label="$filters.translate('TL_FILTER_RESOURCES')"
        />
      </div>
    </div>
    <p v-if="filter" class="nav-empty" role="status">{{ matchMessage }}</p>
    <div v-for="resourceGroup in visibleGroups" :key="groupKey(resourceGroup)" class="resource-group" :class="{'is-open': isGroupOpen(resourceGroup)}">
        <h2 class="group-heading">
          <button
            type="button" class="group-toggle" :aria-expanded="isGroupOpen(resourceGroup) ? 'true' : 'false'"
            :aria-controls="`resource-group-list-${groupKey(resourceGroup)}`" @click="toggleGroup(resourceGroup)"
          >
            <v-icon class="group-chevron" size="small" icon="$chevronRight" />
            <span class="group-title">{{ $filters.translate(resourceGroup.name) }}</span>
            <span v-if="!isGroupOpen(resourceGroup) && groupSelected(resourceGroup)" class="group-current-dot" :title="$filters.translate('TL_YOU_ARE_HERE')" />
            <span class="group-count" :class="{current: !isGroupOpen(resourceGroup) && groupSelected(resourceGroup)}" aria-hidden="true">{{ resourceGroup.list.length }}</span>
          </button>
        </h2>
        <ul v-show="isGroupOpen(resourceGroup)" :id="`resource-group-list-${groupKey(resourceGroup)}`" class="group-list">
          <li v-for="resource in resourceGroup.list" :key="resource.name || resource.title">
            <button type="button" class="resource-link" :class="{selected: isSelected(resource)}" :aria-current="isSelected(resource) ? 'page' : undefined" @click="selectResourceCallback(resource)">
              <span class="resource-link-title"><template v-for="(part, i) in segments(getResourceTitle(resource))"><mark v-if="part.match" :key="i">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
            </button>
          </li>
        </ul>
    </div>
  </nav>
</template>

<script>
  import _ from 'lodash'
  import TranslateService from '@s/TranslateService'
  import SearchField from '@c/SearchField.vue'

  const STORAGE_KEY = 'node-cms.nav.groups'

  export default {
    components: { SearchField },
    props: {
      selectResourceCallback: { type: Function, default: () => {} },
      groupedList: { type: Array, default: () => [] },
      selectedItem: { type: Object, default: () => {} },
      autoSelect: { type: Boolean, default: true },
      collapsible: { type: Boolean, default: false }
    },
    emits: ['collapse'],
    data () {
      return {
        filter: '',
        scrolled: false,
        scroller: null,
        // Explicit user choices, keyed by group name: true (open) / false (closed). Persisted per browser.
        toggled: this.loadToggled()
      }
    },
    computed: {
      sortedGroups () {
        return _.map(this.groupedList, (group) => ({ ...group, list: this.orderedList(_.get(group, 'list', [])) }))
      },
      visibleGroups () {
        const query = _.toLower(_.trim(this.filter))
        const groups = _.compact(_.map(this.sortedGroups, (group) => {
          if (!query) {
            return group
          }
          const filtered = _.filter(group.list, (resource) => _.includes(_.toLower(this.getResourceTitle(resource)), query))
          return filtered.length > 0 ? { ...group, list: filtered } : false
        }))
        // Resources without a group are collected in "Others", a regular group that always comes last
        return _.sortBy(groups, (group) => (this.isOthers(group) ? 1 : 0))
      },
      matchMessage () {
        if (this.matchCount === 0) {
          return TranslateService.get('TL_NO_MATCHING_RESOURCES')
        }
        return TranslateService.get(this.matchCount === 1 ? 'TL_N_RESOURCES_MATCH_ONE' : 'TL_N_RESOURCES_MATCH', { num: this.matchCount })
      },
      shortcutLabel () {
        return /Mac|iPhone|iPad/.test(window.navigator.platform || '') ? '⌘ B' : 'Ctrl B'
      },
      matchCount () {
        return _.sum(_.map(this.visibleGroups, (group) => group.list.length))
      },
      collapsibleGroups () {
        return this.groupedList
      },
      allOpen () {
        return _.every(this.collapsibleGroups, (group) => this.isGroupOpen(group))
      }
    },
    watch: {
      // Navigating (quick switcher, breadcrumb, URL) opens the group of the current resource
      selectedItem () {
        this.openCurrentGroup()
      }
    },
    async mounted () {
      await this.$nextTick()
      if (this.autoSelect && _.isEmpty(this.selectedItem)) {
        // Selects first resource in first group
        this.selectResourceCallback(_.first(_.get(_.first(this.groupedList), 'list', [])))
      }
      this.openCurrentGroup()
      // the sticky block shows a divider only while the list is scrolled
      this.scroller = this.$el.closest ? this.$el.closest('.cms-nav') : null
      if (this.scroller) {
        this.scroller.addEventListener('scroll', this.onScroll, { passive: true })
      }
    },
    beforeUnmount () {
      if (this.scroller) {
        this.scroller.removeEventListener('scroll', this.onScroll)
      }
    },
    methods: {
      onScroll () {
        this.scrolled = this.scroller.scrollTop > 0
      },
      isOthers (group) {
        return _.get(group, 'name', '') === 'TL_OTHERS'
      },
      openCurrentGroup () {
        const group = _.find(this.groupedList, (g) => this.groupSelected(g))
        if (group && !this.isGroupOpen(group)) {
          this.toggled = { ...this.toggled, [this.groupKey(group)]: true }
          this.saveToggled()
        }
      },
      isSelected (resource) {
        if (_.get(resource, 'type', false) === 'plugin') {
          return _.get(resource, 'pluginComponent', false) === _.get(this.selectedItem, 'pluginComponent', false)
        }
        return this.selectedItem === resource
      },
      getResourceTitle (resource) {
        return resource.displayname ? TranslateService.get(resource.displayname) : resource.title
      },
      // Splits a title into matched and unmatched parts for the filter highlight (no v-html)
      segments (title) {
        const query = _.toLower(_.trim(this.filter))
        const text = _.toString(title)
        if (!query) {
          return [{ text, match: false }]
        }
        const index = _.toLower(text).indexOf(query)
        if (index === -1) {
          return [{ text, match: false }]
        }
        return _.filter([
          { text: text.slice(0, index), match: false },
          { text: text.slice(index, index + query.length), match: true },
          { text: text.slice(index + query.length), match: false }
        ], (part) => part.text.length > 0)
      },
      orderedList (list) {
        const collator = new Intl.Collator('en', {
          sensitivity: 'base',
          caseFirst: 'upper',
          usage: 'sort',
          ignorePunctuation: true,
          numeric: true
        })
        return [...list].sort((a, b) => collator.compare(this.getResourceTitle(a), this.getResourceTitle(b)))
      },
      loadToggled () {
        try {
          return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || {}
        } catch {
          return {}
        }
      },
      saveToggled () {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toggled))
        } catch {
          // storage unavailable (private mode): the state simply is not remembered
        }
      },
      groupKey (resourceGroup) {
        const name = _.get(resourceGroup, 'name.enUS', resourceGroup.name)
        return _.kebabCase(_.isString(name) ? name : JSON.stringify(name))
      },
      isGroupOpen (resourceGroup) {
        if (this.filter) {
          return true
        }
        const key = this.groupKey(resourceGroup)
        if (_.has(this.toggled, key)) {
          return this.toggled[key]
        }
        // Small menus stay fully expanded, big ones only open the active group.
        return this.groupedList.length <= 3 || this.groupSelected(resourceGroup)
      },
      toggleGroup (resourceGroup) {
        this.toggled = { ...this.toggled, [this.groupKey(resourceGroup)]: !this.isGroupOpen(resourceGroup) }
        this.saveToggled()
      },
      toggleAll () {
        const open = !this.allOpen
        const next = { ...this.toggled }
        _.each(this.collapsibleGroups, (group) => {
          next[this.groupKey(group)] = open
        })
        this.toggled = next
        this.saveToggled()
      },
      // Arrow keys move between the visible headers and resources; Home/End jump to the ends
      onNavKeydown (event) {
        const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
        if (!_.includes(keys, event.key) || _.toLower(_.get(event.target, 'tagName', '')) !== 'button') {
          return
        }
        const buttons = _.filter(this.$el.querySelectorAll('button.group-toggle, button.resource-link, button.nav-tool'), (el) => el.offsetParent !== null)
        const index = buttons.indexOf(event.target)
        if (index === -1) {
          return
        }
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : _.clamp(index + (event.key === 'ArrowDown' ? 1 : -1), 0, buttons.length - 1)
        buttons[next].focus()
      },
      groupSelected (resourceGroup) {
        if (!this.selectedItem) { return false }
        const selectedItemGroup = _.get(this.selectedItem, 'group.enUS', _.get(this.selectedItem, 'group', false))
        const groupName = _.get(resourceGroup, 'name.enUS', resourceGroup.name)
        return groupName === 'TL_OTHERS' && !selectedItemGroup ? true : groupName === selectedItemGroup
      }
    }
  }
</script>
<style lang="scss" scoped>
.resources-content {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-1);
  padding: 0 var(--cms-space-2) var(--cms-space-6);
  color: var(--cms-chrome-text);
}

// Sticky block: title row and filter on the opaque sidebar surface, a divider only once the list has scrolled
.nav-sticky {
  position: sticky;
  top: 0;
  z-index: 2;
  margin: 0 calc(var(--cms-space-2) * -1) var(--cms-space-2);
  padding: var(--cms-space-3) var(--cms-space-4);
  background: var(--cms-nav-bg);
  border-bottom: 1px solid transparent;
  transition: border-color var(--cms-motion-fast) var(--cms-ease), box-shadow var(--cms-motion-fast) var(--cms-ease);

  &.scrolled {
    border-bottom-color: var(--cms-chrome-border);
    box-shadow: var(--cms-shadow-1);
  }
}

.nav-head {
  display: flex;
  align-items: center;
  gap: var(--cms-space-1);
  min-height: 32px;
  margin-bottom: var(--cms-space-2);
  padding-left: var(--cms-space-2);

  .nav-head-title {
    flex: 1 1 auto;
    color: var(--cms-chrome-muted);
    font-size: var(--cms-fs-xs);
    font-weight: var(--cms-fw-semibold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
}

.nav-filter {
  display: flex;
}

.nav-tool {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: var(--cms-chrome-muted);
  cursor: pointer;
  &:hover {
    background: var(--cms-chrome-hover);
    color: var(--cms-chrome-text);
  }
  &:focus-visible {
    outline: 2px solid var(--cms-chrome-accent);
    outline-offset: 1px;
  }
}

.nav-empty {
  margin: var(--cms-space-4) var(--cms-space-3);
  color: var(--cms-chrome-muted);
}

.resource-group {
  margin-bottom: calc(var(--cms-space-1) / 2);
  border-radius: var(--cms-radius-sm);
  &.is-open {
    padding-bottom: var(--cms-space-1);
  }
}

.group-heading,
.group-toggle {
  display: flex;
  align-items: center;
  gap: var(--cms-space-2);
  width: 100%;
  min-height: var(--cms-nav-group-row);
  padding: 0 var(--cms-space-3) 0 var(--cms-space-2);
  border: 0;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: var(--cms-chrome-muted);
  font: inherit;
  font-size: var(--cms-fs-base);
  font-weight: var(--cms-fw-semibold);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--cms-motion-fast) var(--cms-ease), color var(--cms-motion-fast) var(--cms-ease);

  &:hover {
    background: var(--cms-chrome-hover);
    color: var(--cms-chrome-text);
  }

  &:focus-visible {
    outline: 2px solid var(--cms-chrome-accent);
    outline-offset: -2px;
  }

  /* open state is carried by the chevron and the text colour, not by a fill */
  &[aria-expanded='true'] {
    color: var(--cms-chrome-text);
  }

  .group-chevron {
    flex: 0 0 auto;
    transition: transform var(--cms-motion-fast) var(--cms-ease);
  }

  &[aria-expanded='true'] .group-chevron {
    transform: rotate(90deg);
  }

  .group-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-current-dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: var(--cms-radius-pill);
    background: var(--cms-chrome-accent);
  }

  .group-count {
    flex: 0 0 auto;
    min-width: 24px;
    padding: 0 var(--cms-space-2);
    border-radius: var(--cms-radius-pill);
    background: var(--cms-chrome-badge-bg);
    color: var(--cms-chrome-badge-text);
    font-size: var(--cms-fs-xs);
    font-weight: var(--cms-fw-semibold);
    line-height: 20px;
    text-align: center;
    &.current {
      background: var(--cms-chrome-accent);
      color: var(--cms-chrome-bg);
    }
  }
}

// Tree: children are inset under their header with a guide line
.group-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: var(--cms-space-1) 0 0 calc(var(--cms-space-2) + 10px);
  padding-left: var(--cms-space-2);
  border-left: 1px solid var(--cms-chrome-border);
}

.resource-link {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: var(--cms-nav-item-row);
  padding: 0 var(--cms-space-3);
  border: 0;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: var(--cms-chrome-muted);
  font: inherit;
  font-size: var(--cms-fs-sm);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--cms-motion-fast) var(--cms-ease), color var(--cms-motion-fast) var(--cms-ease);

  &:hover {
    background: var(--cms-chrome-hover);
    color: var(--cms-chrome-text);
  }

  &:focus-visible {
    outline: 2px solid var(--cms-chrome-accent);
    outline-offset: -2px;
  }

  &.selected {
    background: var(--cms-nav-active-bg);
    color: var(--cms-nav-active-text);
    font-weight: var(--cms-fw-semibold);
    box-shadow: inset 3px 0 0 var(--cms-chrome-accent);
  }

  .resource-link-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    mark {
      padding: 0 1px;
      border-radius: 2px;
      background: var(--cms-chrome-accent);
      color: var(--cms-chrome-bg);
    }
  }
}

@media (pointer: coarse) {
  .resource-link,
  .group-toggle {
    min-height: var(--cms-touch-target);
  }
  .nav-tool {
    width: var(--cms-touch-target);
    height: var(--cms-touch-target);
  }
}
</style>
