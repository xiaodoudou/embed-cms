<template>
  <v-card v-if="record" elevation="0" class="record-editor" :class="{frozen:!record._local, 'full-width': resource && resource.maxCount === 1}">
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
        <v-menu v-if="outlineFields.length > 6" location="bottom end">
          <template #activator="{ props }">
            <v-btn v-bind="props" elevation="0" variant="text" class="jump-to" :aria-label="$filters.translate('TL_JUMP_TO')" :title="$filters.translate('TL_JUMP_TO')">
              <v-icon icon="$formatListBulleted" />
            </v-btn>
          </template>
          <v-list density="compact" class="outline-list">
            <v-list-item v-for="f in outlineFields" :key="f.model" :title="f.label" @click="jumpToField(f)">
              <template v-if="isFieldMissing(f)" #append>
                <v-icon size="small" color="error" icon="$alertBoxOutline" :aria-label="$filters.translate('TL_REQUIRED')" />
              </template>
            </v-list-item>
          </v-list>
        </v-menu>
        <v-btn v-if="isDirty" elevation="0" variant="outlined" class="discard" @click="discardChanges">{{ $filters.translate('TL_DISCARD') }}</v-btn>
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
  import AbstractEditorView from './AbstractEditorView'
  import Notification from '@m/Notification'
  import NotificationsService from '@s/NotificationsService'
  import TopBarLocaleList from '@c/TopBarLocaleList.vue'
  import RequestService from '@s/RequestService'
  import { getRecordLabel, recordMessage } from '@u/recordLabel'
  import { createSnapshot, changedParts, isDirty, missingRequired, absorbPaths, unsetSwitchesToFalse } from '@u/dirtyTracker'

  // Fields fill in their own defaults when they appear. For this long after a form (re)renders, and until the user
  // touches it, such changes are not edits (see settle() below).
  const SETTLE_MS = 700

  export default {
    components: {TopBarLocaleList},
    mixins: [AbstractEditorView, Notification],
    props: {
      resource: { type: Object, default: () => ({}) },
      record: { type: Object, default: () => ({}) },
      locale: { type: String, default: () => 'enUS' },
      userLocale: { type: String, default: () => 'enUS' }
    },
    data () {
      return {
        canCreateUpdate: true,
        blinkButton: false,
        blinkButtonTimeout: false,
        scrolledToBottom: false,
        randomId: Math.random(),
        formValid: false,
        isDirty: false,
        formKey: 0,
        snapshot: {},
        settling: false,
        settleBase: [],
        dirtyInfo: { locales: [], shared: [], paths: [] },
        attempted: false,
        invalidSummary: '',
        fileInputTypes: ['file', 'img', 'image', 'imageView', 'attachmentView'],
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
      outlineFields () {
        return _.uniqBy(_.filter(_.get(this.schema, 'fields', []), (f) => f.label && f.originalModel), 'originalModel')
      }
    },
    watch: {
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
      getActionText() {
        return TranslateService.get(this.editingRecord._id ? 'TL_SAVE' : 'TL_CREATE')
      },
      onBeforeUnload (event) {
        if (this.isDirty) {
          event.preventDefault()
          event.returnValue = ''
        }
      },
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
        _.each(_.get(this.schema, 'fields', []), (field) => {
          const element = this.isFieldMissing(field) ? this.$el.querySelector(`.field-wrapper[data-model="${field.model}"]`) : null
          if (element && !element.querySelector('.v-input--error')) {
            element.classList.add('is-missing')
            element.setAttribute('data-missing-text', text)
          }
        })
      },
      focusFirstMissing () {
        const field = _.find(this.outlineFields, (f) => this.isFieldMissing(f))
        if (!field) {
          return
        }
        this.jumpToField(field)
        const input = this.$el.querySelector(`.field-wrapper[data-model="${field.model}"] input, .field-wrapper[data-model="${field.model}"] textarea, .field-wrapper[data-model="${field.model}"] [contenteditable]`)
        if (input && input.focus) {
          input.focus({ preventScroll: true })
        }
      },
      isFieldMissing (field) {
        const name = field.originalModel
        return _.includes(this.missing.shared, name) || _.includes(_.get(this.missing.byLocale, this.locale, []), name)
      },
      jumpToField (field) {
        const elem = this.$el.querySelector(`.field-wrapper[data-model="${field.model}"]`)
        if (elem) {
          const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
          elem.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
        }
      },
      onScroll ({ target: { scrollTop, clientHeight, scrollHeight } }) {
        this.scrolledToBottom = scrollTop + clientHeight >= scrollHeight - 50
      },
      toggleLocale () {
        this.selectLocale(_.find(this.resource.locales, (l) => l !== this.locale))
      },
      getLocaleTranslation (locale) {
        return TranslateService.get('TL_' + locale.toUpperCase())
      },
      getFieldRealOffset (elem) {
        return _.get(elem, '$el.offsetTop', elem.offsetTop, 0) - 50
      },
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
      selectLocale (item) {
        this.$emit('update:locale', item)
      },
      cloneValue(field, value) {
        value = this.fieldValueOrDefault(field, value)
        if (_.isPlainObject(value)) {
          value = _.cloneDeep(value)
        }
        return value
      },
      cloneEditingRecord () {
        const dummy = {}
        _.each(this.resource.schema, (field) => {
          if (this.resource.locales && (field.localised || _.isUndefined(field.localised))) {
            _.each(this.resource.locales, (locale) => {
              const fieldName = `${field.field}.${locale}`
              let value = _.get(this.record, fieldName)
              _.set(dummy, fieldName, this.cloneValue(field, value))
            })
          } else {
            const fieldName = field.field
            let value = _.get(this.record, fieldName)
            _.set(dummy, fieldName, this.cloneValue(field, value))
          }
        })
        this.editingRecord = _.cloneDeep(dummy)
        this.editingRecord._id = this.record._id
        this.removeDirtyFlags()
        this.resetSnapshot()
      },
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
      async doDeleteRecord () {
        if (_.isUndefined(this.editingRecord._id)) {
          this.editingRecord = {}
          this.$emit('update:record', null)
        } else {
          this.$loading.start('delete-record')
          try {
            await RequestService.delete(`../api/${this.resource.title}/${this.editingRecord._id}`)
            this.notify(recordMessage('DELETED', this.resource, this.editingRecord, this.locale), 'success')
            this.$emit('updateRecordList', null)
          } catch (error) {
            console.error('Error happen during deleteRecord:', error)
            this.manageError(error, 'delete', this.editingRecord)
          }
          this.$loading.stop('delete-record')
        }
      },
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
          document.querySelector(`#${firstInvalidField.id}`).focus()
        } else {
          _.find(document.querySelectorAll('.wysiwyg-wrapper[data-val="<p></p>"]'), (elem) => {
            if (elem.innerText && elem.innerText.length > 0) {
              const element = elem.parentElement.querySelector('.tiptap.ProseMirror')
              console.warn('first invalid WYSIWYG field', element)
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
      fieldValueOrDefault (field, value) {
        if (field.input === 'pillbox') {
          return value || []
        } else if (field.input === 'json') {
          return value || {}
        }
        return value
      },
      getLocalisedFieldValue (originalData, data, field) {
        let fieldValue = {}
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
            this.$forceUpdate()
            this.$nextTick(async () => {
              await this.checkFormValid()
            })
            console.error('required field empty 1', locale, field, fieldName, fieldValue, value)
            // this.notify(TranslateService.get('TL_REQUIRED_FIELD_EMPTY', 'error'))
            return
          }
          if (_.includes(this.fileInputTypes, field.input) || !_.isEqual(value, _.get(originalData, fieldName))) {
            _.set(fieldValue, fieldName, _.isUndefined(value) ? null : value)
          }
        })
        return fieldValue
      },
      handleFormNotValid (msg) {
        log.debug('form not valid', msg)
      },
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
          this.$forceUpdate()
          this.$nextTick(async () => {
            await this.checkFormValid()
          })
          console.error('required field empty 2', field, this.formValid)
          return
        }
        return value
      },
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
                let match = regex.exec(filePath)
                if (match !== null) {
                  hasFoundAny = true
                  const pathToCleanIndex = match.length - 1
                  const pathToClean = _.get(match, pathToCleanIndex, '')
                  let _name = filePath.slice(0, -1 * pathToClean.length)
                  let _index
                  let subPath = _.split(pathToClean, '.')
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

      attachmentWasUpdated(oldA, newA) {
        if (_.get(newA, '_name', '?') !== _.get(oldA, '_name', '?') ||
          _.get(newA, '_payload.index', 0) !== _.get(oldA, '_payload.index', 0) ||
          _.get(newA, 'cropOptions.updated', false)) {
          return true
        }
        return false
      },
      getDataToUpload(resource, originalRecord, record) {
        // log.debug(originalRecord)
        let originalRecordAttachments = this.getAttachmentsOfRecord(resource, originalRecord)
        let recordAttachments = this.getAttachmentsOfRecord(resource, record)
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
      summariseMissing () {
        const firstLocale = _.find(this.resource.locales, (locale) => _.has(this.missing.byLocale, locale))
        if (firstLocale) {
          const fields = this.missing.byLocale[firstLocale]
          const text = TranslateService.get(fields.length === 1 ? 'TL_REQUIRED_MISSING_IN_LOCALE_ONE' : 'TL_REQUIRED_MISSING_IN_LOCALE_MANY', { num: fields.length, locale: TranslateService.get('TL_' + firstLocale.toUpperCase()) })
          return `${text}: ${this.namesOfFields(fields)}`
        }
        const fields = this.missing.shared
        return fields.length > 0 ? `${TranslateService.get(fields.length === 1 ? 'TL_REQUIRED_MISSING_ONE' : 'TL_REQUIRED_MISSING_MANY', { num: fields.length })}: ${this.namesOfFields(fields)}` : ''
      },
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
      async createRecord (uploadObject, newAttachments) {
        this.$loading.start('create-record')
        try {
          let data = await RequestService.post(`../api/${this.resource.title}`, uploadObject)
          await this.uploadAttachments(data._id, newAttachments)
          this.notify(recordMessage('CREATED', this.resource, { ...this.editingRecord, _id: data._id }, this.locale), 'success')
          this.$emit('updateRecordList', data)
        } catch (error) {
          console.error('Error happen during createRecord:', error)
          this.manageError(error, 'create')
        }
        this.$loading.stop('create-record')
      },
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
          this.$emit('updateRecordList', data)
        } catch (error) {
          console.error('Error happen during updateRecord:', error)
          this.manageError(error, 'update', this.editingRecord)
        }
        this.$loading.stop('update-record')
      },
      getAttachmentModel (attachment) {
        const modelParts = []
        if (_.get(attachment, '_fields.locale', false)) {
          modelParts.push(attachment._fields.locale)
        }
        modelParts.push(attachment._name)
        return _.join(modelParts, '.')
      },
      getUpdatedAttachments (attachments) {
        return _.filter(attachments, (attachment) => _.get(attachment, 'cropOptions.updated', false))
      },
      updateFields (value, model) {
        if (!model || _.isUndefined(model)) {
          return
        }
        _.set(this.editingRecord, model, value)
      },
      onModelUpdated (value, model) {
        this.updateFields(value, model)
        this.checkDirty()
      },
      isAttachmentField (model) {
        const foundField = _.get(_.find(_.get(this.schema, 'fields', []), {model: model}), 'originalModel', false)
        const fieldType = _.get(_.find(this.resource.schema, {field: foundField}), 'input', false)
        return _.includes(this.fileInputTypes, fieldType)
      },
      resetSnapshot () {
        this.snapshot = createSnapshot(this.editingRecord)
        this.attempted = false
        this.checkDirty()
      },
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
