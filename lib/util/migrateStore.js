const fs = require('fs')
const path = require('path')
const { LOCAL_ENGINES, createLocalEngine } = require('../db/leveldown/localEngines')

const OPTIONS = { keyEncoding: 'utf8', valueEncoding: 'utf8' }
const BATCH = 1000

/**
 * The folders of the resources that keep a store of an engine: `<data>/<namespace...>/<resource>/json` holding the
 * file or folder the engine writes.
 * @param {string} root
 * @param {string} artifact
 * @returns {string[]}
 */
function findStores (root, artifact) {
  const found = []
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'blob' || entry.name === artifact) {
        continue
      }
      const full = path.join(folder, entry.name)
      if (entry.name === 'json') {
        if (fs.existsSync(path.join(full, artifact))) {
          found.push(full)
        }
      } else {
        walk(full)
      }
    }
  }
  walk(root)
  return found
}

/**
 * Copies the records of every resource from one local engine to another, with the keys of the replication (indexes and
 * clocks), so a server that replicates carries on where it stopped. The CMS must be stopped. The old files are left
 * where they are: delete them once the new engine is configured and the content checked.
 * @param {object} options
 * @param {string} options.data - the data folder of the CMS (`data` in cms.json)
 * @param {string} options.from - jsondown, sqlite or leveldb
 * @param {string} options.to - jsondown, sqlite or leveldb
 * @param {boolean} [options.dryRun] - count what would be copied and write nothing
 * @param {function(string)} [options.log]
 * @returns {Promise<{stores: number, entries: number, skipped: string[]}>}
 */
async function migrateStore ({ data, from, to, dryRun = false, log = () => {} }) {
  for (const type of [from, to]) {
    if (!LOCAL_ENGINES[type]) {
      throw new Error(`Unknown engine "${type}". Use one of: ${Object.keys(LOCAL_ENGINES).join(', ')}`)
    }
  }
  if (from === to) {
    throw new Error('from and to are the same engine')
  }
  if (!fs.existsSync(data)) {
    throw new Error(`The data folder ${data} does not exist`)
  }
  const result = { stores: 0, entries: 0, skipped: [] }
  for (const folder of findStores(data, LOCAL_ENGINES[from].artifact)) {
    // never merge into a store that already holds something: it would hide which copy is the right one
    if (fs.existsSync(path.join(folder, LOCAL_ENGINES[to].artifact))) {
      result.skipped.push(folder)
      log(`skipped ${folder}: it already has a ${to} store`)
      continue
    }
    const source = createLocalEngine(from, folder, OPTIONS)
    await source.open()
    let count = 0
    let target
    try {
      if (!dryRun) {
        target = createLocalEngine(to, folder, OPTIONS)
        await target.open()
      }
      let operations = []
      for await (const [key, value] of source.iterator()) {
        count++
        if (target) {
          operations.push({ type: 'put', key, value })
          if (operations.length >= BATCH) {
            await target.batch(operations)
            operations = []
          }
        }
      }
      if (target && operations.length) {
        await target.batch(operations)
      }
    } finally {
      await source.close()
      if (target) {
        await target.close()
      }
    }
    result.stores++
    result.entries += count
    log(`${dryRun ? 'would copy' : 'copied'} ${count} entries: ${folder}`)
  }
  return result
}

module.exports = { migrateStore }
