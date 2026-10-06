// The resources the tests of the ContentLoader load into: a settings record, authors with a photo, categories and articles that point to them (a copy of the ones of docs/examples/magazine).
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
