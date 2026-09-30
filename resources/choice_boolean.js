// checkbox (switch)
module.exports = {
  displayname: { enUS: 'Booleans', zhCN: '布尔值' },
  group: { enUS: 'Choice', zhCN: '选择' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    { field: 'flag', input: 'checkbox', label: 'Switch', localised: false, options: { hint: 'On or off' } },
    { field: 'requiredFlag', input: 'checkbox', label: 'Required switch', localised: false, required: true, options: { hint: 'Required' } },
    { field: 'localisedFlag', input: 'checkbox', label: 'Switch per locale', options: { hint: 'One value per locale' } },
    { field: 'readOnlyFlag', input: 'checkbox', label: 'Read-only switch', localised: false, options: { readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledFlag', input: 'checkbox', label: 'Disabled switch', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } }
  ]
}
