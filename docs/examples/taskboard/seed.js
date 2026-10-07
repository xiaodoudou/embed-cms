// What a first start puts in the CMS: the people, the projects and the tasks of content.json, the group that the team signs in with, one account for each person, and a few comments.
// Run again, it does nothing: what is there is left alone.
const crypto = require('crypto')
const path = require('path')
const CMS = require('../../../')

/** What the group `team` may do: everything on the four resources of the board, and add files. It has no right on the CMS itself (users, groups, the other resources). */
const RESOURCES = ['people', 'projects', 'tasks', 'comments']
const PEOPLE = ['ada', 'grace', 'linus']

/**
 * @param {object} cms
 * @returns {Promise<{report: object, accounts: Array<{username: string, password: string}>}>} the accounts that were made now, with their passwords (shown once: only a hash is kept)
 */
async function seed (cms) {
  const report = await new CMS.ContentLoader(cms).load(path.join(__dirname, 'content.json'))
  const authentication = cms.$authentication
  let group = await authentication.groups.find({ name: 'team' })
  if (!group) {
    group = await authentication.groups.create({ name: 'team', read: RESOURCES, create: RESOURCES, update: RESOURCES, remove: RESOURCES, attachments: RESOURCES })
  }
  const accounts = []
  for (const username of PEOPLE) {
    if (!(await authentication.users.find({ username }))) {
      const password = crypto.randomBytes(6).toString('hex')
      await authentication.users.create({ username, password, group: group._id })
      accounts.push({ username, password })
    }
  }
  const comments = cms.api()('comments')
  if (!(await comments.list({}, { limit: 1 })).length) {
    const task = await cms.api()('tasks').find({ ref: 'WEB-3' })
    await comments.create({ task: task._id, text: 'The prices are in the shared sheet. Which plan do we show first?', _updatedBy: 'team~ada' })
    await comments.create({ task: task._id, text: 'The middle one. I will send the layout tomorrow.', _updatedBy: 'team~grace' })
  }
  return { report, accounts }
}

module.exports = { seed, RESOURCES, PEOPLE }
