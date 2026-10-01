// Benchmark resource without a unique key and without hooks of its own: the cost of a plain create.
module.exports = {
  displayname: 'Notes',
  schema: [
    { field: 'title', input: 'string', localised: false },
    { field: 'body', input: 'text', localised: false }
  ],
  type: 'normal'
}
