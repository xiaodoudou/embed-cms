import { describe, it, expect } from 'vitest'
import { between, crowded, dropIndex, MIN_GAP, place, renumber, STEP } from '../../docs/examples/taskboard/src/lib/position'
import { isEmpty, keeps, readFilters, SOON_DAYS, writeFilters } from '../../docs/examples/taskboard/src/lib/filters'

// The two small pieces of logic the board of docs/examples/taskboard rests on: where a card falls in a column, and what narrows the cards. Both are pure: no component, no network.

describe('taskboard: the order of the cards', () => {
  describe('between', () => {
    it('is the middle of the two neighbours', () => {
      expect(between(1000, 2000)).toBe(1500)
      expect(between(0, 1)).toBe(0.5)
      expect(between(-10, 10)).toBe(0)
    })

    it('is a step beyond the only neighbour, and a step when there is none', () => {
      expect(between(5000, undefined)).toBe(5000 + STEP)
      expect(between(undefined, 5000)).toBe(5000 - STEP)
      expect(between(undefined, undefined)).toBe(STEP)
      expect(between(null, null)).toBe(STEP)
    })

    it('does not take what is not a number for a neighbour', () => {
      expect(between('1000', 2000)).toBe(2000 - STEP)
      expect(between(NaN, NaN)).toBe(STEP)
    })
  })

  describe('crowded', () => {
    const column = [{ position: 1 }, { position: 1 + MIN_GAP / 2 }, { position: 3 }]

    it('is true between two cards that have no room for another number', () => {
      expect(crowded(column, 1)).toBe(true)
    })

    it('is false where there is room, and at the ends', () => {
      expect(crowded(column, 2)).toBe(false)
      expect(crowded(column, 0)).toBe(false)
      expect(crowded(column, 3)).toBe(false)
      expect(crowded([], 0)).toBe(false)
    })
  })

  describe('renumber', () => {
    it('numbers a column again, a step apart, from the first step', () => {
      expect(renumber([{ _id: 'a', position: 0.1 }, { _id: 'b', position: 0.1000001 }, { _id: 'c', position: 9 }])).toEqual([
        { _id: 'a', position: STEP },
        { _id: 'b', position: 2 * STEP },
        { _id: 'c', position: 3 * STEP }
      ])
      expect(renumber([])).toEqual([])
    })
  })

  describe('place', () => {
    const column = [{ _id: 'a', position: 1000 }, { _id: 'b', position: 2000 }, { _id: 'c', position: 3000 }]

    it('puts a card between the two it is dropped between, and writes nothing else', () => {
      expect(place(column, 'x', 1)).toEqual({ position: 1500, renumber: [] })
      expect(place(column, 'x', 2)).toEqual({ position: 2500, renumber: [] })
    })

    it('puts a card above the first, under the last, and in an empty column', () => {
      expect(place(column, 'x', 0)).toEqual({ position: 0, renumber: [] })
      expect(place(column, 'x', 3)).toEqual({ position: 4000, renumber: [] })
      expect(place([], 'x', 0)).toEqual({ position: STEP, renumber: [] })
    })

    it('counts the place without the card that moves, so that a card dropped where it is does not move', () => {
      // b is dropped at 1: the column without b is a, c: between them
      expect(place(column, 'b', 1)).toEqual({ position: 2000, renumber: [] })
      // a is dropped at 0: the column without a starts with b (2000), so it goes a step above it
      expect(place(column, 'a', 0).position).toBe(1000)
      expect(place(column, 'c', 3)).toEqual({ position: 3000, renumber: [] })
    })

    it('keeps the place inside the column, whatever index it is given', () => {
      expect(place(column, 'x', -5).position).toBe(0)
      expect(place(column, 'x', 99).position).toBe(4000)
    })

    it('numbers the column again when the numbers around the place are too close, and gives the card a place among the new numbers', () => {
      const tight = [{ _id: 'a', position: 1 }, { _id: 'b', position: 1 + MIN_GAP / 2 }, { _id: 'c', position: 5 }]
      const result = place(tight, 'x', 1)
      expect(result.renumber).toEqual([{ _id: 'a', position: 1000 }, { _id: 'b', position: 2000 }, { _id: 'c', position: 3000 }])
      expect(result.position).toBe(1500)
    })

    it('can be applied again and again at one place without ever running out of numbers', () => {
      let cards = [{ _id: 'a', position: 1000 }, { _id: 'b', position: 2000 }]
      for (let move = 0; move < 80; move++) {
        const { position, renumber: writes } = place(cards, `n${move}`, 1)
        const byId = new Map(writes.map((card) => [card._id, card.position]))
        cards = cards.map((card) => ({ ...card, position: byId.has(card._id) ? byId.get(card._id) : card.position }))
        cards.push({ _id: `n${move}`, position })
        cards.sort((a, b) => a.position - b.position)
      }
      const positions = cards.map((card) => card.position)
      expect(new Set(positions).size).toBe(positions.length)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
      // each new card was dropped at index 1: it is the second card of the column each time
      expect(cards[0]._id).toBe('a')
      expect(cards[1]._id).toBe('n79')
    })
  })

  describe('dropIndex', () => {
    const rects = [{ top: 0, height: 40 }, { top: 50, height: 40 }, { top: 100, height: 40 }]

    it('is the first card whose middle is under the pointer', () => {
      expect(dropIndex(rects, -10)).toBe(0)
      expect(dropIndex(rects, 19)).toBe(0)
      expect(dropIndex(rects, 21)).toBe(1)
      expect(dropIndex(rects, 75)).toBe(2)
    })

    it('is the number of cards when the pointer is under all of them, and 0 for an empty column', () => {
      expect(dropIndex(rects, 500)).toBe(3)
      expect(dropIndex([], 10)).toBe(0)
    })
  })
})

