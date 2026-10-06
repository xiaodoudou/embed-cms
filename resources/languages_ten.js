// the most languages a resource can show at once: ten, to see how the language switch, the table and the form cope. A real project has two to four (see `languages`)
module.exports = {
  displayname: { enUS: 'Ten languages', zhCN: '十种语言' },
  group: { enUS: 'Text', zhCN: '文本' },
  locales: ['enUS', 'zhCN', 'frFR', 'thTH', 'jaJP', 'koKR', 'deDE', 'esES', 'ptBR', 'viVN'],
  type: 'normal',
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true, options: { hint: 'Required in every language. Names the record in lists' } },
    { field: 'summary', input: 'text', label: 'Summary', options: { hint: 'Optional. One value per language' } },
    { field: 'body', input: 'wysiwyg', label: 'Body', options: { hint: 'Rich text, one per language' } },
    { field: 'banner', input: 'image', label: 'Banner', options: { maxCount: 1, hint: 'One image per language' } },
    { field: 'code', input: 'string', label: 'Code', localised: false, options: { hint: 'The same in every language' } }
  ]
}
