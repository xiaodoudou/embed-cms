// Resource of the driver contract suite: a unique key, localised text, numbers, a boolean, arrays and nested data.
module.exports = {
  displayname: 'Items',
  schema: [
    { field: 'key', input: 'string', unique: true, required: true, localised: false },
    { field: 'title', input: 'string', localised: true },
    { field: 'n', input: 'number', localised: false },
    { field: 'flag', input: 'checkbox', localised: false },
    { field: 'tags', input: 'multiselect', source: ['x', 'y', 'z'], localised: false },
    { field: 'note', input: 'text', localised: false },
    { field: 'photo', input: 'image', localised: false, options: { maxCount: 3 } }
  ],
  locales: ['enUS', 'zhCN'],
  type: 'normal'
}
