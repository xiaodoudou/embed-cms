module.exports = {
  displayname: 'Block with relations and files',
  schema: [
    { field: 'title', input: 'string', localised: false },
    { field: 'note', input: 'wysiwyg', localised: false },
    { field: 'tag', input: 'select', source: 'tags', localised: false },
    { field: 'tags', input: 'multiselect', source: 'tags', localised: false },
    { field: 'picture', input: 'image', localised: false, options: { maxCount: 1 } },
    { field: 'download', input: 'file', localised: false }
  ]
}
