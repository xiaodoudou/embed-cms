// What the example keeps: notes with a title and a text. They can be read without signing in (anonymousRead in server.js), so a
// `curl /api/notes` shows that the container works.
module.exports = {
  displayname: { enUS: 'Notes' },
  locales: ['enUS'],
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true },
    // what tells one note from another: content.json is loaded once, and not again over what is there
    { field: 'slug', input: 'string', label: 'Slug', localised: false, required: true, unique: true },
    { field: 'text', input: 'textarea', label: 'Text' }
  ]
}
