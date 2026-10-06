// paragraph: a list of typed blocks (see paragraphs/)
module.exports = {
  displayname: { enUS: 'Blocks', zhCN: '内容块' },
  group: { enUS: 'Structured', zhCN: '结构化' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // One block type, any number of blocks
    { field: 'textBlocks', input: 'paragraph', label: 'Text blocks', localised: false, options: { types: ['block_text'], hint: 'Any number of text blocks' } },
    // Several block types the editor can choose from
    { field: 'content', input: 'paragraph', label: 'Page content', localised: false, options: { types: ['block_text', 'block_media', 'block_group', 'block_contact'], hint: 'Mix text, media, group and contact blocks in any order. A contact block has its fields in groups' } },
    // At most one block
    { field: 'hero', input: 'paragraph', label: 'Hero block', localised: false, options: { types: ['block_media'], maxCount: 1, hint: 'At most one media block' } },
    // Required: at least one block
    { field: 'requiredBlocks', input: 'paragraph', label: 'Required blocks', localised: false, required: true, options: { types: ['block_text'], hint: 'Required: add at least one text block' } },
    // One list of blocks per locale
    { field: 'localisedBlocks', input: 'paragraph', label: 'Blocks per locale', options: { types: ['block_text'], hint: 'One list of blocks per locale' } }
  ]
}
