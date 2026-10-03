const _ = require('lodash')

// The place of the index of a block in the path of a field inside a paragraph: `blocks.{{*}}.banner` is the `banner` field
// of any block of `blocks`.
const BLOCK_WILDCARD = '{{*}}'
// What the wildcard matches: the index of the block, written `.0.` or `[0]`.
const BLOCK_INDEX = '(\\.|\\[)(.+)(\\.|\\])'
// What may follow the field: its locale and the index of the file, as `.enUS.0` or `.0`.
const SUFFIX = '(\\..+)?'

/**
 * The regular expression (as a string) that tells whether the name of an attachment belongs to a field: `photo` and `photo.enUS.0`
 * belong to `photo`, `blocks.0.banner.enUS.0` and `blocks[0].banner` to `blocks.{{*}}.banner`. The keys of `_attachmentFields`
 * and `_relations` of a resource are these patterns; the admin and the remote importer read them, and the admin takes the locale
 * and the index of the file from the last group, so the groups are part of the contract.
 * @param {string} path the path of the field, with `{{*}}` for the index of a block
 * @param {boolean} [localised=true] whether a locale (and the index of the file) may follow the field
 * @returns {string}
 */
function fieldPathPattern (path, localised = true) {
  const source = path.split(`.${BLOCK_WILDCARD}.`).map(part => _.escapeRegExp(part)).join(BLOCK_INDEX)
  return `${source}${localised ? SUFFIX : ''}$`
}

module.exports = { fieldPathPattern, BLOCK_WILDCARD }
