// The projects: a board each. `key` is what a task is numbered with (WEB-12) and what the address of the board says (/p/WEB).
module.exports = {
  displayname: { enUS: 'Projects' },
  locales: ['enUS'],
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true },
    { field: 'key', input: 'string', label: 'Key', localised: false, required: true, unique: true, options: { hint: 'Capital letters, a few: WEB, OPS' } },
    { field: 'description', input: 'text', label: 'Description', localised: false },
    { field: 'archived', input: 'checkbox', label: 'Archived', localised: false }
  ]
}
