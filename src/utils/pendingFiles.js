// Files dropped on a paragraph field, waiting for the file field of the block made for them. The paragraph field queues
// them under the key of that field (its paragraphKey, `blocks[2].picture`), and the field takes them when it mounts: the
// handoff goes through data, not through the DOM.
const waiting = new Map()

/**
 * @param {string} key the paragraphKey of the file field
 * @param {File[]} files
 */
export function queueFiles (key, files) {
  waiting.set(key, [...(waiting.get(key) || []), ...files])
}

/**
 * The files waiting for a field, which stop waiting.
 * @param {string} key
 * @returns {File[]}
 */
export function takeFiles (key) {
  const files = waiting.get(key) || []
  waiting.delete(key)
  return files
}
