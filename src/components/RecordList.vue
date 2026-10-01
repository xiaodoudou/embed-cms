<template>
  <div class="record-list" :class="{compact: isCompact}">
    <div class="record-list-top-bar cms-toolbar">
      <resource-selector :resource="resource" :grouped-list="groupedList" :select-callback="selectResourceCallback" :full-width="maxCount === 1" />
      <div
        v-if="maxCount != 1"
        v-shortkey="getShortcuts()" class="search"
        :class="{'is-query': sift.isQuery, 'is-valid': sift.isQuery && sift.isValid == true, 'is-invalid': sift.isQuery && sift.isValid == false}" @shortkey="interactiveSearch"
      >
        <search-field ref="search" v-model="search" :placeholder="$filters.translate('TL_SEARCH')" :aria-label="$filters.translate('TL_SEARCH')" name="search" />
        <v-btn v-if="maxCount <= 0 || listCount < maxCount" elevation="0" icon class="new-record" :class="{active: isCreatingNewRecord()}" :aria-label="$filters.translate('TL_NEW_RECORD')" :title="$filters.translate('TL_NEW_RECORD')" @click="onClickNew">
          <v-icon icon="$notePlusOutline" />
        </v-btn>
      </div>
    </div>
    <template v-if="maxCount != 1">
      <div v-if="hasEditableRecords()" class="records-top-bar cms-toolbar-controls">
        <div class="toggle-view-mode" role="group" :aria-label="$filters.translate('TL_VIEW')">
          <button type="button" class="toggle-mode-btn" :aria-pressed="!multiselect ? 'true' : 'false'" :aria-label="$filters.translate('TL_EDIT_MODE')" :title="$filters.translate('TL_EDIT_MODE')" @click="multiselect && toggleViewMode()">
            <v-icon size="small" icon="$noteEditOutline" />
          </button>
          <button type="button" class="toggle-mode-btn" :aria-pressed="multiselect ? 'true' : 'false'" :aria-label="$filters.translate('TL_SELECT_MODE')" :title="$filters.translate('TL_SELECT_MODE')" @click="!multiselect && toggleViewMode()">
            <v-icon size="small" icon="$formatListChecks" />
          </button>
        </div>
        <div v-if="multiselect" class="multiselect-buttons">
          <button type="button" class="multiselect-action" :disabled="allRecordsSelected()" @click="onClickSelectAll">{{ $filters.translate('TL_SELECT_ALL') }}</button>
          <button type="button" class="multiselect-action" :disabled="multiselectItems.length === 0" @click="onClickDeselectAll">{{ $filters.translate('TL_DESELECT_ALL') }}</button>
        </div>
        <button
          v-if="!multiselect" type="button" class="filter-chip" :class="{active: onlyMine}" :aria-pressed="onlyMine ? 'true' : 'false'"
          @click="onlyMine = !onlyMine"
        >
          {{ $filters.translate('TL_ONLY_MINE') }}
        </button>
        <button
          v-if="!multiselect" type="button" class="cms-icon-btn density-btn" :aria-pressed="isCompact ? 'true' : 'false'"
          :aria-label="$filters.translate('TL_COMPACT_ROWS')" :title="$filters.translate('TL_COMPACT_ROWS')" @click="toggleDensity"
        >
          <v-icon size="small" icon="$formatLineSpacing" />
        </button>
        <v-menu v-if="!multiselect" location="bottom end" :offset="6">
          <template #activator="{ props }">
            <v-btn
              v-bind="props" class="sort-button" variant="outlined" icon size="small" :aria-label="`${$filters.translate('TL_SORT_BY')}: ${currentSortLabel}`"
              :title="`${$filters.translate('TL_SORT_BY')}: ${currentSortLabel}`"
            >
              <v-icon size="small" icon="$sortVariant" />
            </v-btn>
          </template>
          <v-list density="compact" class="sort-menu" role="menu" :aria-label="$filters.translate('TL_SORT_BY')">
            <v-list-item
              v-for="option in sortOptions" :key="option.value" role="menuitemradio" :aria-checked="sortMode === option.value ? 'true' : 'false'"
              :active="sortMode === option.value" :title="option.title" @click="onChangeSort(option.value)"
            >
              <template v-if="sortMode === option.value" #append><v-icon size="small" icon="$checkBold" /></template>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
      <div v-shortkey="multiselect ? ['ctrl', 'a'] : false" class="records" @shortkey="selectAll()" @keydown="onListKeydown">
        <div v-if="!list" class="record-skeleton" aria-hidden="true">
          <div v-for="n in 6" :key="n" class="skeleton-item" />
        </div>
        <div v-else-if="filteredList && filteredList.length === 0" class="cms-empty list-empty">
          <div class="cms-empty-icon"><v-icon icon="$magnify" size="28" /></div>
          <h2 class="cms-empty-title">{{ $filters.translate(search ? 'TL_NO_RESULTS' : 'TL_NO_RECORDS') }}</h2>
          <p class="cms-empty-text">{{ $filters.translate(search ? 'TL_NO_RESULTS_HINT' : 'TL_NO_RECORDS_HINT') }}</p>
        </div>
        <RecycleScroller v-slot="{ item }" ref="scroller" class="list" role="listbox" :items="filteredList || []" :item-size="itemSize" key-field="_id" :aria-label="$filters.translate('TL_RECORDS')">
          <div
            class="item" :class="{selected: isItemSelected(item), frozen:!item._local}" :data-id="item._id" role="option" tabindex="0" :aria-selected="isItemSelected(item) ? 'true' : 'false'"
            @click.exact="select($event, item)" @click.shift="selectTo(item)" @click.ctrl="selectTo(item, true)"
            @keydown.enter.self.prevent="select($event, item)" @keydown.space.self.prevent="select($event, item)" @keydown.c.self.exact="copyIdToClipboard(item._id)"
          >
            <div class="item-info">
              <div v-if="multiselect" class="checkbox" aria-hidden="true" @click.exact="select($event, item, true)">
                <v-icon v-if="item._local" :class="{displayed: isItemSelected(item)}" size="small" icon="$checkBold" />
              </div>
              <div class="infos-wrapper">
                <div v-if="item" class="main">
                  <v-tooltip location="right" eager :open-on-focus="false">
                    <template #activator="{ props }">
                      <span v-bind="props" v-html="renderBaseOnSearch(getName(item))" />
                    </template>
                    <span v-html="sanitizeHtml(getName(item))" /><span v-if="isCompact && item._id" class="tooltip-id">{{ item._id }}</span>
                  </v-tooltip>
                </div>
                <div class="meta">
                  <v-icon v-if="item._id && !item._local" class="meta-lock" size="12" icon="$lockOutline" role="img" :aria-label="$filters.translate('TL_READ_ONLY')" :title="$filters.translate('TL_READ_ONLY')" />
                  <span class="update">{{ $filters.translate('TL_UPDATED_BY', {user: getUpdatedBy(item)}) }}</span>
                  <template v-if="item._id">
                    <span class="separator" aria-hidden="true"> &middot; </span>
                    <span class="time-ago">{{ getTimeAgo(item) }}</span>
                  </template>
                  <span v-if="isCompact && item._id && isItemSelected(item)" class="id id-inline" v-html="renderBaseOnSearch(item._id)" />
                </div>
                <div v-if="!isCompact && item._id" class="id" v-html="renderBaseOnSearch(item._id)" />
              </div>
              <button
                v-if="item._id" type="button" class="cms-icon-btn copy-id" tabindex="-1" :aria-label="$filters.translate('TL_COPY_ID')" :title="$filters.translate('TL_COPY_ID')"
                @click.stop="copyIdToClipboard(item._id)"
              >
                <v-icon size="14" icon="$contentCopy" />
              </button>
            </div>
          </div>
        </RecycleScroller>
      </div>
      <div v-if="list && filteredList && filteredList.length > 0" class="list-footer" aria-live="polite">{{ $filters.translate('TL_RECORDS_COUNT', { num: filteredList.length }) }}</div>
    </template>
  </div>
