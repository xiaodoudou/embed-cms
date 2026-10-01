const path = require('path')
const jsondown = require('./jsondown')
const SqliteDOWN = require('./sqlitedown')
const createLeveldbDown = require('./leveldbdown')

// the engines that keep the records of a resource in its own folder, and what each leaves there
const LOCAL_ENGINES = {
  jsondown: { artifact: 'db.json', create: (location, options) => new jsondown(location, options) },
  sqlite: { artifact: 'db.sqlite', create: (location, options) => new SqliteDOWN(location, options) },
  leveldb: { artifact: 'leveldb', create: (location, options) => createLeveldbDown(location, options) }
}

/**
 * Creates the database of a local engine for the folder of a resource.
 * @param {string} type - jsondown, sqlite or leveldb
 * @param {string} folder - the folder the engine keeps its files in
 * @param {object} options - abstract-level options
 * @returns {object} an abstract-level database, not yet open
 */
function createLocalEngine (type, folder, options) {
  const engine = LOCAL_ENGINES[type]
  if (!engine) {
    throw new Error(`Unknown local engine "${type}". Use one of: ${Object.keys(LOCAL_ENGINES).join(', ')}`)
  }
  return engine.create(path.join(folder, engine.artifact), options)
}

module.exports = { LOCAL_ENGINES, createLocalEngine }
