// const path = require('path')
const _ = require('lodash')
const logger = require('../../logger')
const express = require('express')
// const fs = require('fs-extra')
// const pAll = require('p-all')
// const os = require('os')
// const logger = require('../../logger')
const ImportWrapper = require('../../../lib-importFromRemote/index')

class ImportFromRemoteClass {
  constructor(cms, options) {
    this.cms = cms
    this.cms.$importFromRemote = this
    this.config = options.importFromRemote || options
    this.api = cms.api()
    this.schemaMap = {}
    this.data = {}
    this.importStatus = { status: 'idle', progress: 0, message: '' }
    this.initialize()
  }

  initialize = () => {
    const app = express()
    app.get('/status', this.onGetStatus)
    app.get('/execute', this.onGetExecute)
    this.init()
    this.importWrapper = new ImportWrapper()
    this.importWrapper.init(this.onUpdateProgress)
    this.cms._app.use('/importFromRemote', app)
  }

  init = async () => {
    // logger.warn('importFromRemote - init')
  }

  onUpdateProgress = (progress) => {
    this.importStatus = progress
    logger.warn('onUpdateProgress - ', progress)
  }

  onGetStatus = (req, res) => {
    try {
      res.json({
        status: this.importStatus.status || 'idle',
        progress: this.importStatus.progress || 0,
        message: this.importStatus.message || ''
      })
    } catch (error) {
      logger.error('Failed to get import status:', error)
      res.status(500).json({ error: 'Failed to get import status' })
    }
  }

  onGetExecute = (req, res) => {
    try {
      if (this.running || this.importWrapper.ongoingImport) {
        return res.status(409).json({
          status: 'busy',
          message: 'An import is already in progress.'
        })
      }
      // You may want to allow config override via req.body in the future
      this.importStatus = { status: 'starting', progress: 0, message: 'Starting import...' }
      // started from the API there is nobody to ask, so confirmation is skipped
      const remote = { ...this.config.remote }
      if (this.cms.security.restrictRemoteUrls || remote.restrictUrls) {
        remote.restrictUrls = true
      }
      // runs in the background: the progress and the outcome are in GET /importFromRemote/status
      this.running = this.runImport({ ...this.config, remote })
        .catch(error => logger.error('Import failed:', error))
        .finally(() => {
          this.running = null
        })
      res.json({ status: 'started', message: 'Import process started.' })
    } catch (error) {
      logger.error('Failed to start import:', error)
      res.status(500).json({ error: 'Failed to start import' })
    }
  }

  /**
   * Runs the import and records its outcome in importStatus. Never rejects.
   * @param {object} config
   * @returns {Promise<void>}
   */
  runImport = async (config) => {
    try {
      const ok = await this.importWrapper.startImport(config, { yes: true }, null)
      if (ok) {
        this.importStatus = { status: 'done', progress: 100, message: 'Import completed.' }
      } else {
        const reason = _.get(this.importWrapper, 'lastError.message', 'Import failed.')
        this.importStatus = { status: 'error', progress: 0, message: reason }
      }
    } catch (error) {
      this.importStatus = { status: 'error', progress: 0, message: _.get(error, 'message', 'Import failed.') }
      logger.error('Import failed:', error)
    }
  }

  express = () => this.app
}

exports = module.exports = ImportFromRemoteClass
