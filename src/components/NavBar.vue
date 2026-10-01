<template>
  <div class="nav-bar-wrapper">
    <header class="nav-bar">
      <v-btn
        id="cms-nav-toggle" class="nav-toggle" icon variant="text" :aria-label="$filters.translate('TL_TOGGLE_NAVIGATION')"
        aria-controls="cms-nav" :aria-expanded="navOpen ? 'true' : 'false'" @click="$emit('toggle-nav')"
      >
        <v-icon icon="$menu" />
      </v-btn>
      <div class="brand" :class="{rail}">
        <template v-if="settingsData && hasLogoOrTitle()">
          <img v-if="getLogo()" :src="getLogo()" class="logo" :alt="settingsTitle">
          <span v-else-if="settingsData.title && settingsData.title.length > 0" class="brand-title">{{ settingsData.title }}</span>
        </template>
        <brand-logo v-else on-dark />
      </div>
      <div class="nav-bar-spacer" />
      <v-btn class="search-trigger" variant="outlined" :aria-label="$filters.translate('TL_SEARCH_RESOURCES')" @click="openOmnibar">
        <v-icon icon="$magnify" size="small" />
        <span class="search-label">{{ $filters.translate('TL_SEARCH_RESOURCES') }}</span>
        <kbd class="cms-kbd search-hint" aria-hidden="true">{{ shortcutLabel }}</kbd>
      </v-btn>
      <div class="nav-bar-actions">
        <slot />
      </div>
      <system-info v-if="config" :config="config" :settings-data="settingsData" />
    </header>
    <omnibar ref="omnibar" :select-resource-callback="selectResourceCallback" :grouped-list="groupedList" :selected-item="selectedItem" />
  </div>
</template>

<script>
  import _ from 'lodash'
  import { getResourceLabel } from '@u/recordLabel'
  import SystemInfo from '@c/SystemInfo'
  import BrandLogo from '@c/BrandLogo'
  import Omnibar from '@c/Omnibar'
  import ResourceService from '@s/ResourceService'
  import NotificationsService from '@s/NotificationsService'

  export default {
    components: { SystemInfo, BrandLogo, Omnibar },
    props: {
      toolbarTitle: { type: [String, Boolean], default: false },
      groupedList: { type: Array, default: () => [] },
      config: { type: [Object, Boolean], default: false },
      selectResourceCallback: { type: Function, default: () => {} },
      selectedItem: { type: Object, default: () => {} },
      navOpen: { type: Boolean, default: false },
      rail: { type: Boolean, default: false }
    },
    emits: ['toggle-nav'],
    data () {
      return {
        settingsData: false
      }
    },
    computed: {
      shortcutLabel () {
        return /Mac|iPhone|iPad/.test(window.navigator.platform || '') ? '⌘ K' : 'Ctrl K'
      },
      settingsTitle () {
        return _.get(this.settingsData, 'title', 'Embed CMS')
      }
    },
    mounted () {
      this.getSettingsData()
      ResourceService.events.on('cached', this.onResourceCached)
      document.addEventListener('keydown', this.onGlobalKeydown)
      NotificationsService.events.on('omnibar-open', this.openOmnibar)
    },
    beforeUnmount () {
      ResourceService.events.off('cached', this.onResourceCached)
      document.removeEventListener('keydown', this.onGlobalKeydown)
      NotificationsService.events.off('omnibar-open', this.openOmnibar)
    },
    methods: {
      // Ctrl/Cmd+K works everywhere, including inside form fields
      onGlobalKeydown (event) {
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && _.toLower(event.key) === 'k') {
          event.preventDefault()
          const omnibar = _.get(this.$refs, 'omnibar', false)
          if (omnibar) {
            omnibar.showHideOmnibar(!omnibar.showOmnibar)
          }
        }
      },
      openOmnibar () {
        const omnibar = _.get(this.$refs, 'omnibar', false)
        if (omnibar) {
          omnibar.showHideOmnibar(true)
        }
      },
      getLogo () {
        return _.get(this.settingsData, 'logo[0].url', false)
      },
      hasLogoOrTitle () {
        return this.getLogo() || _.get(this.settingsData, 'title', false)
      },
      // the top bar shows the settings (logo, title, links): follow them when they are saved
      onResourceCached (resource) {
        if (resource === '_settings') {
          this.settingsData = _.first(ResourceService.get('_settings'))
        }
      },
      async getSettingsData () {
        try {
          this.settingsData = _.first(await ResourceService.cache('_settings'))
        } catch (error) {
          console.error('Failed to get settings data:', error)
        }
      },
      getSelectedItemName () {
        const displayname = _.get(this.selectedItem, 'displayname', false)
        return displayname ? getResourceLabel(this.selectedItem) : _.get(this.selectedItem, 'name', false)
      }
    }
  }
