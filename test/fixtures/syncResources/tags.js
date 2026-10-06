// the records the blocks of the pages point to
module.exports = {
  displayname: 'Tags',
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', unique: true, required: true, localised: false }
  ]
}
