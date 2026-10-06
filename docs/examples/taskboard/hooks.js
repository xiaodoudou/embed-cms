// What the CMS does on its own side, whoever writes (the board, the admin, a script): the number of a task, its place in its column, and who wrote a comment.
// A client is not trusted with any of these: a number that two people ask for at the same moment must not be given twice, and an author must be the account that wrote.
const _ = require('lodash')

/** Runs one job at a time, in the order they were asked: the number of a task is read, then written, before the next is read. */
const queue = () => {
  let last = Promise.resolve()
  return (job) => {
    const run = last.then(job, job)
    last = run.catch(() => {})
    return run
  }
}

/** The distance between two cards that are first put in a column: room to put others between them without moving anyone. */
const STEP = 1000

/**
 * @param {object} cms
 */
function install (cms) {
  const api = cms.api()
  const oneAtATime = queue()
  /** the last number given for each project: kept here, since a number is given before the task is written, and two that are asked for at once must not read the same highest */
  const given = new Map()

  api('tasks').before('create', (context) => {
    const task = context.params.object
    oneAtATime(async () => {
      const project = await api('projects').find(task.project)
      if (!project) {
        throw Object.assign(new Error('There is no such project'), { code: 400 })
      }
      const same = await api('tasks').list({ project: project._id })
      // a number is the CMS's to give: one that comes with a request (the REST API stamps what it receives with `_updatedBy`) is not kept. The seed writes in the process, with no stamp,
      // and brings its own numbers
      if (!task.ref || typeof task._updatedBy === 'string') {
        // the first time for a project, the highest that is written; after that, one more than the last that was given (the task that has it may not be written yet)
        if (!given.has(project._id)) {
          given.set(project._id, _.max(same.map((one) => parseInt(String(one.ref).replace(/^.*-/, ''), 10)).filter(Number.isFinite)) || 0)
        }
        given.set(project._id, given.get(project._id) + 1)
        task.ref = `${project.key}-${given.get(project._id)}`
      }
      // at the foot of its column, unless the client said where
      if (!_.isFinite(task.position)) {
        task.position = (_.max(same.filter((one) => one.status === task.status).map((one) => one.position).filter(_.isFinite)) || 0) + STEP
      }
    }).then(() => context.next(), (error) => context.error({ code: error.code || 500, message: error.message }))
  })

  // the number of a task never changes
  api('tasks').before('update', (context) => {
    delete context.params.object.ref
    context.next()
  })

  api('comments').before('create', (context) => {
    // `_updatedBy` is written by the CMS from the account that is signed in (group~account): the author is that account, not what the client said
    const stamp = String(_.get(context, 'params.object._updatedBy', ''))
    context.params.object.author = stamp.includes('~') ? stamp.split('~').slice(1).join('~') : 'someone'
    context.next()
  })
}

module.exports = { install, STEP }
