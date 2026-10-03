/**
 * Whether a scrolling element shows its end, give or take a margin: what hides the fade that hints at more below.
 * @param {{scrollTop: number, clientHeight: number, scrollHeight: number}} element
 * @param {number} [margin=50]
 * @returns {boolean}
 */
export function isScrolledToBottom ({ scrollTop, clientHeight, scrollHeight }, margin = 50) {
  return scrollTop + clientHeight >= scrollHeight - margin
}
