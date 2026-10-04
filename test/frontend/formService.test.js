import { describe, it, expect, beforeEach } from 'vitest'
import FormService from '@s/FormService'
import { TranslateService } from './helpers/mountField.js'

const mapper = FormService.typeMapper
const check = (type, value, field = {}, model = {}) => mapper[type].validator(value, field, model)
const REQUIRED = () => TranslateService.get('TL_FIELD_IS_REQUIRED')
const INVALID = () => TranslateService.get('TL_INVALID_FORMAT')

beforeEach(() => {
  TranslateService.locale = 'enUS'
})

describe('FormService (how each input type is built and checked)', () => {
  describe('getKeyLocale', () => {
    it('gives the key of a plain field', () => {
      expect(FormService.getKeyLocale({ model: 'title' })).toEqual({ key: 'title' })
    })

    it('splits the locale off a localised field, and keeps a nested key whole', () => {
      expect(FormService.getKeyLocale({ model: 'title.enUS', localised: true })).toEqual({ key: 'title', locale: 'enUS' })
      expect(FormService.getKeyLocale({ model: 'seo.title.zhCN', localised: true })).toEqual({ key: 'seo.title', locale: 'zhCN' })
      expect(FormService.getKeyLocale({ model: 'seo.title', localised: false })).toEqual({ key: 'seo.title' })
    })

    it('copes with a schema without a model', () => {
      expect(FormService.getKeyLocale({})).toEqual({ key: '' })
      expect(FormService.getKeyLocale(undefined)).toEqual({ key: '' })
    })
  })

  describe('the input types', () => {
    it('knows every input type the documentation lists', () => {
      expect(Object.keys(mapper).sort()).toEqual([
        'checkbox', 'code', 'color', 'cropimage', 'date', 'datetime', 'double', 'email', 'file', 'group', 'image', 'integer', 'json', 'multiselect',
        'number', 'object', 'paragraph', 'password', 'pillbox', 'select', 'string', 'text', 'time', 'transliterate', 'url', 'wysiwyg'
      ])
    })

    it('gives every type the compact, flat look', () => {
      for (const [name, type] of Object.entries(mapper)) {
        expect(type.density, name).toBe('compact')
        expect(type.rounded, name).toBe(true)
        expect(type.flat, name).toBe(true)
        expect(type['solo-filled'], name).toBe(true)
      }
    })

    it('maps a type to the component that draws it', () => {
      expect(mapper.string.overrideType).toBe('CustomInput')
      expect(mapper.text.overrideType).toBe('CustomTextarea')
      expect(mapper.checkbox.overrideType).toBe('CustomCheckbox')
      expect(mapper.select.type).toBe('CustomMultiSelect')
      expect(mapper.pillbox.type).toBe('CustomInputTag')
      expect(mapper.image.type).toBe('ImageView')
      expect(mapper.file.type).toBe('AttachmentView')
      expect(mapper.object.type).toBe('JsonEditor')
      expect(mapper.paragraph.type).toBe('ParagraphView')
    })

    it('uses the right keyboard and number input for each kind of number', () => {
      for (const type of ['number', 'double', 'integer']) expect(mapper[type].inputFieldType).toBe('number')
      expect(mapper.email.inputFieldType).toBeUndefined()
      expect(mapper.email.inputmode).toBeUndefined()
      expect(mapper.password.inputFieldType).toBe('password')
    })

    it('shows the date formats a person types', () => {
      expect(mapper.date.format).toBe('YYYY-MM-DD')
      expect(mapper.time.format).toBe('HH:mm:ss')
      expect(mapper.datetime.format).toBe('YYYY-MM-DD HH:mm:ss')
      for (const type of ['date', 'time', 'datetime']) expect(mapper[type].customDatetimePickerOptions.placeholder).toBe(mapper[type].format)
    })

    it('lets a pillbox add a new tag to its options and to its value', () => {
      const options = ['a']
      const value = ['a']
      mapper.pillbox.selectOptions.onNewTag('b', 'id', options, value)
      expect(options).toEqual(['a', 'b'])
      expect(value).toEqual(['a', 'b'])
    })

    it('makes a select single and a multiselect multiple, both searchable', () => {
      expect(mapper.select.selectOptions).toMatchObject({ multiple: false, searchable: true, trackBy: '_id' })
      expect(mapper.multiselect.selectOptions).toMatchObject({ multiple: true, searchable: true, chips: true })
    })

    it('labels a select option by its label table, or by itself', () => {
      const label = mapper.select.selectOptions.customLabel
      expect(label('a', { a: 'Apple' })).toBe('Apple')
      expect(label('b', { a: 'Apple' })).toBe('b')
    })
  })

  describe('text (string, transliterate, text)', () => {
    it.each(['string', 'transliterate', 'text'])('is used by %s', (type) => {
      expect(check(type, 'x')).toBe(true)
    })

    it('says when a required text is empty or not a text', () => {
      expect(check('string', '', { required: true })).toBe(REQUIRED())
      expect(check('string', undefined, { required: true })).toBe(REQUIRED())
      expect(check('string', 5, { required: true })).toBe(REQUIRED())
      expect(check('string', 'x', { required: true })).toBe(true)
    })

    it('accepts an empty text that is not required', () => {
      expect(check('string', '', {})).toBe(true)
      expect(check('string', undefined, {})).toBe(true)
    })

    it('checks a pattern, and says what it expects', () => {
      const field = { regex: { value: '/^[a-z]+$/', description: 'lower case letters' } }
      expect(check('string', 'abc', field)).toBe(true)
      expect(check('string', 'ABC', field)).toBe(`${INVALID()} (lower case letters)`)
    })

    it('says the pattern itself when there is no description', () => {
      expect(check('string', '1', { regex: { value: '/^[a-z]+$/' } })).toBe(`${INVALID()} (/^[a-z]+$/)`)
    })

    it('reads the flags of a pattern', () => {
      expect(check('string', 'ABC', { regex: { value: '/^[a-z]+$/i' } })).toBe(true)
    })

    it('uses the pattern of the language of a localised field, then the general one', () => {
      const field = {
        localised: true,
        model: 'enUS.title',
        regex: { enUS: { value: '/^a/', description: 'starts with a' }, value: '/^z/', description: 'starts with z' }
      }
      expect(check('string', 'abc', field)).toBe(true)
      expect(check('string', 'zbc', field)).toBe(`${INVALID()} (starts with a)`)
      expect(check('string', 'zbc', { ...field, model: 'zhCN.title' })).toBe(true)
      expect(check('string', 'abc', { ...field, model: 'zhCN.title' })).toBe(`${INVALID()} (starts with z)`)
    })

    it('takes a pattern that is not written like /text/ as the pattern itself', () => {
      expect(check('string', 'x', { regex: { value: '^x$' } })).toBe(true)
      expect(check('string', 'xy', { regex: { value: '^x$' } })).toBe(`${INVALID()} (^x$)`)
    })
  })

  describe('numbers', () => {
    it('says when a required number is missing, and 0 is a number', () => {
      expect(check('number', undefined, { required: true })).toBe(REQUIRED())
      expect(check('number', '', { required: true })).toBe(REQUIRED())
      expect(check('number', 0, { required: true })).toBe(true)
    })

    it('accepts an empty number that is not required', () => {
      expect(check('number', undefined, {})).toBe(true)
      expect(check('integer', undefined, {})).toBe(true)
      expect(check('double', undefined, {})).toBe(true)
    })

    it('accepts numbers typed as text, as the input gives them', () => {
      expect(check('number', '12.5')).toBe(true)
      expect(check('integer', '12')).toBe(true)
      expect(check('double', '1.5')).toBe(true)
    })

    it('refuses a decimal for an integer', () => {
      expect(check('integer', 1.5)).toBe(false)
      expect(check('integer', '1.5')).toBe(false)
      expect(check('integer', 3)).toBe(true)
    })

    it('does not crash on an integer that was cleared', () => {
      expect(check('integer', null)).toBe(true)
      expect(check('integer', undefined)).toBe(true)
    })

    it('accepts a whole number or a decimal for a double', () => {
      expect(check('double', 2)).toBe(true)
      expect(check('double', 2.25)).toBe(true)
    })
  })

  describe('email and url', () => {
    it('accepts an address, an empty value, and refuses the rest', () => {
      expect(check('email', 'me@example.com')).toBeTruthy()
      expect(check('email', undefined)).toBe(true)
      expect(check('email', '')).toBe(true)
      expect(check('email', 'not an address')).toBeFalsy()
      expect(check('email', 'me@')).toBeFalsy()
    })

    it('accepts an address with a plus sign and a sub-domain', () => {
      expect(check('email', 'me+tag@mail.example.co.uk')).toBeTruthy()
    })

    it('accepts a full address and refuses text for a url', () => {
      expect(check('url', 'https://example.com/a?b=1')).toBe(true)
      expect(check('url', 'example.com')).toBe(false)
      expect(check('url', '')).toBe(false)
    })
  })

  describe('wysiwyg', () => {
    it('says when a required text is empty, or only an empty paragraph', () => {
      expect(check('wysiwyg', '', { required: true })).toBe(REQUIRED())
      expect(check('wysiwyg', '<p></p>', { required: true })).toBe(REQUIRED())
      expect(check('wysiwyg', '<p>Hi</p>', { required: true })).toBe(true)
    })

    it('treats an empty paragraph as empty even when the field is not required', () => {
      expect(check('wysiwyg', '<p></p>', {})).toBe(REQUIRED())
      expect(check('wysiwyg', '', {})).toBe(true)
    })
  })

  describe('select, pillbox and multiselect', () => {
    it('says when a required select is empty', () => {
      expect(check('select', '', { required: true })).toBe(REQUIRED())
      expect(check('select', undefined, { required: true })).toBe(REQUIRED())
      expect(check('select', 'a', { required: true })).toBe(true)
      expect(check('select', '', {})).toBe(true)
    })

    it('says when a required pillbox has no tag', () => {
      expect(check('pillbox', [], { required: true })).toBe(REQUIRED())
      expect(check('pillbox', undefined, { required: true })).toBe(REQUIRED())
      expect(check('pillbox', ['a'], { required: true })).toBe(true)
      expect(check('pillbox', [], {})).toBe(true)
    })

    it('wants a list for a multiselect', () => {
      expect(check('multiselect', ['a'])).toBe(true)
      expect(check('multiselect', 'a')).toBe(false)
    })
  })

  describe('image and file', () => {
    const attachment = (name, locale) => ({ _name: name, _fields: { locale } })

    it('is satisfied by a saved attachment of the field', () => {
      expect(check('image', [], { model: 'photo', required: true }, { _attachments: [attachment('photo')] })).toBe(true)
      expect(check('file', [], { model: 'doc', required: true }, { _attachments: [attachment('doc')] })).toBe(true)
    })

    it('says when a required image or file is missing', () => {
      expect(check('image', [], { model: 'photo', required: true }, { _attachments: [attachment('other')] })).toBe(REQUIRED())
      expect(check('file', [], { model: 'doc', required: true }, {})).toBe(REQUIRED())
    })

    it('is satisfied by an image that is about to be uploaded', () => {
      expect(check('image', [{ name: 'new.png' }], { model: 'photo', required: true }, {})).toBe(true)
    })

    it('only counts a file that is saved, not one waiting to be uploaded', () => {
      expect(check('file', [{ name: 'new.pdf' }], { model: 'doc', required: true }, {})).toBe(REQUIRED())
    })

    it('looks for the attachment of the language of a localised field', () => {
      const field = { model: 'photo.zhCN', localised: true, required: true }
      expect(check('image', [], field, { _attachments: [attachment('photo', 'enUS')] })).toBe(REQUIRED())
      expect(check('image', [], field, { _attachments: [attachment('photo', 'zhCN')] })).toBe(true)
    })

    it('does not ask for anything when it is not required', () => {
      expect(check('image', [], { model: 'photo' }, {})).toBe(true)
      expect(check('file', [], { model: 'doc' }, {})).toBe(true)
    })
  })
})
