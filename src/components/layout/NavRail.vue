<template>
  <nav class="nav-rail" :aria-label="$filters.translate('TL_RESOURCES')" @keydown="onRailKeydown">
    <div class="rail-top">
      <button
        type="button" class="rail-btn" :aria-label="$filters.translate('TL_EXPAND_SIDEBAR')" :title="`${$filters.translate('TL_EXPAND_SIDEBAR')} (${shortcutLabel})`"
        aria-expanded="false" aria-controls="cms-nav" @click="$emit('toggle')"
      >
        <v-icon size="small" icon="$chevronDoubleRight" />
      </button>
      <button type="button" class="rail-btn" :aria-label="$filters.translate('TL_SEARCH_RESOURCES')" :title="$filters.translate('TL_SEARCH_RESOURCES')" @click="openSwitcher">
        <v-icon size="small" icon="$magnify" />
      </button>
    </div>
    <ul class="rail-list rail-groups">
      <li v-for="group in sections.groups" :key="keyOf(group)">
        <button
          type="button" class="rail-badge" :class="[`tint-${tintOf(group)}`, {current: holdsItem(group), open: openKey === keyOf(group), pinned: pinnedKey === keyOf(group)}]" :data-group="keyOf(group)"
          :aria-haspopup="isPage(group) ? undefined : 'menu'" :aria-expanded="openKey === keyOf(group) ? 'true' : 'false'" :aria-label="groupLabel(group)" :aria-current="holdsItem(group) ? 'true' : undefined"
          :title="titleOf(group)"
          @mouseenter="onEnter(group, $event)" @mouseleave="scheduleClose" @focus="onFocus(group, $event)" @click="onToggle(group, $event)"
          @keydown.enter.prevent="openWithFocus(group, $event.currentTarget)" @keydown.space.prevent="openWithFocus(group, $event.currentTarget)"
          @keydown.right.prevent="openWithFocus(group, $event.currentTarget)" @keydown.esc="closeFlyout(true)" @keydown.left="closeFlyout(true)"
        >
          <img v-if="iconUrl(group)" :src="iconUrl(group)" class="rail-image" alt="">
          <v-icon v-else-if="group.icon" size="small" :icon="group.icon" />
          <span v-else aria-hidden="true">{{ initialsOf(group) }}</span>
        </button>
      </li>
    </ul>
    <ul v-if="sections.loose.length > 0" class="rail-list rail-loose" :aria-label="$filters.translate('TL_OTHERS')">
      <li v-for="resource in loose" :key="resource.name || resource.title">
        <button
          type="button" class="rail-badge" :class="[`tint-${tintOfName(resourceTitle(resource))}`, {current: isSelected(resource)}]" :aria-label="resourceTitle(resource)"
          :title="resourceTitle(resource)" :aria-current="isSelected(resource) ? 'page' : undefined" @mouseenter="closeFlyout(false)" @click="selectResourceCallback(resource)"
        >
          <span aria-hidden="true">{{ initialsOfName(resourceTitle(resource)) }}</span>
        </button>
      </li>
    </ul>
    <teleport to="body">
      <div
        v-if="openGroup" ref="flyout" class="rail-flyout" role="menu" :aria-label="titleOf(openGroup)" :style="{left: `${position.left}px`, top: `${position.top}px`}"
        @mouseenter="cancelClose" @mouseleave="scheduleClose" @keydown="onFlyoutKeydown" @focusout="onFlyoutFocusOut"
      >
        <div class="rail-flyout-head">
          <span class="rail-flyout-title">{{ titleOf(openGroup) }}</span>
        </div>
        <ul class="rail-flyout-list">
          <li v-for="resource in items" :key="resource.name || resource.title">
            <button
              type="button" role="menuitem" class="rail-flyout-item" :class="{selected: isSelected(resource)}" tabindex="-1" :aria-current="isSelected(resource) ? 'page' : undefined"
              @click="choose(resource)"
            >
              <span class="rail-flyout-name">{{ resourceTitle(resource) }}</span>
            </button>
          </li>
        </ul>
      </div>
    </teleport>
  </nav>
</template>

