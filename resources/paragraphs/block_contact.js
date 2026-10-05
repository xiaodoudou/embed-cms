// Paragraph type: a block whose fields are in groups (`person.firstName`, `address.city`); `groups` says more of each, as in a resource
module.exports = {
  displayname: { enUS: 'Contact block', zhCN: '联系人块' },
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true, options: { hint: 'Required. Title of the block' } },
    { field: 'person.firstName', input: 'string', label: 'First name', options: { hint: 'In a group that is always open' } },
    { field: 'person.lastName', input: 'string', label: 'Last name', options: { hint: 'The family name of the person' } },
    { field: 'person.role', input: 'string', label: 'Role', options: { hint: 'What the person does' } },
    { field: 'address.street', input: 'string', label: 'Street', options: { hint: 'In a group that can be closed from its title' } },
    { field: 'address.city', input: 'string', label: 'City', options: { hint: 'The town of the address' } },
    { field: 'address.postcode', input: 'string', label: 'Postcode', options: { hint: 'The postal code' } },
    { field: 'links.website', input: 'url', label: 'Website', options: { hint: 'In a group that starts closed' } },
    { field: 'links.profiles.github', input: 'string', label: 'GitHub', options: { hint: 'In a group inside a group: its path is links.profiles' } },
    { field: 'links.profiles.linkedin', input: 'string', label: 'LinkedIn', options: { hint: 'The name in the address of the profile' } }
  ],
  groups: {
    person: {
      label: 'Person',
      layout: { lines: [{ slots: 2, fields: [{ model: 'firstName' }, { model: 'lastName' }] }, { fields: [{ model: 'role' }] }] }
    },
    address: {
      label: 'Address',
      collapsible: true,
      layout: { lines: [{ fields: [{ model: 'street' }] }, { slots: 3, fields: [{ model: 'city', width: 2 }, { model: 'postcode' }] }] }
    },
    links: { label: 'Links', collapsed: true },
    'links.profiles': {
      label: 'Profiles',
      collapsible: true,
      layout: { lines: [{ slots: 2, fields: [{ model: 'github' }, { model: 'linkedin' }] }] }
    }
  }
}
