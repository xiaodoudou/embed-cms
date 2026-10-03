<template>
  <v-app :class="{'unclickable': isLoading}">
    <v-theme-provider :theme="getTheme()">
      <toast-host />
      <app-dialog
        :model-value="displayDialog" :title="dialogTitle" :message="dialogMessage" :type="dialogType" :icon="dialogIcon"
        :confirm-text="recordDialog.confirm || $filters.translate('TL_LEAVE_WITHOUT_SAVING')" :cancel-text="recordDialog.cancel || $filters.translate('TL_KEEP_EDITING')"
        @confirm="confirmDialog()" @cancel="cancelDialog()"
      />
      <upload-panel v-if="user" />
      <div v-if="user" v-shortkey="getShortcuts()" class="cms-layout" @shortkey="onShortkey">
        <a class="cms-skip-link" href="#cms-main" @click.prevent="focusMain">{{ $filters.translate('TL_SKIP_TO_CONTENT') }}</a>
        <updates-notifier v-if="selectedResource && config && config.wsRecordUpdates" :selected-resource="selectedResource" :selected-record="selectedRecord" @reload-resource="reloadResource" />
        <div class="cms-inner-layout" :class="{'nav-open': navOpen}">
          <nav-bar
            v-if="resourceList.length > 0" :config="config" :toolbar-title="toolbarTitle" :select-resource-callback="selectResourceAndCloseNav" :grouped-list="groupedList"
            :selected-item="selectedResource || selectedPlugin" :nav-open="navOpen" :rail="navMode === 'rail'" @toggle-nav="toggleNav"
          />
          <div class="cms-body">
            <div class="cms-nav-wrap" :class="`mode-${navMode}`" :style="navStyle">
              <aside id="cms-nav" class="cms-nav" :class="{open: navOpen, 'is-rail': navMode === 'rail'}" :aria-label="$filters.translate('TL_NAVIGATION')" @keydown.esc="closeNav">
                <nav-rail
                  v-if="resourceList.length > 0 && navMode === 'rail'" ref="navRail" :select-resource-callback="selectResourceAndCloseNav" :grouped-list="groupedList"
                  :selected-item="selectedResource || selectedPlugin" @toggle="toggleRail"
                />
                <resource-list
                  v-else-if="resourceList.length > 0" ref="resourceList" :select-resource-callback="selectResourceAndCloseNav" :grouped-list="groupedList"
                  :selected-item="selectedResource || selectedPlugin" :auto-select="false" :crumb-hint="crumbHint" :collapsible="navMode === 'expanded'" @collapse="toggleRail"
                />
              </aside>
              <div
                v-if="navMode === 'expanded'" class="nav-resizer" role="separator" aria-orientation="vertical" tabindex="0" aria-controls="cms-nav"
                :aria-label="$filters.translate('TL_RESIZE_SIDEBAR')" :aria-valuenow="navWidth" :aria-valuemin="navBounds.min" :aria-valuemax="navBounds.max"
                :title="$filters.translate('TL_RESIZE_SIDEBAR')" @pointerdown="startResize" @keydown="onResizeKey" @dblclick="resetNavWidth"
              />
            </div>
            <div v-if="navOpen" class="cms-nav-scrim" aria-hidden="true" @click="closeNav" />
            <div class="cms-content">
              <nav v-if="selectedResource || selectedPlugin" class="cms-crumbs" :aria-label="$filters.translate('TL_YOU_ARE_HERE')">
                <ol>
                  <li v-if="currentGroupLabel" class="crumb-item" @mouseenter="crumbHint = 'group'" @mouseleave="crumbHint = ''">
                    <!-- a group is not a page: clicking it shows where you are in the menu -->
                    <button type="button" class="crumb-group crumb-link" :title="$filters.translate('TL_SHOW_IN_MENU')" :aria-label="`${$filters.translate('TL_SHOW_IN_MENU')}: ${currentGroupLabel}`" @click="locateInMenu">{{ currentGroupLabel }}</button>
                  </li>
                  <li class="crumb-item" @mouseenter="crumbHint = 'resource'" @mouseleave="crumbHint = ''">
                    <button v-if="currentRecordLabel" type="button" class="crumb crumb-link" :title="currentResourceLabel" @click="selectCurrentResource">{{ currentResourceLabel }}</button>
                    <span v-else class="crumb" :title="currentResourceLabel" aria-current="page">{{ currentResourceLabel }}</span>
                  </li>
                  <li v-if="currentRecordLabel" class="crumb-item"><span class="crumb crumb-record" :title="currentRecordLabel" aria-current="page">{{ currentRecordLabel }}</span></li>
                </ol>
              </nav>
              <main id="cms-main" ref="main" class="records" tabindex="-1" :class="{'full-width': selectedResource && selectedResource.maxCount === 1, 'has-selection': hasSelection, 'is-plugin': !!selectedPlugin || showDesignSystem, 'is-design': showDesignSystem}">
                <template v-if="selectedResource && (!selectedResource.view || selectedResource.view == 'list')">
                  <record-list
                    v-if="selectedResource && selectedResource.maxCount !== 1" :list="recordList" :locale="locale" :selected-item="selectedRecord"
                    :grouped-list="groupedList"
                    :resource-group="selectedResourceGroup" :resource="selectedResource" :select-resource-callback="selectResource"
                    :multiselect="multiselect" :multiselect-items="multiselectItems"
                    @select-item="selectRecord"
                    @change-multiselect-items="onChangeMultiselectItems"
                    @select-multiselect="onSelectMultiselect"
                    @update-record-list="updateRecordList"
                  />
                  <record-editor
                    v-if="selectedRecord && !multiselect" :key="selectedRecord._id" v-model:record="selectedRecord" v-model:locale="locale" :resource="selectedResource"
                    :user-locale="TranslateService.locale" @update-record-list="updateRecordList" @back="onBackToList"
                  />
                  <multiselect-page
                    v-if="selectedResource && multiselect"
                    :multiselect-items="multiselectItems"
                    :locale="locale"
                    :resource="selectedResource"
                    :record-list="recordList"
                    @cancel="onCancelMultiselectPage"
                    @change-multiselect-items="onChangeMultiselectItems"
                    @update-record-list="updateRecordList"
                  />
                  <div v-if="!selectedRecord && !multiselect && recordList" class="cms-empty cms-editor-empty">
                    <div class="cms-empty-icon"><v-icon icon="$noteEditOutline" size="28" /></div>
                    <h2 class="cms-empty-title">{{ $filters.translate('TL_NO_RECORD_SELECTED') }}</h2>
                    <p class="cms-empty-text">{{ $filters.translate('TL_NO_RECORD_SELECTED_HINT') }}</p>
                  </div>
                </template>
                <record-table
                  v-if="selectedResource && selectedResource.view == 'table'"
                  v-model:record="selectedRecord" v-model:locale="locale" :grouped-list="groupedList" :resource-group="selectedResourceGroup" :select-resource-callback="selectResource" :record-list="recordList" :resource="selectedResource" :user-locale="TranslateService.locale"
                  @unset-record="unsetSelectedRecord" @update-record-list="updateRecordList"
                />
                <plugin-page v-if="selectedPlugin" :plugin="selectedPlugin" />
                <design-system v-if="showDesignSystem" />
              </main>
            </div>
          </div>
          <loading v-if="isLoading" />
        </div>
      </div>
    </v-theme-provider>
  </v-app>
