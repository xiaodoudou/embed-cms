// string and transliterate: every option a single-line text field takes
module.exports = {
  displayname: { enUS: 'Strings', zhCN: '字符串' },
  group: { enUS: 'Text', zhCN: '文本' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    {
      field: 'name',
      input: 'string',
      label: { enUS: 'Name', zhCN: '名称' },
      required: true,
      options: { hint: 'Required. One value per locale' }
    },
    {
      field: 'optional',
      input: 'string',
      label: 'Optional text',
      options: { hint: 'Optional. One value per locale' }
    },
    {
      field: 'sharedValue',
      input: 'string',
      label: 'Shared text',
      localised: false,
      options: { hint: 'Not localised: one value for every locale' }
    },
    {
      field: 'uniqueCode',
      input: 'string',
      label: 'Unique code',
      localised: false,
      required: true,
      unique: true,
      options: { hint: 'Required and unique across all records' }
    },
    {
      field: 'limited',
      input: 'string',
      label: 'Length limited',
      localised: false,
      options: { min: 3, max: 12, hint: 'Between 3 and 12 characters' }
    },
    {
      field: 'pattern',
      input: 'string',
      label: 'Pattern (regex)',
      localised: false,
      options: {
        regex: { value: '/^[A-Z]{3}\\d{3}$/', description: 'Format: AAA123' },
        hint: 'Three capital letters then three digits, for example ABC123'
      }
    },
    {
      field: 'patternPerLocale',
      input: 'string',
      label: 'Pattern per locale',
      options: {
        regex: {
          enUS: { value: '/^[a-z ]+$/', description: 'Lowercase letters only' },
          zhCN: { value: '/^[\\u4e00-\\u9fa5]+$/', description: 'Chinese characters only' }
        },
        hint: 'Each locale has its own rule: lowercase letters in English, Chinese characters in Chinese'
      }
    },
    {
      field: 'readOnly',
      input: 'string',
      label: 'Read-only text',
      localised: false,
      options: { readonly: true, hint: 'Read-only: visible and copyable, not editable' }
    },
    {
      field: 'disabled',
      input: 'string',
      label: 'Disabled text',
      localised: false,
      options: { disabled: true, hint: 'Disabled: greyed out and not focusable' }
    },
    {
      field: 'slug',
      input: 'transliterate',
      label: 'Slug',
      localised: false,
      unique: true,
      options: { valueFrom: 'name', readonly: false, hint: 'Generated from the name, can be edited. Unique' }
    },
    {
      field: 'lockedSlug',
      input: 'transliterate',
      label: 'Locked slug',
      localised: false,
      options: { valueFrom: 'name', readonly: true, hint: 'Generated from the name, cannot be edited' }
    }
  ]
}
