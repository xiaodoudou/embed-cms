// Paragraph type: a tile that takes 3 of the 12 slots of a row, so a row holds 4 of them (see docs/reference/DYNAMIC_LAYOUT.md)
module.exports = {
  displayname: { enUS: 'Quarter', zhCN: '四分之一' },
  layout: { slots: 3 },
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true, options: { hint: 'Required. The heading of the tile' } },
    { field: 'text', input: 'text', label: 'Text', options: { hint: 'A few lines under the heading' } }
  ]
}