</template>

<script>
  import { log } from '@u/log'
  import _ from 'lodash'
  import pAll from 'p-all'

  import LoadingService from '@s/LoadingService'
  import NotificationsService from '@s/NotificationsService'
  import LoginService from '@s/LoginService'
  import ConfigService from '@s/ConfigService'
  import TranslateService from '@s/TranslateService'
  import ResourceService from '@s/ResourceService'
  import Notification from '@m/Notification'
  import Loading from '@c/feedback/Loading.vue'
  import NavBar from '@c/layout/NavBar.vue'
  import ResourceList from '@c/records/ResourceList.vue'
  import RecordList from '@c/records/RecordList.vue'
  import MultiselectPage from '@c/records/MultiselectPage.vue'
  import RecordEditor from '@c/records/RecordEditor.vue'
  import RecordTable from '@c/records/RecordTable.vue'
  import UpdatesNotifier from '@c/feedback/UpdatesNotifier.vue'
  import UploadPanel from '@c/attachments/UploadPanel.vue'
  import AppDialog from '@c/feedback/AppDialog.vue'
  import ToastHost from '@c/feedback/ToastHost.vue'
  import DesignSystem from '@c/pages/DesignSystem.vue'
  import UploadService from '@s/UploadService'
  import { applyThemeToDocument, pickTheme, savedUserTheme } from '@u/theme'
  import { savedUserLanguage } from '@u/locale'
  import { buildPageTitle } from '@u/pageTitle'
  import { getRecordLabel, getResourceLabel } from '@u/recordLabel'
  import NavRail from '@c/layout/NavRail.vue'
  import { readPreference, writePreference, readNumber } from '@u/preferences'
  import { resolveNavMode, toggledPref, clampNavWidth, resizeByKey, orderGroups, NAV_DEFAULT_WIDTH, NAV_MIN_WIDTH, NAV_MAX_WIDTH } from '@u/navModel'

  // Wide screens open the sidebar, narrower ones start as a rail, phones use the off-canvas drawer
  const WIDE_QUERY = '(min-width: 1280px)'
  const DRAWER_QUERY = '(max-width: 767.98px)'

  export default {
    components: {
      NavBar,
      NavRail,
      ResourceList,
      RecordList,
      MultiselectPage,
      RecordEditor,
      Loading,
      RecordTable,
      UpdatesNotifier,
      UploadPanel,
      AppDialog,
      ToastHost,
      DesignSystem
    },
    mixins: [Notification],
    data () {
      return {
        config: false,
        locale: 'enUS',
        resourceList: [],
        selectedResource: null,
        recordList: [],
        allowedPlugins: [],
        crumbHint: '',
        notification: {},
        showSnackBar: false,
        toolbarTitle: false,
        siteTitle: '',
        selectedResourceGroup: null,
        selectedRecord: null,
        loadingRecords: false,
        selectedPlugin: null,
        isLoading: false,
        TranslateService,
        user: null,
        multiselect: false,
        multiselectItems: [],
        isEditing: false,
        navOpen: false,
        isWide: true,
        isDrawer: false,
        wideMedia: null,
        drawerMedia: null,
        navPref: readPreference('nav.mode', null),
        navWidth: readNumber('nav.width', NAV_MIN_WIDTH, NAV_MAX_WIDTH, NAV_DEFAULT_WIDTH),
        navBounds: { min: NAV_MIN_WIDTH, max: NAV_MAX_WIDTH },
        recordDialog: false,
        displayDialog: false
      }
    },
    computed: {
      navMode () {
        return resolveNavMode({ pref: this.navPref, wide: this.isWide, drawer: this.isDrawer })
      },
      navStyle () {
        return this.navMode === 'expanded' ? { '--cms-nav-width': `${this.navWidth}px` } : {}
      },
      // Leave/discard dialogs come from DialogService without a title; delete dialogs pass their own
      dialogType () {
        if (_.get(this.recordDialog, 'destructive', false) || !_.get(this.recordDialog, 'title', false)) {
          return 'destructive'
        }
        return 'warning'
      },
      dialogIcon () {
        return _.startsWith(_.get(this.recordDialog, 'event', ''), 'delete') ? '$trashCanOutline' : '$alertOutline'
      },
      dialogTitle () {
        return _.get(this.recordDialog, 'title', false) || TranslateService.get('TL_UNSAVED_CHANGES')
      },
      dialogMessage () {
        return _.get(this.recordDialog, 'message', false) || (_.get(this.recordDialog, 'title', false) ? '' : TranslateService.get('TL_ARE_YOU_SURE_YOU_WANT_TO_DISCARD'))
      },
      currentItem () {
        return this.selectedResource || this.selectedPlugin
      },
      currentGroupLabel () {
        const item = this.currentItem
        const group = _.find(this.groupedList, (g) => _.includes(_.get(g, 'list', []), item) || _.some(g.list, (r) => r.title === _.get(item, 'title')))
        return group ? TranslateService.get(group.name) : ''
      },
      // the tab: the record, the resource or page open, and the title of the site
      documentTitle () {
        return buildPageTitle({ record: this.currentRecordLabel, resource: this.currentResourceLabel, site: this.siteTitle })
      },
      currentResourceLabel () {
        return getResourceLabel(this.currentItem)
      },
      currentRecordLabel () {
        // a resource with a single record is one page: the crumb ends at the resource name, not at the record id
        if (!this.selectedResource || !this.selectedRecord || this.multiselect || this.selectedResource.maxCount === 1) {
          return ''
        }
        return getRecordLabel(this.selectedResource, this.selectedRecord, this.locale) || TranslateService.get('TL_NEW_RECORD_CRUMB')
      },
      // Dev reference for the button/dialog/toast system: #/?id=design-system
      showDesignSystem () {
        return _.get(this.$route, 'query.id', '') === 'design-system'
      },
      hasSelection () {
        return !!this.selectedRecord && !this.multiselect
      },
      groupedList () {
        const others = { name: 'TL_OTHERS' }
        const plugins = { name: 'TL_PLUGINS' }
        let groups = [others, plugins]
        const list = _.union(this.resourceList, _.map(this.pluginList, (item) => _.extend(item, {type: 'plugin'})))
        _.each(list, (item) => {
          if (_.isEmpty(item.group)) {
            return
          }
          if (!_.isString(item.group)) {
            const oldGroup = _.find(groups, (group) => {
              if (_.isEqual(group.name, item.group)) {
                return group
              }
            })
            if (!oldGroup) {
              groups.push({ name: item.group })
            }
          }
        })
        _.each(list, (item) => {
          if (_.isEmpty(item.group)) {
            return
          }
          if (_.isString(item.group)) {
            const oldGroup = _.find(groups, (group) => {
              if (group === item.group || group.name === item.group || _.includes(_.values(group.name), item.group)) {
                return group
              }
            })
            if (!oldGroup) {
              groups.push({ name: item.group })
            }
          }
        })
        _.each(list, (item) => {
          const oldGroup = _.find(groups, (group) => {
            if (_.isEqual(group.name, item.group) || group === item.group || group.name === item.group || _.includes(_.values(group.name), item.group)) {
              return group
            }
          })
          if (oldGroup) {
            oldGroup.list = oldGroup.list || []
            oldGroup.list.push(item)
            return
          }
          if (item.type === 'plugin') {
            plugins.list = plugins.list || []
            plugins.list.push(item)
          } else {
            others.list = others.list || []
            others.list.push(item)
          }
        })
        groups = orderGroups(groups, (name) => TranslateService.get(name), TranslateService.locale)
        return _.filter(groups, (group) => group.list && group.list.length !== 0)
      },
      pluginList () {
        const plugins =  _.filter(window.plugins, (item) => {
          if (_.isUndefined(item.allowed)) {
            return true
          }
          return _.isEmpty(this.user) ? false : _.includes(item.allowed, this.user.group)
        })
        return _.filter(plugins, (plugin)=> _.includes(this.allowedPlugins, plugin.displayname))
      }
    },
    watch: {
      documentTitle: {
        immediate: true,
        handler (title) {
          document.title = title
        }
      },
      '$route': function (to, from) {
        NotificationsService.clearContextual()
        if (!_.isNil(this.$route.query.id)) {
          const current = _.get(this.selectedResource || this.selectedPlugin, 'title')
          if (current === this.$route.query.id) {
            // same resource: only the record changed (the browser's back and forward buttons)
            if (_.get(to, 'query.record') !== _.get(from, 'query.record')) {
              this.applyRouteRecord()
            }
            return
          }
          const allResources = this.getResourcesAndPlugins()
          if (allResources.length > 0) {
            this.selectResource(_.find(allResources, {title: this.$route.query.id}))
          }
        }
      },
      // the open record is in the address (?id=resource&record=id): a link opens it and back returns to the previous one
      selectedRecord () {
        this.syncRouteRecord()
      }
    },
    created () {
      // a save empties and refills the selection within a few ticks: only the settled state goes to the address
      this.syncRouteRecord = _.debounce(this.writeRouteRecord, 60)
    },
    unmounted () {
      _.each([this.wideMedia, this.drawerMedia], (media) => media && media.removeEventListener('change', this.onMediaChange))
      LoadingService.events.off('has-loading', this.onLoading)
      ResourceService.events.off('cached', this.onSettingsCached)
      NotificationsService.events.off('notification', this.onGetNotification)
      UploadService.events.off('uploaded', this.onRetriedUpload)
      window.DialogService.events.off('dialog', this.onGetRecordEdition)
      window.DialogService.events.off('dialog:show', this.onGetRecordEditionShowDialog)
      window.DialogService.events.off('dialog:confirm', this.onGetRecordEditionConfirm)
    },
    async mounted () {
      this.wideMedia = window.matchMedia(WIDE_QUERY)
      this.drawerMedia = window.matchMedia(DRAWER_QUERY)
      this.onMediaChange()
      this.wideMedia.addEventListener('change', this.onMediaChange)
      this.drawerMedia.addEventListener('change', this.onMediaChange)
      LoadingService.events.on('has-loading', this.onLoading)
      this.$loading.start('init')
      LoginService.onLogout(() => {
        log.debug('User logged out')
        window.location.reload()
      })
      ResourceService.events.on('cached', this.onSettingsCached)
      this.onSettingsCached('_settings')
      NotificationsService.events.on('notification', this.onGetNotification)
      UploadService.events.on('uploaded', this.onRetriedUpload)
      window.DialogService.events.on('dialog', this.onGetRecordEdition)
      window.DialogService.events.on('dialog:show', this.onGetRecordEditionShowDialog)
      window.DialogService.events.on('dialog:confirm', this.onGetRecordEditionConfirm)
      await this.$nextTick()
      await ConfigService.init()
      this.config = ConfigService.config
      await TranslateService.init()
      this.setToolbarTitle()
      await this.getUser()
      try {
        const data = await ResourceService.getAll()
        await ResourceService.getAllParagraphs()
        this.$loading.stop('init')
        const resourceList = _.sortBy(data, item => item.title)
        this.resourceList = _.filter(resourceList, resource => {
          return _.isUndefined(resource.allowed) ||  _.includes(resource.allowed, this.user.group)
        })
        ResourceService.setSchemas(this.resourceList)
        const routed = !_.isNil(this.$route.query.id) ? _.find(_.union(this.pluginList, this.resourceList), {title: this.$route.query.id}) : undefined
        if (routed) {
          this.selectResource(routed)
        } else if (!this.showDesignSystem) {
          // normal navigation starts on the first resource of the first group (the design system page stays empty)
          this.selectResource(_.first(_.get(_.first(this.groupedList), 'list', [])))
        }
      } catch (error) {
        console.error('Error while getting resources: ', error)
        if (_.get(window, 'noLogin', false)) {
          // there is no session to end: logging out would only reload the page, which fails the same way, for ever
          this.$loading.stop('init')
          this.notify(_.get(error, 'message', 'Could not load the resources'), 'error')
          return
        }
        LoginService.logout()
      }
    },
    methods: {
      // A failed upload that succeeded on retry: refresh the record so the file shows up
      onRetriedUpload (meta) {
        NotificationsService.send(TranslateService.get('TL_UPLOAD_DONE'), 'success')
        if (_.get(meta, 'resource') === _.get(this.selectedResource, 'title') && !this.isEditing) {
          this.reloadResource(_.get(meta, 'recordId', false))
        }
      },
      onMediaChange () {
        this.isWide = this.wideMedia.matches
        this.isDrawer = this.drawerMedia.matches
        if (!this.isDrawer) {
          this.navOpen = false
        }
      },
      // Sidebar rail: toggle button, Ctrl/Cmd+B (not inside text fields, where it means bold)
      toggleRail () {
        this.navPref = toggledPref(this.navMode)
        writePreference('nav.mode', this.navPref)
      },
      // Ctrl+B shows or hides the sidebar (not inside a text field, where it means bold); Escape closes the drawer
      getShortcuts () {
        return this.navOpen ? { nav: ['ctrl', 'b'], close: ['esc'] } : { nav: ['ctrl', 'b'] }
      },
      onShortkey (event) {
        if (event.srcKey === 'close') {
          this.closeNav()
        } else if (this.navMode === 'drawer') {
          this.toggleNav()
        } else {
          this.toggleRail()
        }
      },
      // Sidebar width: drag, arrow keys, double-click to reset. Remembered.
      startResize (event) {
        event.preventDefault()
        const left = event.currentTarget.parentElement.getBoundingClientRect().left
        const onMove = (move) => {
          this.navWidth = clampNavWidth(move.clientX - left)
        }
        const onUp = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          writePreference('nav.width', this.navWidth)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      },
      onResizeKey (event) {
        if (!_.includes(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'], event.key)) {
          return
        }
        event.preventDefault()
        this.navWidth = resizeByKey(this.navWidth, event.key)
        writePreference('nav.width', this.navWidth)
      },
      resetNavWidth () {
        this.navWidth = NAV_DEFAULT_WIDTH
        writePreference('nav.width', this.navWidth)
      },
      toggleNav () {
        this.navOpen = !this.navOpen
        if (this.navOpen) {
          this.$nextTick(() => {
            const first = document.querySelector('#cms-nav button')
            if (first) {
              first.focus()
            }
          })
        }
      },
      closeNav () {
        if (this.navOpen) {
          this.navOpen = false
          this.$nextTick(() => {
            const toggle = document.getElementById('cms-nav-toggle')
            if (toggle) {
              toggle.focus()
            }
          })
        }
      },
      async selectResourceAndCloseNav (resource, force = false) {
        this.navOpen = false
        return this.selectResource(resource, force)
      },
      focusMain () {
        const main = _.get(this.$refs, 'main', false)
        if (main) {
          main.focus()
        }
      },
      onBackToList () {
        this.selectRecord(null)
      },
      async reloadResource(id = false) {
        log.debug(`Will reload resource:${this.selectedResource.name} - id: ${id}`)
        await this.selectResource(this.selectedResource, true)
        const record = id ? _.find(this.recordList, {_id: id}) : this.selectedRecord
        await this.selectRecord(record, true)
      },
      async onLoading(isLoading) {
        await this.$nextTick()
        this.isLoading = isLoading
      },
      getResourcesAndPlugins() {
        return _.union(this.pluginList, this.resourceList)
      },
      async getUser() {
        if (_.get(window, 'noLogin', false)) {
          this.user = {}
          return
        }
        LoginService.init()
        try {
          this.user = await LoginService.getStatus()
          this.allowedPlugins = await LoginService.getPlugins()
          log.debug('Plugins available:', this.allowedPlugins)
          const theme = pickTheme(ConfigService.config, _.get(this.user, 'theme', 'light'))
          if (theme === 'light') {
            this.user.theme = 'light'
          }
          // the language the person chose for the admin, when it is one of the languages of this CMS
          if (_.includes(TranslateService.getLocales(), _.get(this.user, 'language'))) {
            TranslateService.setLocale(this.user.language)
          }
          this.$vuetify.theme.dark = theme === 'dark'
          const themeName = applyThemeToDocument(theme)
          if (_.isFunction(_.get(this.$vuetify, 'theme.change'))) {
            this.$vuetify.theme.change(themeName)
          }
        } catch (error) {
          this.notify(_.get(error, 'response.data.message', error.message), 'error')
          throw error
        }
      },
      getTheme () {
        return pickTheme(ConfigService.config, _.get(this.$vuetify, 'theme.global.name', 'light'))
      },
      resetNotification () {
        this.showSnackBar = false
      },
      setToolbarTitle () {
        this.toolbarTitle = _.get(ConfigService.config, `toolbarTitle.${TranslateService.locale}`, _.get(ConfigService.config, 'toolbarTitle', false))
      },
      // the title of the site is in Settings: follow it when it is loaded or saved
      onSettingsCached (resource) {
        if (resource === '_settings') {
          this.siteTitle = _.get(_.first(ResourceService.get('_settings')), 'title', '')
        }
      },
      onGetNotification (data) {
        this.notification = data
        this.showSnackBar = true
      },
      getNotificationClass () {
        return `notification-${this.notification.type}`
      },
      closeDialog() {
        this.recordDialog = false
        this.displayDialog = false
      },
      cancelDialog() {
        const onCancel = _.get(this.recordDialog, 'onCancel', false)
        this.closeDialog()
        if (_.isFunction(onCancel)) {
          onCancel()
        }
      },
      confirmDialog() {
        window.DialogService.confirm(this.recordDialog)
      },
      onGetRecordEdition (isEditing) {
        this.isEditing = isEditing
      },
      async onGetRecordEditionShowDialog (data) {
        this.recordDialog = data
        this.displayDialog = true
      },
      async onGetRecordEditionConfirm (data) {
        window.DialogService.send(false)
        this.closeDialog()
        if (data.callback) {
          return data.callback()
        }
      },
      // "where am I in the menu?": opens the menu if it is a drawer, then shows the group of the current page
      async locateInMenu () {
        if (this.navMode === 'drawer' && !this.navOpen) {
          this.toggleNav()
          await this.$nextTick()
        }
        const menu = this.$refs.navRail || this.$refs.resourceList
        if (menu && menu.locate) {
          menu.locate()
        }
      },
      // the resource crumb, while a record is open: back to the resource
      selectCurrentResource () {
        this.selectResource(this.selectedResource)
      },
      async selectResourceGroup (resourceGroup) {
        this.selectedResourceGroup = resourceGroup
      },
      async selectResource (resource, force = false) {
        if (_.isUndefined(resource)) {
          return
        }
        if (!force && this.isEditing) {
          return window.DialogService.show({event: 'selectResource', callback: ()=> this.selectResource(resource)})
        }
        try {
          if (this.$route.query.id !== resource.title) {
            this.$router.push({query: {id: resource.title}}).catch(error => console.error('Router throw an error:', error))
          }
          if (resource.type === 'plugin') {
            this.selectedResource = null
            this.selectedPlugin = resource
            return
          }
          this.onCancelMultiselectPage()
          this.selectedResource = resource
          this.selectedPlugin = null
          this.recordList = null
          this.selectedRecord = null
          if (!this.selectedResource) {
            return
          }
          this.loadingRecords = true
          this.locale = _.first(this.selectedResource.locales)
          this.$loading.start('selectResource')
          await this.cacheRelatedResources(resource)
          const data = ResourceService.get(resource.title)
          this.recordList = _.sortBy(data, item => -item._updatedAt)
          if (_.get(resource, 'maxCount', 0) === 1) {
            const first = _.get(this.recordList, '[0]', false)
            this.selectRecord(!first ? { _local: true } : first)
          } else if (this.$route.query.record && this.$route.query.id === resource.title) {
            // opened from a link (or a reload): the record named in the address
            const linked = _.find(this.recordList, {_id: this.$route.query.record})
            if (linked) {
              this.selectRecord(linked, true)
            }
          }
          this.loadingRecords = false
          this.$loading.stop('selectResource')
        } catch (error) {
          console.error('Error happen during selectResource:', error)
          this.loadingRecords = false
        }
      },
      async cacheRelatedResources (resource) {
        let resources = _.union([resource.title], _.values(resource.extraSources))
        const extraResources = (obj) => {
          if (_.isArray(obj)) {
            _.each(obj, item => {
              extraResources(item)
            })
          } else {
            _.each(obj, (value, key) => {
              if (key === 'input') {
                const extraSources = _.get(obj, 'options.extraSources')
                resources.push(..._.values(extraSources))
                if (value === 'select' || value === 'multiselect') {
                  const source = _.get(obj, 'source')
                  if (_.isString(source)) {
                    resources.push(source)
                    const schema = ResourceService.getSchema(source)
                    if (_.get(schema, 'extraSources', false)) {
                      resources.push(..._.values(schema.extraSources))
                    }
                  }
                } else if (value === 'paragraph') {
                  _.each(_.get(obj, 'options.types'), item => {
                    extraResources(item)
                    const paragraphSchema = _.get(item, 'schema')
                    extraResources(paragraphSchema)
                  })
                }
              } else if (key === 'extraSources') {
                resources.push(..._.values(value))
              }
            })
          }
        }
        extraResources(resource.schema)
        resources = _.uniq(resources)
        await pAll(_.map(resources, item => {
          return async () => {
            try {
              return await ResourceService.cache(item)
            } catch (error) {
              console.error(`Failed to get extra resource ${item}`, error)
            }
          }
        }), {concurrency: 10})
      },
      writeRouteRecord (replace = false) {
        if (!this.selectedResource || this.selectedResource.type === 'plugin' || this.loadingRecords) {
          return
        }
        const id = _.get(this.selectedRecord, '_id') || undefined
        if (id === (this.$route.query.record || undefined)) {
          return
        }
        const query = {id: this.selectedResource.title}
        if (id) {
          query.record = id
        }
        this.$router[replace === true ? 'replace' : 'push']({query}).catch(error => console.error('Router throw an error:', error))
      },
      // the address names another record than the one open: open it (or leave the record, when the address has none)
      applyRouteRecord () {
        if (!this.recordList) {
          return
        }
        const wanted = this.$route.query.record
        // the address already says what is open (the app wrote it itself: a new blank record has no id in it): nothing to do
        if ((_.get(this.selectedRecord, '_id') || undefined) === (wanted || undefined)) {
          return
        }
        const record = wanted ? _.find(this.recordList, {_id: wanted}) : null
        if (wanted && !record) {
          return
        }
        if (this.isEditing && this.selectedRecord !== record) {
          // unsaved edits: the address goes back to the record that stays open until the leave is confirmed
          this.writeRouteRecord(true)
          return window.DialogService.show({event: 'selectRecord', callback: () => this.selectRecord(record, true)})
        }
        this.selectRecord(record)
      },
      selectRecord (record, force = false) {
        if (!force && this.isEditing && this.selectedRecord !== record) {
          return window.DialogService.show({event: 'selectRecord', callback: ()=> this.selectRecord(record)})
        }
        this.selectedRecord = record
      },
      onSelectMultiselect (isMultiselect) {
        if (this.isEditing) {
          return window.DialogService.show({event: 'selectMultiselect', callback: ()=> this.onSelectMultiselect(isMultiselect)})
        }
        this.multiselect = isMultiselect
        if (isMultiselect) {
          this.unsetSelectedRecord()
        }
      },
      onChangeMultiselectItems (items) {
        this.multiselectItems = _.clone(items)
      },
      async updateRecordList (record) {
        try {
          this.$loading.start('updateRecordList')
          const data = await ResourceService.cache(this.selectedResource.title)
          this.$loading.stop('updateRecordList')
          this.recordList = []
          this.selectedRecord = false
          await this.$nextTick()
          this.recordList = _.sortBy(data, item => -item._updatedAt)
          let updatedRecord = _.find(this.recordList, { _id: _.get(record, '_id') })
          // A removed record leaves the list view on a blank new record, the table view on the table
          updatedRecord = _.isUndefined(updatedRecord) ? (_.get(this.selectedResource, 'view') === 'table' ? null : {_local: true}) : updatedRecord
          // after a save or a delete the editor state is replaced on purpose: no leave prompt
          this.selectRecord(updatedRecord, true)
          this.applySavedPreferences(updatedRecord)
        } catch (error) {
          console.error('Error happen during updateRecordList:', error)
        }
      },
      // a person who changes the theme or the language of their own user is shown it at once, not at the next login
      applySavedPreferences (record) {
        const language = savedUserLanguage(_.get(this.selectedResource, 'title'), record, this.user, TranslateService.getLocales(), _.get(this.user, 'language') || _.get(TranslateService.config, 'defaultLocale', 'enUS'))
        if (language) {
          // the whole admin is written in this language (menus, titles, schemas, pickers): the page starts again in it, and the
          // status of the user (which carries the language) puts it back on the next visit too
          this.user.language = language
          TranslateService.setLocale(language)
          setTimeout(() => window.location.reload(), 600)
          return
        }
        const theme = savedUserTheme(_.get(this.selectedResource, 'title'), record, this.user, ConfigService.config)
        if (!theme) {
          return
        }
        this.user.theme = theme
        this.$vuetify.theme.dark = theme === 'dark'
        applyThemeToDocument(theme)
        if (_.isFunction(_.get(this.$vuetify, 'theme.change'))) {
          this.$vuetify.theme.change(theme)
        }
        LoginService.events.emit('changed-theme', theme)
      },
      unsetSelectedRecord () {
        this.selectedRecord = null
      },
      onCancelMultiselectPage () {
        this.multiselect = false
        this.multiselectItems = []
      }
    }
  }
</script>
<style lang="scss">
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;

.cms-layout {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  height: 100%;
  overflow: hidden;

  .cms-inner-layout {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    flex: 1 1 0;
    min-height: 0;
    height: 100dvh;
    width: 100%;
  }

  .cms-body {
    position: relative;
    display: flex;
    flex: 1 1 0;
    min-height: 0;
  }

  // The sidebar wrapper animates between the expanded width and the rail; the content never jumps because it is clipped
  .cms-nav-wrap {
    position: relative;
    flex: 0 0 auto;
    display: flex;
    width: var(--cms-nav-width);
    transition: width var(--cms-motion-nav) var(--cms-ease);

    &.mode-rail {
      width: var(--cms-rail-width);
    }

    &.mode-drawer {
      display: contents;
    }
  }

  .cms-nav {
    flex: 1 1 auto;
    min-width: 0;
    background: var(--cms-nav-bg);
    border-right: 1px solid var(--cms-border);
    overflow-y: auto;
    overflow-x: hidden;

    // the rail scrolls without a scrollbar over the badges
    &.is-rail {
      scrollbar-width: none;
      &::-webkit-scrollbar {
        display: none;
      }
    }
  }

  // drag handle on the right edge of the expanded sidebar
  .nav-resizer {
    position: absolute;
    top: 0;
    bottom: 0;
    right: -3px;
    z-index: 3;
    width: 6px;
    cursor: col-resize;
    touch-action: none;
    &::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 2px;
      width: 2px;
      background: transparent;
      transition: background-color var(--cms-motion-fast) var(--cms-ease);
    }
    &:hover::after,
    &:focus-visible::after {
      background: var(--cms-chrome-accent);
    }
    &:focus-visible {
      outline: none;
    }
  }

  .cms-nav-scrim {
    display: none;
  }

  .cms-content {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .cms-crumbs {
    flex: 0 0 auto;
    padding: var(--cms-space-2) var(--cms-space-4);
    background: var(--cms-crumb-bg);
    border-bottom: 1px solid var(--cms-border);
    font-size: var(--cms-fs-sm);
    color: var(--cms-text-muted);
    ol {
      display: flex;
      align-items: center;
      flex-wrap: nowrap;
      gap: var(--cms-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
      min-width: 0;
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--cms-space-2);
      min-width: 0;
      &:not(:first-child)::before {
        content: '/';
        color: var(--cms-border-strong);
      }
      // long middle segments shrink first (they truncate), the last segment stays readable
      flex: 0 1000 auto;
      &:last-child {
        flex: 0 1 auto;
        min-width: 14ch;
      }
    }
    .crumb-group,
    .crumb {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    // a crumb that leads somewhere: the resource (back to it), the group (shows it in the menu)
    .crumb-link {
      margin: 0;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
      border-radius: var(--cms-radius-sm);
      &:hover {
        color: var(--cms-primary);
        text-decoration: underline;
      }
      &:focus-visible {
        outline: 2px solid var(--cms-focus-ring);
        outline-offset: 2px;
      }
    }
    .crumb[aria-current='page'],
    .crumb-record {
      color: var(--cms-text);
      font-weight: var(--cms-fw-semibold);
    }
  }

  .records {
    background-color: $record-editor-background;
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: stretch;
    overflow: hidden;
    outline: none;

    &.is-plugin {
      overflow: auto;
    }

    &.full-width {
      overflow-x: hidden;
      flex-direction: column;

      .record-list {
        max-width: 100%;
        width: 100%;
        min-width: 0;
        height: auto;
        flex-shrink: 0;
        border-right: 0;
      }
    }
  }

  .cms-editor-empty {
    flex: 1 1 0;
    align-self: center;
  }

  .records.is-design > :not(.design-system) {
    display: none;
  }
}

// Phones: the navigation is an off-canvas drawer (wider screens keep the sidebar or the rail).
@media (max-width: 767.98px) {
  .cms-layout {
    .cms-nav {
      position: fixed;
      top: var(--cms-appbar-height);
      bottom: 0;
      left: 0;
      z-index: var(--cms-z-drawer);
      width: min(var(--cms-nav-width), calc(100vw - 48px));
      flex: none;
      box-shadow: var(--cms-shadow-3);
      transform: translateX(-102%);
      visibility: hidden;
      transition: transform var(--cms-motion-base) var(--cms-ease), visibility 0s linear var(--cms-motion-base);

      &.open {
        transform: none;
        visibility: visible;
        transition: transform var(--cms-motion-base) var(--cms-ease), visibility 0s;
      }
    }

    .cms-nav-scrim {
      display: block;
      position: fixed;
      inset: var(--cms-appbar-height) 0 0 0;
      z-index: calc(var(--cms-z-drawer) - 1);
      background: var(--cms-scrim);
    }
  }
}

// Phones: list and editor are two steps of one flow.
@media (max-width: 767.98px) {
  .cms-layout .records:not(.full-width) {
    &.has-selection .record-list {
      display: none;
    }

    .record-list {
      width: 100%;
      min-width: 0;
      max-width: none;
      border-right: 0;
    }

    .cms-editor-empty {
      display: none;
    }
  }
}

// NOTE: For ordered lists
.flip-list-move {
  transition: transform 0.2s;
}

.no-move {
  transition: transform 0s;
}

.ghost {
  opacity: 0.5;
  background: $cms-primary-soft;
}

.sort-records {
  .v-field__input {
    padding-top: 0;
    padding-bottom: 0;
  }
}

.discard-changes {
  .v-overlay__content > div {
    padding: var(--cms-space-2);
  }
}
</style>
