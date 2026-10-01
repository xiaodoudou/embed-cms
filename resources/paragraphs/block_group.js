// Paragraph type: a block that holds more blocks (nesting) and a reference
module.exports = {
  displayname: { enUS: 'Group block', zhCN: '分组块' },
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true, options: { hint: 'Required. Title of the group' } },
    { field: 'featured', input: 'checkbox', label: 'Featured', localised: false, options: { hint: 'Highlight this group' } },
    { field: 'reference', input: 'select', label: 'Linked item', localised: false, source: 'reference_items', options: { hint: 'Optional record from the Reference items resource' } },
    { field: 'children', input: 'paragraph', label: 'Blocks in this group', localised: false, options: { types: ['block_text', 'block_media'], maxCount: 5, hint: 'Nested blocks, up to 5' } }
  ]
}
