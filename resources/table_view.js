// view: 'table' shows the records as a sortable table (columns menu, density, several locales side by side)
// instead of the list + editor. One column per field; the kinds below show how each type is drawn in a cell.
module.exports = {
  displayname: { enUS: 'Table view', zhCN: '表格视图' },
  group: { enUS: 'Table', zhCN: '表格' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  view: 'table',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, searchable: true, options: { hint: 'Required. Searched by the filter above the table' } },
    { field: 'title', input: 'string', label: 'Title', searchable: true, options: { hint: 'One value per locale: the table shows the current locale, or all of them side by side' } },
    { field: 'summary', input: 'text', label: 'Summary', options: { hint: 'Long text is cut to one line in the table' } },
    { field: 'status', input: 'select', label: 'Status', localised: false, source: ['draft', 'published', 'archived'], options: { hint: 'One value from a fixed list' } },
    { field: 'tags', input: 'pillbox', label: 'Tags', localised: false, options: { hint: 'Several values, shown as chips' } },
    { field: 'price', input: 'double', label: 'Price', localised: false, options: { hint: 'Numbers are aligned to the right' } },
    { field: 'stock', input: 'integer', label: 'Stock', localised: false, options: { hint: 'A whole number' } },
    { field: 'featured', input: 'checkbox', label: 'Featured', localised: false, options: { hint: 'Yes or no' } },
    { field: 'released', input: 'date', label: 'Released', localised: false, options: { hint: 'A date' } },
    { field: 'updated', input: 'datetime', label: 'Updated', localised: false, options: { hint: 'A date and a time' } },
    { field: 'colour', input: 'color', label: 'Colour', localised: false, options: { hint: 'A colour swatch' } },
    { field: 'website', input: 'url', label: 'Website', localised: false, options: { hint: 'A link' } },
    { field: 'contact', input: 'email', label: 'Contact', localised: false, options: { hint: 'An email address' } },
    { field: 'photo', input: 'image', label: 'Photo', localised: false, options: { hint: 'A thumbnail' } }
  ]
}
