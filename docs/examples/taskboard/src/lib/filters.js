// What narrows the cards on a board, kept in the address (`/p/WEB?q=link&who=ada,grace&label=bug&due=soon`): a filtered board can be linked, reloaded, and gone back to.
// The address is the state; this turns it into a filter and back, and says which tasks a filter keeps.

/** The days a task is "soon" due in. */
export const SOON_DAYS = 7

const list = (value) => (typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : [])
const first = (value) => (Array.isArray(value) ? value[0] : value)

/**
 * @param {object} query the query of the address (what vue-router gives)
 * @returns {{text: string, who: Array<string>, label: Array<string>, due: ''|'overdue'|'soon'|'none'}}
 */
export function readFilters (query = {}) {
  const due = first(query.due)
  return {
    text: String(first(query.q) || '').slice(0, 100),
    who: list(first(query.who)),
    label: list(first(query.label)),
    due: ['overdue', 'soon', 'none'].includes(due) ? due : ''
  }
}

/**
 * @param {ReturnType<typeof readFilters>} filters
 * @returns {object} the query of the address: only what is set, so that an empty filter is a clean address
 */
export function writeFilters (filters) {
  const query = {}
  if (filters.text) {
    query.q = filters.text
  }
  if (filters.who.length) {
    query.who = filters.who.join(',')
  }
  if (filters.label.length) {
    query.label = filters.label.join(',')
  }
  if (filters.due) {
    query.due = filters.due
  }
  return query
}

/** @returns {boolean} whether nothing is filtered */
export const isEmpty = (filters) => !filters.text && !filters.who.length && !filters.label.length && !filters.due

/**
 * @param {object} task
 * @param {ReturnType<typeof readFilters>} filters
 * @param {object} context
 * @param {function(string): string|undefined} context.usernameOf the account of the person an id is
 * @param {number} [context.now] the time, in ms
 * @returns {boolean} whether the filter keeps the task: every part that is set must hold (a person or a label is one of those chosen)
 */
export function keeps (task, filters, { usernameOf, now = Date.now() }) {
  if (filters.text) {
    const wanted = filters.text.toLowerCase()
    if (!`${task.ref} ${task.title} ${task.description || ''}`.toLowerCase().includes(wanted)) {
      return false
    }
  }
  if (filters.who.length) {
    const who = task.assignee ? usernameOf(task.assignee) : 'nobody'
    if (!filters.who.includes(who)) {
      return false
    }
  }
  if (filters.label.length && !(task.labels || []).some((label) => filters.label.includes(label))) {
    return false
  }
  if (filters.due) {
    const due = Number.isFinite(task.due) ? task.due : null
    const done = task.status === 'done'
    if (filters.due === 'none') {
      return due === null
    }
    if (due === null || done) {
      return false
    }
    return filters.due === 'overdue' ? due < now : due >= now && due < now + SOON_DAYS * 86400000
  }
  return true
}
