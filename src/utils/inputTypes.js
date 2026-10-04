import _ from 'lodash'

// A crop image field is an image field with a crop tool, an image map field one with an image map: wherever a field holds pictures or files, it counts (the server has the same
// two lists, lib/util/inputTypes.js)
const IMAGE_INPUTS = ['image', 'cropimage', 'imagemap']
const ATTACHMENT_INPUTS = ['file', ...IMAGE_INPUTS]

/**
 * @param {string} input the `input` of a field of a schema
 * @returns {boolean} whether the field holds pictures (`image`, `cropimage` or `imagemap`)
 */
export const isImageInput = (input) => _.includes(IMAGE_INPUTS, input)

/**
 * @param {string} input the `input` of a field of a schema
 * @returns {boolean} whether the field holds files (`file`, `image`, `cropimage` or `imagemap`)
 */
export const isAttachmentInput = (input) => _.includes(ATTACHMENT_INPUTS, input)
