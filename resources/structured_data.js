// json (tree view) and object (schema-driven JSON editor)
module.exports = {
  displayname: { enUS: 'Structured data', zhCN: '结构化数据' },
  group: { enUS: 'Structured', zhCN: '结构化' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // Free-form JSON shown as a tree
    { field: 'json', input: 'json', label: 'JSON data', localised: false, options: { hint: 'Free-form JSON shown as a tree' } },
    { field: 'localisedJson', input: 'json', label: 'JSON data per locale', options: { hint: 'One JSON document per locale' } },
    // An object edited through a form generated from a JSON schema
    {
      field: 'settings',
      input: 'object',
      label: 'Settings',
      localised: false,
      options: {
        hint: 'A form generated from a JSON schema: boolean, text, bounded integer and a list of choices',
        jsonEditorOptions: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            title: { type: 'string' },
            count: { type: 'integer', minimum: 0, maximum: 10, default: 1 },
            mode: { type: 'string', enum: ['fast', 'balanced', 'thorough'], default: 'balanced' }
          },
          required: ['title']
        }
      }
    },
    // A list of objects edited as a table
    {
      field: 'rows',
      input: 'object',
      label: 'Table rows',
      localised: false,
      options: {
        hint: 'A list of objects edited as a table',
        jsonEditorOptions: {
          type: 'array',
          format: 'table',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              kind: { type: 'string', enum: ['a', 'b', 'c'] },
              amount: { type: 'number' }
            }
          }
        }
      }
    },
    // One object per locale
    {
      field: 'localisedObject',
      input: 'object',
      label: 'Object per locale',
      options: { hint: 'One object per locale', jsonEditorOptions: { type: 'object', properties: { label: { type: 'string' } } } }
    }
  ]
}
