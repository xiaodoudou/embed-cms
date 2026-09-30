// color picker
module.exports = {
  displayname: { enUS: 'Colors', zhCN: '颜色' },
  group: { enUS: 'Choice', zhCN: '选择' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    { field: 'color', input: 'color', label: 'Colour', localised: false, options: { hint: 'Full picker: canvas, sliders and text inputs' } },
    { field: 'requiredColor', input: 'color', label: 'Required colour', localised: false, required: true, options: { hint: 'Required' } },
    { field: 'localisedColor', input: 'color', label: 'Colour per locale', options: { hint: 'One colour per locale' } },
    // Compact picker: sliders only, no canvas or text inputs
    { field: 'swatch', input: 'color', label: 'Compact picker', localised: false, options: { hideCanvas: true, hideInputs: true, hint: 'Sliders only: no canvas and no text inputs' } },
    { field: 'readOnlyColor', input: 'color', label: 'Read-only colour', localised: false, options: { readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledColor', input: 'color', label: 'Disabled colour', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } }
  ]
}
