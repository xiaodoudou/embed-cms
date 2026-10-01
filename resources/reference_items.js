// A plain resource used as the target of `source` in select and multiselect
module.exports = {
  displayname: { enUS: 'Reference items', zhCN: '参考项目' },
  group: { enUS: 'Reference data', zhCN: '参考数据' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', required: true, unique: true, options: { hint: 'Required and unique. Shown in the select and multiselect examples' } },
    { field: 'description', input: 'text', label: 'Description', options: { hint: 'Optional' } },
    { field: 'active', input: 'checkbox', label: 'Active', localised: false, options: { hint: 'Whether the item is in use' } }
  ]
}