</script>
<style lang="scss">
@use '@a/scss/variables.scss' as *;

.nav-bar-wrapper {
  position: relative;
  z-index: var(--cms-z-appbar);
  flex: 0 0 auto;

  .nav-bar {
    display: flex;
    align-items: center;
    gap: var(--cms-space-2);
    height: var(--cms-appbar-height);
    padding: 0 var(--cms-space-3) 0 var(--cms-space-4);
    background-color: var(--cms-chrome-bg);
    color: var(--cms-chrome-text);
    border-bottom: 1px solid var(--cms-chrome-border);
  }

  // Ghost icon buttons on the dark chrome
  .nav-bar .v-btn--variant-text:not(.v-btn--disabled) {
    color: var(--cms-chrome-text);
    &:hover {
      background: var(--cms-chrome-hover);
    }
  }

  .nav-bar .v-icon {
    color: inherit;
  }

  .nav-toggle {
    display: none;
    margin-left: calc(var(--cms-space-2) * -1);
  }

  .brand {
    display: flex;
    align-items: center;
    min-width: 0;
    height: 100%;
    .logo {
      max-height: 32px;
      max-width: 180px;
      object-fit: contain;
    }
    .brand-title {
      font-size: var(--cms-fs-lg);
      font-weight: var(--cms-fw-bold);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .brand.rail .brand-word {
    display: none;
  }

  .nav-bar-spacer {
    flex: 1 1 auto;
  }

  .nav-bar-actions {
    display: flex;
    align-items: center;
    gap: var(--cms-space-2);
  }

  // Search trigger: icon, label, then the shortcut pushed to the right edge
  .search-trigger.v-btn {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--cms-space-3);
    width: 280px;
    min-width: 280px;
    height: 36px;
    padding: 0 var(--cms-space-3);
    color: var(--cms-chrome-muted);
    border: 1px solid var(--cms-chrome-border);
    background: var(--cms-chrome-hover);
    font-weight: var(--cms-fw-regular);
    &:hover {
      border-color: var(--cms-chrome-accent);
      color: var(--cms-chrome-text);
      background: var(--cms-chrome-hover);
    }
    .v-btn__content {
      flex: 1 1 auto;
      width: 100%;
      justify-content: flex-start;
      gap: var(--cms-space-3);
    }
    .search-label {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
    }
    .search-hint {
      flex: 0 0 auto;
      margin-left: auto;
      border-color: var(--cms-chrome-border);
      background: var(--cms-chrome-bg);
      color: var(--cms-chrome-muted);
    }
  }
}

@media (max-width: 767.98px) {
  .nav-bar-wrapper .nav-toggle {
    display: inline-flex;
  }
}

@media (max-width: 899.98px) {
  .nav-bar-wrapper .search-trigger.v-btn {
    width: auto;
    min-width: 200px;
  }
}

// No keyboard on phones: icon-only trigger without the shortcut badge
@media (max-width: 599.98px), (pointer: coarse) {
  .nav-bar-wrapper {
    .nav-bar {
      padding: 0 var(--cms-space-2);
      gap: var(--cms-space-1);
    }
    .search-trigger.v-btn {
      width: 40px;
      min-width: 40px;
      padding: 0;
      justify-content: center;
      border-radius: var(--cms-radius-pill) !important;
      border-color: transparent;
      background: transparent;
      .v-btn__content {
        justify-content: center;
      }
      .search-label,
      .search-hint {
        display: none;
      }
    }
    .brand .brand-word {
      display: none;
    }
  }
}
</style>
