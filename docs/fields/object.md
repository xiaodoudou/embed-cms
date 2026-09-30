# object

Structured editor whose form is generated from a JSON schema (booleans, text, numbers, lists of choices, arrays as tables). Component: `JsonEditor` (`src/components/fields/JsonEditor.vue`, built on `@json-editor/json-editor` with a CMS theme).

Catalogue: `resources/structured_data.js`, fields `settings`, `rows`, `localisedObject`.

## Declaration

```js
{
  field: 'settings',
  input: 'object',
  label: 'Settings',
  localised: false,
  options: {
    jsonEditorOptions: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        title: { type: 'string' },
        count: { type: 'integer', minimum: 0, maximum: 10, default: 1 },
        mode: { type: 'string', enum: ['fast', 'balanced', 'thorough'], default: 'balanced' }
      },
      required: ['title']
    }
  }
}
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `field`, `input`, `label`, `localised`, `unique` | | | As for [string](string.md). |
| `options.jsonEditorOptions` | JSON schema | **required** | The schema given to json-editor (`type`, `properties`, `items`, `enum`, `default`, `minimum`, `maximum`, `format: 'table'`, ...). Without it the field cannot render (`this.schema.jsonEditorOptions.title` is set on it at mount). The top-level `title` is blanked, the label of the field is used instead. |
| `options.hint` | string | none | Help text under the editor. |
| `required` | boolean | `false` | Refuses the save while the object is empty, like the other types. The catalogue has no required object field, so this is not verified in the UI. |
| `options.readonly` | | | No effect: json-editor is not switched to read-only. |
| `options.disabled` | boolean | `false` | Only disables deleting array rows when the whole form is disabled; the inputs stay editable. |

## Variations

### Object form

`resources/structured_data.js`, field `settings` (a checkbox-like boolean, a text, a bounded integer and a list of choices). Defaults from the schema are applied immediately.

![Settings](img/object-default.png)
![Settings filled](img/object-settings-filled.png)

### Array as a table

`resources/structured_data.js`, field `rows` (`type: 'array', format: 'table'`). **Add row** appends a row; **Delete Last row**, **Delete All**, **Delete** and **Move up/down** edit the list.

![Table rows](img/object-table.png)
![Two rows](img/object-table-filled.png)

### Localised

`resources/structured_data.js`, field `localisedObject`: one object per locale.

![Localised object](img/object-localised.png)

## Stored value

The JSON produced by the editor, with the schema defaults, `{ enUS, zhCN }` when localised:

```json
{
  "settings": { "enabled": true, "title": "My title", "count": 5, "mode": "fast" },
  "rows": [ { "label": "", "kind": "a", "amount": 0 }, { "label": "", "kind": "a", "amount": 0 } ],
  "localisedObject": { "enUS": { "label": "" } }
}
```

Numbers are stored as numbers (unlike the `number` field type). A locale whose tab was never opened is not created.

## Validation and behaviour

- The JSON schema is used to build the form and its defaults only. Its constraints are **not connected to the form**: `required: ['title']` and `minimum` / `maximum` did not stop a save with an empty `title` (saved as `""`).
- The controls use the browser's default look; the buttons are plain text.
- Server: only `unique`.
