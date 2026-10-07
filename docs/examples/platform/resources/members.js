// The people who may read what is for members. An editor types a password in `password`; a hook of the site (accounts.js) turns it into `passwordHash` and empties it, so the clear text is never kept; other hooks take both out of everything the CMS answers.
module.exports = {
  displayname: { enUS: 'Members' },
  locales: ['enUS'],
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true },
    { field: 'email', input: 'email', label: 'Email', localised: false, required: true, unique: true },
    { field: 'password', input: 'password', label: 'New password', localised: false, options: { hint: 'Type one to set or change it; it is stored as a hash and this box is emptied', min: 8 } },
    { field: 'passwordHash', input: 'string', label: 'Password hash', localised: false, options: { readonly: true, hint: 'Never shown, never written from here: the site sets it when a password is typed' } },
    { field: 'active', input: 'checkbox', label: 'Active', localised: false, options: { hint: 'An inactive member cannot sign in or download, at once' } }
  ]
}
