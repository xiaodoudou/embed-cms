// file: single, multiple, restricted and per locale
module.exports = {
  displayname: { enUS: 'Files', zhCN: '文件' },
  group: { enUS: 'Media', zhCN: '媒体' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // Any number of files of any type
    { field: 'attachments', input: 'file', label: 'Attachments', localised: false, options: { hint: 'Any number of files of any type' } },
    // Exactly one file
    { field: 'contract', input: 'file', label: 'Contract', localised: false, required: true, options: { maxCount: 1, hint: 'Required. A single file' } },
    // Restricted formats, with a hint
    { field: 'manual', input: 'file', label: 'User manual', localised: false, options: { accept: '.pdf,.docx', maxCount: 1, hint: 'One PDF or DOCX file' } },
    // Video and audio
    { field: 'media', input: 'file', label: 'Audio and video', localised: false, options: { accept: 'video/*,audio/*', hint: 'Video or audio files only' } },
    // Size limit per file, in bytes
    { field: 'small', input: 'file', label: 'Files (size limited)', localised: false, options: { limit: 5 * 1024 * 1024, hint: 'At most 5 MB per file' } },
    // One file per locale
    { field: 'localisedBrochure', input: 'file', label: 'Brochure per locale', options: { maxCount: 1, hint: 'One file per locale' } },
    { field: 'readOnlyFile', input: 'file', label: 'Read-only file', localised: false, options: { readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledFile', input: 'file', label: 'Disabled file', localised: false, options: { disabled: true, hint: 'Disabled: greyed out, no uploads' } }
  ]
}
