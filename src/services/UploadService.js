import _ from 'lodash'
import Emitter from 'tiny-emitter'
import RequestService from './RequestService'

/**
 * Sends attachment uploads and tracks them per file so the UI can show progress,
 * a success/error state and a retry action.
 *
 * Endpoints, methods and payloads are exactly the ones RequestService.post used
 * (multipart FormData POST, JSON answer); only the transport differs: XMLHttpRequest
 * exposes upload progress. When XMLHttpRequest or its progress events are not
 * available the upload still works (fetch fallback / indeterminate bar).
 */
class UploadService {
  constructor () {
    this.events = new Emitter()
    this.items = []
    this.sequence = 0
  }

  /** Public, serialisable snapshot of the tracked uploads */
  snapshot () {
    return _.map(this.items, (item) => _.pick(item, ['id', 'name', 'size', 'status', 'progress', 'indeterminate', 'error']))
  }

  emitChange () {
    this.events.emit('change', this.snapshot())
  }

  /**
   * @param {string} url upload endpoint
   * @param {FormData} formData multipart payload (kept so a failed upload can be retried)
   * @param {{name?: string, size?: number, recordId?: string}} meta display info
   * @returns {Promise<boolean>} true when the upload succeeded, never rejects
   */
  upload (url, formData, meta = {}) {
    const item = {
      id: ++this.sequence,
      name: meta.name || 'file',
      size: meta.size || 0,
      status: 'uploading',
      progress: 0,
      indeterminate: true,
      error: '',
      url,
      formData,
      meta,
      xhr: null
    }
    this.items.push(item)
    this.emitChange()
    return this.run(item)
  }

  async run (item) {
    item.status = 'uploading'
    item.progress = 0
    item.indeterminate = true
    item.error = ''
    this.emitChange()
    try {
      if (typeof XMLHttpRequest === 'undefined') {
        await RequestService.post(item.url, item.formData)
      } else {
        await this.send(item)
      }
      item.status = 'done'
      item.progress = 100
      item.indeterminate = false
      this.emitChange()
      return true
    } catch (error) {
      item.status = _.get(error, 'aborted', false) ? 'cancelled' : 'error'
      item.error = _.get(error, 'message', _.isString(error) ? error : 'Upload failed')
      item.indeterminate = false
      console.error(`Upload of ${item.name} failed:`, error)
      this.emitChange()
      return false
    }
  }

  send (item) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      item.xhr = xhr
      xhr.open('POST', item.url)
      xhr.setRequestHeader('Accept', 'application/json')
      if (xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            item.indeterminate = false
            item.progress = Math.min(99, Math.round((event.loaded / event.total) * 100))
            this.emitChange()
          }
        }
      }
      xhr.onload = () => {
        let json
        try {
          json = JSON.parse(xhr.responseText)
        } catch {
          json = null
        }
        const code = _.get(json, 'code', xhr.status)
        if (xhr.status >= 200 && xhr.status < 300 && (code >= 200 && code < 300 || _.isNil(code))) {
          resolve(json)
        } else {
          reject(new Error(_.get(json, 'message', `HTTP ${xhr.status}`)))
        }
      }
      xhr.onerror = () => reject(new Error('Network error'))
      xhr.ontimeout = () => reject(new Error('Timeout'))
      xhr.onabort = () => reject(Object.assign(new Error('Cancelled'), { aborted: true }))
      xhr.send(item.formData)
    })
  }

  async retry (id) {
    const item = _.find(this.items, { id })
    if (!item || item.status === 'uploading') {
      return false
    }
    const ok = await this.run(item)
    if (ok) {
      this.events.emit('uploaded', item.meta)
    }
    return ok
  }

  cancel (id) {
    const item = _.find(this.items, { id })
    if (item && item.status === 'uploading' && item.xhr) {
      item.xhr.abort()
    }
  }

  dismiss (id) {
    this.items = _.filter(this.items, (item) => item.id !== id || item.status === 'uploading')
    this.emitChange()
  }

  clearFinished () {
    this.items = _.filter(this.items, (item) => item.status === 'uploading' || item.status === 'error')
    this.emitChange()
  }
}

export default new UploadService()
