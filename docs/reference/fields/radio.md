← [Field types](../FIELDS.md) · [Documentation](../../README.md)

# radio

One value chosen from a short list, shown as a column of radio buttons, each with its label and, if the field gives one, a line of help under it. It is the same field as [segmented](segmented.md) (same component, options, value and keyboard), drawn for longer labels, for choices that need explaining, and for forms where a row of buttons would not fit. Component: `ChoiceField` (`src/components/fields/ChoiceField.vue`); the choices and the rules are in `src/utils/choice.js`.

Catalogue: `resources/choice_buttons.js` (group **Choice**, resource **Radios and segments**), fields `plan`, `planWithHelp`, `requiredPlan`, `inlineChoice`, `readOnlyRadio`, `disabledRadio`.

## Declaration

```js
{ field: 'plan', input: 'radio', label: 'Plan', localised: false, source: ['free', 'team', 'business'], options: { descriptions: { team: 'Up to ten people' } } }
```

## Options

All the options of [segmented](segmented.md) (`source`, `required`, `labels`, `clearable`, `hint`, `readonly`, `disabled`), and two that are for radio buttons:

| Option | Type | Default | Description |
|---|---|---|---|
| `options.descriptions` | `{ value: string \| { enUS, zhCN } }` | none | A line under the label of a choice, in a smaller muted type. The radio button points at it, so a screen reader reads it after the label. |
| `options.inline` | boolean | `false` | The radio buttons stand in a row (wrapping when the box is narrow) instead of a column. |

## The widget

- A click on a label or on its circle chooses it; a click on the chosen one takes the choice away (unless the field is required or `clearable: false`).
- Native radio buttons: one tab stop for the group, the arrow keys move the choice and write it, Delete and Backspace take it away.
- A record that holds a value that is not one of the choices has none chosen, and the save is refused until another is chosen.

## Variations

### Default

`resources/choice_buttons.js`, field `plan`.

![Radio](img/radio-default.png)

In the dark theme:

![Radio, dark](img/radio-default-dark.png)

### A line of help under each choice

Field `planWithHelp` (`labels` and `descriptions`, a text per language).

![Descriptions](img/radio-descriptions.png)

### In a row

Field `inlineChoice` (`inline: true`).

![Inline](img/radio-inline.png)

### Required

Field `requiredPlan`: an empty field is refused when the record is saved.

![Required](img/radio-required-error.png)

### Read-only and disabled

Fields `readOnlyRadio` and `disabledRadio`.

![Read-only and disabled](img/radio-states.png)

## Stored value

The value of the chosen entry of `source`, as it is written there (a string or a number); the key is absent when none is chosen. See [segmented](segmented.md#stored-value).
