// The content of the example site: articles with a title, a slug for their address, a rich text body, and a switch that publishes them
module.exports = {
  displayname: { enUS: 'Articles' },
  locales: ['enUS'],
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true },
    { field: 'slug', input: 'string', label: 'Slug', localised: false, required: true, unique: true, options: { hint: 'The address of the article: /articles/<slug>' } },
    { field: 'body', input: 'wysiwyg', label: 'Body' },
    { field: 'published', input: 'checkbox', label: 'Published', localised: false }
  ]
}