<script>
  import _ from 'lodash'
  import TranslateService from '@s/TranslateService'
  import { getResourceLabel } from '@u/recordLabel'
  import NotificationsService from '@s/NotificationsService'
  import ResourceService from '@s/ResourceService'
  import {
    railSections, groupSettingsName, groupKey, groupHoldsItem, groupInitials, groupTint, orderResources, moveInList, flyoutPosition
  } from '@u/navModel'

  const HOVER_OPEN_DELAY = 90
  const HOVER_CLOSE_DELAY = 200

  /**
   * The collapsed sidebar: a badge per group (initials on a calm tint, accent bar for the active group), a search
   * icon that opens the quick switcher, and a flyout with the resources of a group. The flyout opens on hover, focus,
   * click and Enter, closes on Escape, outside click and focus-out, and is navigated with the arrow keys.
   */
  export default {
    props: {
      groupedList: { type: Array, default: () => [] },
      selectedItem: { type: Object, default: () => ({}) },
      selectResourceCallback: { type: Function, default: () => {} }
    },
    emits: ['toggle'],
    data () {
      return {
        openKey: null,
        pinnedKey: null,
        menuIcons: ResourceService.menuIcons(),
        anchor: null,
        position: { left: 0, top: 0 },
        openTimer: null,
        closeTimer: null
      }
    },
    computed: {
      sections () {
        return railSections(this.groupedList)
      },
      loose () {
        return orderResources(this.sections.loose, this.resourceTitle)
      },
      openGroup () {
        return _.find(this.sections.groups, (group) => groupKey(group) === this.openKey) || null
      },
      items () {
        return this.openGroup ? orderResources(_.get(this.openGroup, 'list', []), this.resourceTitle) : []
      },
      shortcutLabel () {
        return /Mac|iPhone|iPad/.test(window.navigator.platform || '') ? '⌘ B' : 'Ctrl B'
      }
    },
    mounted () {
      document.addEventListener('pointerdown', this.onOutsidePointer, true)
      ResourceService.events.on('cached', this.onResourceCached)
    },
    beforeUnmount () {
      document.removeEventListener('pointerdown', this.onOutsidePointer, true)
      ResourceService.events.off('cached', this.onResourceCached)
      clearTimeout(this.openTimer)
      clearTimeout(this.closeTimer)
    },
    methods: {
      keyOf: groupKey,
      titleOf (group) {
        return TranslateService.get(group.name)
      },
      groupLabel (group) {
        return `${this.titleOf(group)}, ${TranslateService.get(_.size(group.list) === 1 ? 'TL_N_RESOURCES_ONE' : 'TL_N_RESOURCES', { num: _.size(group.list) })}`
      },
      // the image chosen for this group in Settings, if any
      iconUrl (group) {
        return this.menuIcons[groupSettingsName(group)]
      },
      onResourceCached (resource) {
        if (resource === '_settings') {
          this.menuIcons = ResourceService.menuIcons()
        }
      },
      initialsOf (group) {
        return groupInitials(this.titleOf(group))
      },
      initialsOfName: groupInitials,
      tintOf (group) {
        return groupTint(this.titleOf(group))
      },
      tintOfName: groupTint,
      resourceTitle (resource) {
        return getResourceLabel(resource)
      },
      holdsItem (group) {
        return groupHoldsItem(group, this.selectedItem)
      },
      isSelected (resource) {
        if (_.get(resource, 'type', false) === 'plugin') {
          return _.get(resource, 'pluginComponent', false) === _.get(this.selectedItem, 'pluginComponent', false)
        }
        return this.selectedItem === resource
      },
      // Shows where the current page is: the flyout of its group opens (and stays until dismissed)
      async locate () {
        const group = _.find(this.sections.groups, (g) => this.holdsItem(g))
        const badge = group && this.$el.querySelector(`[data-group="${this.keyOf(group)}"]`)
        if (!badge) {
          return
        }
        this.pinnedKey = groupKey(group)
        await this.showFlyout(group, badge)
      },
      openSwitcher () {
        this.closeFlyout(false)
        NotificationsService.openOmnibar()
      },
      // ---- flyout open and close
      async showFlyout (group, badge) {
        clearTimeout(this.closeTimer)
        this.anchor = badge
        this.openKey = groupKey(group)
        this.position = flyoutPosition(badge.getBoundingClientRect(), window.innerHeight, 0)
        await this.$nextTick()
        const flyout = this.$refs.flyout
        if (flyout) {
          this.position = flyoutPosition(badge.getBoundingClientRect(), window.innerHeight, flyout.offsetHeight)
        }
      },
      onEnter (group, event) {
        if (this.isPage(group)) {
          this.closeFlyout(false)
          return
        }
        clearTimeout(this.closeTimer)
        clearTimeout(this.openTimer)
        const badge = event.currentTarget
        this.openTimer = setTimeout(() => this.showFlyout(group, badge), this.openKey ? 0 : HOVER_OPEN_DELAY)
      },
      onFocus (group, event) {
        // keyboard focus previews the group; the pointer path (mouseenter, click) handles itself
        if (!this.skipFocusOpen && !this.isPage(group) && event.currentTarget.matches(':focus-visible')) {
          this.showFlyout(group, event.currentTarget)
        }
      },
      // A group with one resource is a page: a click goes straight there. A group of several is not a page, so a click
      // pins its flyout open (hover only previews it) and highlights the badge; a second click, Escape or a click
      // elsewhere closes it.
      isPage (group) {
        return _.size(group.list) === 1
      },
      onToggle (group, event) {
        if (this.isPage(group)) {
          this.choose(_.first(group.list))
          return
        }
        if (this.pinnedKey === groupKey(group)) {
          this.closeFlyout(false)
          return
        }
        this.pinnedKey = groupKey(group)
        this.showFlyout(group, event.currentTarget)
      },
      async openWithFocus (group, badge) {
        if (this.isPage(group)) {
          this.choose(_.first(group.list))
          return
        }
        this.pinnedKey = groupKey(group)
        await this.showFlyout(group, badge)
        this.focusItem(_.max([0, _.findIndex(this.items, (resource) => this.isSelected(resource))]))
      },
      scheduleClose () {
        clearTimeout(this.openTimer)
        clearTimeout(this.closeTimer)
        if (this.pinnedKey && this.pinnedKey === this.openKey) {
          return
        }
        this.closeTimer = setTimeout(() => this.closeFlyout(false), HOVER_CLOSE_DELAY)
      },
      cancelClose () {
        clearTimeout(this.closeTimer)
      },
      closeFlyout (returnFocus) {
        clearTimeout(this.openTimer)
        clearTimeout(this.closeTimer)
        const anchor = this.anchor
        this.openKey = null
        this.pinnedKey = null
        this.anchor = null
        if (returnFocus && anchor && _.isFunction(anchor.focus)) {
          // moving focus back to the badge must not preview the flyout again
          this.skipFocusOpen = true
          anchor.focus()
          setTimeout(() => { this.skipFocusOpen = false }, 0)
        }
      },
      choose (resource) {
        this.closeFlyout(false)
        this.selectResourceCallback(resource)
      },
      onOutsidePointer (event) {
        if (!this.openKey) {
          return
        }
        const inFlyout = this.$refs.flyout && this.$refs.flyout.contains(event.target)
        const inRail = this.$el && this.$el.contains(event.target)
        if (!inFlyout && !inRail) {
          this.closeFlyout(false)
        }
      },
      onFlyoutFocusOut (event) {
        const next = event.relatedTarget
        const inside = next && ((this.$refs.flyout && this.$refs.flyout.contains(next)) || next === this.anchor)
        if (!inside) {
          this.closeFlyout(false)
        }
      },
      // ---- keyboard
      flyoutButtons () {
        return this.$refs.flyout ? Array.from(this.$refs.flyout.querySelectorAll('button.rail-flyout-item')) : []
      },
      focusItem (index) {
        const buttons = this.flyoutButtons()
        if (buttons[index]) {
          buttons[index].focus()
        }
      },
      onFlyoutKeydown (event) {
        const buttons = this.flyoutButtons()
        const current = buttons.indexOf(document.activeElement)
        if (event.key === 'Escape' || event.key === 'ArrowLeft') {
          event.preventDefault()
          event.stopPropagation()
          this.closeFlyout(true)
          return
        }
        if (event.key === 'Tab') {
          this.closeFlyout(false)
          return
        }
        const next = moveInList(current, event.key, buttons.length)
        if (next !== current || _.includes(['ArrowDown', 'ArrowUp', 'Home', 'End'], event.key)) {
          event.preventDefault()
          this.focusItem(next)
        }
      },
      // Up and Down move between the rail badges
      onRailKeydown (event) {
        const classes = _.get(event, 'target.classList')
        const isControl = classes && (classes.contains('rail-badge') || classes.contains('rail-btn'))
        if (!_.includes(['ArrowDown', 'ArrowUp'], event.key) || !isControl) {
          return
        }
        const all = Array.from(this.$el.querySelectorAll('button.rail-btn, button.rail-badge'))
        const next = moveInList(all.indexOf(event.target), event.key, all.length)
        event.preventDefault()
        if (all[next]) {
          all[next].focus()
        }
      }
    }
  }
