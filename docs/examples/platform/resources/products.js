// The products whose documentation the platform hosts. A product is public, or for members as a whole (the guides of an enterprise edition, say): then nothing of it is shown
// to a visitor who is not signed in, not even its pages' titles. A hook of the site (platform.js) refuses a slug that is an address of the platform itself (`login`, `search`...).
module.exports = {
  displayname: { enUS: 'Products' },
  locales: ['enUS'],
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true },
    { field: 'slug', input: 'string', label: 'Slug', localised: false, required: true, unique: true, options: { hint: 'The address of the product: /<slug>/' } },
    { field: 'summary', input: 'text', label: 'Summary', localised: false },
    { field: 'order', input: 'integer', label: 'Position', localised: false, options: { hint: 'Smaller numbers come first' } },
    { field: 'membersOnly', input: 'checkbox', label: 'Members only', localised: false, options: { hint: 'The whole product, its versions and its pages, is for signed-in members' } },
    { field: 'published', input: 'checkbox', label: 'Published', localised: false }
  ]
}
