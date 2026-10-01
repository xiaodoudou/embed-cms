// number, integer and double: with and without bounds
module.exports = {
  displayname: { enUS: 'Numbers', zhCN: '数字' },
  group: { enUS: 'Numbers', zhCN: '数字' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // Any number
    { field: 'number', input: 'number', label: 'Number', localised: false, options: { hint: 'Any number, whole or decimal' } },
    { field: 'requiredNumber', input: 'number', label: 'Required number', localised: false, required: true, options: { hint: 'Required' } },
    { field: 'localisedNumber', input: 'number', label: 'Number per locale', options: { hint: 'One value per locale' } },
    { field: 'uniqueNumber', input: 'number', label: 'Unique number', localised: false, unique: true, options: { hint: 'Unique across all records' } },
    // Whole numbers only
    { field: 'integer', input: 'integer', label: 'Whole number', localised: false, options: { hint: 'Whole numbers only, no decimals' } },
    { field: 'boundedInteger', input: 'integer', label: 'Percentage', localised: false, required: true, options: { min: 0, max: 100, hint: 'Required. Whole number between 0 and 100' } },
    // Decimals
    { field: 'double', input: 'double', label: 'Decimal number', localised: false, options: { hint: 'Decimals allowed, for example 12.5' } },
    { field: 'boundedDouble', input: 'double', label: 'Ratio', localised: false, options: { min: 0, max: 1, hint: 'Decimal between 0 and 1' } },
    { field: 'readOnlyNumber', input: 'number', label: 'Read-only number', localised: false, options: { readonly: true, hint: 'Read-only: visible and copyable, not editable' } },
    { field: 'disabledNumber', input: 'number', label: 'Disabled number', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } }
  ]
}
