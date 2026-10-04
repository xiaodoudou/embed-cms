// A second plain resource, so that a select or a multiselect can take its records from several (`sources`)
module.exports = {
  displayname: { enUS: 'Reference people', zhCN: '参考人员' },
  group: { enUS: 'Reference data', zhCN: '参考数据' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', required: true, unique: true, options: { hint: 'Required and unique. Shown in the examples of a field of several resources' } },
    { field: 'role', input: 'string', label: 'Role', localised: false, options: { hint: 'Optional. Shown after the name in the list' } }
  ]
}
