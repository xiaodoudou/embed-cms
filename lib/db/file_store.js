
const mkdirp = require('mkdirp')
const fs = require('fs-extra')
const _ = require('lodash')
/*
 * Constructor
 *
 * @param {String} namespace, e.g ['FileStores']
 * @param {Object} options
 * @return {FileStore} fileStore
 */
class FileStore {
  constructor (dbpath, id, options) {
    mkdirp.sync(dbpath)
    this._dir = `${dbpath}/`
    this._id = id
    this._options = options
  }

  /*
   * Resolves an id to a path inside the store directory.
   * Ids come from clients and remote peers: separators and dot segments are refused so an id can never
   * point outside of the store.
   * @param {String} id
   * @return {String} path
   */
  _path = (id) => {
    const name = String(id)
    if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
      throw new Error(`Invalid file id: ${JSON.stringify(name)}`)
    }
    return this._dir + name
  }

  /*
   * Low level streaming APIs
   */

  /*
   * Create a new readStream (from record)
   * @param {String} id
   * @return {Readable} stream
   */
  read = (id) => {
    return fs.createReadStream(this._path(id))
  }

  /*
   * Create a new writeStream (record)
   * @param {String} id
   * @return {Writable} stream
   */
  write = (id) => {
    return fs.createWriteStream(this._path(id))
  }

  /*
   * Highlevel Async APIs
   */

  /*
   * Delete a record from database
   *
   * @param {String} id
   * @return {Boolean} exists
   */
  remove = async (id) => {
    const fileExists = this.exists(id)
    if (fileExists) {
      await fs.unlink(this._path(id))
    }
    return fileExists
  }

  /*
   * Check if record exists in database
   *
   * @param {String} id
   */
  exists = (id) => {
    return fs.existsSync(this._path(id))
  }

  /*
   * Milliseconds since a file was last written
   *
   * @param {String} id
   * @return {Number} age
   */
  age = async (id) => {
    return Date.now() - (await fs.stat(this._path(id))).mtimeMs
  }

  /*
   * list existing files in database
   *
   */
  list = async () => {
    return await fs.readdir(this._dir)
  }
}

exports = module.exports = FileStore