describe('taskboard: what narrows the cards', () => {
  const people = { p1: 'ada', p2: 'grace' }
  const usernameOf = (id) => people[id]
  const now = Date.UTC(2026, 9, 6, 12)
  const day = 86400000
  const task = (extra) => ({ ref: 'WEB-1', title: 'Build the pricing page', description: 'Prices in the sheet', status: 'todo', labels: ['content', 'design'], assignee: 'p1', ...extra })
  const kept = (filters, one = task()) => keeps(one, { text: '', who: [], label: [], due: '', ...filters }, { usernameOf, now })

  describe('readFilters and writeFilters', () => {
    it('read the filter from the query of the address, and write it back', () => {
      const query = { q: 'link', who: 'ada,grace', label: 'bug', due: 'soon' }
      const filters = readFilters(query)
      expect(filters).toEqual({ text: 'link', who: ['ada', 'grace'], label: ['bug'], due: 'soon' })
      expect(writeFilters(filters)).toEqual(query)
    })

    it('write only what is set: an empty filter is a clean address', () => {
      expect(writeFilters(readFilters({}))).toEqual({})
      expect(writeFilters({ text: '', who: [], label: [], due: '' })).toEqual({})
      expect(writeFilters({ text: 'a', who: [], label: [], due: '' })).toEqual({ q: 'a' })
    })

    it('read what the address could hold of nonsense: a list, an empty value, an unknown due, a long text', () => {
      expect(readFilters({ q: ['first', 'second'], who: ['ada'], due: ['overdue', 'none'] })).toEqual({ text: 'first', who: ['ada'], label: [], due: 'overdue' })
      expect(readFilters({ who: ', ,ada,,', label: ' ' })).toEqual({ text: '', who: ['ada'], label: [], due: '' })
      expect(readFilters({ due: 'tomorrow' }).due).toBe('')
      expect(readFilters({ who: 5, q: 7 })).toEqual({ text: '7', who: [], label: [], due: '' })
      expect(readFilters({ q: 'x'.repeat(500) }).text).toHaveLength(100)
      expect(readFilters(undefined)).toEqual({ text: '', who: [], label: [], due: '' })
    })

    it('isEmpty says whether nothing is filtered', () => {
      expect(isEmpty(readFilters({}))).toBe(true)
      for (const query of [{ q: 'a' }, { who: 'ada' }, { label: 'bug' }, { due: 'none' }]) {
        expect(isEmpty(readFilters(query))).toBe(false)
      }
    })
  })

  describe('keeps', () => {
    it('keeps every task when nothing is filtered', () => {
      expect(kept({})).toBe(true)
    })

    it('searches the number, the title and the description, whatever the case', () => {
      expect(kept({ text: 'PRICING' })).toBe(true)
      expect(kept({ text: 'web-1' })).toBe(true)
      expect(kept({ text: 'sheet' })).toBe(true)
      expect(kept({ text: 'nothing like it' })).toBe(false)
      expect(kept({ text: 'x' }, task({ description: undefined }))).toBe(false)
    })

    it('keeps the tasks of the people that are chosen, "nobody" for the ones that are given to no one', () => {
      expect(kept({ who: ['ada'] })).toBe(true)
      expect(kept({ who: ['grace'] })).toBe(false)
      expect(kept({ who: ['grace', 'ada'] })).toBe(true)
      expect(kept({ who: ['nobody'] }, task({ assignee: undefined }))).toBe(true)
      expect(kept({ who: ['ada'] }, task({ assignee: undefined }))).toBe(false)
      expect(kept({ who: ['nobody'] })).toBe(false)
    })

    it('keeps the tasks that have one of the labels that are chosen', () => {
      expect(kept({ label: ['design'] })).toBe(true)
      expect(kept({ label: ['bug', 'content'] })).toBe(true)
      expect(kept({ label: ['bug'] })).toBe(false)
      expect(kept({ label: ['bug'] }, task({ labels: undefined }))).toBe(false)
    })

    it('keeps the overdue, the soon due, and the ones with no date, and never the ones that are done', () => {
      expect(kept({ due: 'overdue' }, task({ due: now - day }))).toBe(true)
      expect(kept({ due: 'overdue' }, task({ due: now + day }))).toBe(false)
      expect(kept({ due: 'soon' }, task({ due: now + day }))).toBe(true)
      expect(kept({ due: 'soon' }, task({ due: now + (SOON_DAYS + 1) * day }))).toBe(false)
      expect(kept({ due: 'soon' }, task({ due: now - day }))).toBe(false)
      expect(kept({ due: 'none' }, task({}))).toBe(true)
      expect(kept({ due: 'none' }, task({ due: now }))).toBe(false)
      expect(kept({ due: 'overdue' }, task({ due: now - day, status: 'done' }))).toBe(false)
      expect(kept({ due: 'overdue' }, task({}))).toBe(false)
    })

    it('needs every part that is set to hold', () => {
      expect(kept({ text: 'pricing', who: ['ada'], label: ['design'] })).toBe(true)
      expect(kept({ text: 'pricing', who: ['grace'], label: ['design'] })).toBe(false)
      expect(kept({ text: 'pricing', who: ['ada'], label: ['bug'] })).toBe(false)
    })

    it('uses the time of now when it is not given one', () => {
      const result = keeps(task({ due: Date.now() - 1000 }), { text: '', who: [], label: [], due: 'overdue' }, { usernameOf })
      expect(result).toBe(true)
    })
  })
})
