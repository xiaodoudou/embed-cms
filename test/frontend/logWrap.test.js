import { describe, it, expect } from 'vitest'
import { columnsFor, rowsFor, withRowHeights, ROW_HEIGHT } from '../../src/utils/logWrap.js'

describe('logWrap', () => {
  it('counts the columns that fit, never fewer than the minimum', () => {
    expect(columnsFor(800, 8)).toBe(100)
    expect(columnsFor(30, 8)).toBe(10)
    expect(columnsFor(0, 8)).toBe(10)
    expect(columnsFor(800, 0)).toBe(10)
  })

  it('counts the rows of a line', () => {
    expect(rowsFor('', 80)).toBe(1)
    expect(rowsFor('a'.repeat(80), 80)).toBe(1)
    expect(rowsFor('a'.repeat(81), 80)).toBe(2)
    expect(rowsFor('a'.repeat(250), 80)).toBe(4)
    expect(rowsFor(undefined, 80)).toBe(1)
  })

  it('gives every line its height without changing the originals', () => {
    const lines = [{ id: 1, line: 'short' }, { id: 2, line: 'x'.repeat(200) }]
    const sized = withRowHeights(lines, 100)
    expect(sized.map((l) => l.rowHeight)).toEqual([ROW_HEIGHT, ROW_HEIGHT * 2])
    expect(lines[0]).not.toHaveProperty('rowHeight')
  })
})
