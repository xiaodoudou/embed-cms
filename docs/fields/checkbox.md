# checkbox

On/off switch (a toggle labelled No / Yes). Component: `CustomCheckbox` (`src/components/fields/CustomCheckbox.vue`). Click it, or focus it and press Space or Enter.

Catalogue: `resources/choice_boolean.js` (group **Choice**, resource **Booleans**).

## Declaration

```js
{ field: 'active', input: 'checkbox', label: 'Active', localised: false }
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `field`, `input`, `label`, `localised`, `unique` | | | As for [string](string.md). |
| `required` | boolean | `false` | Adds `*` to the label. A switch that was never touched refuses the save (`This field is required!`); a switch turned off counts as answered. |
| `options.hint` | string | none | Help text under the switch. |
| `options.readonly` | boolean | `false` | The switch cannot be toggled; a lock icon is shown, no border. |
| `options.disabled` | boolean | `false` | The switch cannot be toggled and is removed from the tab order; dashed border, muted colours. |

The labels are always the translated `No` / `Yes`; there is no `textOn` / `textOff` option (older docs mention them, the component does not read them).

## Variations

### Default

`resources/choice_boolean.js`, field `flag`. Off:

![Switch off](img/checkbox-default.png)

On:

![Switch on](img/checkbox-on.png)

### Required

`resources/choice_boolean.js`, field `requiredFlag`. A switch always shows an answer (No until it is turned on), so it is never reported as missing: a save stores an untouched switch as an explicit `false`, never as nothing. The record holds two values, true and false.

![Required switch](img/checkbox-required.png)

### Localised

`resources/choice_boolean.js`, field `localisedFlag` (one value per locale).

![Localised switch](img/checkbox-localised.png)

### Read-only

`resources/choice_boolean.js`, field `readOnlyFlag`.

![Read-only switch](img/checkbox-readonly.png)

### Disabled

`resources/choice_boolean.js`, field `disabledFlag`.

![Disabled switch](img/checkbox-disabled.png)

## Stored value

A boolean:

```json
{ "flag": true, "localisedFlag": {} }
```

- A switch that was never touched is **not saved** (the key is absent, not `false`); read it as `false`. After being switched on and off again it is stored as `false`. A required switch must be touched at least once.
- A localised switch that was not touched is saved as `{}`.
- A read-only or disabled switch keeps its value; it cannot be changed from the form.

## Validation and behaviour

- UI: `required` refuses the save while the switch was never touched (verified); once touched, on or off, it is accepted (`false` stored).
- Server: only `unique`.
