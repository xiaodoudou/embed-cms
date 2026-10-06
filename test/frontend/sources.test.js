import { describe, it, expect, beforeEach, vi } from 'vitest'
import ResourceService from '@s/ResourceService'
import { isMultiSource, sourcesOf, isRef, refKey, toKey, keyRef, sourceTitle, sourceItems, refLabel } from '@u/sources'
import { TranslateService } from './helpers/mountField.js'

vi.mock('@s/ResourceService', () => ({ default: { schemas: [], get: vi.fn(), getSchema: vi.fn() } }))

// A select of several resources: its choices, the references it keeps, how a reference is named.

const authors = [{ _id: 'a1', name: 'Zoe' }, { _id: 'a2', name: 'Ann' }]
const editors = [{ _id: 'e1', name: { enUS: 'Eve', zhCN: '夏娃' }, role: 'chief' }]

beforeEach(() => {
  TranslateService.locale = 'enUS'
  ResourceService.get.mockReset().mockImplementation(resource => ({ authors, editors })[resource])
  ResourceService.getSchema.mockReset().mockImplementation(resource => ({
    authors: { title: 'authors', displayname: 'Authors', schema: [{ field: 'name', input: 'string', localised: false }] },
    editors: { title: 'editors', displayname: { enUS: 'Editors', zhCN: '编辑' }, locales: ['enUS', 'zhCN'], schema: [{ field: 'name', input: 'string' }, { field: 'role', input: 'string' }] }
  })[resource])
})

describe('isMultiSource and sourcesOf', () => {
  it('is a select or a multiselect with a list of sources', () => {
    expect(isMultiSource({ input: 'select', sources: ['a'] })).toBe(true)
    expect(isMultiSource({ input: 'multiselect', sources: [{ resource: 'a' }] })).toBe(true)
    expect(isMultiSource({ input: 'select', source: 'a' })).toBe(false)
    expect(isMultiSource({ input: 'select', sources: [] })).toBe(false)
    expect(isMultiSource({ input: 'string', sources: ['a'] })).toBe(false)
    expect(isMultiSource(undefined)).toBe(false)
  })

  it('lists the resources in order, a name and an object being the same thing, and leaves out what is not one', () => {
    const field = { input: 'select', sources: ['a', { resource: 'b', customLabel: '{{x}}' }, 3, '', { resource: 'a' }, null] }
    expect(sourcesOf(field)).toEqual([{ resource: 'a' }, { resource: 'b', customLabel: '{{x}}' }])
    expect(sourcesOf({ input: 'select', source: 'a' })).toEqual([])
  })
})

describe('references and their keys', () => {
  it('knows a reference, and writes it as one text and back', () => {
    expect(isRef({ resource: 'a', id: 'x' })).toBe(true)
    for (const bad of [undefined, null, '', 'a:x', {}, { resource: 'a' }, { resource: 'a', id: '' }, [], 5]) {
      expect(isRef(bad), JSON.stringify(bad)).toBe(false)
    }
    expect(refKey({ resource: 'authors', id: 'a1' })).toBe('authors:a1')
    expect(keyRef('authors:a1')).toEqual({ resource: 'authors', id: 'a1' })
    expect(keyRef('authors:a:1')).toEqual({ resource: 'authors', id: 'a:1' })
  })

  it('has no reference for a text that is not a key', () => {
    for (const bad of [undefined, null, '', 'plain', ':a1', 'authors:', 5, {}]) {
      expect(keyRef(bad), String(bad)).toBeUndefined()
    }
  })

  it('takes the key of a reference, or of a key', () => {
    expect(toKey({ resource: 'authors', id: 'a1' })).toBe('authors:a1')
    expect(toKey('authors:a1')).toBe('authors:a1')
    expect(toKey('plain')).toBeUndefined()
    expect(toKey(undefined)).toBeUndefined()
  })
})

describe('sourceTitle', () => {
  it('is the title the field gives, else the name of the resource in the admin, else its name', () => {
    expect(sourceTitle({ resource: 'authors', title: 'Writers' })).toBe('Writers')
    expect(sourceTitle({ resource: 'authors' })).toBe('Authors')
    expect(sourceTitle({ resource: 'nothing' })).toBe('nothing')
  })

  it('speaks the language of the admin', () => {
    expect(sourceTitle({ resource: 'editors' })).toBe('Editors')
    TranslateService.locale = 'zhCN'
    expect(sourceTitle({ resource: 'editors' })).toBe('编辑')
    expect(sourceTitle({ resource: 'authors', title: { enUS: 'Writers', zhCN: '作者' } })).toBe('作者')
  })
})

describe('sourceItems', () => {
  const field = { input: 'select', sources: ['authors', { resource: 'editors', customLabel: '{{name}} ({{role}})', title: 'People who edit' }] }

  it('lists the records of every resource, in the order of the field, each resource by name, with the group it belongs to', () => {
    const items = sourceItems(field, 'enUS')
    expect(items.map(item => [item._title, item._label])).toEqual([['Authors', 'Ann'], ['Authors', 'Zoe'], ['People who edit', 'Eve (chief)']])
  })

  it('keys a choice by its resource and its id, and keeps its record', () => {
    const [ann] = sourceItems(field, 'enUS')
    expect(ann).toMatchObject({ _id: 'authors:a2', _resource: 'authors', _record: authors[1] })
  })

  it('names a record in the language, by the label of the field or by its first field', () => {
    expect(sourceItems(field, 'zhCN').map(item => item._label)).toEqual(['Ann', 'Zoe', '夏娃 (chief)'])
    expect(sourceItems({ input: 'select', sources: ['editors'] }, 'zhCN')[0]._label).toBe('夏娃')
  })

  it('has no choice for a resource that is not loaded', () => {
    expect(sourceItems({ input: 'select', sources: ['nothing', 'authors'] }, 'enUS').map(item => item._label)).toEqual(['Ann', 'Zoe'])
  })
})

describe('refLabel', () => {
  const field = { input: 'select', sources: ['authors', { resource: 'editors', customLabel: '{{name}} ({{role}})' }] }

  it('names the record a reference points to, the way the field says', () => {
    expect(refLabel({ resource: 'authors', id: 'a1' }, field, 'enUS')).toBe('Zoe')
    expect(refLabel({ resource: 'editors', id: 'e1' }, field, 'zhCN')).toBe('夏娃 (chief)')
  })

  it('gives the id of a record that is not there', () => {
    expect(refLabel({ resource: 'authors', id: 'gone' }, field, 'enUS')).toBe('gone')
    expect(refLabel({ resource: 'nothing', id: 'x' }, field, 'enUS')).toBe('x')
  })
})
