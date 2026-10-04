// multiselect (several values from a list) and pillbox (free tags)
module.exports = {
  displayname: { enUS: 'Multiple choice', zhCN: '多选' },
  group: { enUS: 'Choice', zhCN: '选择' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // multiselect: static values
    { field: 'flags', input: 'multiselect', label: 'Colour flags', localised: false, source: ['red', 'green', 'blue'], options: { hint: 'Any number of values from a fixed list' } },
    { field: 'requiredFlags', input: 'multiselect', label: 'Required colour flags', localised: false, required: true, source: ['red', 'green', 'blue'], options: { hint: 'Required: pick at least one' } },
    // multiselect: static values with a readable label
    {
      field: 'channels',
      input: 'multiselect',
      label: 'Publishing channels',
      localised: false,
      source: ['web', 'mobile', 'print'],
      options: { labels: { web: 'Website', mobile: 'Mobile app', print: 'Print' }, hint: 'Stored as web, mobile or print; shown with a readable label' }
    },
    // multiselect: values from another resource
    { field: 'items', input: 'multiselect', label: 'Linked items', localised: false, source: 'reference_items', options: { customLabel: '{{name}}', hint: 'Several records from the Reference items resource' } },
    { field: 'linkedMany', input: 'multiselect', label: 'Linked records (several resources)', localised: false, sources: ['reference_items', { resource: 'reference_people', customLabel: '{{name}} ({{role}})', title: 'People' }], options: { hint: 'Records from the Reference items and the Reference people resources, in groups; kept as { resource, id }' } },
    { field: 'localisedItems', input: 'multiselect', label: 'Linked items per locale', source: 'reference_items', options: { hint: 'One selection per locale' } },
    { field: 'readOnlyItems', input: 'multiselect', label: 'Read-only items', localised: false, source: 'reference_items', options: { readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledItems', input: 'multiselect', label: 'Disabled items', localised: false, source: 'reference_items', options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } },
    // pillbox: free tags
    { field: 'tags', input: 'pillbox', label: 'Tags', localised: false, options: { hint: 'Type a tag and press Enter. Any number of tags' } },
    { field: 'requiredTags', input: 'pillbox', label: 'Required tags', localised: false, required: true, options: { hint: 'Required: add at least one tag' } },
    { field: 'localisedTags', input: 'pillbox', label: 'Tags per locale', options: { hint: 'One list of tags per locale' } },
    // pillbox: between 2 and 4 tags
    { field: 'boundedTags', input: 'pillbox', label: 'Keywords (2 to 4)', localised: false, min: 2, max: 4, options: { hint: 'Add between 2 and 4 tags' } },
    // pillbox: locked
    { field: 'readOnlyTags', input: 'pillbox', label: 'Read-only tags', localised: false, options: { readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledTags', input: 'pillbox', label: 'Disabled tags', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } },
    // multiselect: a button that selects or deselects every value
    { field: 'allFlags', input: 'multiselect', label: 'Colour flags with a select all button', localised: false, source: ['red', 'green', 'blue'], options: { listBox: true, hint: 'A button next to the label selects or deselects every value' } }
  ]
}
