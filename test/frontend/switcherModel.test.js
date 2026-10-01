import { describe, it, expect } from 'vitest'
import { buildEntries, searchEntries, moveHighlight } from '../../src/utils/switcherModel.js'

const resource = (title, extra = {}) => ({ title, displayname: title, schema: [{ field: 'headline' }], ...extra })
const groups = [
  { name: 'Text', list: [resource('articles'), resource('authors')] },
  { name: 'Plugins', list: [{ title: 'Syslog', displayname: 'Syslog', type: 'plugin' }] }
]
const entries = buildEntries(groups, (item) => item.displayname)

describe('buildEntries', () => {
  it('lists every resource and plugin of the menu, once, with its type', () => {
    expect(entries.map((e) => [e.displayname, e.type])).toEqual([['articles', 'resource'], ['authors', 'resource'], ['Syslog', 'plugin']])
    const shared = resource('shared')
    expect(buildEntries([{ list: [shared] }, { list: [shared] }], (i) => i.title)).toHaveLength(1)
  })

  it('does not change the resources it is given', () => {
    const r = resource('articles', { type: 'normal' })
    buildEntries([{ list: [r] }], (i) => i.title)
    expect(r.type).toBe('normal')
  })
})

describe('searchEntries', () => {
  it('finds a name from letters that are far apart (an abbreviation), not only from a part of it', () => {
    // fuzzysort 3 and later hide such weak matches unless the search says otherwise
    expect(searchEntries(entries, 'atcs').map((r) => r.displayname)).toContain('articles')
    expect(searchEntries(entries, 'ssl').map((r) => r.displayname)).toContain('Syslog')
    expect(searchEntries(entries, 'aths').map((r) => r.displayname)).toContain('authors')
  })

  it('finds resources and plugins by name', () => {
    expect(searchEntries(entries, 'artic').map((r) => r.displayname)).toEqual(['articles'])
    expect(searchEntries(entries, 'sysl').map((r) => r.type)).toEqual(['plugin'])
  })

  it('does not search field names', () => {
    expect(searchEntries(entries, 'headline')).toEqual([])
  })

  it('returns nothing for an empty query and highlights the match', () => {
    expect(searchEntries(entries, '')).toEqual([])
    expect(searchEntries(entries, '  ')).toEqual([])
    expect(searchEntries(entries, 'auth')[0].html).toContain('<b>')
  })

  it('ranks the page you are on first', () => {
    const both = buildEntries([{ list: [resource('note'), resource('notes')] }], (i) => i.title)
    expect(searchEntries(both, 'note', 'notes')[0].displayname).toBe('notes')
  })
})

describe('moveHighlight', () => {
  it('moves with the arrows and stops at both ends', () => {
    expect(moveHighlight(0, 'ArrowDown', 3)).toBe(1)
    expect(moveHighlight(2, 'ArrowDown', 3)).toBe(2)
    expect(moveHighlight(1, 'ArrowUp', 3)).toBe(0)
    expect(moveHighlight(0, 'ArrowUp', 3)).toBe(0)
    expect(moveHighlight(1, 'End', 5)).toBe(4)
    expect(moveHighlight(3, 'Home', 5)).toBe(0)
  })

  it('copes with no results and other keys', () => {
    expect(moveHighlight(0, 'ArrowDown', 0)).toBe(0)
    expect(moveHighlight(2, 'a', 5)).toBe(2)
  })
})