</template>

<script>
  import _ from 'lodash'
  import { sanitizeHtml, escapeHtml } from '@u/sanitizeHtml'
  import TranslateService from '@s/TranslateService'
  import Notification from '@m/Notification'
  import NotificationsService from '@s/NotificationsService'
  import LoginService from '@s/LoginService'

  import RecordNameHelper from './RecordNameHelper'
  import SearchField from '@c/SearchField.vue'
  import ResourceSelector from '@c/ResourceSelector.vue'
  import { readChoice, writePreference } from '@u/preferences'
  import sift from 'sift'
  import JSON5 from 'json5'
  import Dayjs from 'dayjs'
  import relativeTime from 'dayjs/plugin/relativeTime'
  Dayjs.extend(relativeTime)

  export default {
    components: { SearchField, ResourceSelector },
    mixins: [Notification, RecordNameHelper],
    props: {
      selectResourceCallback: { type: Function, default: () => {} },
      list: { type: [Array, Boolean], default: () => [] },
      resource: { type: [Object, Boolean], default: () => {} },
      groupedList: { type: [Array, Boolean], default: () => [] },
      resourceGroup: { type: [Object, Boolean], default: () => {} },
      selectedItem: { type: [Object, Boolean], default: () => {} },
      locale: { type: String, default: 'enUS' },
      multiselect: { type: Boolean, default: false },
      multiselectItems: { type: [Array, Boolean], default: () => [] }
    },
    data () {
      return {
        get: _.get,
        sortOptions: [
          {
            title: TranslateService.get('TL_UPDATED_AT'),
            value: '_updatedAt'
          },
          {
            title: TranslateService.get('TL_ALPHABETICAL'),
            value: 'alphabetical'
          }
        ],
        sortMode: false,
        lastSelectedItem: false,
        menuOpened: false,
        search: '',
        TranslateService,
        omnibarDisplayed: false,
        sift: {
          isQuery: false,
          isValid: false
        },
        query: {},
        onlyMine: false,
        density: readChoice('list.density', ['comfortable', 'compact'], 'comfortable'),
        localMultiselectItems: []
      }
    },
    computed: {
      isCompact () {
        return this.density === 'compact'
      },
      // mirrors --cms-list-row / --cms-list-row-compact (the virtual scroller needs the number)
      itemSize () {
        return this.isCompact ? 44 : 68
      },
      selectedResourceGroup () {
        return _.find(this.groupedList, (resourceGroup) => this.groupSelected(resourceGroup))
      },
      currentSortLabel () {
        return _.get(_.find(this.sortOptions, { value: this.sortMode }), 'title', '')
      },
      maxCount () {
        return _.get(this.resource, 'maxCount', 0)
      },
      listCount () {
        return _.get(this.list, 'length', 0)
      },
      filteredList () {
        let fields = this.getSearchableFields()
        if (fields.length === 0) {
          fields = [_.first(this.resource.schema)]
        }
        const me = _.get(LoginService, 'user.username', false)
        const source = this.onlyMine && me ? _.filter(this.list, (item) => this.getUpdatedBy(item) === me) : this.list
        _.each(source, item => item._searchable = { id: false, keyFields: false, query: false })
        if (this.sift.isQuery) {
          return _.each(source.filter(sift(this.query)), item => item._searchable.query = true)
        }
        let filteredRecords = _.filter(source, (item) => {
          if (_.isEmpty(this.search)) {
            return true
          }
          const values = []
          _.each(fields, (field) => {
            values.push(this.getValue(item, field, this.resource.displayItem))
          })
          let qItems = 0
          let qValues = 0
          for (const queryKey in this.query) {
            const queryValue = this.query[queryKey]
            qItems = qItems + 1
            let value = _.get(item, queryKey)
            if (_.isUndefined(value) === false && (_.isArray(value) && _.includes(value, queryValue)) || (!_.isArray(value) && value === queryValue)) {
              qValues = qValues + 1
            }
          }
          let found = false
          if (qItems > 0 && qItems === qValues) {
            found = true
            item._searchable.query = true
          } else if (this.doesMatch(this.search, values)) {
            found = true
            item._searchable.keyFields = true
          } else if (new RegExp(this.search, 'i').test(item._id)) {
            found = true
            item._searchable.id = true
          }
          return found
        })
        if (_.includes(['_updatedAt', '_createdAt'], this.sortMode)) {
          filteredRecords = _.orderBy(filteredRecords, [this.sortMode], ['desc'])
        } else {
          filteredRecords = this.orderedList(filteredRecords)
        }
        return filteredRecords
      }
    },
    watch: {
      resource() {
        this.sortMode = _.get(_.first(this.sortOptions), 'value', '_updatedAt')
      },
      selectedResourceGroup () {
        this.search = ''
      },
      search () {
        // Parse query string using native URLSearchParams instead of qs
        const params = new URLSearchParams(this.search)
        const parsedQuery = {}
        for (const [key, value] of params) {
          parsedQuery[key] = value
        }
        this.query = this.flatten(parsedQuery)
        this.sift.isQuery = false
        try {
          if (this.search.search('sift:') === 0) {
            this.sift.isQuery = true
            this.query = JSON5.parse(this.search.substr(5))
            this.sift.isValid = true
          }
        } catch {
          this.sift.isValid = false
          this.query = {}
        }
      },
      multiselectItems () {
        this.localMultiselectItems = _.cloneDeep(this.multiselectItems)
      }
    },
    mounted () {
      this.sortMode = _.get(_.first(this.sortOptions), 'value', '_updatedAt')
      NotificationsService.events.on('omnibar-display-status', this.onGetOmnibarDisplayStatus)
      document.addEventListener('keydown', this.onDocumentKeydown)
    },
    beforeUnmount () {
      NotificationsService.events.off('omnibar-display-status', this.onGetOmnibarDisplayStatus)
      document.removeEventListener('keydown', this.onDocumentKeydown)
    },
    methods: {
      // "/" jumps to the search field from anywhere outside a text field
      onDocumentKeydown (event) {
        if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || this.omnibarDisplayed) {
          return
        }
        const target = event.target
        const tag = _.toLower(_.get(target, 'tagName', ''))
        if (_.includes(['input', 'textarea', 'select'], tag) || _.get(target, 'isContentEditable', false)) {
          return
        }
        const search = _.get(this.$refs, 'search', false)
        if (search && _.isFunction(search.focus)) {
          event.preventDefault()
          search.focus()
        }
      },
      // Up/Down move between rows (the list is virtualised, so scroll first), Home/End jump to the ends
      async onListKeydown (event) {
        const keys = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' }
        if (!_.has(keys, event.key) || !_.get(event.target, 'classList', false) || !event.target.classList.contains('item')) {
          return
        }
        const list = this.filteredList || []
        if (list.length === 0) {
          return
        }
        event.preventDefault()
        const current = _.findIndex(list, { _id: event.target.getAttribute('data-id') })
        const move = keys[event.key]
        const index = move === 'first' ? 0 : move === 'last' ? list.length - 1 : _.clamp(current + move, 0, list.length - 1)
        const scroller = _.get(this.$refs, 'scroller', false)
        if (scroller && _.isFunction(scroller.scrollToItem)) {
          scroller.scrollToItem(index)
        }
        await this.$nextTick()
        await new Promise((resolve) => requestAnimationFrame(resolve))
        const elem = this.$el.querySelector(`.item[data-id="${list[index]._id}"]`)
        if (elem) {
          elem.focus()
        }
      },
      toggleDensity () {
        this.density = this.isCompact ? 'comfortable' : 'compact'
        writePreference('list.density', this.density)
      },
      getUpdatedBy(item) {
        return _.last(_.get(item, '_updatedBy', '~API').split('~'))
      },
      sanitizeHtml,
      renderBaseOnSearch(value) {
        // record values are user content: escape first, then add our own highlight markup
        const result = escapeHtml(value)
        if (_.isEmpty(this.search)) {
          return result
        }
        const search = escapeHtml(this.search)
        return result.split(search).join(`<strong>${search}</strong>`)
      },
      getFirstKey(record) {
        return _.get([_.first(_.keys(_.get(record, '[0]', false)))])
      },
      orderedList(list) {
        const collator = new Intl.Collator('en', {
          sensitivity: 'base',
          ignorePunctuation: true
        })
        return list.sort((a, b) => {
          return collator.compare(this.getName(a), this.getName(b))
        })
      },
      onChangeSort(value) {
        this.sortMode = value
      },
      getTimeAgo (item) {
        return Dayjs().to(Dayjs(_.get(item, '_updatedAt', 0)))
      },
      onGetOmnibarDisplayStatus (status) {
        this.omnibarDisplayed = status
      },
      getShortcuts () {
        return this.omnibarDisplayed ? {} : {open: ['ctrl', '/']}
      },
      getSelectedRecordIds () {
        return _.map(this.localMultiselectItems, '_id')
      },
      allRecordsSelected () {
        const ids = this.getSelectedRecordIds()
        return _.get(_.filter(this.filteredList, (record) => !_.includes(ids, record._id)), 'length', 0) === 0
      },
      onClickSelectAll () {
        const ids = this.getSelectedRecordIds()
        _.each(this.filteredList, (record) => {
          if (!_.includes(ids, record._id)) {
            this.localMultiselectItems.push(record)
          }
        })
        this.$emit('changeMultiselectItems', this.localMultiselectItems)
      },
      onClickDeselectAll () {
        this.$emit('changeMultiselectItems', [])
      },
      toggleViewMode () {
        this.localMultiselectItems = []
        this.$emit('changeMultiselectItems', this.localMultiselectItems)
        this.$emit('selectMultiselect', !this.multiselect)
      },
      isCreatingNewRecord () {
        return this.selectedItem && !_.get(this.selectedItem, '_id', false)
      },
      async copyIdToClipboard (id) {
        try {
          await navigator.clipboard.writeText(id)
          // no detail: the toast would offer to copy the id that was just copied
          this.notify(TranslateService.get('TL_ID_COPIED'), 'success')
        } catch (error) {
          console.error('Failed to copy ID to clipboard:', error)
          this.notify(TranslateService.get('TL_COPY_ID_FAILED'), 'error')
        }
      },
      hasEditableRecords () {
        // judged on the whole list: a filter that matches nothing must not remove the controls needed to undo it
        return this.onlyMine || _.some(this.list, (item) => _.get(item, '_local', false))
      },
      isItemSelected (item) {
        return (this.multiselect && _.includes(_.map(this.localMultiselectItems, '_id'), item._id)) || item === this.selectedItem
      },
      getTypePrefix (type) {
        return TranslateService.get(`TL_ERROR_ON_RECORD_${_.toUpper(type)}`)
      },
      manageError (error, type, record) {
        let typePrefix = this.getTypePrefix(type)
        let errorMessage = typePrefix
        if (_.get(error, 'code', 500) === 400) {
          errorMessage = `${typePrefix}: ${_.get(error, 'message', TranslateService.get('TL_UNKNOWN_ERROR'))}`
        }
        console.error(errorMessage, record)
        this.notify(errorMessage, 'error')
      },
      groupSelected (resourceGroup) {
        if (!this.resource) {
          return false
        }
        const selectedItemGroup = _.get(this.resource, 'group.enUS', _.get(this.resource, 'group', false))
        const groupName = _.get(resourceGroup, 'name.enUS', resourceGroup.name)
        if (groupName === 'TL_OTHERS' && !selectedItemGroup) {
          return true
        }
        return groupName === selectedItemGroup
      },
      getResourceTitle (resource) {
        if (!resource) {
          return ''
        }
        return resource.displayname ? TranslateService.get(resource.displayname) : resource.title
      },
      selectAll () {
        if (this.localMultiselectItems.length === this.filteredList.length) {
          this.localMultiselectItems = []
        } else {
          this.localMultiselectItems = this.filteredList
        }
        this.$emit('changeMultiselectItems', this.localMultiselectItems)
      },
      dive (currentKey, into, target) {
        for (let i in into) {
          if (i in into) {
            let newKey = i
            let newVal = into[i]
            if (currentKey.length > 0) {
              newKey = currentKey + '.' + i
            }
            if (_.isObject(newVal)) {
              this.dive(newKey, newVal, target)
            } else {
              target[newKey] = newVal
            }
          }
        }
      },
      flatten (arr) {
        let newObj = {}
        this.dive('', arr, newObj)
        return newObj
      },
      async interactiveSearch (event) {
        const action = _.get(event, 'srcKey', false)
        const elem = _.get(this.$refs, '[\'search\']', false)
        if (!action || !elem) {
          return
        }
        return elem.focus()
      },
      select (event, item, clickedCheckbox = false) {
        if (clickedCheckbox) {
          event.stopPropagation()
        }
        if (!item._local) {
          return this.$emit('selectItem', item)
        }
        this.lastSelectedItem = item._id
        // choosing several records: a click on a row adds or removes it, like its box, instead of starting over with that one
        if (!clickedCheckbox && !this.multiselect) {
          this.localMultiselectItems = [item]
          this.$emit('selectItem', item)
        } else {
          if (this.selectedItem && this.selectedItem._id === item._id) {
            return
          }
          if (this.isItemSelected(item)) {
            this.localMultiselectItems = _.filter(this.localMultiselectItems, (i) => i._id !== item._id)
          } else {
            this.localMultiselectItems.push(item)
          }
        }
        this.$emit('changeMultiselectItems', this.localMultiselectItems)
      },
      checkIndex (index) {
        if (index + 1 <= this.filteredList.length) {
          return index + 1
        }
        return -1
      },
      selectTo (item, ctrlPressed = false) {
        if (!this.multiselect) {
          return
        }
        if (ctrlPressed || item._id === this.lastSelectedItem) {
          if (_.isUndefined(_.find(this.localMultiselectItems, {_id: item._id}))) {
            this.localMultiselectItems.push(item)
          } else {
            this.localMultiselectItems = _.filter(this.localMultiselectItems, (i) => i._id !== item._id)
          }
          return this.$emit('changeMultiselectItems', this.localMultiselectItems)
        }
        if (!this.lastSelectedItem) {
          this.lastSelectedItem = item._id
        }
        const state = _.isUndefined(_.find(this.localMultiselectItems, {_id: item._id})) ? 'check' : 'uncheck'
        const start = _.findIndex(this.filteredList, (i) => i._id === item._id)
        const end = _.findIndex(this.filteredList, (i) => i._id === this.lastSelectedItem)
        const firstIndex = start <= end ? start : end
        const lastIndex = this.checkIndex(start <= end ? end : start)
        const selectedItems = _.slice(this.filteredList, firstIndex, lastIndex)
        if (state === 'check') {
          _.each(selectedItems, (i) => {
            if (_.isUndefined(_.find(this.localMultiselectItems, {_id: i._id}))) {
              this.localMultiselectItems.push(i)
            }
          })
        } else {
          const ids = _.map(selectedItems, '_id')
          this.localMultiselectItems = _.filter(this.localMultiselectItems, (i) => !_.includes(ids, i._id))
        }
        this.lastSelectedItem = item._id
        this.$emit('changeMultiselectItems', this.localMultiselectItems)
      },
      onClickNew () {
        this.localMultiselectItems = []
        this.$emit('changeMultiselectItems', this.localMultiselectItems)
        this.$emit('selectMultiselect', false)
        this.$emit('selectItem', { _local: true })
      },
      getSearchableFields () {
        return _.filter(this.resource.schema, item => item.searchable === true)
      },
      doesMatch (search, values) {
        return _.find(values, (value) => !!new RegExp(this.search, 'i').test(value))
      }
    }
  }
</script>
