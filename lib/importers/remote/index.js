const _ = require('lodash')
const Api = require('./api')
const logger = require('../../logger')
const pAll = require('p-all')
const cliProgress = require('cli-progress')
const { determineResourceOrder } = require('./utils')
const { loadData } = require('./dataLoader')
const { convertDataToPreload } = require('./preloadConverter')
const { createDummyRecords, deleteUnusedRecords, updateRecords } = require('./recordHandler')
const { downloadBinaries } = require('./attachmentHandler')

class ImportWrapper {
  constructor () {
    this.progressCallback = null
    this.ongoingImport = false
    this.logger = logger
  }

  /** @param {function(object): void} progressCallback told how the import goes */
  init = (progressCallback) => {
    this.progressCallback = progressCallback
  }

  /**
   * Keeps the configuration and the options, and makes the API clients of both servers.
   * @param {object} config the local and remote connection settings, the resources
   * @param {{yes?: boolean, overwrite?: boolean, useCache?: boolean, convertToPreload?: boolean, createOnly?: boolean}} options
   * @param {Function} [askConfirmation] called before the import unless `yes`
   */
  prepareImport = (config, options, askConfirmation) => {
    this.config = config
    this.options = options
    this.noPrompt = options.yes
    this.overwrite = options.overwrite
    this.useCache = _.get(options, 'useCache', false)
    this.convertToPreload = _.get(options, 'convertToPreload', false)
    this.createOnly = options.createOnly
    this.askConfirmation = askConfirmation
    const localConfig = this.config.local || {}
    const remoteConfig = this.config.remote || {}
    const overwrite = _.get(this.options, 'overwrite', false)
    this.localApi = Api(localConfig, overwrite)
    this.remoteApi = Api(remoteConfig, overwrite)
    this.binaryMap = {}
    this.cmsRecordsMap = {}
    this.attachmentMap = {}
    this.localSchemaMap = {}
    this.localParagraphMap = {}
    this.remoteSchemaMap = {}
    this.remoteParagraphMap = {}
    this.remoteRecords = {}
    this.data = {}
    this.attachmentsToIgnore = ['.DS_Store', 'desktop.ini', 'Icon\r']
    this.remoteToLocalIdMap = {}
    this.originalRemoteRecords = {}
    this.multibar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format: ' {bar} | {name} | {value}/{total}'
    }, cliProgress.Presets.shades_classic)
    //  NOTE: For paragraphs to work, '/admin/paragraphs' should be in config.cms.routesToAuth for both local & remote CMS
  }

  // the bars only start on a terminal (cli-progress draws nothing elsewhere), but stop() would still print every bar
  // created, empty, into a log file or a pipe
  stopProgress () {
    if (this.multibar.isActive) {
      this.multibar.stop()
    }
  }

  /** Removes every local record of the resources imported (the overwrite option). */
  async deleteAllLocalRecords () {
    const bar = this.multibar.create(this.config.resources.length, 0, { name: 'Deleting local records' })
    await pAll(_.map(this.config.resources, (resource) => {
      return async () => {
        const records = await this.localApi(resource).list({})
        await pAll(_.map(records, (record) => {
          return async () => {
            await this.localApi(resource).remove(record._id)
          }
        }), { concurrency: 20 })
        bar.increment()
      }
    }), { concurrency: 5 })
  }

  /**
   * Imports the configured resources from the remote cms.
   * @param {Object} config - local/remote connection settings and the resources to import
   * @param {Object} options - cli style options (yes, overwrite, useCache, convertToPreload, createOnly)
   * @param {Function} [askConfirmation] - called before starting unless options.yes is set
   * @returns {Promise<boolean>} true when the import finished, false when it failed or was refused;
   *   the failure is kept in `lastError`
   */
  startImport = async (config, options, askConfirmation) => {
    if (this.ongoingImport) {
      logger.warn('Ongoing import, will cancel')
      return false
    }
    this.ongoingImport = true
    this.lastError = null
    this.prepareImport(config, options, askConfirmation)
    logger.info('Starting import...')
    const importStartedAt = Date.now()
    try {
      if (!this.noPrompt) {
        if (!_.isFunction(this.askConfirmation)) {
          throw new Error('Confirmation required but no way to ask for it, pass options.yes')
        }
        await this.askConfirmation()
      }
      await pAll(_.map(['local', 'remote'], (key) => {
        return async () => {
          await this.checkConnection(_.get(this, `${key}Api`), key === 'remote')
          await this.getSchemaMap(_.get(this, `${key}Api`), _.get(this, `${key}SchemaMap`), _.get(this, `${key}ParagraphMap`), key === 'remote')
        }
      }), { concurrency: 2 })
      this.config.resources = determineResourceOrder(this.config.resources, this.remoteSchemaMap)
      await loadData(this)
      if (this.convertToPreload) {
        await downloadBinaries(this)
        await convertDataToPreload(this)
      } else {
        if (this.overwrite) {
          logger.info('Overwrite option detected, will delete all local records for resources:', this.config.resources)
          await this.deleteAllLocalRecords()
        } else {
          await this.checkDuplicatedRecord()
        }
        await downloadBinaries(this)
        const createdRecordsMap = await createDummyRecords(this)
        await deleteUnusedRecords(this)
        await updateRecords(this, createdRecordsMap)
      }
      this.stopProgress()
      logger.info(`Import took ${Date.now() - importStartedAt}ms`)
      return true
    } catch (error) {
      this.stopProgress()
      this.lastError = error
      logger.error(_.get(error, 'response.body', _.get(error, 'message', error)))
      return false
    } finally {
      // a finished or failed import must not leave the wrapper "busy" forever
      this.ongoingImport = false
    }
  }

  /** Throws when two remote records of a resource share their unique keys. */
  async checkDuplicatedRecord () {
    const bar = this.multibar.create(1, 0, { name: 'Checking duplicated records' })
    const duplicatedMap = {}
    _.each(this.data, (data, resource) => {
      const uniqueKeys = this.remoteApi(resource).getUniqueKeys()
      let dataMap = _.countBy(data, (item) => JSON.stringify(_.pick(item, uniqueKeys)))
      dataMap = _.omitBy(dataMap, (value) => value === 1)
      if (!_.isEmpty(dataMap)) {
        duplicatedMap[resource] = _.keys(dataMap)
      }
    })
    if (!_.isEmpty(duplicatedMap)) {
      _.each(duplicatedMap, (list, key) => {
        _.each(list, item => logger.warn`resource (${key}) has duplicate record (${item})`)
      })
      throw new Error('Duplicated records')
    }
    bar.increment()
  }

  /**
   * Logs in to a server; throws when it does not answer.
   * @param {Function} api the API client
   * @param {boolean} [isRemote=false] for the progress bar
   */
  async checkConnection (api, isRemote = false) {
    const bar = this.multibar.create(1, 0, { name: `Checking ${isRemote ? 'remote' : 'local'} server connection` })
    await api().login()
    bar.increment()
  }

  /**
   * Fills a schema map from what a server answered: `localised` defaulted from the locales, the languages of each field.
   * @param {object} map filled in place
   * @param {object[]} resourcesOrParagraphs
   */
  formatSchema (map, resourcesOrParagraphs) {
    _.each(resourcesOrParagraphs, item => {
      const schema = item.schema
      if (_.isArray(item.locales)) {
        _.each(schema, field => {
          if (field.localised || _.isUndefined(field.localised)) {
            field.locales = item.locales
          }
        })
      }
      map[item.title] = { schema, locales: item.locales }
      if (_.get(item, '_attachmentFields', false)) {
        map[item.title]._attachmentFields = item._attachmentFields
      }
    })
  }

  /**
   * Loads the schemas of the resources and of the block types of a server.
   * @param {Function} api the API client
   * @param {object} schemaMap filled in place
   * @param {object} paragraphMap filled in place
   * @param {boolean} [isRemote=false] for the progress bar
   */
  async getSchemaMap (api, schemaMap, paragraphMap, isRemote = false) {
    const bar = this.multibar.create(1, 0, { name: `Getting schema map from ${isRemote ? 'remote' : 'local'} server` })
    this.formatSchema(schemaMap, await api().resources())
    this.formatSchema(paragraphMap, await api().paragraphs())
    bar.increment()
  }
}

module.exports = ImportWrapper

