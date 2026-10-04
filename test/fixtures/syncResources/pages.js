// pages with blocks: relations and files inside the blocks, and blocks inside blocks
module.exports = {
  displayname: 'Pages',
  type: 'normal',
  schema: [
    { field: 'slug', input: 'string', unique: true, required: true, localised: false },
    { field: 'topic', input: 'select', source: 'tags', localised: false },
    { field: 'body', input: 'wysiwyg', localised: false },
    { field: 'data', input: 'json', localised: false },
    { field: 'content', input: 'paragraph', localised: false, options: { types: ['block_rel', 'block_group'] } },
    { field: 'plan', input: 'imagemap', localised: false }
  ]
}
