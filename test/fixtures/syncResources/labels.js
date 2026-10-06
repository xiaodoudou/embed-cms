// a second resource the pages can point to, with the tags: a field of several resources
module.exports = {
  displayname: 'Labels',
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', unique: true, required: true, localised: false }
  ]
}
