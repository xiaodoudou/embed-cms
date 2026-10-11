← [Concepts](../start/CONCEPTS.md#resource) · [Documentation](../README.md)

# Resource files

A resource is declared by one JavaScript file in the `resources/` folder. The file name is the name of the resource, so `resources/articles.js` declares `articles`, served at `/api/articles` and listed in the admin's menu. You can also declare one in code with `cms.resource('articles', { ... })`, which takes the same keys.

This page lists every key a resource can have. The fields in `schema` have their own pages, linked at the end.

## A whole file

```js
// resources/articles.js
module.exports = {
  displayname: { enUS: 'Articles', zhCN: '文章' },
  group: ['Content', 'Blog'],
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  allowed: ['admins', 'editors'],
  displayItem: '{{title}} by {{author.name}}',
  extraSources: { author: 'authors' },
  groups: { seo: { label: 'Search engines', collapsible: true, collapsed: true } },
  layout: { lines: [{ slots: 2, fields: [{ model: 'title' }, { model: 'author' }] }] },
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true },
    { field: 'author', input: 'select', source: 'authors', label: 'Author' },
    { field: 'seo.description', input: 'text', label: 'Description' }
  ]
}
```

Only `schema` is required. Every other key has a default, and the file works with the schema alone.

## The keys

| Key | Type | Default | What it does |
|---|---|---|---|
| `schema` | `array` of fields | none | The fields of a record. See [Field types](FIELDS.md). |
| `displayname` | `string`, or `object` with one string per admin language | the name of the resource | The name shown in the menu, the breadcrumb and the quick switcher. |
| `group` | `string`, `object` with one string per admin language, or an `array` of either | none | The heading of the menu the resource is filed under. An array nests it: see [Nested groups](#nested-groups). Without one, the resource goes under **Others**. |
| `allowed` | `array` of `string` | everyone | The names of the user groups that see the resource in the admin's menu. The API ignores it: use the rights of the groups. |
| `locales` | `array` of `string` | none | The content languages, as locale codes (`'enUS'`). Every field then holds one value per locale, unless it says `localised: false`. See [Locale](../start/CONCEPTS.md#locale). |
| `view` | `'table'` | the list | A grid with a column per field instead of the list. See [View](../start/CONCEPTS.md#view). |
| `maxCount` | `number` | no limit | The most records it holds. With `1` the admin opens the record directly, with no list. Once the limit is reached, a create returns the existing record instead of failing. |
| `displayItem` | `string`, a [Mustache](https://github.com/janl/mustache.js) template | the first field | How a record is named in the list and in the multiple selection. See [Naming records](#naming-records). |
| `extraSources` | `object`, `{ field: resource }` | none | Turns the id in a field into the record it points to, for `displayItem`. See [Naming records](#naming-records). |
| `groups` | `object`, `{ path: options }` | none | The look of groups of nested fields (`address.city`): a title, `collapsible`, `collapsed` and a `layout` of their own. See [Groups](FIELDS.md#groups). |
| `layout` | `object`, `{ lines: [...] }` | one field per line | Puts fields side by side in the record form. See [Form layout](FORM_LAYOUT.md). |
| `activeField` | `string`, the name of a boolean field | none | At most one record has this field set to `true`. Setting it on a record clears it on the others, and when the active record is removed, the first other one becomes active. |
| `type` | `'normal'`, `'downstream'` or `'upstream'` | `'normal'` | The direction records travel when [replication](../operations/REPLICATION.md#directions) runs. |

## Nested groups

`group` can be a name or a list of names. A list files the resource in a group inside a group, from the top down:

```js
group: 'Content'                    // under the heading Content
group: ['Content', 'Blog']          // under Blog, inside Content
group: ['Content', 'Blog', 'Tags']  // one more level
```

The list can be as long as you like. Each name is a string, or an object with one name per admin language, `{ enUS: 'Blog', zhCN: '博客' }`. A plain string is one level, so existing resources don't change.

Names are matched from the top. Two resources that start with the same names share those groups, and a group that holds only other groups is shown as a heading with the groups inside it. An empty name in the list is skipped, and an empty list means no group.

What the admin shows:

- **Sidebar:** a nested group opens and closes like a heading. Its resources come first, then the groups inside it, one step in. The step is small and stops growing after five levels. Opening a resource opens the groups around it, and the filter looks through every level.
- **Collapsed sidebar:** only the top group has a badge. Its pop-up lists the groups inside it as small headings, with their resources under them.
- **Breadcrumb and quick switcher:** the breadcrumb shows the whole path, `Content / Blog`. The quick switcher finds a resource at any depth.
- **Icons:** every group can have an image in **Settings**, under **Menu icons**. A group inside another is named from the top down, `Content / Blog`, so two groups with the same name in different places have their own icons.

## Naming records

A record is named by the value of the first field of the schema, in the language you are editing, and by its `_id` when that is empty. That is the name in the record list and in the chips of the multiple selection. A `displayItem` template changes it:

```js
displayItem: '{{title}} ({{status}})'
```

The template is rendered with the record. When a field holds the `_id` of a record of another resource, `extraSources` replaces that id with the record, so the template can reach its fields:

```js
extraSources: { author: 'authors' },
displayItem: '{{title}} by {{author.name}}'
```

Here `author` is a field of the schema and `authors` is the name of the other resource. If the field you use is localised in the other resource, it is an object with one value per locale, so name the locale: `{{author.name.enUS}}`.

## System resources

A name that starts with an underscore belongs to the CMS: `_users`, `_groups`, `_settings`, and `_sync` and `_xlsx` when their plugins are on. They are edited in the admin like any other resource. See [System resources](../start/CONCEPTS.md#system-resources).

## Where to go next

- [Field types](FIELDS.md), for what goes in `schema`.
- [Form layout](FORM_LAYOUT.md) and [Dynamic layout](DYNAMIC_LAYOUT.md), for the record form.
- [The field catalogue](../../resources/README.md), for a working resource of each family of fields.
- [The API](API.md), for hooks on the operations of a resource (`before` and `after` `create`, `update` and the rest) and the JavaScript API.
- [Types and editor support](TYPESCRIPT.md), for `ResourceDefinition`, which has these keys with autocomplete.
