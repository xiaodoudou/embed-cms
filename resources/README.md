← [Documentation](../docs/README.md) · [Field types](../docs/reference/FIELDS.md)

# Field catalogue

Every resource here demonstrates ONE family of field types with each variation the CMS supports. Nothing here models a
real project: copy the field you need into your own resource.

| Group | Resource | Field types |
|---|---|---|
| Text | `text_strings` | string, transliterate |
| Text | `text_long` | text, wysiwyg, code |
| Text | `text_formats` | email, url, password |
| Text | `languages` | text, rich text, tags, selects, image and switch in four languages (English, Chinese, French, Thai) |
| Numbers | `numbers` | number, integer, double |
| Date and time | `dates` | date, time, datetime |
| Choice | `choice_boolean` | checkbox |
| Choice | `choice_select` | select (static, labelled, resource) |
| Choice | `choice_multi` | multiselect, pillbox |
| Choice | `choice_color` | color |
| Media | `media_images` | image |
| Media | `media_files` | file |
| Structured | `structured_data` | json, object |
| Structured | `structured_blocks` | paragraph |
| Table | `table_view` | the table view (`view: 'table'`): one column per field |
| Reference data | `reference_items` | target of the `source` examples |

Variations shown in each resource, where the type supports them:

- `required`, `unique`, `localised: true|false` (each resource declares two locales)
- `options.hint`, `options.readonly`, `options.disabled`, `label` (plain and per locale)
- validation: `regex`, `min` / `max`, `accept`, `maxCount`, `limit`
- sources: a static array, labelled values, or another resource with `customLabel`

Paragraph types live in `paragraphs/`: text, media, and a group block that nests the other two.
