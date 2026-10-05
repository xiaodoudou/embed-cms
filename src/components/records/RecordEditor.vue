<template>
  <v-card v-if="record" v-shortkey.anywhere="{ jump: ['ctrl', 'j'] }" elevation="0" class="record-editor" :class="{frozen:!record._local, 'full-width': resource && resource.maxCount === 1}" @shortkey="toggleJump">
    <div class="top-bar">
      <top-bar-locale-list :locales="resource.locales" :locale="locale" :select-locale="selectLocale" :back="back" :dirty-locales="dirtyLocales" :missing="visibleMissing" />
      <div class="editor-status" role="status" aria-live="polite">
        <span v-if="isDirty" class="status-dirty" :title="$filters.translate('TL_UNSAVED_CHANGES_HINT')"><span class="status-dot" aria-hidden="true" />{{ $filters.translate('TL_UNSAVED_CHANGES') }}</span>
        <span v-else-if="editingRecord._id" class="status-saved">{{ $filters.translate('TL_ALL_SAVED') }}</span>
        <!-- after a failed save: how many required fields are empty (the locale tabs only count the localised ones) -->
        <button v-if="attempted && missing.total > 0" type="button" class="status-missing" @click="focusFirstMissing">
          <v-icon size="14" icon="$alertBoxOutline" aria-hidden="true" />{{ $filters.translate(missing.total === 1 ? 'TL_REQUIRED_MISSING_ONE' : 'TL_REQUIRED_MISSING_MANY', { num: missing.total }) }}
        </button>
      </div>
      <div class="buttons">
        <v-menu v-if="outlineEntries.length > 0" v-model="jumpOpen" location="bottom end">
          <template #activator="{ props }">
            <v-btn v-bind="props" elevation="0" variant="text" class="jump-to" :aria-label="$filters.translate('TL_JUMP_TO')" :title="`${$filters.translate('TL_JUMP_TO')} (Ctrl J)`">
              <v-icon icon="$formatListBulleted" />
            </v-btn>
          </template>
          <div class="outline-panel">
            <!-- a search box that keeps the focus: the arrows move over the rows, Enter jumps, Escape closes the menu -->
            <div class="outline-search">
              <label :for="`${randomId}-jump-search`" class="cms-visually-hidden">{{ $filters.translate('TL_JUMP_TO_SEARCH') }}</label>
              <v-text-field
                :id="`${randomId}-jump-search`" ref="jumpSearch" v-model="jumpQuery" type="text" autocomplete="off" spellcheck="false" density="compact" variant="plain" hide-details
                clearable clear-icon="$close"
                prepend-inner-icon="$magnify" :placeholder="$filters.translate('TL_JUMP_TO_SEARCH')" role="combobox" aria-expanded="true" :aria-controls="`${randomId}-jump-rows`"
                :aria-activedescendant="jumpHighlight >= 0 && jumpRows.length > 0 ? `${randomId}-jump-row-${jumpHighlight}` : undefined" @keydown="onJumpKeydown"
              />
            </div>
            <v-list :id="`${randomId}-jump-rows`" density="compact" class="outline-list" role="listbox">
              <v-list-item
                v-for="(row, i) in jumpRows" :id="`${randomId}-jump-row-${i}`" :key="row.entry.key" role="option" :aria-selected="i === jumpHighlight ? 'true' : 'false'"
                :class="{ 'outline-block': row.entry.block !== undefined && !row.entry.blockField, 'outline-field': !!row.entry.blockField, highlighted: i === jumpHighlight }" @click="jumpTo(row.entry)" @mousemove="jumpHighlight = i"
              >
                <template #title><template v-for="(part, p) in row.parts" :key="p"><mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></template>
                <template v-if="row.entry.dirty || (row.entry.block === undefined && isFieldMissing(row.entry.field))" #append>
                  <span v-if="row.entry.dirty" class="outline-dirty" role="img" :aria-label="$filters.translate('TL_UNSAVED_CHANGES')" :title="$filters.translate('TL_UNSAVED_CHANGES')" />
                  <v-icon v-if="row.entry.block === undefined && isFieldMissing(row.entry.field)" size="small" color="error" icon="$alertBoxOutline" :aria-label="$filters.translate('TL_REQUIRED')" />
                </template>
              </v-list-item>
              <div v-if="jumpRows.length === 0" class="outline-empty" role="status">{{ $filters.translate('TL_NO_MATCHES') }}</div>
            </v-list>
          </div>
        </v-menu>
        <v-btn v-if="isDirty" elevation="0" variant="outlined" class="discard" :aria-label="$filters.translate('TL_DISCARD')" :title="$filters.translate('TL_DISCARD')" @click="discardChanges"><v-icon class="discard-icon" icon="$undoVariant" /><span class="discard-text">{{ $filters.translate('TL_DISCARD') }}</span></v-btn>
        <v-btn v-if="editingRecord._id" elevation="0" class="delete" icon variant="outlined" color="error" :aria-label="$filters.translate('TL_DELETE')" :title="$filters.translate('TL_DELETE')" @click="deleteRecord"><v-icon icon="$trashCanOutline" /></v-btn>
        <v-btn elevation="0" class="update" :class="{blinking: blinkButton}" :disabled="!canCreateUpdate" @click="createUpdateClicked">{{ getActionText() }}</v-btn>
      </div>
    </div>
    <div class="scroll-wrapper" :class="{'scrolled-to-bottom': scrolledToBottom}" @scroll="onScroll">
      <v-form :id="randomId" ref="vfg" v-model="formValid" class="record-editor-form" lazy-validation>
        <custom-form
          v-if="isReady"
          :key="formKey"
          v-model:model="editingRecord"
          :schema="schema" :form-id="randomId"
          :form-options="formOptions"
          :paragraph-level="1"
          @input="onModelUpdated"
        />
      </v-form>
    </div>
  </v-card>
