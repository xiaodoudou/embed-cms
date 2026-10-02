// text, wysiwyg and code: multi-line and formatted content
module.exports = {
  displayname: { enUS: 'Long text', zhCN: '长文本' },
  group: { enUS: 'Text', zhCN: '文本' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'title', input: 'string', label: 'Title', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // Plain multi-line text
    { field: 'text', input: 'text', label: 'Text', options: { hint: 'Plain multi-line text. One value per locale' } },
    { field: 'requiredText', input: 'text', label: 'Required text', required: true, options: { hint: 'Required in every locale' } },
    { field: 'limitedText', input: 'text', label: 'Short text', localised: false, options: { max: 140, hint: 'At most 140 characters' } },
    { field: 'readOnlyText', input: 'text', label: 'Read-only text', localised: false, options: { readonly: true, hint: 'Read-only: visible and copyable, not editable' } },
    { field: 'disabledText', input: 'text', label: 'Disabled text', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } },
    // Formatted text with the full toolbar
    { field: 'body', input: 'wysiwyg', label: 'Rich text', options: { hint: 'Full formatting toolbar. One value per locale' } },
    { field: 'requiredBody', input: 'wysiwyg', label: 'Required rich text', required: true, options: { hint: 'Required in every locale' } },
    // Restricted toolbar
    { field: 'basicBody', input: 'wysiwyg', label: 'Basic rich text', localised: false, options: { buttons: ['bold', 'italic'], hint: 'Only bold and italic are available' } },
    { field: 'disabledBody', input: 'wysiwyg', label: 'Disabled rich text', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not editable' } },
    // Code editor
    { field: 'snippet', input: 'code', label: 'Code snippet', localised: false, options: { hint: 'Code editor with syntax highlighting' } },
    { field: 'sizedSnippet', input: 'code', label: 'Fixed-height code', localised: false, options: { height: '160px', hint: 'Code editor with a fixed height of 160px' } },
    { field: 'requiredSnippet', input: 'code', label: 'Required code', localised: false, required: true, options: { hint: 'Required: an empty editor refuses the save' } },
    { field: 'readOnlySnippet', input: 'code', label: 'Read-only code', localised: false, options: { readonly: true, hint: 'Read-only: visible and copyable, not editable' } },
    { field: 'disabledSnippet', input: 'code', label: 'Disabled code', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } }
  ]
}
