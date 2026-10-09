#!/usr/bin/env node

const { program } = require('commander')
// const _ = require('lodash')
const path = require('path')
const { confirm } = require('../lib/util/confirm')

const ImportWrapper = require('../lib/importers/remote')

program.addHelpText('after', `
  Example:
    $ import-from-remote ./dev.json
`)

program
  .usage('<config json>')
  .option('-y, --yes', 'Assume Yes to all queries and do not prompt')
  .option('--overwrite', 'Overwrite all local records with remote ones')
  .option('--use-cache', 'Use cached data instead of downloading from remote')
  .option('--convert-to-preload', 'Convert downloaded data to preload format')
  .parse(process.argv)

if (!program.args[0]) {
  program.help()
  process.exit(1)
}

class ImportManager {
  constructor(config) {
    this.importWrapper = new ImportWrapper()
    this.importWrapper.startImport(config, program.opts(), this.askConfirmation)
  }

  /**
   * @param {{protocol: string, host: string}} config
   * @returns {string} the address of the server
   */
  buildUrl = (config) => `${config.protocol}${config.host}`

  /** Asks before importing, unless --yes was given. */
  askConfirmation = async () => {
    if (program.opts().yes) {
      return
    }
    if (!await confirm(`Are you sure you want to import data from ${this.buildUrl(config.remote)} to ${this.buildUrl(config.local)} ? [yes/no]`)) {
      console.log('no')
      process.exit(1)
    }
  }
}

const config = require(path.resolve(program.args[0]))

exports = new ImportManager(config)
