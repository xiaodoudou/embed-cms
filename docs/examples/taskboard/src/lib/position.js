// The order of the cards in a column. Each task has a number, `position`, and the column is the tasks of a status sorted by it. Dropping a card between two others gives it a number
// between theirs: nothing else is written (the other cards keep theirs), so a move is one write, and two people who move different cards do not collide.
// When two numbers have come too close to have another between them, the column is numbered again, a thousand apart.

/** The distance between two cards that are first put in a column. */
export const STEP = 1000
/** Under this gap there is no room for another number that a float keeps apart. */
export const MIN_GAP = 1e-6

/**
 * @param {number|undefined} before the position of the card above, if any
 * @param {number|undefined} after the position of the card below, if any
 * @returns {number} a position between them; a step above or below when there is only one neighbour; a step when there is none
 */
export function between (before, after) {
  const hasBefore = Number.isFinite(before)
  const hasAfter = Number.isFinite(after)
  if (hasBefore && hasAfter) {
    return (before + after) / 2
  }
  if (hasBefore) {
    return before + STEP
  }
  if (hasAfter) {
    return after - STEP
  }
  return STEP
}

/**
 * @param {Array<{position: number}>} cards a column, in order, without the card that moves
 * @param {number} index where the card is dropped: 0 is above the first, the length is under the last
 * @returns {boolean} whether the numbers around that place have no room left
 */
export function crowded (cards, index) {
  const before = cards[index - 1]
  const after = cards[index]
  return Boolean(before) && Boolean(after) && after.position - before.position < MIN_GAP
}

/**
 * @param {Array<{_id: string}>} cards a column in order
 * @returns {Array<{_id: string, position: number}>} the numbers it gets when it is numbered again
 */
export function renumber (cards) {
  return cards.map((card, index) => ({ _id: card._id, position: (index + 1) * STEP }))
}

/**
 * Where a dropped card goes, and what else has to be written.
 * @param {Array<{_id: string, position: number}>} column the cards of the column it is dropped in, in order
 * @param {string} movingId the card that moves (it may be in this column already: it is taken out before the place is looked for)
 * @param {number} index the place, counted in the column without the card that moves
 * @returns {{position: number, renumber: Array<{_id: string, position: number}>}} the position of the card; the cards to write again when there was no room (the card itself is not in the list)
 */
export function place (column, movingId, index) {
  const others = column.filter((card) => card._id !== movingId)
  const at = Math.max(0, Math.min(index, others.length))
  if (crowded(others, at)) {
    const numbered = renumber(others)
    return { position: between(numbered[at - 1] && numbered[at - 1].position, numbered[at] && numbered[at].position), renumber: numbered }
  }
  return { position: between(others[at - 1] && others[at - 1].position, others[at] && others[at].position), renumber: [] }
}

/**
 * Where, in a column, the pointer says a card would fall.
 * @param {Array<{top: number, height: number}>} rects the boxes of the cards of the column, from the first to the last, on the screen
 * @param {number} y the vertical place of the pointer
 * @returns {number} the index: above the first card whose middle is under the pointer, or the number of cards
 */
export function dropIndex (rects, y) {
  const index = rects.findIndex((rect) => y < rect.top + rect.height / 2)
  return index === -1 ? rects.length : index
}
