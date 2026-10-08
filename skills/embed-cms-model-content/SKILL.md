---
name: embed-cms-model-content
description: Design or change the content model of an embed-cms site, meaning resources, fields, locales, relations, paragraph blocks and single-record settings. Use when the user wants to add a resource, add or change a field, make content multilingual, link resources, or asks which field type to use.
---

# Model content in embed-cms

A resource is `resources/<name>.js` (the file name is the resource name, served at `/api/<name>`).

```js
module.exports = {
  displayname: { enUS: 'Articles', zhCN: '文章' },
  group: 'Content', // menu heading
  locales: ['enUS', 'zhCN'], // omit for one language
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true },
    { field: 'slug', input: 'transliterate', label: 'Slug', localised: false, unique: true, options: { valueFrom: 'title' } },
    { field: 'author', input: 'select', label: 'Author', localised: false, source: 'authors', options: { customLabel: '{{name}}' } },
    { field: 'cover', input: 'image', label: 'Cover', localised: false, options: { maxCount: 1, accept: '.jpg,.png' } },
    { field: 'published', input: 'checkbox', label: 'Published', localised: false },
    { field: 'body', input: 'paragraph', label: 'Body', options: { types: ['quote'] } }
  ]
}
```

## Decisions

- **`unique` depends on what the resource needs.** Without one, a record is identified by its `_id`, which is fine for the admin, the REST API and `cms.api()`. Add a `unique` field (a slug, a code, a name) when something must find a record by a stable key: `cms-load` and `resource://key` references, imports, sync between servers, or public URLs like `/articles/:slug`. It also costs something: every create and update searches the resource to check the key, and a very large resource pays for it. Ask what the resource will be used for before adding one.
- **`localised: false`** for what does not change by language (slug, relations, flags, files). Localised values are stored as `{ enUS, zhCN }`.
- **Relations**: `select` / `multiselect` with `source: '<resource>'` store the target `_id`. The target resource must exist (all files are read at start, in any order).
- **Single record** (site settings, a home page): `maxCount: 1`. **Spreadsheet view**: `view: 'table'`.
- **Block content**: a `paragraph` field. Each type in `options.types` needs its file `resources/paragraphs/<type>.js` (the example above uses `quote`, so `resources/paragraphs/quote.js` must exist, with its own `schema`). Without the file the server only warns and the field offers no block.
- **Field types**: do not guess options. Read `docs/reference/FIELDS.md` and `docs/reference/fields/<type>.md`, and copy from `resources/*.js` (one example per family: text, numbers, dates, choice, media, reference, structured, places). Those folders are in the repository https://github.com/xiaodoudou/embed-cms, not in the npm package.
- Nested values use dotted names (`address.city`); groups of nested fields use the resource `groups` key.

## Caveats

- **Restart** after editing a resource file.
- The server checks `unique` and group rights. `required`, formats, min/max and patterns are checked by the **admin only**; REST and API clients must validate their own input.
- Renaming or removing a field does not migrate stored records. Back up (`embed-cms-backup-restore`), then patch (`embed-cms-patch-content`).
- Never give an editors' group rights on `_users` or `_groups`: they could make themselves administrators.
- Expose public data with `anonymousRead: [...]` and list only what is public.
