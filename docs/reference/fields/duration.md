← [Field types](../FIELDS.md) · [Documentation](../../README.md)

# duration

A length of time, typed in hours and minutes (or the units you choose) and kept as a number of seconds. Component: `DurationField` (`src/components/fields/DurationField.vue`), the arithmetic and the words are in `src/utils/duration.js`.

Catalogue: `resources/numbers_quantities.js` (group **Numbers**, resource **Quantities**), fields `duration`, `preciseDuration`, `longDuration`, `minutesOnly`, `requiredDuration`, `localisedDuration`, `readOnlyDuration`, `disabledDuration`.

## Declaration

```js
{ field: 'cookingTime', input: 'duration', label: 'Cooking time', localised: false, options: { units: ['hours', 'minutes'], max: 8 * 3600 } }
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `field`, `input`, `label`, `localised` | | | As for [string](string.md). |
| `required` | boolean | `false` | Adds `*` to the label; a save with every box empty is refused (`This field is required!`). A length of zero is a length. |
| `options.units` | array | `['hours', 'minutes']` | The boxes to show, from `'days'`, `'hours'`, `'minutes'` and `'seconds'`, always largest first whatever the order you list them in. At least one: a list with no unit it knows gives the default. A length is rounded to the smallest unit shown (with `['hours', 'minutes']` a length of 5430 seconds is 1 h 31 min). |
| `min`, `max` | number | none | The shortest and the longest length it takes, **in seconds** (also accepted in `options`). A length outside is refused with `At least 15m` or `At most 2h`, written in the units of the field. |
| `options.hint` | string | none | Help text under the boxes. |
| `options.readonly` | boolean | `false` | Shows the length, changes nothing, with the lock icon after the label. |
| `options.disabled` | boolean | `false` | Greyed out and not focusable. |

## The widget

- One number box for each unit, with its name after it (`hours`, `minutes`): each has a real label, so a screen reader says which box it is on. There are no spin buttons.
- A box takes more than the unit above would hold: 90 typed in the minutes box is kept as 5400 seconds at once, and when you leave the box the lengths are carried up (1 hour, 30 minutes). With one unit only there is nothing above, and 90 stays 90.
- An empty box counts as nothing, and a field with every box empty holds nothing. A box that holds what is not a length (a minus sign) holds nothing and says `A length of time` under the boxes.
- The message of the rules is shown under the boxes, in red, when you leave a box and when the record is saved.

## Stored value

A whole number of seconds; the key is absent when there is no length. A localised field holds one per locale.

```json
{ "duration": 5400, "localisedDuration": { "enUS": 3600, "zhCN": 7200 } }
```

## Validation and behaviour

- UI: `required`, the least and the most (`min` and `max`, in seconds), and a whole number of seconds from zero.
- Server: only `unique`, as for any field; the number is not checked.
- In the table the length is written in the units of the field in the language of the admin (`1h 30m`, `1小时 30分`), right aligned, sorted as a number.
