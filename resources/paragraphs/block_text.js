// Paragraph type: text content
module.exports = {
  displayname: { enUS: 'Text block', zhCN: '文本块' },
  schema: [
    { field: 'heading', input: 'string', label: 'Heading', required: true, options: { hint: 'Required. Short title of the block' } },
    { field: 'body', input: 'wysiwyg', label: 'Body', options: { hint: 'Formatted text of the block' } },
    { field: 'note', input: 'text', label: 'Internal note', localised: false, options: { hint: 'Not localised. For editors only' } }
  ]
}
