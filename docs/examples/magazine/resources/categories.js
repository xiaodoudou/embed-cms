// The sections of the magazine
module.exports = {
  displayname: { enUS: 'Categories' },
  locales: ['enUS', 'zhCN'],
  schema: [
    { field: 'name', input: 'string', label: 'Name', required: true },
    { field: 'slug', input: 'string', label: 'Slug', localised: false, required: true, unique: true },
    { field: 'order', input: 'integer', label: 'Place in the menu', localised: false }
  ]
}
