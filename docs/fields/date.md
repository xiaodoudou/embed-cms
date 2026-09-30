# date

Calendar date picker. The value can be typed or picked. Component: `CustomDatetimePicker` (`src/components/fields/CustomDatetimePicker.vue`, wraps `@vuepic/vue-datepicker`). [time](time.md) and [datetime](datetime.md) use the same component.

Catalogue: `resources/dates.js` (group **Date and time**, resource **Dates and times**), fields `date`, `requiredDate`, `localisedDate`, `disabledDate`.

## Declaration

```js
{ field: 'publishedOn', input: 'date', label: 'Published on', localised: false }
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `field`, `input`, `label`, `localised`, `unique` | | | As for [string](string.md). |
| `required` | boolean | `false` | Adds `*` to the label. An empty value blocks Create/Save with the toast `N required fields missing`; the field itself shows no error text. |
| `options.hint` | string | none | Help text under the field. |
| `options.readonly` | boolean | `false` | Not editable, no clear button, lock icon. |
| `options.disabled` | boolean | `false` | Greyed out with a dashed border, not focusable. |
| `options.format` | string | `'YYYY-MM-DD'` | Display and typing format (dayjs tokens). Read by the component; not used by the catalogue and not exercised in the UI. |
| `options.customDatetimePickerOptions.placeholder` | string | `'YYYY-MM-DD'` | Placeholder text. Read by the component; not used by the catalogue. |

The calendar language follows the current locale (`enUS` gives English, any other locale Chinese). Tomorrow is highlighted with a marker.

## Variations

### Default and required

`resources/dates.js`, fields `date` and `requiredDate`.

![Date and required date](img/date-default.png)

Click the field to open the calendar and press Select, or type a date and press Enter or Tab:

![Calendar popup](img/date-picker.png)
![Filled dates](img/date-filled.png)

### Required error

With `required`, clicking Create on an empty field blocks the save and shows a toast; the field keeps its normal look.

![Required toast](img/date-required-error.png)

### Localised

`resources/dates.js`, field `localisedDate` (one date per locale).

![Localised date](img/date-localised.png)

### Disabled

`resources/dates.js`, field `disabledDate`.

![Disabled date](img/date-disabled.png)

## Stored value

A **timestamp in milliseconds since the Unix epoch** (a number), `{ enUS, zhCN }` of timestamps when localised. The picked day is stored as **local midnight of the browser's time zone**:

```json
{ "date": 1773504000000, "localisedDate": { "enUS": 1767196800000, "zhCN": 1767283200000 } }
```

`1773504000000` is `2026-03-14T16:00:00Z`, which is 2026-03-15 00:00 in UTC+8 (the time zone of the screenshots). Read it with `new Date(value)` and format it in the same time zone, or expect a one-day shift.

## Validation and behaviour

- UI: only the form-level required check; the field shows no format error message.
- Clearing with the `x` button empties the value.
- Server: only `unique`; any value sent over REST is stored.
