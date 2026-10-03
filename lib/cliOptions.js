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
 * @returns {object}
 */
function cliOptions (cwd, packageDir) {
  return path.resolve(cwd) === path.resolve(packageDir) ? { ...DEV_OPTIONS } : {}
}

module.exports = { cliOptions, DEV_OPTIONS }
