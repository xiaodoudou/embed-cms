← [Field types](../FIELDS.md) · [Documentation](../../README.md)

# token

A key, a secret or an id that two systems share. Type it, paste it, or make a random one with the **Generate** button; the **Copy** button copies it. With `options.autoGenerate`, a new record gets a token by itself. Component: `TokenField` (`src/components/fields/TokenField.vue`), with the tokens made by `src/utils/token.js` in the admin and `lib/util/token.js` on the server.

Catalogue: `resources/text_formats.js` (group **Text**, resource **Formatted strings**), fields `apiKey` and `hexToken`.

## Declaration

```js
{ field: 'apiKey', input: 'token', label: 'API key', localised: false, options: { prefix: 'key_' } }
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `field`, `input`, `label` | | | As for [string](string.md). |
| `localised` | boolean | | Write `localised: false`. A token is one value per record; the server leaves a value per language alone and makes none for it. |
| `required` | boolean | `false` | Adds `*` to the label; a save with no token is refused (`This field is required!`). |
| `options.autoGenerate` | boolean | `false` | A new record gets a token by itself: as its form opens, and from the server when it is created over the API without one. |
| `options.length` | integer | `32` | How many random bytes **Generate** makes, from 8 to 128. 32 bytes are 43 characters in `base64url` and 64 in `hex`. |
| `options.prefix` | string | none | Written before the random part, up to 32 characters (`key_`, `rpl_`), so a token says what it is for. |
| `options.format` | `'base64url'` or `'hex'` | `'base64url'` | How the bytes are written: letters, digits, `-` and `_` with no padding, or lower-case hexadecimal. |
| `options.hint` | string | none | Help text under the field. |
| `options.readonly` | boolean | `false` | Shows the token, changes nothing: no **Generate** button, and no token for a new record. |
| `options.disabled` | boolean | `false` | Greyed out and not focusable. |

## Stored value

A string. A generated token is the prefix, then the random bytes: `key_mH2v0Z8yJ3sQe5b1rXo9cWkT4uPn6aLdFgVhYi7jRzE`. A typed or pasted one is kept as it is.

## What happens when

- **You type or paste:** the field takes the value as it is, like a text field.
- **Generate:** puts a new random token in the field. The record keeps its old one until you save, so Discard brings it back.
- **A new record, with `autoGenerate`:** the form fills the field as it opens, and the server fills it for a record created over the API without one. A record sent with a value keeps that value.
- **An update** never makes a new token.

## Notes

- The token is stored as it is, not hashed, and anyone who can read the record can read it. Give the resource rights to the groups that should see the token, and no others.
- Two records can't have the same token in practice, but nothing checks it. Add `unique: true` if a duplicate must be refused.
