import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import SchemaService from '@s/SchemaService'
import ResourceService from '@s/ResourceService'
import { TranslateService } from './helpers/mountField.js'

vi.mock('@s/ResourceService', () => ({ default: { schemas: [], get: vi.fn(), getSchema: vi.fn() } }))

const resource = (extra = {}) => ({ name: 'articles', title: 'articles', locales: ['enUS', 'zhCN'], ...extra })
const fields = (schema, options = {}) => {
  const { res = resource(), locale = 'enUS', disabled = false, extra } = options
  return SchemaService.getSchemaFields(schema, res, locale, 'enUS', disabled, extra, false)
}
const one = (field, options) => fields([field], options)[0]

beforeEach(() => {
  TranslateService.locale = 'enUS'
  ResourceService.schemas = []
  ResourceService.get.mockReset().mockReturnValue([])
  ResourceService.getSchema.mockReset().mockReturnValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('SchemaService (the form a resource schema becomes)', () => {
  describe('the basics of a field', () => {
    it('takes the look and the validator of its input type', () => {
      const field = one({ field: 'title', input: 'string' })
      expect(field.type).toBe('input')
      expect(field.overrideType).toBe('CustomInput')
      expect(typeof field.validator).toBe('function')
      expect(field.density).toBe('compact')
    })

    it('does not change the shared type description of the input', () => {
      one({ field: 'title', input: 'string', options: { extra: 1 }, required: true })
      expect(one({ field: 'other', input: 'string' }).extra).toBeUndefined()
    })

    it('is labelled from its translated label, or from its field name', () => {
      TranslateService.dict.enUS.TL_TEST_TITLE = 'The title'
      expect(one({ field: 'title', input: 'string', label: 'TL_TEST_TITLE' }, { res: resource({ locales: undefined }) }).label).toBe('The title')
      expect(one({ field: 'title', input: 'string' }, { res: resource({ locales: undefined }) }).label).toBe('title')
    })

    it('uses its label as the placeholder', () => {
      const field = one({ field: 'title', input: 'string' }, { res: resource({ locales: undefined }) })
      expect(field.placeholder).toBe(field.label)
    })

    it('knows whether it is required, disabled or read only', () => {
      const res = resource({ locales: undefined })
      expect(one({ field: 'a', input: 'string', required: true }, { res }).required).toBe(true)
      expect(one({ field: 'a', input: 'string' }, { res }).required).toBe(false)
      expect(one({ field: 'a', input: 'string', disabled: true }, { res }).disabled).toBe(true)
      expect(one({ field: 'a', input: 'string', options: { disabled: true } }, { res }).disabled).toBe(true)
      expect(one({ field: 'a', input: 'string' }, { res, disabled: true }).disabled).toBe(true)
      expect(one({ field: 'a', input: 'string', options: { readonly: true } }, { res }).readonly).toBe(true)
      expect(one({ field: 'a', input: 'string' }, { res }).readonly).toBe(false)
    })

    it('hands the resource, the language and the root view to the field', () => {
      const res = resource()
      const field = SchemaService.getSchemaFields([{ field: 'a', input: 'string' }], res, 'zhCN', 'enUS', false, undefined, 'root')[0]
      expect(field.resource).toBe(res)
      expect(field.locale).toBe('zhCN')
      expect(field.userLocale).toBe('enUS')
      expect(field.rootView).toBe('root')
    })

    it('copies the options of the schema onto the field', () => {
      const field = one({ field: 'a', input: 'string', options: { maxlength: 5, customThing: 'x' } })
      expect(field.maxlength).toBe(5)
      expect(field.customThing).toBe('x')
    })

    it('makes one field for each entry, in order', () => {
      expect(fields([{ field: 'a', input: 'string' }, { field: 'b', input: 'text' }]).map((field) => field.originalModel)).toEqual(['a', 'b'])
    })
  })

  describe('languages', () => {
    it('binds a localised field to the value of the language, and names the language in the label', () => {
      TranslateService.dict.enUS.TL_ZHCN = 'Chinese'
      const field = one({ field: 'title', input: 'string' }, { locale: 'zhCN' })
      expect(field.model).toBe('title.zhCN')
      expect(field.originalModel).toBe('title')
      expect(field.label).toBe('title (Chinese)')
      expect(field.localised).toBeTruthy()
    })

    it('binds a field that is not localised to its own name', () => {
      const field = one({ field: 'code', input: 'string', localised: false })
      expect(field.model).toBe('code')
      expect(field.label).toBe('code')
      expect(field.localised).toBeFalsy()
    })

    it('does not localise anything when the resource has no languages', () => {
      const field = one({ field: 'title', input: 'string' }, { res: resource({ locales: undefined }) })
      expect(field.model).toBe('title')
    })
  })

  describe('hints', () => {
    it('keeps a hint of the field in its options, and a hint of the options as they are', () => {
      expect(one({ field: 'a', input: 'string', hint: 'Plain' }).options.hint).toBe('Plain')
      expect(one({ field: 'a', input: 'string', hint: 'Top', options: { hint: 'Inner' } }).options.hint).toBe('Inner')
    })

    it('picks the text of the language when a hint has one text for each', () => {
      const hint = { enUS: 'English hint', zhCN: 'Chinese hint' }
      expect(one({ field: 'a', input: 'string', hint }).options.hint).toBe('English hint')
      TranslateService.locale = 'zhCN'
      TranslateService.dict.zhCN = TranslateService.dict.zhCN || {}
      expect(one({ field: 'a', input: 'string', hint }).options.hint).toBe('Chinese hint')
    })
  })

  describe('by input type', () => {
    it('lets a file field take any number of files unless it says otherwise', () => {
      expect(one({ field: 'doc', input: 'file' }).maxCount).toBe(Infinity)
      expect(one({ field: 'doc', input: 'file', options: { maxCount: 2 } }).maxCount).toBe(2)
    })

    it('keeps the key of a paragraph, and the type of a paragraph field', () => {
      expect(one({ field: 'body', input: 'paragraph', key: 'blocks' }).key).toBe('blocks')
      const field = one({ field: 'text', input: 'string', paragraphKey: 'blocks', paragraphType: 'quote' })
      expect(field.paragraphKey).toBe('blocks')
      expect(field.paragraphType).toBe('quote')
    })

    it('writes the labels of a select in the language shown', () => {
      const field = one({ field: 'kind', input: 'select', options: { labels: { a: { enUS: 'Alpha', zhCN: 'A' }, b: 'Beta' } } })
      expect(field.selectOptions.label).toEqual([{ value: 'a', text: 'Alpha' }, { value: 'b', text: 'Beta' }])
    })

    it('gives a select of several resources the records of all of them, in groups, and says it is one', () => {
      ResourceService.get.mockImplementation(name => ({ authors: [{ _id: 'a1', name: 'Zoe' }], tags: [{ _id: 't1', name: 'red' }] })[name])
      ResourceService.getSchema.mockImplementation(name => ({ title: name, displayname: name === 'tags' ? 'Tags' : 'Authors', schema: [{ field: 'name', input: 'string', localised: false }] }))
      const field = one({ field: 'owner', input: 'select', sources: ['authors', { resource: 'tags', title: 'Labels' }] })
      expect(field.multiSource).toBe(true)
      expect(field.values.map(item => [item._id, item._label, item._title])).toEqual([['authors:a1', 'Zoe', 'Authors'], ['tags:t1', 'red', 'Labels']])
      expect(one({ field: 'owner', input: 'select', source: 'authors' }).multiSource).toBeUndefined()
    })

    it('types a text with a template in a box that keeps it, and any other text in the usual one', () => {
      expect(one({ field: 'phone', input: 'string', options: { mask: '(___) ___-____' } }).overrideType).toBe('MaskedField')
      expect(one({ field: 'phone', input: 'string', options: { mask: 'no slot here' } }).overrideType).toBe('CustomInput')
      expect(one({ field: 'phone', input: 'string' }).overrideType).toBe('CustomInput')
      expect(one({ field: 'phone', input: 'email', options: { mask: '__' } }).overrideType).toBe('CustomInput')
    })

    it('gives a select and a pillbox the words of the multiselect', () => {
      for (const input of ['select', 'pillbox']) {
        const options = one({ field: 'x', input }).selectOptions
        expect(options.selectedLabel).toBe(TranslateService.get('TL_MULTISELECT_SELECTED_LABEL'))
        expect(options.tagPlaceholder).toBe(TranslateService.get('TL_MULTISELECT_TAG_PLACEHOLDER'))
        expect(options.deselectLabel).toBe(TranslateService.get('TL_MULTISELECT_DESELECT_LABEL'))
      }
    })

    it('hands the limits of a pillbox to the field and its options', () => {
      const field = one({ field: 'tags', input: 'pillbox', min: 1, max: 3 })
      expect(field).toMatchObject({ min: 1, max: 3 })
      expect(field.selectOptions).toMatchObject({ min: 1, max: 3 })
    })

    it('does not leak the words or limits of one select into another', () => {
      one({ field: 'tags', input: 'pillbox', min: 1, max: 3 })
      const other = one({ field: 'kind', input: 'select' })
      expect(other.selectOptions.min).toBeUndefined()
    })
  })

  describe('where the values of a field come from', () => {
    it('takes a list that is written in the schema', () => {
      expect(one({ field: 'kind', input: 'select', source: ['a', 'b'] }).values).toEqual(['a', 'b'])
    })

    it('takes the records of another resource', () => {
      ResourceService.get.mockReturnValue([{ _id: '1', name: { enUS: 'One' } }, { _id: '2', name: { enUS: 'Two' } }])
      ResourceService.getSchema.mockReturnValue({ locales: ['enUS'], schema: [{ field: 'name' }] })
      const field = one({ field: 'author', input: 'select', source: 'authors' })
      expect(ResourceService.get).toHaveBeenCalledWith('authors')
      expect(field.values.map((item) => item._id)).toEqual(['1', '2'])
      expect(field.source).toBe('authors')
    })

    it('has an empty list while the records are not loaded', () => {
      ResourceService.get.mockReturnValue(undefined)
      expect(one({ field: 'author', input: 'select', source: 'authors' }).values).toEqual([])
    })

    it('names an option by the first field of the other resource, in the language shown', () => {
      ResourceService.get.mockReturnValue([{ _id: '1', name: { enUS: 'One', zhCN: 'Yi' } }])
      ResourceService.getSchema.mockReturnValue({ locales: ['enUS', 'zhCN'], schema: [{ field: 'name' }] })
      const field = one({ field: 'author', input: 'select', source: 'authors' }, { locale: 'zhCN' })
      expect(field.selectOptions.customLabel('1')).toBe('Yi')
      expect(field.selectOptions.customLabel({ _id: '1', name: { enUS: 'One', zhCN: 'Er' } })).toBe('Er')
    })

    it('names an option by its id when the other resource is unknown', () => {
      ResourceService.get.mockReturnValue([{ _id: '1' }])
      const field = one({ field: 'author', input: 'select', source: 'authors' })
      expect(field.selectOptions.customLabel('1')).toBe('1')
    })

    it('names an option from a template of the field', () => {
      ResourceService.get.mockReturnValue([{ _id: '1', first: 'Ann', last: 'Lee' }])
      const field = one({ field: 'author', input: 'select', source: 'authors', options: { customLabel: '{{first}} {{last}}' } })
      expect(field.selectOptions.customLabel('1')).toBe('Ann Lee')
    })

    it('writes nothing for a template whose option is gone', () => {
      ResourceService.get.mockReturnValue([])
      const field = one({ field: 'author', input: 'select', source: 'authors', options: { customLabel: '{{first}}' } })
      expect(field.selectOptions.customLabel('missing')).toBe('')
    })

    it('reads a text field of the language when a template points at a localised field', () => {
      ResourceService.get.mockReturnValue([{ _id: '1', name: { enUS: 'One' } }])
      const field = one({ field: 'author', input: 'select', source: 'authors', options: { customLabel: '{{name}}' } })
      expect(field.selectOptions.customLabel('1')).toBe('One')
    })

    it('replaces an id by the record in an extra source', () => {
      const authors = [{ _id: 'a1', title: 'Ann' }]
      const posts = [{ _id: 'p1', author: 'a1' }, { _id: 'p2', author: { _id: 'a1' } }]
      ResourceService.get.mockImplementation((name) => (name === 'authors' ? authors : posts))
      one({ field: 'post', input: 'select', source: 'posts' }, { extra: { author: 'authors' } })
      expect(posts[0].author).toEqual({ _id: 'a1', title: 'Ann' })
      expect(posts[1].author).toEqual({ _id: 'a1' })
    })

    it('lists every resource to choose from for the rights of a group', () => {
      ResourceService.schemas = [{ name: 'articles' }, { name: 'pages' }]
      const res = resource({ name: '_groups', locales: undefined })
      const list = fields([{ field: 'create', input: 'multiselect' }, { field: 'plugins', input: 'multiselect' }], { res })
      expect(list[0].values).toEqual(['articles', 'pages'])
      expect(list[1].values).toBeUndefined()
    })
  })

  describe('getKeyLocale', () => {
    it('says what the form service says', () => {
      expect(SchemaService.getKeyLocale({ model: 'a.enUS', localised: true })).toEqual({ key: 'a', locale: 'enUS' })
    })
  })

  describe('getNestedGroups (dotted field names become groups)', () => {
    const flat = (...names) => names.map((name) => ({ originalModel: name, model: name, type: 'input' }))
    const res = (extra = {}) => ({ title: 'articles', ...extra })

    it('keeps a field without a dot where it is', () => {
      const result = SchemaService.getNestedGroups(res(), flat('title', 'body'), 0)
      expect(result.map((item) => item.originalModel)).toEqual(['title', 'body'])
    })

    it('puts the fields that share a first part in a group named by it', () => {
      const result = SchemaService.getNestedGroups(res(), flat('seo.title', 'seo.description', 'name'), 0)
      expect(result).toHaveLength(2)
      const group = result[0]
      expect(group.type).toBe('group')
      expect(group.key).toBe('seo')
      expect(group.label).toBe('seo')
      expect(group.groupOptions.fields.map((item) => item.originalModel)).toEqual(['seo.title', 'seo.description'])
      expect(result[1].originalModel).toBe('name')
    })

    it('nests a group in a group', () => {
      const result = SchemaService.getNestedGroups(res(), flat('a.b.c', 'a.b.d', 'a.e'), 0)
      expect(result).toHaveLength(1)
      const inner = result[0].groupOptions.fields
      expect(inner.map((item) => item.key || item.originalModel)).toEqual(['b', 'a.e'])
      expect(inner[0].groupOptions.fields.map((item) => item.originalModel)).toEqual(['a.b.c', 'a.b.d'])
    })

    it('names a group from the resource when it has a label for it', () => {
      TranslateService.dict.enUS.TL_TEST_SEO = 'Search engines'
      const result = SchemaService.getNestedGroups(res({ groups: { seo: { label: 'TL_TEST_SEO' } } }), flat('seo.a', 'seo.b'), 0)
      expect(result[0].label).toBe('Search engines')
    })

    it('is always open and has no layout unless the resource says so', () => {
      const group = SchemaService.getNestedGroups(res(), flat('seo.a', 'seo.b'), 0)[0]
      expect(group.collapsible).toBe(false)
      expect(group.collapsed).toBe(false)
      expect(group.groupOptions.layout).toBeUndefined()
    })

    it('can be closed and opened when the resource says so', () => {
      const group = SchemaService.getNestedGroups(res({ groups: { seo: { collapsible: true } } }), flat('seo.a', 'seo.b'), 0)[0]
      expect(group.collapsible).toBe(true)
      expect(group.collapsed).toBe(false)
    })

    it('starts closed, and can be opened, when the resource says collapsed', () => {
      const group = SchemaService.getNestedGroups(res({ groups: { seo: { collapsed: true } } }), flat('seo.a', 'seo.b'), 0)[0]
      expect(group.collapsible).toBe(true)
      expect(group.collapsed).toBe(true)
    })

    it('stays open when it is collapsed but says it cannot be collapsible', () => {
      const group = SchemaService.getNestedGroups(res({ groups: { seo: { collapsed: true, collapsible: false } } }), flat('seo.a', 'seo.b'), 0)[0]
      expect(group.collapsible).toBe(false)
      expect(group.collapsed).toBe(false)
    })

    it('gives a group the lines of its layout, with its fields on them', () => {
      const groups = { seo: { layout: { lines: [{ slots: 2, fields: [{ model: 'a' }, { model: 'b' }] }] } } }
      const group = SchemaService.getNestedGroups(res({ groups }), flat('seo.a', 'seo.b', 'seo.c'), 0)[0]
      expect(group.groupOptions.layout.lines.map((line) => line.fields.map((field) => field.model))).toEqual([['seo.a', 'seo.b'], ['seo.c']])
      expect(group.groupOptions.fields).toHaveLength(3)
    })

    it('says what a group inside a group is by its whole path', () => {
      TranslateService.dict.enUS.TL_TEST_PROFILES = 'Online profiles'
      const groups = {
        'a.b': { label: 'TL_TEST_PROFILES', collapsed: true, layout: { lines: [{ fields: [{ model: 'c' }, { model: 'd' }] }] } },
        // (the last part alone does not name it)
        b: { label: 'not this' }
      }
      const outer = SchemaService.getNestedGroups(res({ groups }), flat('a.b.c', 'a.b.d', 'a.e'), 0)[0]
      expect(outer.collapsible).toBe(false)
      const inner = outer.groupOptions.fields[0]
      expect(inner.label).toBe('Online profiles')
      expect(inner.collapsed).toBe(true)
      expect(inner.groupOptions.layout.lines[0].fields.map((field) => field.model)).toEqual(['a.b.c', 'a.b.d'])
    })

    it('starts the path of a group at its own key whether the path given is nothing or null (a block gives null)', () => {
      const groups = { 'a.b': { label: 'Inner' } }
      for (const path of [undefined, null]) {
        const outer = SchemaService.getNestedGroups(res({ groups }), flat('a.b.c', 'a.b.d', 'a.e'), 0, path)[0]
        expect(outer.groupOptions.fields[0].label).toBe('Inner')
      }
    })

    it('places the fields of a block, whose keys start with a prefix', () => {
      const groups = { a: { layout: { lines: [{ fields: [{ model: 'y' }, { model: 'x' }] }] } } }
      const group = SchemaService.getNestedGroups(res({ groups }), flat('block.a.x', 'block.a.y'), 0, undefined, 'block.')[0]
      expect(group.groupOptions.layout.lines[0].fields.map((field) => field.model)).toEqual(['block.a.y', 'block.a.x'])
    })

    it('warns about a field that is declared twice, and shows it once', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = SchemaService.getNestedGroups(res(), flat('title', 'title'), 0)
      expect(result).toHaveLength(1)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toContain('duplicated field \'title\'')
    })

    it('leaves out a prefix that is given', () => {
      const result = SchemaService.getNestedGroups(res(), flat('block.a.x', 'block.a.y'), 0, undefined, 'block.')
      expect(result[0].key).toBe('a')
    })
  })
})
