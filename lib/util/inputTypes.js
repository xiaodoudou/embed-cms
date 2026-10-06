/**
 * @fileoverview The input types that hold files. `cropimage` is an `image` field with a crop tool, and `imagemap` one with an image map: wherever a field holds pictures, or files,
 * it is one of them.
 */

const _ = require('lodash')

const IMAGE_INPUTS = ['image', 'cropimage', 'imagemap']
const ATTACHMENT_INPUTS = ['file', ...IMAGE_INPUTS]

/**
 * @param {string} input the `input` of a field of a schema
 * @returns {boolean} whether the field holds pictures (`image`, `cropimage` or `imagemap`)
 */
const isImageInput = (input) => _.includes(IMAGE_INPUTS, input)

/**
 * @param {string} input the `input` of a field of a schema
 * @returns {boolean} whether the field holds files (`file`, `image`, `cropimage` or `imagemap`): they are kept as attachments of the record
 */
const isAttachmentInput = (input) => _.includes(ATTACHMENT_INPUTS, input)

module.exports = { isImageInput, isAttachmentInput, ATTACHMENT_INPUTS }
