// The people of the team that tasks are given to. They are records, not accounts: who may sign in to the board is a user of the CMS, in the group `team` (see seed.js).
module.exports = {
  displayname: { enUS: 'People' },
  locales: ['enUS'],
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true },
    { field: 'username', input: 'string', label: 'Account', localised: false, unique: true, options: { hint: 'The account this person signs in with, to know who "me" is' } },
    { field: 'color', input: 'string', label: 'Colour', localised: false, options: { hint: 'A CSS colour, for the round badge' } }
  ]
}
