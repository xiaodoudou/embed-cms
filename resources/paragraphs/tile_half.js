// Paragraph type: a tile that takes 6 of the 12 slots of a row, so a row holds 2 of them (see docs/reference/DYNAMIC_LAYOUT.md)
module.exports = {
  displayname: { enUS: 'Half', zhCN: '半宽' },
  layout: { slots: 6 },
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true, options: { hint: 'Required. The heading of the tile' } },
    { field: 'text', input: 'text', label: 'Text', options: { hint: 'A few lines under the heading' } }
  ]
}
