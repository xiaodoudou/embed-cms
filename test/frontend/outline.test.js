import { describe, it, expect } from 'vitest'
import { blockLabel, outlineEntries } from '../../src/utils/outline.js'
import { createSnapshot } from '../../src/utils/dirtyTracker.js'

// the rows of the "Jump to" menu: the fields, and under a paragraph field one row for each block it holds

const TYPES = {
  tile_half: { displayname: { enUS: 'Half' }, schema: [{ field: 'title', input: 'string', label: 'Title' }, { field: 'text', input: 'text', label: 'Text' }] },
  picture: { displayname: 'Picture', schema: [{ field: 'image', input: 'image', label: 'Image' }, { field: 'caption', input: 'string', label: 'Caption' }] },
  bare: { schema: [{ field: 'file', input: 'file' }] }
}
const options = { paragraphSchema: (type) => TYPES[type] || false }

describe('Jump to: the label of a block', () => {
  it('is its type and the first text it holds', () => {
    expect(blockLabel({ _type: 'tile_half', title: 'News', text: 'Read on' }, 0, options)).toBe('Half · News')
    expect(blockLabel({ _type: 'tile_half', title: '', text: 'Only a text' }, 3, options)).toBe('Half · Only a text')
  })

  it('is its type and its place when it holds no text, so repeats can be told apart', () => {
    expect(blockLabel({ _type: 'tile_half' }, 0, options)).toBe('Half 1')
    expect(blockLabel({ _type: 'tile_half', title: '   ' }, 2, options)).toBe('Half 3')
    expect(blockLabel({ _type: 'bare' }, 1, options)).toBe('bare 2')
  })

  it('takes a text per language in the language being edited, else the first one there is', () => {
    expect(blockLabel({ _type: 'tile_half', title: { enUS: 'News', zhCN: '新闻' } }, 0, { ...options, locale: 'zhCN' })).toBe('Half · 新闻')
    expect(blockLabel({ _type: 'tile_half', title: { enUS: 'News' } }, 0, { ...options, locale: 'zhCN' })).toBe('Half · News')
  })

  it('does not take the text of a field that is not text, and cuts a long one', () => {
    expect(blockLabel({ _type: 'picture', image: 'photo.png', caption: 'Sunset' }, 0, options)).toBe('Picture · Sunset')
    const long = blockLabel({ _type: 'tile_half', title: 'x'.repeat(100) }, 0, options)
    expect(long).toBe(`Half · ${'x'.repeat(39)}…`)
  })

  it('names a block of a type that is not known by its type, or a generic name without one', () => {
    expect(blockLabel({ _type: 'gone' }, 0, options)).toBe('gone 1')
    expect(blockLabel({}, 4, options)).toBe('Block 5')
  })

  it('uses the translator it is given for the name of a type', () => {
    const translate = (value) => (value && value.enUS ? `T:${value.enUS}` : value)
    expect(blockLabel({ _type: 'tile_half' }, 0, { ...options, translate })).toBe('T:Half 1')
  })
})

