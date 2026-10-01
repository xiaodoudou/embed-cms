const { Readable } = require('stream')
// file-type >= 17 is ESM only; Node >= 22.12 can require() it synchronously
const { fileTypeFromBuffer, fileTypeStream } = require('file-type')

/**
 * Detects the type of a buffer.
 * @param {Buffer} buffer
 * @returns {Promise<{ext: string, mime: string}|undefined>}
 */
const fromBuffer = (buffer) => fileTypeFromBuffer(buffer)

/**
 * Detects the type of a Node stream without consuming it.
 * @param {import('stream').Readable} stream
 * @returns {Promise<import('stream').Readable & {fileType: ({ext: string, mime: string}|undefined)}>}
 *   a Node stream that still yields the whole content, with the detected type on `.fileType`
 */
const stream = async (nodeStream) => {
  const detected = await fileTypeStream(Readable.toWeb(nodeStream))
  const out = Readable.fromWeb(detected)
  out.fileType = detected.fileType
  return out
}

module.exports = { fromBuffer, stream }
