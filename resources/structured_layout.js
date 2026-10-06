// form layout: `layout.lines` puts fields side by side in the record form (the fields of one line share its slots)
module.exports = {
  displayname: { enUS: 'Form layout', zhCN: '表单布局' },
  group: { enUS: 'Structured', zhCN: '结构化' },
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', required: true, options: { hint: 'Required. Names the record in lists' } },
    { field: 'firstName', input: 'string', label: 'First name', options: { hint: 'The given name of the person' } },
    { field: 'lastName', input: 'string', label: 'Last name', options: { hint: 'The family name of the person' } },
    { field: 'email', input: 'email', label: 'Email', options: { hint: 'Where to write to the person' } },
    { field: 'phone', input: 'string', label: 'Phone', options: { hint: 'With the country code' } },
    { field: 'street', input: 'string', label: 'Street', options: { hint: 'The street of the address' } },
    { field: 'number', input: 'string', label: 'Number', options: { hint: 'The number in the street' } },
    { field: 'city', input: 'string', label: 'City', options: { hint: 'The town of the address' } },
    { field: 'postcode', input: 'string', label: 'Postcode', options: { hint: 'The postal code' } },
    { field: 'country', input: 'select', label: 'Country', source: ['France', 'Germany', 'Spain', 'United Kingdom'], options: { hint: 'One of the countries listed' } },
    { field: 'notes', input: 'text', label: 'Notes', options: { hint: 'Anything else to remember' } },
    { field: 'reference', input: 'string', label: 'Reference', options: { hint: 'Not in any line of the layout: the form puts it at the end' } }
  ],
  layout: {
    lines: [
      { slots: 1, fields: [{ model: 'name' }] },
      { slots: 2, fields: [{ model: 'firstName' }, { model: 'lastName' }] },
      // a field takes `width` slots of its line (1 when it says nothing)
      { slots: 3, fields: [{ model: 'email', width: 2 }, { model: 'phone' }] },
      { slots: 4, fields: [{ model: 'street', width: 3 }, { model: 'number' }] },
      { slots: 3, fields: [{ model: 'city' }, { model: 'postcode' }, { model: 'country' }] },
      { slots: 1, fields: [{ model: 'notes' }] }
    ]
  }
}
