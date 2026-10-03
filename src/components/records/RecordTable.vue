<template>
  <div class="record-table-wrapper">
    <resource-selector v-if="!record" :resource="resource" :grouped-list="groupedList" :select-callback="selectResourceCallback" full-width />
    <v-card class="record-table" :class="{'has-back-button': record}" elevation="0">
      <template v-if="!record">
        <div class="cms-toolbar">
          <div v-shortkey="getShortcuts()" class="search" @shortkey="focusSearch">
            <search-field ref="search" v-model="search" :placeholder="$filters.translate('TL_SEARCH')" :aria-label="$filters.translate('TL_SEARCH')" name="search" />
            <v-btn v-if="maxCount <= 0 || listCount < maxCount" elevation="0" class="new" @click="createRecord">
              <v-icon size="small" icon="$notePlusOutline" />
              {{ $filters.translate('TL_ADD_NEW_RECORD') }}
            </v-btn>
          </div>
        </div>
        <div v-if="selectedRecords.length === 0" class="cms-toolbar-controls table-controls">
          <top-bar-locale-list :locales="resource.locales" :locale="locale" :select-locale="selectLocale" :back="back" />
          <button
            v-if="canShowAllLocales" type="button" class="filter-chip" :class="{active: prefs.showAllLocales}" :aria-pressed="prefs.showAllLocales ? 'true' : 'false'"
            @click="toggleAllLocales"
          >
            {{ $filters.translate('TL_SHOW_ALL_LOCALES') }}
          </button>
          <span class="controls-spacer" />
          <table-column-menu :columns="allColumns" :prefs="prefs" @toggle="onToggleColumn" @move="onMoveColumn" @reset="onResetColumns" />
          <v-menu location="bottom end">
            <template #activator="{ props }">
              <v-btn
                v-bind="props" class="table-tool" variant="outlined" size="small" :aria-label="`${$filters.translate('TL_DENSITY')}: ${densityLabel(density)}`"
                :title="`${$filters.translate('TL_DENSITY')}: ${densityLabel(density)}`"
              >
                <v-icon size="small" icon="$formatLineSpacing" />
                <span class="tool-label">{{ $filters.translate('TL_DENSITY') }}</span>
              </v-btn>
            </template>
            <v-list density="compact" role="menu" :aria-label="$filters.translate('TL_DENSITY')">
              <v-list-item
                v-for="option in densityOptions" :key="option" role="menuitemradio" :aria-checked="density === option ? 'true' : 'false'" :active="density === option"
                :title="densityLabel(option)" @click="setDensity(option)"
              >
                <template v-if="density === option" #append><v-icon size="small" icon="$checkBold" /></template>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>
        <div v-else class="cms-toolbar-controls table-bulk" role="region" :aria-label="$filters.translate('TL_BULK_ACTIONS')">
          <button type="button" class="cms-icon-btn" :aria-label="$filters.translate('TL_CLEAR_SELECTION')" :title="$filters.translate('TL_CLEAR_SELECTION')" @click="selectedRecords = []">
            <v-icon size="16" icon="$close" />
          </button>
          <span class="bulk-count" aria-live="polite">{{ $filters.translate('TL_N_SELECTED', { num: selectedRecords.length }) }}</span>
          <span class="controls-spacer" />
          <v-btn class="delete-selected-records" variant="outlined" color="error" size="small" @click="removeRecords">
            <v-icon size="small" icon="$trashCanOutline" />
            {{ $filters.translate('TL_DELETE_SELECTED') }}
          </v-btn>
        </div>
        <div v-if="!loading && rows.length === 0" class="cms-empty table-empty">
          <div class="cms-empty-icon"><v-icon icon="$magnify" size="28" /></div>
          <h2 class="cms-empty-title">{{ $filters.translate(search ? 'TL_NO_RESULTS' : 'TL_NO_RECORDS') }}</h2>
          <p class="cms-empty-text">{{ $filters.translate(search ? 'TL_NO_RESULTS_HINT' : 'TL_NO_RECORDS_HINT') }}</p>
        </div>
        <vue-table-generator
          v-else
          v-model:selected="selectedRecords" :columns="columns" :rows="rows" :sort-by="sortBy" :density="density" :loading="loading"
          :label="resourceTitle" :show-locale-badge="visibleLocaleCount > 1" :helpers="helpers" :row-name="rowName"
          @sort="onSort" @open="editRecord" @edit="editRecord" @remove="removeRecord"
        />
        <div v-if="!loading && rows.length > 0" class="table-footer" aria-live="polite">
          <span>{{ footerText }}</span>
          <span v-if="hiddenColumnCount > 0" class="footer-hint">{{ $filters.translate('TL_COLUMNS_HIDDEN', { num: hiddenColumnCount }) }}</span>
        </div>
      </template>
      <!-- editing -->
      <record-editor
        v-if="record"
        :key="record._id"
        v-model:record="localRecord"
        v-model:locale="localLocale"
        :resource="resource"
        :user-locale="TranslateService.locale"
        @update-record-list="updateRecordList"
        @back="back"
      />
    </v-card>
  </div>
