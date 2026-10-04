import { log } from '@u/log'
import _ from 'lodash'
import { filesize } from 'filesize'
import TranslateService from '@s/TranslateService'
import { takeFiles } from '@u/pendingFiles'

export default {
  data () {
    return {
      attachments: [],
      // what the box holds for a moment after files are chosen or dropped in it: taken out at once (see emptyBox)
      boxFiles: []
    }
  },
  mounted () {
    this.attachments = _.cloneDeep(this._value) || []
    // files dropped on the paragraph field for the block of this field (see ParagraphView): taken as if dropped here
    const waiting = this.schema.paragraphKey ? takeFiles(this.schema.paragraphKey) : []
    if (waiting.length) {
      this.onUploadChanged(waiting)
    }
  },
  methods: {
    /**
     * Empties the box once its files are taken: with a file left in it the box shows no hint, and a file chosen twice in a row fires no
     * event the second time. (Vuetify clears the native input when the model is emptied.)
     */
    emptyBox () {
      this.boxFiles = []
    },
    /**
     * Moves the attachment at an index one place, as dragging it there does.
     * @param {number} index
     * @param {number} delta -1 earlier, 1 later; nothing past the ends
     */
    moveAttachment (index, delta) {
      const list = this.getAttachments()
      const to = index + delta
      if (!list || to < 0 || to >= list.length) {
        return
      }
      list.splice(to, 0, list.splice(index, 1)[0])
      this.onEndDrag()
    },
    /** Renumbers the order of the attachments. */
    onEndDrag () {
      const attachments = _.map(this.getAttachments(), (item, i) => {
        if (item.order !== i + 1) {
          item.order = i + 1
          item.orderUpdated = true
        }
        return item
      })
      this._value = attachments
    },
    /**
     * @param {Object|false} attachment the first one by default
     * @returns {string} its data url before upload, else its preview url
     */
    getImageSrc (attachment = false) {
      const a = attachment || this.attachment()
      return a.data ? a.data : this.getPreviewUrl(a)
    },
    /**
     * @param {Object|false} attachment the first one by default
     * @returns {boolean} by the extension of the filename, else by the content type
     */
    isImage (attachment = false) {
      const a = attachment || this.attachment()
      const attachmentFilename = this.getAttachmentFilename(a)
      if (attachmentFilename) {
        const isAnImage = _.find(['jpg', 'jpeg', 'png', 'svg'], (type)=> _.endsWith(attachmentFilename, type))
        if (isAnImage) {
          return true
        }
      }
      const declared = a && (a._contentType || _.get(a, 'file.type', false))
      if (_.isString(declared) && declared.length > 0) {
        return /image/g.test(declared)
      }
      // no extension and no type: an image field holds images
      return _.isFunction(this.unknownIsImage) && this.unknownIsImage()
    },
    /**
     * @param {Object|false} attachment the first one by default
     * @returns {string} its url, resized unless it is an svg
     */
    getPreviewUrl (attachment = false) {
      const a = attachment || this.attachment()
      const contentType = _.get(a, '_contentType', false)
      if (_.isString(contentType) && contentType.indexOf('svg') !== -1) {
        return a.url
      }
      return `${a.url}?resize=autox100`
    },
    /** @returns {Object|undefined} the first */
    attachment () {
      return _.first(this.attachments)
    },
    /** @returns {Array<Object>} the value of the field, else the prop */
    getAttachments () {
      return this._value || this.attachments
    },
    /**
     * @param {Object|false} attachment the first one by default
     * @returns {string} human readable
     */
    imageSize (attachment = false) {
      const a = attachment || this.attachment()
      return this.bytesToSize(_.get(a, '_size', _.get(a, 'file.size', false)))
    },
    /**
     * @param {number} bytes
     * @returns {string} jedec units
     */
    bytesToSize (bytes) {
      return filesize(bytes, {standard: 'jedec'})
    },
    /** @returns {boolean} false when the schema fixes a width and a height, else whether more than one is allowed */
    isForMultipleImages () {
      if (this.schema.width && this.schema.height) {
        return false
      }
      const maxCount = this.getMaxCount()
      return maxCount === -1 ? true : maxCount > 1
    },
    /** @returns {boolean} locked, or full */
    isFieldDisabled () {
      if (this.isLocked()) {
        return true
      }
      const maxCount = this.getMaxCount()
      return maxCount !== -1 && this.getAttachments().length >= maxCount
    },
    /** @returns {'IMAGE'|'FILE'} */
    getFieldType () {
      return _.toUpper(_.get(this.schema, 'type', 'ImageView') === 'ImageView' ? 'image' : 'file')
    },
    /** @returns {Array<Function>} the Vuetify rules: required, count, size */
    getRules () {
      const rules = []
      if (this.schema.required) {
        rules.push(v => {
          const attachmentsLength = _.get(this.getAttachments(), 'length', 0)
          const valueLength = _.get(v, 'length', 0)
          if ((v instanceof Object || v instanceof File) && _.get(v, 'name', false)) {
            return true
          } else if (attachmentsLength === 0 && valueLength === 0) {
            return TranslateService.get(`TL_${this.getFieldType()}_IS_MANDATORY`)
          }
          if ((valueLength !== 0 || v instanceof FileList) || attachmentsLength !== 0) {
            return true
          }
          return TranslateService.get(`TL_${this.getFieldType()}_IS_MANDATORY`)
        })
      }
      if (this.isForMultipleImages()) {
        rules.push(files => {
          const maxCount = this.getMaxCount()
          if (maxCount === -1 || _.get(this.getAttachments(), 'length', 0) + _.get(files, 'length', 0) <= maxCount + 1) {
            return true
          }
          return TranslateService.get(`TL_TOO_MANY_${this.getFieldType()}S`)
        })
      }
      if (_.get(this.schema, 'options.limit', false)) {
        rules.push((files) => {
          if (!files) {
            return true
          }
          if (!_.isArray(files)) {
            files = [files]
          }
          for (const file of files) {
            if (file.size > this.schema.options.limit) {
              const fieldType = this.getFieldType()
              console.warn(`${fieldType} ${_.get(file, 'name', 'undefined-filename')} is too big: ${this.bytesToSize(file.size)}(${file.size}bytes) > ${this.bytesToSize(this.schema.options.limit)}(${this.schema.options.limit}bytes)`)
              return TranslateService.get(`TL_${fieldType}_IS_TOO_BIG`)
            }
          }
          return true
        })
      }
      if (_.get(this.schema, 'options.accept', false)) {
        const acceptedTypes = this.schema.options.accept.split(',')
        rules.push(files => {
          if (!files) {
            return true
          }
          let isValid = true
          if (!_.isArray(files)) {
            files = [files]
          }
          _.each(files, (file) => {
            const fileType = `.${_.toLower(_.last(_.split(file.name, '.')))}`
            const mimeType = file.type || ''
            let matched = false
            for (const accept of acceptedTypes) {
              const trimmed = accept.trim()
              if (trimmed.startsWith('.')) {
                // Extension match
                if (fileType === trimmed) {
                  matched = true
                  break
                }
              } else if (trimmed.endsWith('/*')) {
                // MIME group match (e.g., image/*)
                const group = trimmed.split('/')[0]
                if (mimeType.startsWith(group + '/')) {
                  matched = true
                  break
                }
              } else if (trimmed.includes('/')) {
                // Exact MIME type match
                if (mimeType === trimmed) {
                  matched = true
                  break
                }
              }
            }
            if (!matched) {
              isValid = false
              return false
            }
          })
          return isValid || TranslateService.get(`TL_INVALID_${this.getFieldType()}_TYPE`)
        })
      }
      return rules
    },
    /** @returns {string} */
    getPlaceholder () {
      return TranslateService.get(`TL_CLICK_OR_DRAG_AND_DROP_TO_ADD_${this.getFieldType()}${this.isForMultipleImages() ? 'S' : ''}`)
    },
    /** @returns {number} -1 when unlimited */
    getMaxCount () {
      return _.get(this.schema, 'options.maxCount', -1)
    },
    /**
     * @param {Object} attachment
     * @returns {string|false} _filename, else _fields._filename
     */
    getAttachmentFilename(attachment) {
      return _.get(attachment, '_filename', false) || _.get(attachment, '_fields._filename', false)
    },
    /**
     * @param {Object} attachment
     * @param {number} index removed from the list
     */
    removeImage (attachment, index) {
      _.remove(this.attachments, (val, i)=> i === index)
      this._value = this.attachments
      // work around to force label update
      const dummy = this.schema.label
      this.schema.label = null
      this.schema.label = dummy
    },
    /** @param {DragEvent} event its files, cut to the max count */
    onDrop (event) {
      const maxCount = this.getMaxCount()
      let files = _.get(event, 'dataTransfer.files', [])
      if (maxCount !== -1 && maxCount <= 1 && files.length > 1) {
        files = _.last(files)
        log.debug(`Only one file can be uploaded at a time for field '${this.schema.originalModel}', will take the last one:`, files)
      } else if (_.isObject(files)) {
        files = _.toArray(files)
      }
      this.onUploadChanged(files)
    },
    /** @param {FileList|Array<File>} files from the input; read and added as attachments */
    async onUploadChanged (files) {
      let maxCount = this.getMaxCount()
      if (_.get(event, 'target.files.length', 0) !== 0) {
        files = event.target.files
        // dragAndDrop = true
        if (maxCount !== -1 && maxCount <= 1 && files.length > 1) {
          files = _.last(files)
          log.debug(`Only one file can be uploaded at a time for field '${this.schema.originalModel}', will take the last one:`, files)
        } else if (_.isObject(files)) {
          files = _.toArray(files)
        }
      }
      files = _.isNull(files) ? [] : files
      if (_.get(files, 'target.files', false)) {
        files = _.values(files.target.files)
      }
      if (!_.isArray(files)) {
        files = [files]
      }
      // the files are in the array now: the box is emptied, so that its hint stays and the same file can be chosen again
      this.emptyBox()
      if (!files.length) {
        return
      }
      if (_.get(this.schema, 'width', false) && _.get(this.schema, 'height', false)) {
        maxCount = 1
      }
      const totalNbFiles = this.getAttachments().length + files.length
      if (maxCount >= 1 && totalNbFiles > maxCount) {
        log.debug(`Reached max number of files for ${this.schema.paragraphKey || this.schema.model}`, totalNbFiles, maxCount)
        files = _.take(files, files.length - (totalNbFiles - maxCount))
      }
      // the rules, against the files that arrive: the box only knows the files picked in it, not the ones dropped on it or handed
      // over by the paragraph field, and a required field has to take its first file
      const errors = _.reject(_.map(this.getRules(), rule => rule(files)), result => result === true)
      if (errors.length) {
        console.error('validation error, will not upload files:', errors)
        return
      }
      this.attachments = await this.readAllFiles(files)
      this._value = this.attachments
    },
    /** @returns {string} the paragraph key with the locale, else the model */
    getFieldKey() {
      if (this.schema.paragraphKey && this.schema.localised) {
        return `${this.schema.paragraphKey}.${this.schema.locale}`
      }
      return this.schema.paragraphKey || this.schema.model
    },
    /**
     * @param {File} file
     * @param {Object} element the file read, with its data url
     */
    addAttachment (file, element) {
      const { locale } = this.getKeyLocale()
      const newAttachment = {
        _isAttachment: true,
        _filename: _.get(file, '[0].name', file.name),
        field: this.getFieldKey(),
        localised: this.schema.localised,
        file: _.get(file, '[0]', file),
        data: element.target.result
      }
      if (!_.isUndefined(locale)) {
        newAttachment._fields = {locale}
      }
      this.attachments.push(newAttachment)
    },
    // The files are uploaded one beside the other, so their order is sent with them: each file gets its position, and only a file
    // that is new or has moved is marked (the others need no request). It used to count the list the field had before the files
    // were added, so new files had no position and could be stored in the order they happened to arrive.
    numberAttachments () {
      _.each(this.attachments, (attachment, i) => {
        if (attachment.order !== i + 1) {
          attachment.order = i + 1
          attachment.orderUpdated = true
        }
      })
    },
    /**
     * @param {FileList} files
     * @returns {Promise<Array<Object>>} each one read as a data url
     */
    async readAllFiles (files) {
      let nbFilesToRead = _.get(files, 'length', 1)
      return new Promise((resolve) => {
        _.each(files, (file) => {
          const reader = new FileReader()
          if (_.get(file, 'type', false).indexOf('video/') !== -1) {
            this.addAttachment(file, {target: {result: URL.createObjectURL(file)}})
            nbFilesToRead--
            if (nbFilesToRead === 0) {
              if (this.isForMultipleImages()) {
                this.numberAttachments()
              }
              resolve(this.attachments)
            }
          } else {
            const vm = this
            reader.onload = (element) => {
              vm.addAttachment(file, element)
              nbFilesToRead--
              if (nbFilesToRead === 0) {
                if (this.isForMultipleImages()) {
                  vm.numberAttachments()
                }
                resolve(vm.attachments)
              }
            }
            try {
              const blob = _.get(file, '[0]', file)
              if (blob instanceof Blob) {
                reader.readAsDataURL(blob)
              }
            } catch (error) {
              console.error('Error while reading file:', error)
            }
          }
        })
      })
    }
  }
}
