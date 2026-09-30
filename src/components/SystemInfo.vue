<template>
  <div class="system-info">
    <theme-switch v-if="!config.disableDarkMode" />
    <v-menu v-if="settingsData && settingsData.linksGroups && settingsData.linksGroups.length > 0" content-class="links-menu" location="bottom end" :close-on-content-click="false">
      <template #activator="{ props }">
        <v-btn icon variant="text" v-bind="props" :aria-label="$filters.translate('TL_LINKS')">
          <v-icon icon="$dotsVertical" />
        </v-btn>
      </template>
      <div class="links-wrapper">
        <div v-for="(group, i) in settingsData.linksGroups" :key="i" class="group">
          <div class="node-cms-title">{{ group.title }}</div>
          <a v-for="(link, y) in group.links" :key="y" class="link" :href="link.url" target="_blank" rel="noopener noreferrer" :class="{active: isActiveLink(link.url)}">{{ link.name }}</a>
          <v-divider v-if="i < settingsData.linksGroups.length - 1" />
        </div>
      </div>
    </v-menu>

    <v-menu content-class="system-info-menu" location="bottom end" :close-on-content-click="false">
      <template #activator="{ props }">
        <v-btn icon variant="text" v-bind="props" :aria-label="$filters.translate('TL_SYSTEM')">
          <v-icon icon="$cogOutline" />
        </v-btn>
      </template>
      <div class="system-info-wrapper">
        <div class="node-cms-title flex">
          <span>{{ $filters.translate('TL_SYSTEM') }}</span>
          <span class="node-cms-version text">v{{ getNodeCmsVersion() }}</span>
        </div>
        <div class="stats cpu">
          <div class="stat-head"><span>CPU</span><span>{{ Math.round(system.cpu.usage) }}%</span></div>
          <v-progress-linear rounded height="8" aria-label="CPU usage" :model-value="system.cpu.usage" />
          <small class="text">{{ system.cpu.count }} cores ({{ system.cpu.model }})</small>
        </div>
        <div class="stats ram">
          <div class="stat-head"><span>{{ $filters.translate('TL_MEMORY') }}</span><span>{{ Math.round(100 - system.memory.freeMemPercentage) }}%</span></div>
          <v-progress-linear rounded height="8" aria-label="Memory usage" :model-value="100 - system.memory.freeMemPercentage" />
          <small class="text">{{ convertBytes(system.memory.usedMemMb) }} / {{ convertBytes(system.memory.totalMemMb) }}</small>
        </div>
        <div v-if="system.drive != 'not supported'" class="stats drive">
          <div class="stat-head"><span>{{ $filters.translate('TL_DISK') }}</span><span>{{ Math.round(100 - system.drive.usedPercentage) }}%</span></div>
          <v-progress-linear rounded height="8" aria-label="Disk usage" :model-value="100 - system.drive.usedPercentage" />
          <small class="text">{{ convertBytes(system.drive.usedGb * 1024) }} / {{ convertBytes(system.drive.totalGb * 1024) }}</small>
        </div>
        <div class="stats two-by-two">
          <div v-if="system.network != 'not supported'" class="stats network">
            <div class="stat-head"><span>{{ $filters.translate('TL_NETWORK') }}</span></div>
            <small class="text">{{ convertBytes(system.network.total.outputMb) }} <v-icon icon="$arrowUp" size="x-small" aria-label="upload" /> / {{ convertBytes(system.network.total.inputMb) }} <v-icon icon="$arrowDown" size="x-small" aria-label="download" /></small>
          </div>
          <div class="stats uptime">
            <div class="stat-head"><span>{{ $filters.translate('TL_UPTIME') }}</span></div>
            <small class="text">{{ timeAgo(system.uptime) }}</small>
          </div>
        </div>
      </div>
    </v-menu>
    <v-btn v-if="showLogoutButton" icon variant="text" :aria-label="$filters.translate('TL_LOGOUT')" @click="logout()">
      <v-icon icon="$logout" />
    </v-btn>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted, onUnmounted, getCurrentInstance } from 'vue'
  import _ from 'lodash'
  import Dayjs from 'dayjs'
  import relativeTime from 'dayjs/plugin/relativeTime'
  import LoginService from '@s/LoginService'
  import ThemeSwitch from '@c/ThemeSwitch'
  import { useTheme } from 'vuetify'
  import { applyThemeToDocument } from '@u/theme'

  Dayjs.extend(relativeTime)
  const theme = useTheme()

  const properties = defineProps({
    config: { type: [Object, Boolean], default: false },
    settingsData: { type: [Object, Boolean], default: false }
  })

  const isEditing = ref(false)
  const destroyed = ref(false)
  const timer = ref(null)
  const eventSource = ref(false)
  const firstMessage = ref(true)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 10
  const system = ref({
    cpu: { count: 0, usage: 0, model: 'Unknown' },
    memory: { totalMemMb: 0, usedMemMb: 0, freeMemMb: 0, freeMemPercentage: 0 },
    network: 'not supported',
    drive: 'not supported',
    uptime: 0
  })

  const showLogoutButton = computed(() => !_.get(window, 'disableJwtLogin', false))

  function onGetRecordEdition(editing) {
    isEditing.value = editing
  }

  function getNodeCmsVersion() {
    return _.get(properties.config, 'version', 'X.X.X')
  }

  function disconnectFromLogStream() {
    try {
      clearTimeout(timer.value)
      if (eventSource.value) {
        console.warn('close SSE')
        eventSource.value.close()
      }
    } catch { /* empty */ }
  }

  function connectToLogStream() {
    disconnectFromLogStream()
    firstMessage.value = true
    timer.value = setTimeout(() => {
      eventSource.value = new EventSource(`${window.location.pathname}../api/system`)
      eventSource.value.onmessage = (event) => {
        try {
          reconnectAttempts.value = 0
          if (firstMessage.value) {
            firstMessage.value = false
            if (_.isFunction(theme.change)) {
              const userTheme = LoginService.user.theme
              theme.change(userTheme)
              applyThemeToDocument(userTheme)
            } else {
              console.error(`Cannot call theme.change:`, theme)
            }
          }
          system.value = JSON.parse(event.data)
          const instance = getCurrentInstance()
          if (instance && instance.proxy) {
            instance.proxy.$forceUpdate()
          }
        } catch (error) {
          console.error('Failed to parse system info:', error)
        }
      }
      eventSource.value.addEventListener('end', () => {
        eventSource.value.close()
        console.warn('System info stream ended')
        connectToLogStream()
      })
      eventSource.value.onerror = (error) => {
        console.error('Error in SSE connection:', error)
        eventSource.value.close()
        if (reconnectAttempts.value < maxReconnectAttempts) {
          reconnectAttempts.value++
          const reconnectDelay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000)
          console.log(`Attempting to reconnect system info stream in ${reconnectDelay}ms (attempt ${reconnectAttempts.value})`)
          setTimeout(() => connectToLogStream(), reconnectDelay)
        } else {
          console.error('Max reconnection attempts for system info reached. Giving up.')
        }
      }
    }, 1000)
  }

  function isActiveLink(url) {
    const urlA = new URL(window.location)
    const urlB = new URL(url)
    return urlA.host === urlB.host
  }

  async function logout() {
    if (isEditing.value) {
      return window.DialogService.show({event: 'logout', callback: () => logout()})
    }
    await LoginService.logout()
  }

  function timeAgo(current) {
    return Dayjs().subtract(parseInt(current, 10), 'second').fromNow()
  }

  function convertBytes(megaBytes) {
    const sizes = ['MB', 'GB', 'TB']
    if (megaBytes === 0) {
      return '0 MB'
    } else if (Math.log(megaBytes) <= 0) {
      return `${megaBytes.toFixed(1)} MB`
    }
    const i = parseInt(Math.floor(Math.log(megaBytes) / Math.log(1024)))
    if (i <= 0) {
      return megaBytes + ' ' + sizes[i]
    }
    return (megaBytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i]
  }

  onMounted(() => {
    window.DialogService.events.on('dialog', onGetRecordEdition)
    connectToLogStream()
  })

  onUnmounted(() => {
    window.DialogService.events.off('dialog', onGetRecordEdition)
    if (getCurrentInstance()?.proxy?.$loading) {
      getCurrentInstance().proxy.$loading.stop('_syslog')
    }
    destroyed.value = true
    clearTimeout(timer.value)
  })
