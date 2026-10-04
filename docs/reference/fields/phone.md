← [Field types](../FIELDS.md) · [Documentation](../../README.md)

# phone

A telephone number: a country chosen from a list and the national number in a box, kept in the international form (`+442071838750`). Component: `PhoneField` (`src/components/fields/PhoneField.vue`), the reading of what is typed, the countries and the words are in `src/utils/phone.js`, the table of calling codes in `src/utils/dialCodes.js`.

Catalogue: `resources/text_formats.js` (group **Text**, resource **Formatted strings**), fields `phone`, `europePhone`, `frenchPhone`, `requiredPhone`, `localisedPhone`, `readOnlyPhone`, `disabledPhone`.

## Declaration

```js
{ field: 'phone', input: 'phone', label: 'Phone', localised: false, options: { countries: ['FR', 'DE', 'GB'], country: 'GB' } }
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `field`, `input`, `label`, `localised` | | | As for [string](string.md). |
| `required` | boolean | `false` | Adds `*` to the label; a save with no number is refused (`This field is required!`). |
| `options.countries` | array | every country | The countries the field takes, ISO 3166 codes (`'FR'`), listed in the order you write them. A code it does not know is left out. With one country there is nothing to choose and the calling code is written for you. |
| `options.country` | string | the country of the language of the admin, else `US` | The country the field starts with; used when the field takes it. |
| `options.hint` | string | none | Help text under the boxes. |
| `options.readonly` | boolean | `false` | Shows the number, changes nothing, with the lock icon after the label. |
| `options.disabled` | boolean | `false` | Greyed out and not focusable. |

## The widget

- The country is a list you can type in: it finds a country by its name in the language of the admin (`germ`), its code (`DE`) or its calling code (`+49`), and shows its flag, name and calling code. A system without flag emoji shows the two letters of the country in their place.
- The number is typed as it is written in the country: spaces, dots, dashes and brackets are left out, and so is the 0 a national number starts with (`020 7183 8750` in the United Kingdom is `+44 20 7183 8750`; in Italy the 0 belongs to the number and stays).
- A number typed with its country (`+44 20 7183 8750`, `0044 20 7183 8750`, pasted from an address book) says which country it is: the list follows it, and the box keeps the national number. A code the field does not take leaves the list where it is and says so under the boxes.
- When you leave the box the digits are written in groups to be read (`207 183 8750`); the number is the same. Groups are by length, not the way each country writes them.
- A country chosen with no number is no value: the field holds nothing, so `required` is not met.
- A box that is not a number (`call me`) holds nothing and says `A phone number, like +44 20 7183 8750` under the boxes. The message of the rules is shown there too, when you leave the box and when the record is saved.
- The countries of the North American plan are told apart by their area codes: `+1 242` is the Bahamas, `+1 416` is Canada, the rest of `+1` is the United States.

## Stored value

A string: `+`, the calling code and the national number, with no space, from 7 to 15 digits (E.164). The key is absent when there is no number. A localised field holds one per locale.

```json
{ "phone": "+442071838750", "localisedPhone": { "enUS": "+12125550123", "zhCN": "+861012345678" } }
```

## Validation and behaviour

- UI: `required`, an international number of 7 to 15 digits that starts with a calling code, a country among the ones of the field.
- Server: only `unique`, as for any field; the string is not checked.
- In the table the number is written with its code and the digits in groups (`+44 207 183 8750`), as a link that calls it (`tel:`).