</template>

<script>
  import { log } from '@u/log'
  import _ from 'lodash'
  import { flatten } from 'flat'
  import pAll from 'p-all'
  import TranslateService from '@s/TranslateService'
  import FieldSelectorService from '@s/FieldSelectorService'
  import AbstractEditorView from '@m/AbstractEditorView'
  import Notification from '@m/Notification'
  import NotificationsService from '@s/NotificationsService'
  import TopBarLocaleList from '@c/layout/TopBarLocaleList.vue'
  import RequestService from '@s/RequestService'
  import { host } from '@s/HostService'
  import ResourceService from '@s/ResourceService'
  import { outlineEntries } from '@u/outline'
  import { getRecordLabel, recordMessage } from '@u/recordLabel'
  import { createSnapshot, changedParts, isDirty, missingRequired, absorbPaths, unsetSwitchesToFalse } from '@u/dirtyTracker'
  import { isScrolledToBottom } from '@u/scroll'
  import { revealField } from '@u/groups'
  import { searchOutline } from '@u/jumpSearch'
  import { moveHighlight } from '@u/switcherModel'

  // Fields fill in their own defaults when they appear. For this long after a form (re)renders, and until the user
  // touches it, such changes are not edits (see settle() below).
  const SETTLE_MS = 700
  // how long the place a "Jump to" row points at stays lit (the animation in base.scss lasts as long)
  const JUMP_FLASH_MS = 1200

  export default {
    components: {TopBarLocaleList},
    mixins: [AbstractEditorView, Notification],
    props: {
      resource: { type: Object, default: () => ({}) },
      record: { type: Object, default: () => ({}) },
      locale: { type: String, default: () => 'enUS' },
      userLocale: { type: String, default: () => 'enUS' }
    },
    emits: ['back', 'update:locale', 'update:record', 'updateRecordList'],
    data () {
      return {
        canCreateUpdate: true,
        blinkButton: false,
        blinkButtonTimeout: false,
        scrolledToBottom: false,
        randomId: Math.random(),
        // the Jump to field menu: whether it is open, what is typed in its search box, and the row the arrows are on
        jumpOpen: false,
        jumpQuery: '',
        jumpHighlight: -1,
        formValid: false,
        isDirty: false,
        formKey: 0,
        snapshot: {},
        settling: false,
        settleBase: [],
        dirtyInfo: { locales: [], shared: [], paths: [] },
        attempted: false,
        invalidSummary: '',
        fileInputTypes: ['file', 'img', 'image', 'cropimage', 'imagemap', 'imageView', 'attachmentView'],
        cachedMap: {},
        editingRecord: {},
        originalFieldList: [],
        schema: { fields: [] },
        isReady: false,
        formElem: false,
        formOptions: {
          validateAfterLoad: true,
          validateAfterChanged: true
        }
      }
    },
    computed: {
      // Required fields still empty, per locale and shared (see utils/dirtyTracker.js)
      missing () {
        return missingRequired(this.editingRecord, this.resource)
      },
      // Locales own the amber "unsaved" marker only when their own localised values differ
      dirtyLocales () {
        return this.dirtyInfo.locales
      },
      // Red markers: always for records loaded incomplete; for a new record only after a save attempt or an edit in that locale
      visibleMissing () {
        const isNew = !_.get(this.record, '_id', false)
        const result = {}
        _.each(this.missing.byLocale, (fields, locale) => {
          if (!isNew || this.attempted || _.includes(this.dirtyInfo.locales, locale)) {
            result[locale] = fields.length
          }
        })
        return result
      },
      /**
       * @returns {Array<Object>} the fields of the form in the order they are drawn (the lines of a layout, else the schema), those inside groups (and groups of groups) too.
       * A field in a group is named after its groups: `Address · City`
       */
      formFields () {
        const drawn = (form) => _.get(form, 'layout.lines') ? _.compact(_.flatMap(form.layout.lines, (line) => _.map(line.fields, 'schema'))) : _.get(form, 'fields', [])
        const walk = (form, titles) => _.flatMap(drawn(form), (field) => {
          if (field.type === 'group') {
            return walk(field.groupOptions, [...titles, field.label])
          }
          return [titles.length > 0 ? { ...field, label: `${titles.join(' · ')} · ${field.label}` } : field]
        })
        return walk(this.schema, [])
      },
      /** @returns {Array<Object>} the labelled fields, one per original model */
      outlineFields () {
        return _.uniqBy(_.filter(this.formFields, (f) => f.label && f.originalModel), 'originalModel')
      },
      /** @returns {Array<{entry: Object, parts: Array<{text: string, hit: boolean}>}>} the rows of the Jump to field menu for what is typed in its search box */
      jumpRows () {
        return searchOutline(this.outlineEntries, this.jumpQuery)
      },
      // the fields, and under each paragraph field a row for each of its blocks (from the record, so repeats are listed as they are)
      outlineEntries () {
        return outlineEntries(this.outlineFields, this.editingRecord, {
          paragraphSchema: (type) => ResourceService.getParagraphSchema(type),
          translate: (value) => TranslateService.get(value),
          locale: this.locale,
          snapshot: this.snapshot
        })
      }
    },
    watch: {
      // the menu starts over each time it opens: every row, the first one under the arrows, and the search box ready to type in (not on a touch screen, where it would bring up the keyboard
      // over the list)
      jumpOpen (open) {
        if (!open) {
          return
        }
        this.jumpQuery = ''
        this.jumpHighlight = -1
        if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) {
          this.$nextTick(() => _.invoke(this.$refs.jumpSearch, 'focus'))
        }
      },
      // typing puts the arrows on the best match; with nothing typed no row is marked until an arrow or the pointer picks one
      jumpQuery (query) {
        this.jumpHighlight = _.trim(query) === '' ? -1 : 0
      },
      // Deep watch: catches every field type, including in-place edits of nested arrays and objects
      editingRecord: {
        deep: true,
        handler () {
          this.checkDirty()
        }
      },
      // the marks follow the fields: filled in, they go
      missing () {
        this.$nextTick(this.markMissingFields)
      },
      async locale () {
        await this.updateSchema()
        this.editingRecord = _.cloneDeep(this.editingRecord)
        this.checkDirty()
        this.settle()
        this.$nextTick(this.markMissingFields)
      },
      async record () {
        NotificationsService.clearContextual()
        await this.updateSchema()
        this.cloneEditingRecord()
        this.settle()
      },
      async userLocale () {
        await this.updateSchema()
        this.editingRecord = _.cloneDeep(this.editingRecord)
        this.checkDirty()
        this.settle()
      }
    },
    async mounted () {
      await this.updateSchema()
      this.cloneEditingRecord()
      this.isReady = true
      // log.debug('EDITING RECORD - ', this.editingRecord)
      FieldSelectorService.events.on('select', this.onFieldSelected)
      window.addEventListener('beforeunload', this.onBeforeUnload)
      await this.$nextTick()
      this.formElem = document.getElementById(this.randomId)
      document.addEventListener('pointerdown', this.onUserInput, true)
      document.addEventListener('keydown', this.onUserInput, true)
      document.addEventListener('input', this.onUserInput, true)
      this.settle()
    },
    beforeUnmount () {
      NotificationsService.clearContextual()
      // the app must not keep believing there are unsaved edits once this editor is gone
      window.DialogService.send(false)
      FieldSelectorService.events.off('select', this.onFieldSelected)
      window.removeEventListener('beforeunload', this.onBeforeUnload)
      document.removeEventListener('pointerdown', this.onUserInput, true)
      document.removeEventListener('keydown', this.onUserInput, true)
      document.removeEventListener('input', this.onUserInput, true)
      clearTimeout(this.settleTimer)
    },
    methods: {
      /** @returns {string} Save or Create */
      getActionText() {
        return TranslateService.get(this.editingRecord._id ? 'TL_SAVE' : 'TL_CREATE')
      },
      /** @param {BeforeUnloadEvent} event the leave prompt of the browser while the record is dirty */
      onBeforeUnload (event) {
        if (this.isDirty) {
          event.preventDefault()
          event.returnValue = ''
        }
      },
      /** Back to the record as loaded; the form is mounted again. */
      discardChanges () {
        this.cloneEditingRecord()
        this.formKey++
        this.settle()
      },
      // Opens the settling window: the paths that are dirty now are the user's and stay dirty, everything that changes
      // before the user touches the form (or the window closes) is a default a field wrote itself.
      async settle () {
        await this.$nextTick()
        this.settleBase = _.clone(this.dirtyInfo.paths)
        this.settling = true
        clearTimeout(this.settleTimer)
        this.settleTimer = setTimeout(() => { this.settling = false }, SETTLE_MS)
        this.checkDirty()
      },
      // A real interaction with the form ends the window; the locale tabs and buttons around it do not
      onUserInput (event) {
        if (this.settling && event.isTrusted && _.invoke(document.getElementById(this.randomId), 'contains', event.target)) {
          this.settling = false
          clearTimeout(this.settleTimer)
        }
      },
      // After a failed save the empty required fields say so on the field itself (the ones with a rule of their own
      // already show their message)
      markMissingFields () {
        _.each(this.$el.querySelectorAll('.field-wrapper.is-missing'), (element) => {
          element.classList.remove('is-missing')
          element.removeAttribute('data-missing-text')
        })
        if (!this.attempted) {
          return
        }
        const text = TranslateService.get('TL_FIELD_IS_REQUIRED')
        _.each(this.formFields, (field) => {
          const element = this.isFieldMissing(field) ? this.$el.querySelector(`.field-wrapper[data-model="${field.model}"]`) : null
          if (element && !element.querySelector('.v-input--error')) {
            element.classList.add('is-missing')
            element.setAttribute('data-missing-text', text)
          }
        })
      },
      /**
       * Opens the closed groups that hold a field with an error, so that the error is seen (and the field can be focused).
       * @param {Element|null} [first] the field to focus, which may be in a closed group whose error is not drawn yet
       */
      async revealInvalidFields (first) {
        await this.$nextTick()
        const opened = _.map([first, ...this.$el.querySelectorAll('.group.is-collapsed .v-input--error, .group.is-collapsed .is-missing')], revealField)
        if (_.some(opened)) {
          await this.$nextTick()
        }
      },
      /** Jumps to the first required field without a value. */
      async focusFirstMissing () {
        const field = _.find(this.outlineFields, (f) => this.isFieldMissing(f))
        if (!field) {
          return
        }
        // (a field in a closed group is shown first)
        if (revealField(this.$el.querySelector(`.field-wrapper[data-model="${field.model}"]`))) {
          await this.$nextTick()
        }
        this.jumpToField(field)
        const input = this.$el.querySelector(`.field-wrapper[data-model="${field.model}"] input, .field-wrapper[data-model="${field.model}"] textarea, .field-wrapper[data-model="${field.model}"] [contenteditable]`)
        if (input && input.focus) {
          input.focus({ preventScroll: true })
        }
      },
      /**
       * @param {Object} field
       * @returns {boolean} required and empty, shared or in the current locale
       */
      isFieldMissing (field) {
        const name = field.originalModel
        return _.includes(this.missing.shared, name) || _.includes(_.get(this.missing.byLocale, this.locale, []), name)
      },
      // a row of the menu: a field, or a block of a paragraph field
      /** The shortcut of the menu (Ctrl+J, also inside a field): opens it, or closes it when it is open. */
      toggleJump () {
        if (this.outlineEntries.length > 0) {
          this.jumpOpen = !this.jumpOpen
        }
      },
      /** @param {Object} entry a row of the menu: the menu closes and the form goes to it */
      jumpTo (entry) {
        this.jumpOpen = false
        return this.jumpToEntry(entry)
      },
      /**
       * The keys of the search box: the arrows move over the rows (Home and End stay with the text), Enter goes to the row.
       * @param {KeyboardEvent} event
       */
      onJumpKeydown (event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          this.jumpHighlight = moveHighlight(this.jumpHighlight, event.key, this.jumpRows.length)
          this.$nextTick(() => _.invoke(document.getElementById(`${this.randomId}-jump-row-${this.jumpHighlight}`), 'scrollIntoView', { block: 'nearest' }))
        } else if (event.key === 'Enter' && this.jumpHighlight >= 0 && this.jumpRows[this.jumpHighlight]) {
          event.preventDefault()
          this.jumpTo(this.jumpRows[this.jumpHighlight].entry)
        }
      },
      async jumpToEntry (entry) {
        if (entry.block === undefined) {
          return this.jumpToField(entry.field)
        }
        const wrapper = this.$el.querySelector(`.field-wrapper[data-model="${entry.field.model}"]`)
        // the blocks of the field itself (a block inside a block is one level deeper)
        const block = wrapper && wrapper.querySelectorAll('.item.nested-level-1')[entry.block]
        if (block) {
          // the fields of a block are all named _value.<field>: the one of this block, not of a block inside it
          const inner = entry.blockField && _.find(block.querySelectorAll(`.field-wrapper[data-model^="_value.${entry.blockField}"]`), (element) => element.closest('.item') === block)
          // (a field in a closed group is shown first)
          if (revealField(inner)) {
            await this.$nextTick()
          }
          // centred: the paragraph field keeps a bar of its own at the top, which would cover the top of a block
          this.scrollAndFlash(inner || block, 'center')
        } else {
          this.jumpToField(entry.field)
        }
      },
      /** @param {Object} field scrolled to and flashed */
      async jumpToField (field) {
        const elem = this.$el.querySelector(`.field-wrapper[data-model="${field.model}"]`)
        if (elem) {
          if (revealField(elem)) {
            await this.$nextTick()
          }
          this.scrollAndFlash(elem, 'start')
        }
      },
      // scrolls to where a row of the menu points, and lights it up for a moment so the eye finds it
      scrollAndFlash (element, block) {
        const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        element.scrollIntoView({ block, behavior: reduced ? 'auto' : 'smooth' })
        element.classList.remove('jump-flash')
        // a second jump to the same place plays it again
        void element.offsetWidth
        element.classList.add('jump-flash')
        // one timer for each place: an earlier jump to it must not end this one early
        clearTimeout(element.jumpFlashTimer)
        element.jumpFlashTimer = setTimeout(() => element.classList.remove('jump-flash'), JUMP_FLASH_MS)
      },
      /** @param {{target: HTMLElement}} event */
      onScroll ({ target }) {
        this.scrolledToBottom = isScrolledToBottom(target)
      },
      /** With two locales, goes to the other one. */
      toggleLocale () {
        this.selectLocale(_.find(this.resource.locales, (l) => l !== this.locale))
      },
      /**
       * @param {string} locale
       * @returns {string} its translated name
       */
      getLocaleTranslation (locale) {
        return TranslateService.localeName(locale)
      },
      /**
       * @param {Object|HTMLElement} elem a component or an element
       * @returns {number} its top, 50px above for the sticky bar
       */
      getFieldRealOffset (elem) {
        return _.get(elem, '$el.offsetTop', elem.offsetTop, 0) - 50
      },
      /** @param {Object} field from the outline: flagged focused in the schema */
      onFieldSelected (field) {
        this.schema.fields = _.map(this.schema.fields, (f) => {
          const key = `${field.field}${f.localised ? `.${TranslateService.locale}` : ''}`
          if (f.model === key) {
            const elem = document.getElementById(`${key}-${this.randomId}`)
            const top = this.getFieldRealOffset(elem)
            this.formElem.scrollTo({top})
          }
          return f
        })
      },
      back () {
        this.$emit('back')
      },
      /** @param {string} item a locale, emitted as update:locale */
      selectLocale (item) {
        this.$emit('update:locale', item)
      },
      /**
       * @param {Object} field
       * @param {*} value
       * @returns {*} a deep copy, the empty value of the field when there is none
       */
      cloneValue(field, value) {
        value = this.fieldValueOrDefault(field, value)
        if (_.isPlainObject(value)) {
          value = _.cloneDeep(value)
        }
        return value
      },
      /** Copies the record into editingRecord, every field of the schema present (per locale when localised). */
      cloneEditingRecord () {
        const dummy = {}
        _.each(this.resource.schema, (field) => {
          if (this.resource.locales && (field.localised || _.isUndefined(field.localised))) {
            _.each(this.resource.locales, (locale) => {
              const fieldName = `${field.field}.${locale}`
              const value = _.get(this.record, fieldName)
              _.set(dummy, fieldName, this.cloneValue(field, value))
            })
          } else {
            const fieldName = field.field
            const value = _.get(this.record, fieldName)
            _.set(dummy, fieldName, this.cloneValue(field, value))
          }
        })
        this.editingRecord = _.cloneDeep(dummy)
        this.editingRecord._id = this.record._id
        this.removeDirtyFlags()
        this.resetSnapshot()
      },
      /** Asks for confirmation with the name of the record. */
      deleteRecord () {
        const name = getRecordLabel(this.resource, this.record, this.locale) || this.editingRecord._id
        window.DialogService.show({
          event: 'deleteRecord',
          destructive: true,
          title: TranslateService.get('TL_DELETE_RECORD_TITLE', { name: name || TranslateService.get('TL_NEW_RECORD_CRUMB') }),
          message: `${TranslateService.get('TL_ARE_YOU_SURE_TO_DELETE')} ${TranslateService.get('TL_ARE_YOU_SURE_TO_DELETE_IRREVERSIBLE')}`,
          confirm: TranslateService.get('TL_DELETE'),
          cancel: TranslateService.get('TL_CANCEL'),
          callback: () => this.doDeleteRecord()
        })
      },
      /** A record not saved yet is just dropped. */
      async doDeleteRecord () {
        if (_.isUndefined(this.editingRecord._id)) {
          this.editingRecord = {}
          this.$emit('update:record', null)
        } else {
          this.$loading.start('delete-record')
          try {
            await RequestService.delete(`../api/${this.resource.title}/${this.editingRecord._id}`)
            this.notify(recordMessage('DELETED', this.resource, this.editingRecord, this.locale), 'success')
            host.emit('record:removed', { resource: this.resource.title, id: this.editingRecord._id })
            this.$emit('updateRecordList', null)
          } catch (error) {
            console.error('Error happen during deleteRecord:', error)
            this.manageError(error, 'delete', this.editingRecord)
          }
          this.$loading.stop('delete-record')
        }
      },
      /** Validates the form and collects the required fields left empty. */
      async checkFormValid () {
        let formValid
        try {
          this.$refs.vfg.resetValidation()
          formValid = _.get(await this.$refs.vfg.validate(), 'valid', false)
        } catch (error) {
          console.error('Not valid: ', error)
          formValid = false
        }
        const firstInvalidField = _.find(this.$refs.vfg.items, (input) => !input.isValid)
        if (!_.isUndefined(firstInvalidField)) {
          console.error('First invalid field', firstInvalidField)
          formValid = false
          const invalidElement = document.querySelector(`#${firstInvalidField.id}`)
          await this.revealInvalidFields(invalidElement)
          invalidElement.focus()
        } else {
          _.find(document.querySelectorAll('.wysiwyg-wrapper[data-val="<p></p>"]'), (elem) => {
            if (elem.innerText && elem.innerText.length > 0) {
              const element = elem.parentElement.querySelector('.tiptap.ProseMirror')
              log.debug('first invalid WYSIWYG field', element)
              element.focus()
              formValid = false
              return true
            }
          })
        }
        this.formValid = formValid
        this.canCreateUpdate = true
        if (!this.formValid) {
          // const notificationText = this.editingRecord._id ? TranslateService.get('TL_ERROR_CREATING_RECORD_ID', { id: this.editingRecord._id }) : TranslateService.get('TL_ERROR_CREATING_RECORD')
          const notificationText = this.invalidSummary || TranslateService.get('TL_FORM_IS_INVALID')
          this.invalidSummary = ''
          this.notify(notificationText, 'error')
          this.blinkButton = true
          clearTimeout(this.blinkButtonTimeout)
          this.blinkButtonTimeout = setTimeout(() => {
            this.blinkButton = false
          }, 500)
        }
      },
      /**
       * @param {Object} field
       * @param {*} value
       * @returns {*} the value, or the empty value of its input type
       */
      fieldValueOrDefault (field, value) {
        if (field.input === 'pillbox') {
          return value || []
        } else if (field.input === 'json') {
          return value || {}
        }
        return value
      },
      /**
       * @param {Object} originalData the record as loaded
       * @param {Object} data the record edited
       * @param {Object} field
       * @returns {Object} the value per locale, the original one where the form is not valid
       */
      getLocalisedFieldValue (originalData, data, field) {
        const fieldValue = {}
        _.each(this.resource.locales, (locale) => {
          if (!this.formValid) {
            // return this.handleFormNotValid(`getLocalisedFieldValue - ${locale}`)
            return
          }
          const fieldName = `${field.field}.${locale}`
          const value = this.fieldValueOrDefault(field, _.get(data, fieldName))
          if (field.required &&
            (_.isUndefined(value) || (field.input === 'string' && value.length === 0))) {
            if (locale !== this.locale) {
              this.selectLocale(locale)
            }
            this.formValid = false
            this.canCreateUpdate = true
            this.$nextTick(async () => {
              await this.checkFormValid()
            })
            log.debug('required field empty', locale, field, fieldName, fieldValue, value)
            // this.notify(TranslateService.get('TL_REQUIRED_FIELD_EMPTY', 'error'))
            return
          }
          if (_.includes(this.fileInputTypes, field.input) || !_.isEqual(value, _.get(originalData, fieldName))) {
            _.set(fieldValue, fieldName, _.isUndefined(value) ? null : value)
          }
        })
        return fieldValue
      },
      /** @param {*} msg logged */
      handleFormNotValid (msg) {
        log.debug('form not valid', msg)
      },
      /**
       * @param {Object} originalData the record as loaded
       * @param {Object} data the record edited
       * @param {Object} field
       * @returns {*} the value to send, per locale when the field is localised
       */
      getFieldValue(originalData, data, field) {
        const isLocalised = this.resource.locales && (field.localised || _.isUndefined(field.localised))
        if (isLocalised) {
          return this.getLocalisedFieldValue(originalData, data, field)
        }
        const fieldName = field.field
        const value = this.fieldValueOrDefault(field, _.get(data, fieldName))
        const originalValue = _.get(originalData, fieldName)
        if (!_.isEqual(value, originalValue)) {
          const obj = {}
          _.set(obj, fieldName, _.isUndefined(value) ? null : value)
          return obj
        }
        if (field.required &&
          (_.isUndefined(value) || (field.input === 'string' && value.length === 0))) {
          this.formValid = false
          this.canCreateUpdate = true
          this.$nextTick(async () => {
            await this.checkFormValid()
          })
          log.debug('required field empty', field, this.formValid)
          return
        }
        return value
      },
      /**
       * @param {Object} resource
       * @param {Object} record
       * @returns {Array<Object>} the attachments at the attachment fields of the resource, paragraphs included
       */
      getAttachmentsOfRecord(resource, record) {
        let attachments = []
        let attachmentsPaths = []
        const fieldsRegExpressions = _.keys(_.get(resource, '_attachmentFields', {}))
        const locales = _.get(resource, 'locales', [])
        const content = flatten(record)
        for (const key in content) {
          if (_.endsWith(key, '_isAttachment')) {
            let filePath = key.slice(0, -1 * '._isAttachment'.length)
            let attachment = _.cloneDeep(_.get(record, filePath, false))
            if (attachment) {
              let hasFoundAny = false
              _.each(fieldsRegExpressions, fieldsRegExpression => {
                const regex = new RegExp(fieldsRegExpression, 'g')
                const match = regex.exec(filePath)
                if (match !== null) {
                  hasFoundAny = true
                  const pathToCleanIndex = match.length - 1
                  const pathToClean = _.get(match, pathToCleanIndex, '')
                  let _name = filePath.slice(0, -1 * pathToClean.length)
                  let _index
                  const subPath = _.split(pathToClean, '.')
                  if (subPath.length === 3) {
                    _index = _.get(subPath, 2, 0)
                    const locale =  _.get(subPath, 1, false)
                    if (locale) {
                      _name = `${_name}.${locale}`
                    }
                  } else {
                    _index = _.get(subPath, 1, 0)
                  }
                  attachment._name = `${_name}`
                  _.set(attachment, '_payload.index', _index)
                  attachment = _.omit(attachment, ['_createdAt', '_updatedAt', '_md5sum'])
                  _.each(locales, locale => {
                    if (_.endsWith(_name, `.${locale}`)) {
                      _name = _name.slice(0, -1 * `.${locale}`)
                    }
                  })
                  attachmentsPaths.push(_name)
                }
                if (hasFoundAny) {
                  return false
                }
              })
              if (!hasFoundAny) {
                _.each(locales, locale => {
                  if (_.endsWith(filePath, `.${locale}`)) {
                    filePath = filePath.slice(0, -1 * `.${locale}`)
                  }
                })
                attachmentsPaths.push(filePath)
              }
              attachments.push(attachment)
            }
          }
        }
        attachmentsPaths = _.compact(_.uniq(attachmentsPaths))
        attachments = _.compact(attachments)
        return {attachments, attachmentsPaths}
      },
      /**
       * @param {Array<Object>} attachments
       * @param {boolean} removeDuplicate
       * @returns {Array<Object>} without the _isAttachment flag
       */
      cleanAttachments(attachments, removeDuplicate = true) {
        attachments = _.map(attachments, attachment => {
          delete attachment._isAttachment
          return attachment
        })
        if (removeDuplicate) {
          attachments = _.compact(_.uniqBy(attachments, attachment => attachment._id))
        }
        return attachments
      },

      /**
       * @param {Object} oldA
       * @param {Object} newA
       * @returns {boolean} name, position, order (the file was dragged to another place) or crop changed
       */
      attachmentWasUpdated(oldA, newA) {
        if (_.get(newA, '_name', '?') !== _.get(oldA, '_name', '?') ||
          _.get(newA, '_payload.index', 0) !== _.get(oldA, '_payload.index', 0) ||
          _.get(newA, 'order') !== _.get(oldA, 'order') ||
          _.get(newA, 'cropOptions.updated', false) ||
          _.get(newA, 'imageMap.updated', false)) {
          return true
        }
        return false
      },
      /**
       * @param {Object} resource
       * @param {Object} originalRecord
       * @param {Object} record
       * @returns {Object} the fields to send and the attachments to add, update and delete
       */
      getDataToUpload(resource, originalRecord, record) {
        // log.debug(originalRecord)
        const originalRecordAttachments = this.getAttachmentsOfRecord(resource, originalRecord)
        const recordAttachments = this.getAttachmentsOfRecord(resource, record)
        const uploadObject = _.cloneDeep(record)
        _.each(recordAttachments.attachmentsPaths, attachmentsPath => {
          _.unset(uploadObject, attachmentsPath)
        })
        let deletedAttachments = []
        let updatedAttachments = []
        let untouchedAttachments = []
        let newAttachments = _.filter(recordAttachments.attachments, attachment => !attachment._id)
        recordAttachments.attachments = _.filter(recordAttachments.attachments, attachment => attachment._id)
        _.each(originalRecordAttachments.attachments, attachment => {
          const hasAttachment = _.find(recordAttachments.attachments, {_id: attachment._id})
          if (!hasAttachment) {
            deletedAttachments.push(attachment)
          } else if (this.attachmentWasUpdated(attachment, hasAttachment)) {
            updatedAttachments.push(hasAttachment)
          } else {
            untouchedAttachments.push(attachment)
          }
        })
        deletedAttachments = this.cleanAttachments(deletedAttachments)
        updatedAttachments = this.cleanAttachments(updatedAttachments)
        untouchedAttachments = this.cleanAttachments(untouchedAttachments)
        newAttachments = this.cleanAttachments(newAttachments, false)
        return {
          originalAttachments: originalRecordAttachments.attachments,
          deletedAttachments: deletedAttachments,
          updatedAttachments: updatedAttachments,
          untouchedAttachments: untouchedAttachments,
          newAttachments: newAttachments,
          uploadObject: uploadObject
        }
      },
      /** Validates every locale in turn, the form shown in each. */
      async checkFormValidForAllLocales() {
        await pAll(_.map(this.resource.locales, locale => {
          return async () => {
            this.selectLocale(locale)
            await this.$nextTick()
            await this.checkFormValid()
            if (!this.formValid) {
              throw new Error(`Record is not valid for locale ${locale}`)
            }
          }
        }), {concurrency: 1})
      },
      // "3 required fields missing in zhCN": summary of the first locale that has errors (or of the shared fields)
      // The names of the fields, so that the message says which ones (the first three, then "...")
      namesOfFields (fieldNames) {
        const names = _.map(fieldNames, (name) => {
          const field = _.find(this.resource.schema, { field: name })
          return field && field.label ? TranslateService.get(field.label) : name
        })
        return _.size(names) > 3 ? `${_.take(names, 3).join(', ')}...` : names.join(', ')
      },
      /** @returns {string} the message naming the missing fields and the locales short of them */
      summariseMissing () {
        const firstLocale = _.find(this.resource.locales, (locale) => _.has(this.missing.byLocale, locale))
        if (firstLocale) {
          const fields = this.missing.byLocale[firstLocale]
          const text = TranslateService.get(fields.length === 1 ? 'TL_REQUIRED_MISSING_IN_LOCALE_ONE' : 'TL_REQUIRED_MISSING_IN_LOCALE_MANY', { num: fields.length, locale: TranslateService.localeName(firstLocale) })
          return `${text}: ${this.namesOfFields(fields)}`
        }
        const fields = this.missing.shared
        return fields.length > 0 ? `${TranslateService.get(fields.length === 1 ? 'TL_REQUIRED_MISSING_ONE' : 'TL_REQUIRED_MISSING_MANY', { num: fields.length })}: ${this.namesOfFields(fields)}` : ''
      },
      /** Validates, then creates or updates the record with its attachments. */
      async createUpdateClicked () {
        if (!this.canCreateUpdate)  {
          return
        }
        this.attempted = true
        // switches nobody touched show "No": save them as false, not as nothing
        unsetSwitchesToFalse(this.editingRecord, this.resource)
        this.$nextTick(this.markMissingFields)
        if (this.missing.total > 0) {
          this.invalidSummary = this.summariseMissing()
          const firstLocale = _.find(this.resource.locales, (locale) => _.has(this.missing.byLocale, locale))
          if (firstLocale && firstLocale !== this.locale) {
            this.selectLocale(firstLocale)
            await this.$nextTick()
          }
        }
        try {
          if (_.get(this.resource, 'locales.length', 0) > 1) {
            log.debug('will check data for all locales')
            const currentLocale = this.locale
            await this.checkFormValidForAllLocales()
            this.selectLocale(currentLocale)
          } else {
            log.debug('will check data')
            await this.$nextTick()
            await this.checkFormValid()
            if (!this.formValid) {
              throw new Error(`Record is not valid`)
            }
          }
        } catch (error) {
          console.error(error)
          this.formValid = false
          return
        }
        // The rules of the fields catch most empty required fields, but not every type has one (dates, times...):
        // this is the check that covers them all.
        if (this.missing.total > 0) {
          this.formValid = false
          this.canCreateUpdate = true
          this.notify(this.invalidSummary || this.summariseMissing(), 'error')
          this.invalidSummary = ''
          await this.$nextTick()
          this.markMissingFields()
          this.focusFirstMissing()
          return
        }
        this.canCreateUpdate = false
        const dataToUpload = this.getDataToUpload(this.resource, _.cloneDeep(this.record), this.editingRecord)
        const newAttachments = dataToUpload.newAttachments
        const updatedAttachments = dataToUpload.updatedAttachments
        const deletedAttachments = dataToUpload.deletedAttachments
        if (!this.formValid) {
          this.canCreateUpdate = true
          return this.handleFormNotValid('createUpdateClicked 2')
        }
        _.each(newAttachments, (attachment) => {
          log.debug(`Will clean field ${attachment.field} from uploadObject`)
          _.set(dataToUpload.uploadObject, attachment.field, undefined)
        })
        if (_.isUndefined(this.editingRecord._id)) {
          await this.createRecord(dataToUpload.uploadObject, newAttachments)
        } else {
          await this.updateRecord(dataToUpload.uploadObject, newAttachments, updatedAttachments, deletedAttachments)
        }
        window.DialogService.send(false)
        this.canCreateUpdate = true
      },
      /**
       * @param {Object} uploadObject
       * @param {Array<Object>} newAttachments uploaded once the record exists
       */
      async createRecord (uploadObject, newAttachments) {
        this.$loading.start('create-record')
        try {
          const data = await RequestService.post(`../api/${this.resource.title}`, uploadObject)
          await this.uploadAttachments(data._id, newAttachments)
          this.notify(recordMessage('CREATED', this.resource, { ...this.editingRecord, _id: data._id }, this.locale), 'success')
          host.emit('record:saved', { resource: this.resource.title, record: data, created: true })
          this.$emit('updateRecordList', data)
        } catch (error) {
          console.error('Error happen during createRecord:', error)
          this.manageError(error, 'create')
        }
        this.$loading.stop('create-record')
      },
      /**
       * @param {Array<Object>} newAttachments
       * @param {Array<Object>} updatedAttachments
       * @param {Array<Object>} deletedAttachments removed first
       */
      async handleAttachmentsUpdates(newAttachments, updatedAttachments, deletedAttachments) {
        if (deletedAttachments.length > 0) {
          await this.removeAttachments(this.editingRecord._id, deletedAttachments)
        }
        if (newAttachments.length > 0) {
          await this.uploadAttachments(this.editingRecord._id, newAttachments)
        }
        if (updatedAttachments.length > 0) {
          await this.updateAttachments(this.editingRecord._id, updatedAttachments)
        }
      },
      /**
       * @param {Object} uploadObject
       * @param {Array<Object>} newAttachments
       * @param {Array<Object>} updatedAttachments
       * @param {Array<Object>} deletedAttachments
       */
      async updateRecord (uploadObject, newAttachments, updatedAttachments, deletedAttachments) {
        this.$loading.start('update-record')
        try {
          const url = `../api/${this.resource.title}/${this.editingRecord._id}`
          // The record first, then its files (as when creating): a save the server refuses must not leave files
          // uploaded, or fixing the record and saving again would upload them a second time.
          if (!_.isEmpty(uploadObject)) {
            await RequestService.put(url, uploadObject)
          }
          await this.handleAttachmentsUpdates(newAttachments, updatedAttachments, deletedAttachments)
          // read the record back: the files change it
          const data = await RequestService.get(url)
          this.notify(recordMessage('SAVED', this.resource, this.editingRecord, this.locale), 'success')
          host.emit('record:saved', { resource: this.resource.title, record: data, created: false })
          this.$emit('updateRecordList', data)
        } catch (error) {
          console.error('Error happen during updateRecord:', error)
          this.manageError(error, 'update', this.editingRecord)
        }
        this.$loading.stop('update-record')
      },
      /**
       * @param {Object} attachment
       * @returns {string} the model path of its field, the locale first when localised
       */
      getAttachmentModel (attachment) {
        const modelParts = []
        if (_.get(attachment, '_fields.locale', false)) {
          modelParts.push(attachment._fields.locale)
        }
        modelParts.push(attachment._name)
        return _.join(modelParts, '.')
      },
      /**
       * @param {*} value
       * @param {string} model the field path; nothing without one
       */
      updateFields (value, model) {
        if (!model || _.isUndefined(model)) {
          return
        }
        _.set(this.editingRecord, model, value)
      },
      /**
       * @param {*} value
       * @param {string} model the field path
       */
      onModelUpdated (value, model) {
        this.updateFields(value, model)
        this.checkDirty()
      },
      /**
       * @param {string} model a field path
       * @returns {boolean} whether its input takes files
       */
      isAttachmentField (model) {
        const foundField = _.get(_.find(_.get(this.schema, 'fields', []), {model: model}), 'originalModel', false)
        const fieldType = _.get(_.find(this.resource.schema, {field: foundField}), 'input', false)
        return _.includes(this.fileInputTypes, fieldType)
      },
      /** Takes the record as it is as the clean state. */
      resetSnapshot () {
        this.snapshot = createSnapshot(this.editingRecord)
        this.attempted = false
        this.checkDirty()
      },
      /** Compares the record with the snapshot; the dirty locales and fields follow. */
      checkDirty () {
        if (!this.snapshot) {
          return
        }
        this.dirtyInfo = changedParts(this.snapshot, this.editingRecord, this.resource)
        if (this.settling) {
          const defaults = _.difference(this.dirtyInfo.paths, this.settleBase)
          if (defaults.length > 0) {
            absorbPaths(this.snapshot, this.editingRecord, defaults)
            this.dirtyInfo = changedParts(this.snapshot, this.editingRecord, this.resource)
          }
        }
        const formIsDirty = isDirty(this.snapshot, this.editingRecord)
        _.each(this.originalFieldList, (field) => {
          field.labelClasses = _.includes(this.dirtyInfo.paths, field.model) ? 'dirty' : ''
        })
        if (formIsDirty !== this.isDirty) {
          this.isDirty = formIsDirty
          window.DialogService.send(formIsDirty)
        }
      },
      removeDirtyFlags () {
        _.each(this.originalFieldList, (field) => {
          delete field.labelClasses
        })
      },
      /**
       * @param {Object} schema
       * @returns {{key: string, locale?: string}} the field name and the locale of the model path
       */
      getKeyLocale (schema) {
        const options = {}
        const list = schema.model.split('.')
        if (schema.localised) {
          options.locale = list.pop()
        }
        options.key = list.join('.')
        return options
      }
    }
  }
</script>
