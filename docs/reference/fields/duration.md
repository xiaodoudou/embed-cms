← [Field types](../FIELDS.md) · [Documentation](../../README.md)

# duration

A length of time, typed in one box the way people write it (`1:30`, `1h 30m`, `90`) and kept as a number of seconds. Component: `DurationField` (`src/components/fields/DurationField.vue`), the reading of what is typed, the arithmetic and the words are in `src/utils/duration.js`.

Catalogue: `resources/numbers_quantities.js` (group **Numbers**, resource **Quantities**), fields `duration`, `preciseDuration`, `longDuration`, `minutesOnly`, `requiredDuration`, `localisedDuration`, `readOnlyDuration`, `disabledDuration`.

## Declaration

```js
{ field: 'cookingTime', input: 'duration', label: 'Cooking time', localised: false, options: { units: ['hours', 'minutes'], max: 8 * 3600 } }
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `field`, `input`, `label`, `localised` | | | As for [string](string.md). |
| `required` | boolean | `false` | Adds `*` to the label; a save with an empty box is refused (`This field is required!`). A length of zero is a length. |
| `options.units` | array | `['hours', 'minutes']` | The units of the field, from `'days'`, `'hours'`, `'minutes'` and `'seconds'`, always largest first whatever the order you list them in. At least one: a list with no unit it knows gives the default. They decide how a length is written back (see below) and the unit a bare number is in: the smallest. A length is rounded to the smallest unit (with `['hours', 'minutes']` a length of 5430 seconds is 1:31). |
| `min`, `max` | number | none | The shortest and the longest length it takes, **in seconds** (also accepted in `options`). A length outside is refused with `At least 15m` or `At most 2h`, written in the units of the field. |
| `options.hint` | string | none | Help text under the box. |
| `options.readonly` | boolean | `false` | Shows the length, changes nothing, with the lock icon after the label. |
| `options.disabled` | boolean | `false` | Greyed out and not focusable. |

## The widget

One box. While it is empty it shows how to write a length (`h:mm`, `h:mm:ss`, `m:ss`, `0d 0h`), and its text is selected when you enter it, so that typing replaces what is there.

The box takes the ways people write a length:

| Typed | Is | Notes |
|---|---|---|
| `1:30` | 1 h 30 min | The colon form fills the units from the smallest up: `1:30` is 1 min 30 s in a field of minutes and seconds. More parts than the field has units is not a length. |
| `1:30:05` | 1 h 30 min 5 s | In a field of hours, minutes and seconds. |
| `1h 30m`, `1h30m`, `1 hour 30 minutes` | 1 h 30 min | `d`, `h`, `m`, `s` and the words (`day`, `hr`, `min`, `sec`, plural too), in any case, with or without spaces and commas; `天`, `小时`, `分`, `秒` as well. A unit the field does not show is taken all the same: `1h` in a field of minutes is 60. |
| `1.5h`, `1,5h` | 1 h 30 min | A decimal number is taken with a point or a comma. |
| `90` | 90 of the smallest unit | In a field of hours and minutes, 90 minutes; in a field of days and hours, 90 hours. |

When you leave the box a length is written back in the form of the field: a clock for hours and minutes (`1:30`, `0:05`, `100:00`), for minutes and seconds and for hours, minutes and seconds (`1:30:05`); letters for the rest (`2d 3h`, `90m`, zero units left out; `0m` for a length of zero). What it writes it reads back to the same length.

An empty box holds nothing. A box that is not a length (a minus sign, a word it does not know) holds nothing and says `A length of time, like 1:30 or 1h 30m` under the box when you leave it; the message of the rules is shown there too, and when the record is saved. The text is kept, so that it can be corrected.

## Stored value

A whole number of seconds; the key is absent when there is no length. A localised field holds one per locale.

```json
{ "duration": 5400, "localisedDuration": { "enUS": 3600, "zhCN": 7200 } }
```

## Validation and behaviour

- UI: `required`, the least and the most (`min` and `max`, in seconds), and a whole number of seconds from zero.
- Server: only `unique`, as for any field; the number is not checked.
- In the table the length is written in the units of the field in the language of the admin (`1h 30m`, `1小时 30分`), right aligned, sorted as a number.
