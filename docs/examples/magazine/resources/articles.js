// The articles: text in both languages, a cover, an author and categories (the records they point to are followed by cms.api, see content.js)
module.exports = {
  displayname: { enUS: 'Articles' },
  locales: ['enUS', 'zhCN'],
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true },
    { field: 'summary', input: 'text', label: 'Summary' },
    { field: 'body', input: 'wysiwyg', label: 'Body' },
    { field: 'slug', input: 'string', label: 'Slug', localised: false, required: true, unique: true },
    { field: 'cover', input: 'image', label: 'Cover', localised: false, options: { maxCount: 1 } },
    { field: 'author', input: 'select', label: 'Author', localised: false, source: 'authors' },
    { field: 'categories', input: 'multiselect', label: 'Categories', localised: false, source: 'categories' },
    { field: 'publishedOn', input: 'date', label: 'Published on', localised: false },
    { field: 'featured', input: 'checkbox', label: 'Featured on the home page', localised: false },
    { field: 'published', input: 'checkbox', label: 'Published', localised: false }
  ]
}
