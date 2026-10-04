// text, wysiwyg, markdown and code: multi-line and formatted content
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
    // Markdown: a toolbar that writes the signs, and a preview
    { field: 'markdown', input: 'markdown', label: 'Markdown', options: { hint: 'Markdown with a toolbar; the preview is in a tab. One value per locale' } },
    { field: 'requiredMarkdown', input: 'markdown', label: 'Required markdown', required: true, options: { hint: 'Required in every locale' } },
    { field: 'splitMarkdown', input: 'markdown', label: 'Markdown with the preview beside it', localised: false, options: { preview: 'split', rows: 6, hint: 'The preview is beside the box, and follows what is typed' } },
    { field: 'miniMarkdown', input: 'markdown', label: 'Markdown with a few buttons', localised: false, options: { toolbar: ['bold', 'italic', 'link'], rows: 4, hint: 'Only bold, italic and link are in the toolbar' } },
    { field: 'plainMarkdown', input: 'markdown', label: 'Markdown without help', localised: false, options: { toolbar: false, preview: false, hint: 'No toolbar and no preview: a box for people who write Markdown' } },
    { field: 'limitedMarkdown', input: 'markdown', label: 'Short markdown', localised: false, options: { max: 200, hint: 'At most 200 characters, signs included' } },
    { field: 'readOnlyMarkdown', input: 'markdown', label: 'Read-only markdown', localised: false, options: { readonly: true, hint: 'Read-only: opens on what the text says, and can be copied' } },
    { field: 'disabledMarkdown', input: 'markdown', label: 'Disabled markdown', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not editable' } },
    // Code editor
    { field: 'snippet', input: 'code', label: 'Code snippet', localised: false, options: { hint: 'Code editor with syntax highlighting' } },
    { field: 'sizedSnippet', input: 'code', label: 'Fixed-height code', localised: false, options: { height: '160px', hint: 'Code editor with a fixed height of 160px' } },
    { field: 'requiredSnippet', input: 'code', label: 'Required code', localised: false, required: true, options: { hint: 'Required: an empty editor refuses the save' } },
    { field: 'readOnlySnippet', input: 'code', label: 'Read-only code', localised: false, options: { readonly: true, hint: 'Read-only: visible and copyable, not editable' } },
    { field: 'disabledSnippet', input: 'code', label: 'Disabled code', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } }
  ]
}
