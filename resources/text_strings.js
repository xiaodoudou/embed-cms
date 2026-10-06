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
    },

    // a template that stays in the box while it is typed in (options.mask)
    { field: 'maskPhone', input: 'string', label: 'Phone (mask)', localised: false, options: { mask: '(___) ___-____', hint: 'Digits only, in the template (___) ___-____' } },
    { field: 'maskDate', input: 'string', label: 'Date (mask)', localised: false, options: { mask: '__/__/____', hint: 'Digits only, __/__/____' } },
    { field: 'maskPlate', input: 'string', label: 'Plate (mask)', localised: false, options: { mask: 'AA-___-AA', hint: 'Two letters, three digits, two letters: AA-___-AA' } },
    { field: 'maskFlight', input: 'string', label: 'Flight (mask)', localised: false, options: { mask: 'F__-AAAA', hint: 'F and - are part of the template and are written for you; two digits, then four letters: F__-AAAA' } },
    { field: 'maskCode', input: 'string', label: 'Code (mask)', localised: false, required: true, options: { mask: '****-****', hint: 'Required. Letters or digits, ****-****' } },
    { field: 'maskLocalised', input: 'string', label: 'Reference per locale (mask)', options: { mask: '#####', hint: 'One reference per locale, five digits' } }
  ]
}
