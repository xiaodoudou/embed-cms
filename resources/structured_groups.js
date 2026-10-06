// groups: the keys that share a first part (`contact.email`) are drawn together under a title; `groups` says more of each, by its path:
// a title, whether it opens and closes (`collapsible`), whether it starts closed (`collapsed`) and a `layout` of its own
module.exports = {
  displayname: { enUS: 'Field groups', zhCN: '字段分组' },
  group: { enUS: 'Structured', zhCN: '结构化' },
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', required: true, options: { hint: 'Required. Names the record in lists' } },
    { field: 'contact.email', input: 'email', label: 'Email', options: { hint: 'In a group that is always open: its fields are side by side' } },
    { field: 'contact.phone', input: 'string', label: 'Phone', options: { hint: 'With the country code' } },
    { field: 'address.street', input: 'string', label: 'Street', options: { hint: 'In a group that can be closed from its title' } },
    { field: 'address.number', input: 'string', label: 'Number', options: { hint: 'The number in the street' } },
    { field: 'address.city', input: 'string', label: 'City', options: { hint: 'The town of the address' } },
    { field: 'address.postcode', input: 'string', label: 'Postcode', options: { hint: 'The postal code' } },
    { field: 'address.country', input: 'select', label: 'Country', source: ['France', 'Germany', 'Spain', 'United Kingdom'], options: { hint: 'One of the countries listed' } },
    { field: 'social.website', input: 'url', label: 'Website', options: { hint: 'In a group that starts closed. It opens by itself when a field in it is wrong' } },
    { field: 'social.blog', input: 'url', label: 'Blog', options: { hint: 'Where the person writes' } },
    { field: 'social.profiles.github', input: 'string', label: 'GitHub', options: { hint: 'In a group inside a group: its path is social.profiles' } },
    { field: 'social.profiles.linkedin', input: 'string', label: 'LinkedIn', options: { hint: 'The name in the address of the profile' } },
    { field: 'notes', input: 'text', label: 'Notes', options: { hint: 'A field that is in no group' } }
  ],
  // the form layout places the groups too, by their first part: one alone, two side by side, then a field
  layout: {
    lines: [
      { fields: [{ model: 'name' }] },
      { fields: [{ model: 'contact' }] },
      { slots: 2, fields: [{ model: 'address' }, { model: 'social' }] },
      { fields: [{ model: 'notes' }] }
    ]
  },
  groups: {
    contact: {
      label: 'Contact',
      layout: { lines: [{ slots: 3, fields: [{ model: 'email', width: 2 }, { model: 'phone' }] }] }
    },
    address: {
      label: 'Address',
      collapsible: true,
      layout: {
        lines: [
          { slots: 3, fields: [{ model: 'street', width: 2 }, { model: 'number' }] },
          { slots: 2, fields: [{ model: 'city' }, { model: 'postcode' }] },
          { fields: [{ model: 'country' }] }
        ]
      }
    },
    // `collapsed` alone makes a group that can be opened
    social: { label: 'Online', collapsed: true },
    'social.profiles': {
      label: 'Profiles',
      collapsible: true,
      layout: { lines: [{ slots: 2, fields: [{ model: 'github' }, { model: 'linkedin' }] }] }
    }
  }
}
