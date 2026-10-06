// What the team says on a task. `author` is the account that wrote it, which the board puts in and the CMS keeps.
module.exports = {
  displayname: { enUS: 'Comments' },
  locales: ['enUS'],
  schema: [
    { field: 'task', input: 'select', label: 'Task', localised: false, source: 'tasks', required: true },
    { field: 'author', input: 'string', label: 'Author', localised: false },
    { field: 'text', input: 'text', label: 'Text', localised: false, required: true }
  ]
}