</template>

<script>

  import _ from 'lodash'
  import Mustache from 'mustache'

  import TranslateService from '@s/TranslateService'
  import NotificationsService from '@s/NotificationsService'
  import RequestService from '@s/RequestService'
  import ResourceService from '@s/ResourceService'
  import { getRecordLabel, getResourceLabel, recordMessage } from '@u/recordLabel'
  import {
    buildColumns, fieldsFromSchema, applyPrefs, loadPrefs, savePrefs, clearPrefs, toggleColumn, moveColumn, nextSort, sortRows, sortValue, matchesSearch,
    visibleLocales, richTextToPlain, isColumnHidden, attachmentOf, DENSITIES
  } from '@u/tableModel'
  import { readChoice, writePreference } from '@u/preferences'
  import VueTableGenerator from '@c/records/VueTableGenerator.vue'
  import TableColumnMenu from '@c/records/TableColumnMenu.vue'
  import ResourceSelector from '@c/records/ResourceSelector.vue'
  import SearchField from '@c/records/SearchField.vue'
  import TopBarLocaleList from '@c/layout/TopBarLocaleList.vue'

  import RecordEditor from '@c/records/RecordEditor.vue'
  import Notification from '@m/Notification'

  const TEXTUAL_KINDS = ['text', 'richtext', 'select', 'multi', 'link', 'number']

  export default {
    components: {
      VueTableGenerator,
      TableColumnMenu,
      ResourceSelector,
      SearchField,
      RecordEditor,
      TopBarLocaleList
    },
    mixins: [Notification],
    props: {
      groupedList: { type: Array, default: () => [] },
      recordList: { type: [Array, Boolean], default: () => [] },
      locale: { type: String, default: 'enUS' },
      selectResourceCallback: { type: Function, default: () => {} },
      resource: { type: Object, default: () => {} },
      record: { type: [Object, Boolean], default: false }
    },
    emits: ['update:locale', 'update:record', 'updateRecordList', 'unsetRecord'],
    data () {
      return {
        omnibarDisplayed: false,
        search: '',
        selectedRecords: [],
        TranslateService,
        localLocale: false,
        localRecord: {},
        prefs: {},
        sortBy: [],
        density: readChoice('table.density', DENSITIES, 'default'),
        densityOptions: DENSITIES,
        loading: true
      }
    },
    computed: {
      /** @returns {string} */
      resourceTitle () {
        return getResourceLabel(this.resource)
      },
      /** @returns {Array<Object>} the list, [] when it is not an array */
      clonedRecordList () {
        return _.isArray(this.recordList) ? this.recordList : []
      },
      /** @returns {number} 0 when unlimited */
      maxCount () {
        return _.get(this.resource, 'maxCount', 0)
      },
      /** @returns {number} */
      listCount () {
        return this.clonedRecordList.length
      },
      /** @returns {boolean} */
      showAllLocales () {
        return !!this.prefs.showAllLocales
      },
      /** @returns {Function} (column) => its translated label, else its field */
      labelOf () {
        return (raw) => TranslateService.get(raw.label) || raw.field
      },
      // every column of the schema (also the hidden ones, for the column menu)
      allColumns () {
        const fields = fieldsFromSchema(this.resource, this.locale, this.labelOf)
        return buildColumns(fields, this.resource, { showAllLocales: this.showAllLocales, labelOf: this.labelOf })
      },
      /** @returns {Array<Object>} the visible columns in the saved order */
      columns () {
        return applyPrefs(this.allColumns, this.prefs)
      },
      /** @returns {number} */
      hiddenColumnCount () {
        return this.allColumns.length - this.columns.length
      },
      /** @returns {number} */
      visibleLocaleCount () {
        return visibleLocales(this.columns).length
      },
      /** @returns {boolean} several locales and a localised column */
      canShowAllLocales () {
        return _.size(this.resource.locales) > 1 && _.some(this.allColumns, 'locale')
      },
      /** @returns {Object<string, Object>} */
      columnByKey () {
        return _.keyBy(this.allColumns, 'key')
      },
      /** @returns {Object} the cell helpers handed to TableCell */
      helpers () {
        return { optionLabel: this.optionLabel, imageUrl: this.imageUrl, fileName: this.fileName }
      },
      /** @returns {Array<Object>} the records matching the search */
      filteredList () {
        if (_.isEmpty(_.trim(this.search))) {
          return this.clonedRecordList
        }
        const searchable = this.getSearchableFields()
        const fields = searchable.length > 0 ? searchable : _.compact([_.first(this.resource.schema)])
        const textual = _.filter(this.columns, (column) => _.includes(TEXTUAL_KINDS, column.kind))
        return _.filter(this.clonedRecordList, (item) => {
          const values = [item._id, ..._.map(fields, (field) => this.getValue(item, field)), ..._.map(textual, (column) => this.cellText(item, column))]
          return matchesSearch(this.search, values)
        })
      },
      /** @returns {Array<Object>} the filtered records, sorted */
      rows () {
        return sortRows(this.filteredList, this.sortBy, (row, key) => sortValue(row, this.columnByKey[key] || {}, { labelOf: (column) => (value) => this.optionLabel(column, value) }))
      },
      /** @returns {string} the count, "n of total" when filtered */
      footerText () {
        const total = this.clonedRecordList.length
        return this.rows.length === total
          ? TranslateService.get('TL_RECORDS_COUNT', { num: total })
          : TranslateService.get('TL_RECORDS_COUNT_OF', { shown: this.rows.length, total })
      }
    },
    watch: {
      resource: {
        immediate: true,
        handler () {
          this.prefs = loadPrefs(window.localStorage, this.resource.title)
          this.sortBy = _.filter(_.get(this.prefs, 'sortBy', []), (entry) => _.isString(_.get(entry, 'key')))
          this.search = ''
          this.selectedRecords = []
        }
      },
      recordList: {
        immediate: true,
        handler () {
          this.loading = !_.isArray(this.recordList)
          const ids = _.map(this.clonedRecordList, '_id')
          this.selectedRecords = _.intersection(this.selectedRecords, ids)
        }
      },
      record () {
        this.localRecord = _.cloneDeep(this.record)
      },
      locale: {
        immediate: true,
        handler () {
          this.localLocale = this.locale
        }
      }
    },
    mounted () {
      NotificationsService.events.on('omnibar-display-status', this.onGetOmnibarDisplayStatus)
    },
    beforeUnmount () {
      NotificationsService.events.off('omnibar-display-status', this.onGetOmnibarDisplayStatus)
    },
    methods: {
      /** @param {boolean} status */
      onGetOmnibarDisplayStatus (status) {
        this.omnibarDisplayed = status
      },
      // Ctrl+/ and "/" jump to the search field from anywhere outside a text field, while the switcher is closed (as in the list)
      getShortcuts () {
        return this.omnibarDisplayed ? {} : { open: ['ctrl', '/'], jump: ['/'] }
      },
      focusSearch () {
        const elem = _.get(this.$refs, 'search', false)
        if (elem) {
          elem.focus()
        }
      },
      // ---- preferences (remembered per resource)
      updatePrefs (prefs) {
        this.prefs = prefs
        savePrefs(window.localStorage, this.resource.title, prefs)
      },
      /** The sort is reset: the column keys change. */
      toggleAllLocales () {
        // the column keys change with the locale expansion, so the remembered column choices no longer apply
        this.updatePrefs({ showAllLocales: !this.showAllLocales })
        this.sortBy = []
      },
      /** @param {string} key */
      onToggleColumn (key) {
        this.updatePrefs(toggleColumn(this.allColumns, this.prefs, key))
      },
      /**
       * @param {string} key
       * @param {number} delta -1 or 1
       */
      onMoveColumn (key, delta) {
        this.updatePrefs(moveColumn(this.allColumns, this.prefs, key, delta))
      },
      /** Back to the default columns; the locales and the sort are kept. */
      onResetColumns () {
        clearPrefs(window.localStorage, this.resource.title)
        this.updatePrefs(_.pick(this.prefs, ['showAllLocales', 'sortBy']))
      },
      /**
       * @param {string} key
       * @param {boolean} additive shift: added to the current sort
       */
      onSort (key, additive) {
        this.sortBy = nextSort(this.sortBy, key, additive)
        this.updatePrefs({ ...this.prefs, sortBy: this.sortBy })
      },
      /** @param {string} density saved as a preference */
      setDensity (density) {
        this.density = density
        writePreference('table.density', density)
      },
      /**
       * @param {string} density
       * @returns {string}
       */
      densityLabel (density) {
        return TranslateService.get(`TL_DENSITY_${_.toUpper(density)}`)
      },
      /**
       * @param {string} key
       * @returns {boolean}
       */
      isColumnHidden (key) {
        return isColumnHidden(this.allColumns, this.prefs, key)
      },
      // ---- cell helpers
      optionLabel (column, value) {
        if (_.isNil(value) || value === '') {
          return ''
        }
        if (_.isObject(value)) {
          return _.toString(value.text || value.name || value._id)
        }
        const raw = column.raw || {}
        if (_.isString(raw.source)) {
          const related = _.find(ResourceService.get(raw.source), { _id: value })
          if (!related) {
            return _.toString(value)
          }
          const template = _.get(raw, 'options.customLabel')
          if (template) {
            const rendered = Mustache.render(template, related)
            if (rendered && !_.includes(rendered, '[object Object]')) {
              return rendered
            }
          }
          return getRecordLabel(ResourceService.getSchema(raw.source), related, this.locale) || _.toString(value)
        }
        const source = _.find(_.isArray(raw.source) ? raw.source : [], (item) => _.isObject(item) && item.value === value)
        if (source) {
          return _.toString(source.text || source.value)
        }
        const label = _.get(raw, ['labels', value])
        if (label) {
          return _.toString(_.isObject(label) ? _.get(label, this.locale, _.first(_.values(label))) : label)
        }
        return _.toString(value)
      },
      /**
       * @param {Object} record
       * @param {Object} column
       * @returns {Object|undefined}
       */
      findAttachment (record, column) {
        return attachmentOf(record, column)
      },
      /**
       * @param {Object} record
       * @param {Object} column
       * @returns {string|false} the url, resized to 64px high
       */
      imageUrl (record, column) {
        const url = _.get(this.findAttachment(record, column), 'url', false)
        return url ? `${url}?resize=autox64` : false
      },
      /**
       * @param {Object} record
       * @param {Object} column
       * @returns {string}
       */
      fileName (record, column) {
        return _.get(this.findAttachment(record, column), '_filename', '')
      },
      /**
       * @param {Object} item
       * @param {Object} column
       * @returns {string} the value as text, by kind
       */
      cellText (item, column) {
        const value = _.get(item, column.model)
        if (column.kind === 'richtext') {
          return richTextToPlain(value)
        }
        if (column.kind === 'select') {
          return this.optionLabel(column, value)
        }
        if (column.kind === 'multi') {
          return _.map(_.castArray(value), (v) => this.optionLabel(column, v)).join(' ')
        }
        return _.isObject(value) ? '' : value
      },
      /**
       * @param {Object} row
       * @returns {string} its label, else its id
       */
      rowName (row) {
        return getRecordLabel(this.resource, row, this.locale) || _.get(row, '_id', '')
      },
      // ---- editing and deleting
      updateRecordList (record) {
        this.$emit('updateRecordList', record)
      },
      /** @param {Object} record emitted as update:record */
      selectRecord (record) {
        this.localLocale = this.locale
        this.$emit('update:record', record)
      },
      /** @param {Object} record */
      editRecord (record) {
        this.selectRecord(record)
      },
      createRecord () {
        this.selectRecord({ _local: true })
      },
      /**
       * @param {boolean} forMultipleRecords
       * @param {Object|false} record named in the question
       * @returns {Promise<boolean>}
       */
      askConfirmation (forMultipleRecords = false, record = false) {
        const name = record ? (getRecordLabel(this.resource, record, this.locale) || record._id) : ''
        return window.DialogService.ask({
          event: 'deleteRecord',
          destructive: true,
          title: forMultipleRecords
            ? TranslateService.get('TL_DELETE_RECORDS_TITLE', { num: _.size(this.selectedRecords) })
            : TranslateService.get('TL_DELETE_RECORD_TITLE', { name }),
          message: `${TranslateService.get(`TL_ARE_YOU_SURE_TO_DELETE${forMultipleRecords ? '_SELECTED_RECORDS' : ''}`)} ${TranslateService.get('TL_ARE_YOU_SURE_TO_DELETE_IRREVERSIBLE')}`,
          confirm: TranslateService.get('TL_DELETE'),
          cancel: TranslateService.get('TL_CANCEL')
        })
      },
      // Bulk delete: one named confirmation, then one toast for the whole batch
      async removeRecords () {
        const ids = [...this.selectedRecords]
        if (ids.length === 0 || !(await this.askConfirmation(true))) {
          return
        }
        this.$loading.start('delete-records')
        const failed = []
        for (const id of ids) {
          try {
            await RequestService.delete(`../api/${this.resource.title}/${id}`)
          } catch (error) {
            console.error('Error happen during deleteRecords:', error)
            failed.push(id)
          }
        }
        this.$loading.stop('delete-records')
        if (ids.length > failed.length) {
          this.notify(TranslateService.get('TL_RECORDS_DELETED', { num: ids.length - failed.length }), 'success')
        }
        if (failed.length > 0) {
          this.notify(TranslateService.get('TL_RECORDS_DELETE_FAILED', { num: failed.length }), 'error')
        }
        this.selectedRecords = failed
        this.$emit('updateRecordList', null)
      },
      /** @param {Object} record after confirmation */
      async removeRecord (record) {
        if (!(await this.askConfirmation(false, record))) {
          return
        }
        this.$loading.start('delete-record')
        try {
          await RequestService.delete(`../api/${this.resource.title}/${record._id}`)
          this.notify(recordMessage('DELETED', this.resource, record, this.locale), 'success')
          this.selectedRecords = _.without(this.selectedRecords, record._id)
          this.$emit('updateRecordList', null)
        } catch (error) {
          console.error('Error happen during deleteRecord:', error)
          this.manageError(error, 'delete', record)
        }
        this.$loading.stop('delete-record')
      },
      /**
       * @param {Error|Object} error a 400 adds its message
       * @param {string} type create, update or delete
       * @param {Object} record
       */
      manageError (error, type, record) {
        let errorMessage = TranslateService.get(`TL_ERROR_ON_RECORD_${_.toUpper(type)}`)
        if (_.get(error, 'code', 500) === 400 && _.get(error, 'message', false)) {
          errorMessage += `: ${_.get(error, 'message', TranslateService.get('TL_UNKNOWN_ERROR'))}`
        }
        console.error(errorMessage, record)
        this.notify(errorMessage, 'error')
      },
      /** @returns {Array<Object>} */
      getSearchableFields () {
        return _.filter(this.resource.schema, {searchable: true})
      },
      /** @param {string} item a locale, emitted as update:locale */
      selectLocale (item) {
        this.$emit('update:locale', item)
      },
      /**
       * @param {Object} item
       * @param {Object} field
       * @returns {*} the value of the field, empty without a field
       */
      getValue (item, field) {
        if (!field) {
          return ''
        }
        if (field.input === 'file') {
          const localised = this.resource.locales && (field.localised || _.isUndefined(field.localised))
          const attachment = attachmentOf(item, { model: localised ? `${field.field}.${this.locale}` : field.field, originalModel: field.field, field, locale: this.locale })
          return attachment && attachment._filename
        }
        if (this.resource.locales && (field.localised || _.isUndefined(field.localised))) {
          return _.get(item, `${field.field}.${this.locale}`)
        }
        return _.get(item, field.field)
      },
      back () {
        this.$emit('unsetRecord')
      }
    }
  }
</script>
