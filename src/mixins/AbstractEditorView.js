import { log } from '@u/log'
import _ from 'lodash'
import TranslateServiceLib from '@s/TranslateService'
import SchemaService from '@s/SchemaService'
import Notification from '@m/Notification'
import RequestService from '@s/RequestService'
import UploadService from '@s/UploadService'
import pAll from 'p-all'

const TranslateService = window.TranslateService || TranslateServiceLib

export default {
  mixins: [Notification],
  methods: {
    /**
     * @param {string} id the record
     * @param {Array<Object>} attachments uploaded one by one; the failures are reported together
     */
    async uploadAttachments (id, attachments) {
      this.$loading.start('uploadAttachments')
      const url = `../api/${this.resource.title}/${id}/attachments`
      const failed = []
      try {
        await pAll(_.map(attachments, attachment => {
          return async () => {
            const data = new FormData()
            data.append(attachment.field, attachment.file)
            if (_.get(attachment, '_fields.locale', false)) {
              data.append('locale', attachment._fields.locale)
            }
            if (attachment._filename) {
              data.append('_filename', attachment._filename)
            }
            if (_.get(attachment, 'cropOptions', false)) {
              log.debug('detected cropOptions, will add it to the request')
              data.append('cropOptions', JSON.stringify(attachment.cropOptions))
            }
            if (_.get(attachment, 'imageMap', false)) {
              data.append('imageMap', JSON.stringify(attachment.imageMap))
            }
            if (_.get(attachment, 'orderUpdated', false) && _.get(attachment, 'order', false)) {
              log.debug('detected orderUpdated, will add it to the request')
              data.append('order', attachment.order)
            }
            // Tracked per file (progress, error, retry); resolves to false instead of throwing
            const ok = await UploadService.upload(url, data, {
              name: _.get(attachment, 'file.name', attachment._filename || attachment.field),
              size: _.get(attachment, 'file.size', 0),
              recordId: id,
              resource: this.resource.title
            })
            if (!ok) {
              failed.push(attachment)
            }
          }}), {concurrency: 5})
        if (failed.length > 0) {
          this.notify(TranslateService.get('TL_UPLOADS_FAILED', { num: failed.length }), 'error')
        }
      } catch (error) {
        console.error('Error happen during uploadAttachments:', error)
      }
      this.$loading.stop('uploadAttachments')
    },
    /**
     * @param {Array<Object>} attachments
     * @param {Array<string>} fieldsToKeep
     * @returns {Array<Object>}
     */
    formatAttachments(attachments, fieldsToKeep = ['_id', 'cropOptions', 'imageMap', 'order', '_name']) {
      return _.map(attachments, (attachment)=> _.pick(attachment, fieldsToKeep))
    },
    /**
     * @param {string} id the record
     * @param {Array<Object>} attachments
     */
    async updateAttachments (id, attachments) {
      this.$loading.start('updateAttachments')
      try {
        await RequestService.put(`../api/${this.resource.title}/${id}/attachments`, this.formatAttachments(attachments))
      } catch (error) {
        console.error('Error happen during updateAttachments:', error)
      }
      this.$loading.stop('updateAttachments')
    },
    /**
     * @param {string} id the record
     * @param {Array<Object>} attachments
     */
    async removeAttachments (id, attachments) {
      this.$loading.start('remove-attachments')
      try {
        await RequestService.delete(`../api/${this.resource.title}/${id}/attachments`, this.formatAttachments(attachments, ['_id']))
      } catch (error) {
        console.error('Error happen during removeAttachments:', error)
      }
      this.$loading.stop('remove-attachments')
    },
    /**
     * @param {string} type create, update or delete
     * @returns {string} the translated "error on record" message
     */
    recordErrorMessage (type) {
      return TranslateService.get(`TL_ERROR_ON_RECORD_${_.toUpper(type)}`)
    },
    /**
     * @param {Error|Object} error a 400 adds its message
     * @param {string} type create, update or delete
     * @param {Object} record
     */
    manageError (error, type, record) {
      let errorMessage = this.recordErrorMessage(type)
      if (_.get(error, 'code', 500) === 400 && _.get(error, 'message', false)) {
        errorMessage += `: ${_.get(error, 'message', TranslateService.get('TL_UNKNOWN_ERROR'))}`
      }
      console.error(errorMessage, record)
      this.notify(errorMessage, 'error')
    },
    /**
     * @param {Object} schema
     * @returns {Object} the schema with its fields placed on layout.lines; as it is without a layout
     */
    formatSchemaLayout (schema) {
      if (!_.get(schema, 'layout.lines', false)) {
        return schema
      }
      const alreadyPlacedFields = []
      _.each(schema.layout.lines, (line) => {
        line.slots = line.slots || _.get(line, 'fields.length', 1)
        _.each(line.fields, (field) => {
          field.schema = _.find(schema.fields, {model: field.model})
          if (_.isUndefined(field.schema)) {
            field.schema = _.find(schema.fields, {originalModel: field.model})
          }
          if (_.isUndefined(field.schema)) {
            console.error(`Couldn't find schema for field ${field.model}`)
          } else {
            alreadyPlacedFields.push(field.model)
          }
        })
      })
      _.each(schema.fields, (field) => {
        if (!_.includes(alreadyPlacedFields, field.model) && !_.includes(alreadyPlacedFields, field.originalModel)) {
          console.warn(`not placed field ${field.model} in layout, placing at the end`)
          schema.layout.lines.push({fields: [{model: field.model, schema: field}]})
        } else {
          log.debug(`field ${field.model} already placed in layout, skipping`)
        }
      })
      return schema
    },
    /** Builds the form schema of the resource; the fields are disabled on a record that is not local. */
    async updateSchema () {
      try {
        const disabled = !(this.record && this.record._local)
        this.$loading.start('loading-schema')
        const fields = SchemaService.getSchemaFields(this.resource.schema, this.resource, this.locale || this.userLocale, this.userLocale, disabled, this.resource.extraSources)
        const groups = SchemaService.getNestedGroups(this.resource, fields, 0)
        this.schema = this.formatSchemaLayout({
          fields: groups,
          layout: _.cloneDeep(this.resource.layout)
        })
        this.$loading.stop('loading-schema')
        this.originalFieldList = fields
      } catch (error) {
        console.error('AbstractEditorView - updateSchema - Error happen during updateSchema:', error)
      }
    }
  }
}
