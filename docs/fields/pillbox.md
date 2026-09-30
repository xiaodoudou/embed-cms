# pillbox

Free-form tags: type a value and press Enter, it becomes a chip. Component: `CustomInputTag` (`src/components/fields/CustomInputTag.vue`, a Vuetify combobox). Unlike [multiselect](multiselect.md) the values are not taken from a list.

Catalogue: `resources/choice_multi.js`, fields `tags`, `requiredTags`, `localisedTags`, `boundedTags`.

## Declaration

```js
{ field: 'tags', input: 'pillbox', label: 'Tags', localised: false }
{ field: 'keywords', input: 'pillbox', label: 'Keywords (2 to 4)', localised: false, min: 2, max: 4 }
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `field`, `input`, `label`, `localised`, `unique` | | | As for [string](string.md). |
| `required` | boolean | `false` | Adds `*` to the label only: **not enforced**, a record with no tag was saved. |
| `min` / `max` | number | none | Declared at field level (next to `input`, not in `options`) and forwarded to the component, but **not enforced** (see Validation). |
| `options.hint` | string | none | Help text under the field. |
| `options.readonly` | boolean | `false` | Passed to the combobox as `readonly`. Not used by the catalogue, not verified. |
| `options.disabled` | boolean | `false` | Greyed out. Not used by the catalogue. |

Typing behaviour:
- Enter turns the text into a chip; a value with commas (`a,b`, also when pasted) is split into one chip per part, trimmed, empty parts dropped.
- Duplicates are removed.
- Right-click a chip to copy its value; each chip has a close button and the field a clear button.

## Variations

### Default

`resources/choice_multi.js`, field `tags`.

![Pillbox](img/pillbox-default.png)
![Tags added](img/pillbox-filled.png)

### Required

`resources/choice_multi.js`, field `requiredTags`. Only the `*` mark: an empty required pillbox does not block the save and shows no error (a record was saved with `"requiredTags": []`).

![Required pillbox](img/pillbox-required.png)

### Localised

`resources/choice_multi.js`, field `localisedTags`: one list per locale.

![Localised pillbox](img/pillbox-localised.png)

### Bounded

`resources/choice_multi.js`, field `boundedTags` (`min: 2, max: 4`). The hint tells the editor the range; the range itself is not checked.

![Bounded pillbox](img/pillbox-bounded.png)
![One tag accepted](img/pillbox-bounded-one.png)

## Stored value

An array of strings; localised: one array per locale.

```json
{ "tags": ["news", "sport", "a", "b"], "localisedTags": { "enUS": ["en1"], "zhCN": ["zh1"] }, "boundedTags": ["one"] }
```

## Validation and behaviour

- UI: neither `required` nor `min` / `max` is enforced: a record with an empty `requiredTags` and a single-tag `boundedTags` (`min: 2`) was saved. An untouched pillbox is stored as `[]`.
- Server: only `unique`; arrays of any length are stored.
- The old `inputtag` type no longer exists; use `pillbox`.
