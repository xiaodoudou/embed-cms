← [Documentation](../docs/README.md) · [Field types](../docs/reference/FIELDS.md)

# Field catalogue

Every resource here demonstrates ONE family of field types with each variation the CMS supports. Nothing here models a
real project: copy the field you need into your own resource.

| Group | Resource | Field types |
|---|---|---|
| Text | `text_strings` | string, transliterate |
| Text | `text_long` | text, wysiwyg, code |
| Text | `text_formats` | email, url, password |
| Text | `languages_ten` | the most languages a resource can show: ten (a real project has two to four) |
| Text | `languages` | text, rich text, tags, selects, image and switch in four languages (English, Chinese, French, Thai) |
| Numbers | `numbers` | number, integer, double |
| Numbers | `numbers_quantities` | rating, duration |
| Date and time | `dates` | date, time, datetime, daterange |
| Place | `places` | geopoint (a latitude and a longitude, with a map to pick on) |
| Choice | `choice_boolean` | checkbox |
| Choice | `choice_select` | select (static, labelled, resource) |
| Choice | `choice_buttons` | radio, segmented |
| Choice | `choice_multi` | multiselect, pillbox |
| Choice | `choice_color` | color |
| Media | `media_images` | image |
| Media | `media_crop` | cropimage (the crop tool: free or fixed shapes, a fixed size, a circle, several pictures) |
| Media | `media_map` | imagemap (areas on a picture, with an address or a record to link to) |
| Media | `media_files` | file |
| Structured | `structured_data` | json, object |
| Structured | `structured_blocks` | paragraph |
| Structured | `structured_layout` | fields side by side in the record form, with `layout.lines` (see [FORM_LAYOUT.md](../docs/reference/FORM_LAYOUT.md)) |
| Structured | `structured_groups` | groups of dotted fields (`contact.email`): a title, `collapsible`, `collapsed` and a `layout` of their own (see [FIELDS.md](../docs/reference/FIELDS.md#groups)) |
| Structured | `structured_grid` | paragraph blocks side by side: 2 by 2, 3 by 3, mixed (see [DYNAMIC_LAYOUT.md](../docs/reference/DYNAMIC_LAYOUT.md)) |
| Table | `table_view` | the table view (`view: 'table'`): one column per field |
| Reference data | `reference_items` | target of the `source` examples |
| Reference data | `reference_people` | the second resource of the `sources` examples |

Variations shown in each resource, where the type supports them:

- `required`, `unique`, `localised: true|false` (each resource declares two locales)
- `options.hint`, `options.readonly`, `options.disabled`, `label` (plain and per locale)
- validation: `regex`, `min` / `max`, `accept`, `maxCount`, `limit`
- sources: a static array, labelled values, or another resource with `customLabel`

Paragraph types live in `paragraphs/`: text, media, a group block that nests the other two, and a contact block whose fields are in groups (see [Groups](../docs/reference/FIELDS.md#groups)).
