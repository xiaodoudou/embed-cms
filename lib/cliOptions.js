const fs = require('fs')
const path = require('path')

// The options of the development harness: what CONTRIBUTING.md describes for `npm start` in a clone of embed-cms
// (the field catalogue of resources/, the sync plugin on with its resources chosen in the Sync settings, replication off).
const DEV_OPTIONS = Object.freeze({
  sync: {},
  disableReplication: true
})

/**
 * The options the cms command starts the CMS with. In the folder of embed-cms itself it is the development harness;
 * anywhere else it adds nothing, so the project's cms.json and the defaults decide (on a first start, cms.json is written
 * from them, and must not inherit the harness's sync and replication settings).
 * @param {string} cwd the folder the command runs in
 * @param {string} packageDir the folder of embed-cms
 * @param {function(string): object} [readConfig] reads the cms.json of a folder ({} when there is none), replaced in tests
 * @returns {object}
 */
function cliOptions (cwd, packageDir, readConfig = readConfigFile) {
  if (path.resolve(cwd) !== path.resolve(packageDir)) {
    return {}
  }
  const options = { ...DEV_OPTIONS }
  // an option replaces the whole block of cms.json: a `sync` block written there (a schedule, the resources) is kept, the harness only
  // turns the plugin on when there is none
  if (readConfig(cwd).sync) {
    delete options.sync
  }
  return options
}

/** The cms.json of a folder, or {} when it has none or cannot be read */
function readConfigFile (folder) {
  try {
    return JSON.parse(fs.readFileSync(path.join(folder, 'cms.json'), 'utf8')) || {}
  } catch {
    return {}
  }
}

module.exports = { cliOptions, DEV_OPTIONS }
