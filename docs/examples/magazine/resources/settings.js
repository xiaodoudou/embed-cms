// The name and the tagline of the site: one record (`maxCount: 1`), in both languages
module.exports = {
  displayname: { enUS: 'Site' },
  locales: ['enUS', 'zhCN'],
  maxCount: 1,
  schema: [
    { field: 'name', input: 'string', label: 'Name of the site', required: true },
    { field: 'tagline', input: 'string', label: 'Tagline' }
  ]
}
