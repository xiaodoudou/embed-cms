import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Every input the admin can render must show the field's label and its hint. The field components are listed here
// so a new one has to be added on purpose.

const DIR = path.resolve(__dirname, '../../src/components/fields')
const source = (name) => fs.readFileSync(path.join(DIR, `${name}.vue`), 'utf8')

const FIELD_COMPONENTS = [
  'AttachmentView', 'ColorPicker', 'CustomCheckbox', 'CustomCode', 'CustomDatetimePicker', 'CustomInput', 'CustomInputTag',
  'CustomMultiSelect', 'CustomTextarea', 'CustomTreeView', 'DateRangeField', 'DurationField', 'GeopointField', 'ImageView', 'JsonEditor', 'MarkdownField', 'MaskedField', 'MoneyField', 'ParagraphView', 'PhoneField', 'RatingField', 'Transliterate', 'Wysiwyg'
]
// Building blocks that are not inputs themselves
const HELPERS = ['FieldLabel', 'GeoPickerDialog', 'Group', 'TiptapMenuBar', 'TiptapMenuItem']

describe('field components', () => {
  it('lists every component of the fields folder', () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.vue')).map((f) => f.replace(/\.vue$/, ''))
    expect(files.sort()).toEqual([...FIELD_COMPONENTS, ...HELPERS].sort())
  })

  it.each(FIELD_COMPONENTS)('%s shows the label', (name) => {
    expect(source(name)).toMatch(/<field-label|schema\.label|getLabel\(/)
  })

  it.each(FIELD_COMPONENTS)('%s shows the hint', (name) => {
    expect(source(name)).toMatch(/class="help-block[ "]|showHint\(\)|<file-input-errors/)
  })
})
