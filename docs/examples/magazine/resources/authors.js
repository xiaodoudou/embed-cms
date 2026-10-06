// The people who write: a name, a slug for their address, a few words about them and a photo
module.exports = {
  displayname: { enUS: 'Authors' },
  locales: ['enUS', 'zhCN'],
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true },
    { field: 'slug', input: 'string', label: 'Slug', localised: false, required: true, unique: true },
    { field: 'bio', input: 'text', label: 'About' },
    { field: 'photo', input: 'image', label: 'Photo', localised: false, options: { maxCount: 1 } }
  ]
}
