const _ = require('lodash')
const crypto = require('crypto')
const pAll = require('p-all')
const { Readable } = require('stream')
const logger = require('../../logger')
const peerFetchOptions = require('./peerAuth')
const { isFileId } = require('./validate')

/**
 * @param {*} id
 * @returns {boolean} true when the id can be used in a url and as a file name of the store
 */
const isSafeFileId = isFileId

/**
 * md5 of what a stream carries (the checksum stored with an attachment).
 * @param {import('stream').Readable} stream
 * @returns {Promise<string>}
 */
async function md5Of (stream) {
  const digest = crypto.createHash('md5')
  for await (const chunk of stream) {
    digest.update(chunk)
  }
  return digest.digest('hex')
}

/**
 * Downloads a file of a record from a peer, with one retry.
 * @param {object} resource
 * @param {string} baseUrl the address of the peer
 * @param {string} name the resource name
 * @param {string} aid the attachment id
 * @returns {Promise<object|undefined>} nothing when the peer does not have it
 */
async function downloadAttachment (resource, baseUrl, name, aid) {
  const url = `${baseUrl + name}/file/${aid}`
  try {
    try {
      const response = await fetch(url, peerFetchOptions(resource, { method: 'HEAD' }))
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      logger.warn(`downloading file ${aid} ... ... miss`, error)
      return
    }

    const response = await fetch(url, peerFetchOptions(resource))
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return new Promise((resolve, reject) => {
      Readable.fromWeb(response.body)
        .pipe(resource.file.write(aid))
        .on('finish', () => {
          resolve()
        }).on('error', (error) => {
          resource.file.remove(aid).catch(() => {})
          reject(new Error(`downloading file ${aid} ... ... error, ${error}`))
        })
    })
  } catch (error) {
    await resource.file.remove(aid).catch(() => {})
    throw new Error(`downloading file ${aid} ... ... error, ${error}`, { cause: error })
  }
}

/**
 * Downloads the attachments of a resource that are missing locally or whose checksum differs from the record.
 * Attachment ids come from records a peer sent: an id that is not a plain file id is ignored, it would otherwise end
 * up in a url and in a path.
 * @param {object} resource
 * @param {string} baseUrl - http url of the peer's api, with a trailing slash
 * @param {function(): Promise} cleanup - removes the files no record refers to
 * @returns {Promise<void>}
 */
async function syncAttachment (resource, baseUrl, cleanup) {
  logger.info('start syncing attachments ... ...')
  const result = await resource.list()
  const attachmentList = _.compact(_.flatten(_.map(result, '_attachments')))
  const downloadList = []
  await pAll(_.map(attachmentList, attachment => {
    return async () => {
      if (!isSafeFileId(attachment._id)) {
        logger.warn(`ignoring the attachment id ${JSON.stringify(attachment._id)}: it is not a plain file id`)
        return
      }
      const item = { baseUrl, resource, name: resource.name, aid: attachment._id }
      if (!(await resource.file.exists(attachment._id))) {
        downloadList.push(item)
      } else if (await md5Of(resource.file.read(attachment._id)) !== attachment._md5sum) {
        downloadList.push(item)
      }
    }
  }), {concurrency: 10})
  let count = 0
  await pAll(_.map(downloadList, item => {
    return async () => {
      logger.info(`downloading file ${item.aid} ... ... `)
      await downloadAttachment(item.resource, item.baseUrl, item.name, item.aid)
      count++
      logger.info(`downloading file ${item.aid} ... ... done ( ${count} / ${downloadList.length} )`)
    }
  }), {concurrency: 10})
  await cleanup()
  logger.info('start syncing attachments ... ... done')
}

module.exports = { syncAttachment, isSafeFileId, md5Of }