</script>

<style lang="scss">
.nav-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cms-space-3);
  min-height: 100%;
  padding: var(--cms-space-3) 0 var(--cms-space-4);
  color: var(--cms-chrome-text);

  .rail-top {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--cms-space-1);
    padding-bottom: var(--cms-space-3);
    border-bottom: 1px solid var(--cms-chrome-border);
  }

  .rail-list {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--cms-space-2);
    margin: 0;
    padding: 0;
  }

  // ungrouped resources sit apart at the bottom
  .rail-loose {
    margin-top: auto;
    padding-top: var(--cms-space-3);
    border-top: 1px solid var(--cms-chrome-border);
  }

  .rail-btn {
    display: grid;
    place-items: center;
    width: var(--cms-rail-badge);
    height: var(--cms-rail-badge);
    padding: 0;
    border: 0;
    border-radius: var(--cms-radius-md);
    background: transparent;
    color: var(--cms-chrome-muted);
    cursor: pointer;
    transition: background-color var(--cms-motion-fast) var(--cms-ease), color var(--cms-motion-fast) var(--cms-ease);
    &:hover {
      background: var(--cms-chrome-hover);
      color: var(--cms-chrome-text);
    }
  }

  .rail-badge {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--cms-rail-badge);
    height: var(--cms-rail-badge);
    padding: 0;
    border: 0;
    border-radius: var(--cms-radius-md);
    background: var(--rail-bg);
    color: var(--rail-fg);
    font: inherit;
    font-size: var(--cms-fs-sm);
    font-weight: var(--cms-fw-semibold);
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: box-shadow var(--cms-motion-fast) var(--cms-ease);

    &.tint-1 {
      --rail-bg: var(--cms-rail-tint-1-bg);
      --rail-fg: var(--cms-rail-tint-1-fg);
    }
    &.tint-2 {
      --rail-bg: var(--cms-rail-tint-2-bg);
      --rail-fg: var(--cms-rail-tint-2-fg);
    }
    &.tint-3 {
      --rail-bg: var(--cms-rail-tint-3-bg);
      --rail-fg: var(--cms-rail-tint-3-fg);
    }
    &.tint-4 {
      --rail-bg: var(--cms-rail-tint-4-bg);
      --rail-fg: var(--cms-rail-tint-4-fg);
    }
    &.tint-5 {
      --rail-bg: var(--cms-rail-tint-5-bg);
      --rail-fg: var(--cms-rail-tint-5-fg);
    }
    &.tint-6 {
      --rail-bg: var(--cms-rail-tint-6-bg);
      --rail-fg: var(--cms-rail-tint-6-fg);
    }

    &:hover,
    &.open {
      box-shadow: 0 0 0 2px var(--cms-chrome-border), 0 0 0 3px var(--cms-chrome-muted);
    }

    // the group holding the current page, and a group whose flyout is pinned open, carry the accent ring
    &.current,
    &.pinned {
      box-shadow: 0 0 0 2px var(--cms-nav-bg), 0 0 0 4px var(--cms-chrome-accent);
    }

    // the active group: a thin accent bar at the left edge of the rail
    &.current::before {
      content: '';
      position: absolute;
      left: calc((var(--cms-rail-width) - var(--cms-rail-badge)) / -2);
      top: 6px;
      bottom: 6px;
      width: 3px;
      border-radius: 0 var(--cms-radius-pill) var(--cms-radius-pill) 0;
      background: var(--cms-chrome-accent);
    }
  }

  .rail-badge .rail-image {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    object-fit: cover;
  }

  .rail-btn:focus-visible,
  .rail-badge:focus-visible {
    outline: 2px solid var(--cms-chrome-accent);
    outline-offset: 2px;
  }
}

