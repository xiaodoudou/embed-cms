module.exports = {
  displayname: 'Block of blocks',
  schema: [
    { field: 'label', input: 'string', localised: false },
    { field: 'children', input: 'paragraph', localised: false, options: { types: ['block_rel'] } }
  ]
}
