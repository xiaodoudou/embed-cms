// select: one value from a list
module.exports = {
  displayname: { enUS: 'Selects', zhCN: '单选' },
  group: { enUS: 'Choice', zhCN: '选择' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // Static list of values
    { field: 'status', input: 'select', label: 'Status', localised: false, source: ['draft', 'published', 'archived'], options: { hint: 'One value from a fixed list' } },
    { field: 'requiredStatus', input: 'select', label: 'Required status', localised: false, required: true, source: ['draft', 'published', 'archived'], options: { hint: 'Required' } },
    // Static values with a readable label, per locale
    {
      field: 'priority',
      input: 'select',
      label: 'Priority',
      localised: false,
      source: ['low', 'medium', 'high'],
      options: {
        hint: 'Stored as low, medium or high; shown with a readable label per locale',
        labels: {
          low: { enUS: 'Low', zhCN: '低' },
          medium: { enUS: 'Medium', zhCN: '中' },
          high: { enUS: 'High', zhCN: '高' }
        }
      }
    },
    // The list comes from another resource
    { field: 'item', input: 'select', label: 'Linked item', localised: false, source: 'reference_items', options: { hint: 'One record from the Reference items resource' } },
    // Custom label built from the target record
    { field: 'itemWithLabel', input: 'select', label: 'Linked item (custom label)', localised: false, source: 'reference_items', options: { customLabel: '{{name}}', hint: 'Same list, label built from the record name' } },
    { field: 'linked', input: 'select', label: 'Linked record (several resources)', localised: false, sources: ['reference_items', { resource: 'reference_people', customLabel: '{{name}} ({{role}})', title: 'People' }], options: { hint: 'One record from the Reference items or the Reference people resource, in groups; kept as { resource, id }' } },
    { field: 'localisedChoice', input: 'select', label: 'Choice per locale', source: ['one', 'two', 'three'], options: { hint: 'One value per locale' } },
    { field: 'readOnlySelect', input: 'select', label: 'Read-only select', localised: false, source: ['a', 'b'], options: { readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledSelect', input: 'select', label: 'Disabled select', localised: false, source: ['a', 'b'], options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } }
  ]
}