</script>
<style lang="scss" scoped>
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;
.system-info {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--cms-space-1);
  .v-icon {
    color: $navbar-system-info-icon-color;
  }
}
</style>

<style lang="scss">
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;

.system-info-menu,
.links-menu {
  background-color: transparent;
}

.system-info-wrapper,
.links-wrapper {
  min-width: min(360px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  @include blurred-background;
  padding: var(--cms-space-4);
  color: $system-info-color;
  background-color: $system-info-background;
  .node-cms-title {
    @include h6;
    color: $system-info-color;
  }
}

.system-info-wrapper {
  gap: var(--cms-space-4);
  .node-cms-title.flex {
    @include h5;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .node-cms-version {
    font-size: var(--cms-fs-sm);
    font-weight: var(--cms-fw-regular);
    color: var(--cms-text-muted);
  }
  .stat-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--cms-space-1);
    font-size: var(--cms-fs-sm);
    font-weight: var(--cms-fw-semibold);
  }
  .stats .text,
  small {
    display: block;
    margin-top: var(--cms-space-1);
    font-size: var(--cms-fs-sm);
    color: var(--cms-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .v-progress-linear {
    .v-progress-linear__background {
      background-color: $system-info-progress-bar-background !important;
      opacity: 1;
    }
    .v-progress-linear__determinate {
      background-color: $system-info-progress-bar !important;
    }
  }
  .stats.two-by-two {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: var(--cms-space-4);
    .stats {
      flex: 1 1 0;
      min-width: 0;
    }
  }
}

.links-wrapper {
  gap: var(--cms-space-1);
  .node-cms-title {
    font-weight: var(--cms-fw-semibold);
    user-select: none;
    padding: var(--cms-space-1) var(--cms-space-2);
  }
  .link {
    display: block;
    @include h6;
    padding: var(--cms-space-2) var(--cms-space-3);
    border-radius: var(--cms-radius-sm);
    color: var(--cms-text);
    text-decoration: none;
    transition: background-color var(--cms-motion-fast) var(--cms-ease);
    &:hover {
      background-color: var(--cms-surface-2);
    }
    &.active {
      font-weight: var(--cms-fw-semibold);
      background-color: var(--cms-primary-soft);
      color: var(--cms-on-primary-soft);
    }
  }
  .v-divider {
    margin: var(--cms-space-2) 0;
  }
}
</style>
