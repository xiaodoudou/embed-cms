// Text with a built-in format: email, url, phone, password
module.exports = {
  displayname: { enUS: 'Formatted strings', zhCN: '格式化字符串' },
  group: { enUS: 'Text', zhCN: '文本' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    { field: 'email', input: 'email', label: 'Email address', localised: false, options: { hint: 'Checked for a valid email format' } },
    { field: 'requiredEmail', input: 'email', label: 'Unique email address', localised: false, required: true, unique: true, options: { hint: 'Required and unique across all records' } },
    { field: 'url', input: 'url', label: 'Website', localised: false, options: { hint: 'Checked for a valid URL, for example https://example.com' } },
    { field: 'requiredUrl', input: 'url', label: 'Required website', localised: false, required: true, options: { hint: 'Required. Must be a valid URL' } },
    { field: 'localisedUrl', input: 'url', label: 'Website per locale', options: { hint: 'One link per locale' } },
    { field: 'phone', input: 'phone', label: 'Phone', localised: false, options: { hint: 'A country and the number; kept in the international form, +442071838750' } },
    { field: 'europePhone', input: 'phone', label: 'Phone in Europe', localised: false, options: { countries: ['FR', 'DE', 'GB', 'ES', 'IT', 'NL', 'BE'], hint: 'Seven countries, starting with France' } },
    { field: 'frenchPhone', input: 'phone', label: 'French phone', localised: false, options: { countries: ['FR'], hint: 'One country: nothing to choose, the code is written for you' } },
    { field: 'requiredPhone', input: 'phone', label: 'Required phone', localised: false, required: true, options: { country: 'GB', hint: 'Required, and starts with the United Kingdom' } },
    { field: 'localisedPhone', input: 'phone', label: 'Phone per locale', options: { hint: 'One number per locale' } },
    { field: 'password', input: 'password', label: 'Password', localised: false, options: { hint: 'Characters are hidden while typing' } },
    { field: 'requiredPassword', input: 'password', label: 'Required password', localised: false, required: true, options: { hint: 'Required. Characters are hidden while typing' } },
    { field: 'readOnlyEmail', input: 'email', label: 'Read-only email', localised: false, options: { readonly: true, hint: 'Read-only: visible and copyable, not editable' } },
    { field: 'readOnlyPhone', input: 'phone', label: 'Read-only phone', localised: false, options: { readonly: true, hint: 'Read-only: visible and copyable, not editable' } },
    { field: 'disabledPhone', input: 'phone', label: 'Disabled phone', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } },
    { field: 'disabledUrl', input: 'url', label: 'Disabled website', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } }
  ]
}
