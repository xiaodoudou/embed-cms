// The tasks of a board. `status` is the column, `position` the place in it (a number the board puts between its neighbours when a card is dropped, see src/lib/position.js),
// `files` the files that are attached to it. A task points to its project and to the person it is given to with `select` fields, as in every example.
module.exports = {
  displayname: { enUS: 'Tasks' },
  locales: ['enUS'],
  schema: [
    { field: 'ref', input: 'string', label: 'Number', localised: false, unique: true, options: { hint: 'WEB-12: made by the CMS (hooks.js) when a task is made without one', readonly: true } },
    { field: 'title', input: 'string', label: 'Title', localised: false, required: true },
    { field: 'project', input: 'select', label: 'Project', localised: false, source: 'projects', required: true },
    { field: 'status', input: 'segmented', label: 'Status', localised: false, source: ['todo', 'doing', 'review', 'done'], required: true },
    { field: 'position', input: 'double', label: 'Position', localised: false, options: { hint: 'In its column, smaller first' } },
    { field: 'assignee', input: 'select', label: 'Given to', localised: false, source: 'people' },
    { field: 'labels', input: 'inputtag', label: 'Labels', localised: false },
    { field: 'due', input: 'date', label: 'Due', localised: false },
    { field: 'description', input: 'text', label: 'Description', localised: false },
    { field: 'files', input: 'file', label: 'Files', localised: false, options: { hint: 'Any number of files' } }
  ]
}
