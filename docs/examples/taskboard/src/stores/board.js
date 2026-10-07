// The board: the four collections (people, projects, tasks, comments) and what the screens do with them. A screen asks for a column, a move, a comment; it never builds an address
// or looks at a response. What is derived (the cards of a column, the person who is me) is computed from the collections, so it is always the state of the records, never a copy.
import { computed } from 'vue'
import { place, STEP } from '../lib/position.js'
import { keeps } from '../lib/filters.js'
import { createCollection } from './collection.js'

export const STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'In progress' },
  { value: 'review', label: 'In review' },
  { value: 'done', label: 'Done' }
]

/**
 * @param {object} deps
 * @param {ReturnType<import('../api/http').createHttp>} deps.http
 * @param {ReturnType<import('../api/realtime').createRealtime>} deps.realtime
 * @param {ReturnType<import('../api/session').createSession>} deps.session
 */
export function createBoard ({ http, realtime, session }) {
  const make = (resource) => createCollection({ http, realtime, session, resource })
  const people = make('people')
  const projects = make('projects')
  const tasks = make('tasks')
  const comments = make('comments')

  const personByUsername = computed(() => new Map(people.list.value.map((person) => [person.username, person])))
  /** the person that the signed-in account is, if the team has one for it */
  const me = computed(() => (session.state.user ? personByUsername.value.get(session.state.user.username) || null : null))
  const usernameOf = (id) => (people.get(id) || {}).username
  const projectByKey = (key) => projects.list.value.find((project) => project.key === key)

  /** @returns {Array<object>} the cards of one column of a project that the filter keeps, in their order */
  function column (projectId, status, filters) {
    const context = { usernameOf }
    return tasks.list.value
      .filter((task) => task.project === projectId && task.status === status && keeps(task, filters, context))
      .sort((a, b) => (a.position - b.position) || String(a.ref).localeCompare(String(b.ref)))
  }

  /** @returns {Array<string>} the labels that the tasks of a project have, to offer in the filter */
  const labelsOf = (projectId) => [...new Set(tasks.list.value.filter((task) => task.project === projectId).flatMap((task) => task.labels || []))].sort()

  /**
   * Loads what a board shows: the team, the projects, and the tasks of one project.
   * @param {string} key the key of the project (WEB)
   * @param {AbortSignal} [signal] to stop when the person has gone elsewhere
   * @returns {Promise<object|undefined>} the project, or nothing when there is none with that key
   */
  async function open (key, signal) {
    await Promise.all([people.loaded.value ? null : people.load({}, { signal }), projects.loaded.value ? null : projects.load({}, { signal })])
    const project = projectByKey(key)
    if (project) {
      await tasks.load({ project: project._id }, { signal, scope: (task) => task.project === project._id })
    }
    return project
  }

  /**
   * Puts a new card at the foot of a column; the CMS gives it its number and its place. Until it answers the card is shown at the foot, where it will be.
   * @returns {Promise<object>}
   */
  function addTask (projectId, status, title) {
    const foot = Math.max(0, ...tasks.list.value.filter((task) => task.project === projectId && task.status === status).map((task) => task.position).filter(Number.isFinite))
    return tasks.create({ project: projectId, status, title }, { position: foot + STEP })
  }

  /**
   * Moves a card to a place in a column: one write for the card, and a few more only when the numbers of the column have no room left.
   * @param {string} id the card
   * @param {string} status the column it is dropped in
   * @param {Array<object>} cards the cards of that column that are on the screen, in order
   * @param {number} index the place among them
   */
  async function moveTask (id, status, cards, index) {
    const { position, renumber } = place(cards, id, index)
    await Promise.all(renumber.map((card) => tasks.update(card._id, { position: card.position })))
    await tasks.update(id, { status, position })
  }

  /** @returns {Promise<void>} reads the comments of a task */
  const openTask = (taskId, signal) => comments.load({ task: taskId }, { signal, scope: (comment) => comment.task === taskId })
  const commentsOf = (taskId) => comments.list.value.filter((comment) => comment.task === taskId).sort((a, b) => a._createdAt - b._createdAt)
  /** the author is set by the CMS from the account that wrote: it is not sent */
  const addComment = (taskId, text) => comments.create({ task: taskId, text })

  /**
   * Adds a file to a task, saying how far it has gone, then reads the task again (the answer of the upload is the file, not the task).
   * @param {string} taskId
   * @param {File|Blob} blob
   * @param {function(number): void} [onProgress]
   * @param {AbortSignal} [signal]
   */
  async function attach (taskId, blob, onProgress, signal) {
    await http.upload('tasks', taskId, { field: 'files', blob, onProgress, signal })
    await tasks.fetch(taskId)
  }

  /** Takes a file off a task. */
  async function detach (taskId, attachmentId) {
    await http.delete(`/api/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`)
    await tasks.fetch(taskId)
  }

  /** Makes a project. */
  const addProject = (data) => projects.create(data)

  return { people, projects, tasks, comments, me, usernameOf, projectByKey, column, labelsOf, open, addTask, moveTask, openTask, commentsOf, addComment, attach, detach, addProject, stop: () => [people, projects, tasks, comments].forEach((one) => one.stop()) }
}
