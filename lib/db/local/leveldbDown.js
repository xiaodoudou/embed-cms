const { scanRecords, countRecords } = require('./records')

let LeveldbDOWN

/**
 * The LevelDB engine: classic-level, the reference abstract-level database, with the two reads JsonStore uses beyond
 * the abstract-level interface. classic-level is a native module, so it is loaded when the engine is first used.
 * @param {string} location - the folder LevelDB keeps its files in
 * @param {object} options - abstract-level options
 * @returns {object} an abstract-level database
 */
function createLeveldbDown (location, options) {
  if (!LeveldbDOWN) {
    let ClassicLevel
    try {
      ({ ClassicLevel } = require('classic-level'))
    } catch (error) {
      throw new Error(`The leveldb engine needs the classic-level package, which could not be loaded (${error.message}). Run: npm install classic-level, or set dbEngine.type to "jsondown" or "sqlite"`, { cause: error })
    }
    LeveldbDOWN = class LeveldbDOWN extends ClassicLevel {
      // classic-level answers undefined for a missing key; the other engines throw, and JsonStore relies on it
      // (an update of a record that does not exist must fail)
      async get (key, options) {
        const value = await super.get(key, options)
        if (value === undefined) {
          const notFoundError = new Error(`Key not found in database [${key}]`)
          notFoundError.code = 404
          throw notFoundError
        }
        return value
      }

      scan (options) {
        return scanRecords(this, options)
      }

      recordCount () {
        return countRecords(this)
      }
    }
  }
  return new LeveldbDOWN(location, options)
}

module.exports = createLeveldbDown