@media (pointer: coarse) {
  .nav-rail {
    .rail-btn,
    .rail-badge {
      width: var(--cms-touch-target);
      height: var(--cms-touch-target);
    }
  }
}

// The flyout is teleported to the body, so it carries the chrome tokens itself
.rail-flyout {
  position: fixed;
  z-index: var(--cms-z-drawer);
  min-width: 220px;
  max-width: min(320px, calc(100vw - 96px));
  max-height: calc(100vh - 16px);
  overflow: auto;
  padding: var(--cms-space-1);
  border: 1px solid var(--cms-chrome-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-nav-bg);
  color: var(--cms-chrome-text);
  box-shadow: var(--cms-shadow-2);
  font-family: var(--cms-font-sans);

  .rail-flyout-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cms-space-3);
    padding: var(--cms-space-2) var(--cms-space-3);
    border-bottom: 1px solid var(--cms-chrome-border);
    font-size: var(--cms-fs-base);
    font-weight: var(--cms-fw-semibold);
  }


  .rail-flyout-list {
    margin: var(--cms-space-1) 0 0;
    padding: 0;
  }

  .rail-flyout-item {
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

    &:hover,
    &:focus-visible {
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

    .rail-flyout-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

@media (pointer: coarse) {
  .rail-flyout .rail-flyout-item {
    min-height: var(--cms-touch-target);
  }
}
</style>