describe('Jump to: the rows', () => {
  const fields = [
    { model: 'name', label: 'Name', input: 'string', originalModel: 'name' },
    { model: 'tiles', label: 'Tiles', input: 'paragraph', originalModel: 'tiles' },
    { model: 'notes.enUS', label: 'Notes', input: 'paragraph', originalModel: 'notes' },
    { model: 'email', label: 'Email', input: 'email', originalModel: 'email' }
  ]

  it('lists a field, then its blocks in the order of the record, for each paragraph field', () => {
    const record = { tiles: [{ _type: 'tile_half', title: 'News' }, { _type: 'tile_half', title: 'Events' }, { _type: 'picture', caption: 'Sunset' }], notes: { enUS: [{ _type: 'tile_half' }] } }
    const entries = outlineEntries(fields, record, options)
    const rows = entries.filter((entry) => !entry.blockField)
    expect(rows.map((entry) => entry.label)).toEqual(['Name', 'Tiles', 'Half · News', 'Half · Events', 'Picture · Sunset', 'Notes', 'Half 1', 'Email'])
    expect(rows.map((entry) => entry.block)).toEqual([undefined, undefined, 0, 1, 2, undefined, 0, undefined])
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length)
  })

  it('keeps the field of a block, so that the menu can find where it is', () => {
    const entries = outlineEntries(fields, { tiles: [{ _type: 'tile_half' }] }, options)
    expect(entries[2].field).toBe(fields[1])
  })

  it('lists the fields of each block under it, named by their labels, once for each block', () => {
    const record = { tiles: [{ _type: 'tile_half', title: 'News' }, { _type: 'picture' }] }
    const entries = outlineEntries(fields.slice(0, 2), record, options)
    expect(entries.map((entry) => entry.label)).toEqual(['Name', 'Tiles', 'Half · News', 'Title', 'Text', 'Picture 2', 'Image', 'Caption'])
    const inner = entries.filter((entry) => entry.blockField)
    expect(inner.map((entry) => [entry.block, entry.blockField])).toEqual([[0, 'title'], [0, 'text'], [1, 'image'], [1, 'caption']])
    expect(inner.every((entry) => entry.field === fields[1])).toBe(true)
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length)
  })

  it('takes the label of a field of a block through the translator, and its name when it has no label', () => {
    const types = { tile: { schema: [{ field: 'title', label: { enUS: 'Title', zhCN: '标题' } }, { field: 'plain' }] } }
    const translate = (value) => (value && value.enUS ? value.enUS : value)
    const entries = outlineEntries(fields.slice(1, 2), { tiles: [{ _type: 'tile' }] }, { paragraphSchema: (type) => types[type], translate })
    expect(entries.filter((entry) => entry.blockField).map((entry) => entry.label)).toEqual(['Title', 'plain'])
  })

  it('lists no fields for a block of a type that is not known', () => {
    expect(outlineEntries(fields.slice(1, 2), { tiles: [{ _type: 'gone' }] }, options).map((entry) => entry.label)).toEqual(['Tiles', 'gone 1'])
  })

  it('lists a paragraph field that has no blocks yet as one row', () => {
    expect(outlineEntries(fields, {}, options).map((entry) => entry.label)).toEqual(['Name', 'Tiles', 'Notes', 'Email'])
    expect(outlineEntries(fields, { tiles: null }, options)).toHaveLength(4)
  })

  it('lists the blocks as they are after they are moved or removed', () => {
    const record = { tiles: [{ _type: 'tile_half', title: 'B' }, { _type: 'tile_half', title: 'A' }] }
    const blocks = () => outlineEntries(fields, record, options).filter((entry) => entry.block !== undefined && !entry.blockField).map((entry) => entry.label)
    expect(blocks()).toEqual(['Half · B', 'Half · A'])
    record.tiles.reverse()
    expect(blocks()).toEqual(['Half · A', 'Half · B'])
  })

  describe('what changed', () => {
    const loaded = { name: 'Home', tiles: [{ _type: 'tile_half', title: 'News', text: 'Read' }, { _type: 'tile_half', title: 'Events' }] }
    const snapshot = createSnapshot(loaded)
    const dirtyRows = (record) => outlineEntries(fields.slice(0, 2), record, { ...options, snapshot }).filter((entry) => entry.dirty).map((entry) => entry.label)

    it('marks nothing when the record is as it was loaded', () => {
      expect(dirtyRows(JSON.parse(JSON.stringify(loaded)))).toEqual([])
    })

    it('marks nothing without a snapshot, whatever the record holds', () => {
      expect(outlineEntries(fields.slice(0, 2), loaded, options).some((entry) => entry.dirty)).toBe(false)
    })

    it('marks a field that changed', () => {
      expect(dirtyRows({ ...loaded, name: 'Home page' })).toEqual(['Name'])
    })

    it('marks the field of a block that changed, the block, and the paragraph field around them', () => {
      const record = JSON.parse(JSON.stringify(loaded))
      record.tiles[1].title = 'Shows'
      expect(dirtyRows(record)).toEqual(['Tiles', 'Half · Shows', 'Title'])
    })

    it('marks a block that was added, with all its fields, and not the blocks before it', () => {
      const record = JSON.parse(JSON.stringify(loaded))
      record.tiles.push({ _type: 'tile_half', title: 'Shop' })
      expect(dirtyRows(record)).toEqual(['Tiles', 'Half · Shop', 'Title'])
    })

    it('marks the blocks that moved to another place', () => {
      const record = JSON.parse(JSON.stringify(loaded))
      record.tiles.reverse()
      expect(dirtyRows(record)).toEqual(['Tiles', 'Half · Events', 'Title', 'Text', 'Half · News', 'Title', 'Text'])
    })

    it('does not count a value that is empty either way as a change', () => {
      const record = JSON.parse(JSON.stringify(loaded))
      record.tiles[1].text = ''
      record.tiles[0].title = 'News'
      expect(dirtyRows(record)).toEqual([])
    })

    it('marks a field that was emptied', () => {
      const record = JSON.parse(JSON.stringify(loaded))
      record.tiles[0].text = ''
      expect(dirtyRows(record)).toEqual(['Tiles', 'Half · News', 'Text'])
    })
  })

  it('has no rows for a form without fields', () => {
    expect(outlineEntries([], {})).toEqual([])
  })
})
