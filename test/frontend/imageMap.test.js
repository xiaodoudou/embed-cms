import { describe, it, expect } from 'vitest'
import {
  clamp01, newId, rectFromPoints, circleFromPoints, boundsOf, moveArea, handlesOf, dragHandle, contains, areaAt, removePoint, isBigEnough,
  svgPoints, isSafeHref, linkKinds, kindOf, readAreas, buildMap, countAreas, referencesOf, recordLabel, linkText, MIN_SIZE
} from '@u/imageMap'

// The geometry of the map tool: what a drag makes, how an area moves and is reshaped, what a click hits. A wide picture (2:1) shows that a
// circle stays round: its radius is a fraction of the width.

const WIDE = { width: 2000, height: 1000 }
const rect = (coords = [0.2, 0.2, 0.6, 0.6]) => ({ id: 'r', shape: 'rect', coords })
const circle = (coords = [0.5, 0.5, 0.1]) => ({ id: 'c', shape: 'circle', coords })
const poly = (coords = [0.1, 0.1, 0.9, 0.1, 0.5, 0.9]) => ({ id: 'p', shape: 'poly', coords })

describe('drawing', () => {
  it('keeps a number between 0 and 1', () => {
    expect([-1, 0, 0.4, 1, 3].map(clamp01)).toEqual([0, 0, 0.4, 1, 1])
  })

  it('makes a rectangle from two corners, in whichever direction it is dragged', () => {
    expect(rectFromPoints({ x: 0.6, y: 0.7 }, { x: 0.2, y: 0.1 })).toEqual([0.2, 0.1, 0.6, 0.7])
    expect(rectFromPoints({ x: -1, y: 0.5 }, { x: 2, y: 3 })).toEqual([0, 0.5, 1, 1])
  })

  it('makes a circle from a centre and a point on it, round whatever the shape of the picture', () => {
    // 0.1 of the width is 200 px: a point 200 px to the right, or 200 px below (that is 0.2 of the height), is on the circle
    expect(circleFromPoints({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, WIDE)).toEqual([0.5, 0.5, 0.1])
    expect(circleFromPoints({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.7 }, WIDE)).toEqual([0.5, 0.5, 0.1])
  })

  it('has a minimum size, which a click does not reach', () => {
    expect(isBigEnough(rect([0.2, 0.2, 0.2, 0.2]), WIDE)).toBe(false)
    expect(isBigEnough(rect([0.2, 0.2, 0.2 + MIN_SIZE, 0.5]), WIDE)).toBe(true)
    expect(isBigEnough(circle([0.5, 0.5, 0.001]), WIDE)).toBe(false)
    expect(isBigEnough(circle([0.5, 0.5, MIN_SIZE]), WIDE)).toBe(true)
    expect(isBigEnough(poly([0.1, 0.1, 0.5, 0.5]), WIDE)).toBe(false)
    expect(isBigEnough(poly(), WIDE)).toBe(true)
  })

  it('names an id nobody has', () => {
    expect(newId([])).toBe('area-1')
    expect(newId([{ id: 'area-1' }, { id: 'x' }])).toBe('area-3')
    expect(newId([{ id: 'area-3' }, { id: 'area-2' }])).toBe('area-4')
  })
})

describe('boundsOf', () => {
  it('is the box around a rectangle, a circle and a polygon', () => {
    expect(boundsOf(rect(), WIDE)).toEqual({ left: 0.2, top: 0.2, right: 0.6, bottom: 0.6 })
    // a radius of 0.1 of the width is 0.2 of the height on a picture twice as wide as high
    const box = boundsOf(circle(), WIDE)
    expect(box.left).toBeCloseTo(0.4)
    expect(box.right).toBeCloseTo(0.6)
    expect(box.top).toBeCloseTo(0.3)
    expect(box.bottom).toBeCloseTo(0.7)
    expect(boundsOf(poly(), WIDE)).toEqual({ left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 })
  })
})

describe('moveArea', () => {
  it('moves each shape', () => {
    expect(moveArea(rect(), 0.1, 0.05, WIDE).coords).toEqual([0.3, 0.25, 0.7, 0.65])
    expect(moveArea(circle(), 0.1, 0.1, WIDE).coords).toEqual([0.6, 0.6, 0.1])
    expect(moveArea(poly([0.2, 0.2, 0.4, 0.2, 0.3, 0.4]), 0.1, 0.1, WIDE).coords).toEqual([0.3, 0.3, 0.5, 0.3, 0.4, 0.5])
  })

  it('stops at the edge of the picture, and keeps its size', () => {
    expect(moveArea(rect(), 5, 5, WIDE).coords).toEqual([0.6, 0.6, 1, 1])
    expect(moveArea(rect(), -5, -5, WIDE).coords).toEqual([0, 0, 0.4, 0.4])
    expect(moveArea(circle(), -5, 0, WIDE).coords).toEqual([0.1, 0.5, 0.1])
    // a circle's top and bottom come first on a wide picture: it is 0.2 of the height from the middle
    expect(moveArea(circle(), 0, -5, WIDE).coords[1]).toBeCloseTo(0.2)
  })

  it('does not change the area it is given', () => {
    const area = rect()
    moveArea(area, 0.1, 0.1, WIDE)
    expect(area.coords).toEqual([0.2, 0.2, 0.6, 0.6])
  })
})

describe('the handles', () => {
  it('are the corners of a rectangle, the radius of a circle and the points of a polygon', () => {
    expect(handlesOf(rect()).map(handle => [handle.key, handle.x, handle.y])).toEqual([['nw', 0.2, 0.2], ['ne', 0.6, 0.2], ['se', 0.6, 0.6], ['sw', 0.2, 0.6]])
    expect(handlesOf(circle())).toEqual([{ key: 'r', x: 0.6, y: 0.5 }])
    expect(handlesOf(poly()).map(handle => handle.key)).toEqual(['p0', 'p1', 'p2'])
  })

  it('moves a corner of a rectangle against the opposite one, which does not move', () => {
    expect(dragHandle(rect(), 'se', { x: 0.8, y: 0.9 }, WIDE).coords).toEqual([0.2, 0.2, 0.8, 0.9])
    expect(dragHandle(rect(), 'nw', { x: 0.1, y: 0.05 }, WIDE).coords).toEqual([0.1, 0.05, 0.6, 0.6])
    expect(dragHandle(rect(), 'ne', { x: 0.7, y: 0.1 }, WIDE).coords).toEqual([0.2, 0.1, 0.7, 0.6])
    expect(dragHandle(rect(), 'sw', { x: 0.1, y: 0.8 }, WIDE).coords).toEqual([0.1, 0.2, 0.6, 0.8])
  })

  it('turns a rectangle over when a corner is dragged past the opposite one', () => {
    expect(dragHandle(rect(), 'se', { x: 0.1, y: 0.1 }, WIDE).coords).toEqual([0.1, 0.1, 0.2, 0.2])
  })

  it('keeps a corner inside the picture', () => {
    expect(dragHandle(rect(), 'se', { x: 4, y: -4 }, WIDE).coords).toEqual([0.2, 0, 1, 0.2])
  })

  it('changes the radius of a circle, its centre staying', () => {
    expect(dragHandle(circle(), 'r', { x: 0.8, y: 0.5 }, WIDE).coords).toEqual([0.5, 0.5, 0.3])
  })

  it('moves one point of a polygon, the others staying', () => {
    expect(dragHandle(poly(), 'p1', { x: 0.7, y: 0.3 }, WIDE).coords).toEqual([0.1, 0.1, 0.7, 0.3, 0.5, 0.9])
  })

  it('does not change the area it starts from', () => {
    const start = rect()
    dragHandle(start, 'se', { x: 0.9, y: 0.9 }, WIDE)
    expect(start.coords).toEqual([0.2, 0.2, 0.6, 0.6])
  })
})

describe('what a point is in', () => {
  it('is in a rectangle, edges included', () => {
    expect(contains(rect(), { x: 0.4, y: 0.4 }, WIDE)).toBe(true)
    expect(contains(rect(), { x: 0.2, y: 0.6 }, WIDE)).toBe(true)
    expect(contains(rect(), { x: 0.7, y: 0.4 }, WIDE)).toBe(false)
  })

  it('is in a circle by pixels, so a wide picture does not stretch it', () => {
    // 200 px of radius: 0.1 across, 0.2 down
    expect(contains(circle(), { x: 0.59, y: 0.5 }, WIDE)).toBe(true)
    expect(contains(circle(), { x: 0.5, y: 0.69 }, WIDE)).toBe(true)
    expect(contains(circle(), { x: 0.5, y: 0.71 }, WIDE)).toBe(false)
    expect(contains(circle(), { x: 0.61, y: 0.5 }, WIDE)).toBe(false)
  })

  it('is in a polygon, a concave one too', () => {
    expect(contains(poly(), { x: 0.5, y: 0.3 }, WIDE)).toBe(true)
    expect(contains(poly(), { x: 0.1, y: 0.9 }, WIDE)).toBe(false)
    // an L: the corner that is cut out is outside
    const ell = poly([0.1, 0.1, 0.4, 0.1, 0.4, 0.6, 0.9, 0.6, 0.9, 0.9, 0.1, 0.9])
    expect(contains(ell, { x: 0.2, y: 0.3 }, WIDE)).toBe(true)
    expect(contains(ell, { x: 0.7, y: 0.8 }, WIDE)).toBe(true)
    expect(contains(ell, { x: 0.7, y: 0.3 }, WIDE)).toBe(false)
  })

  it('is on the first area when several overlap, as in an HTML image map', () => {
    const areas = [poly(), circle([0.5, 0.5, 0.1]), rect([0, 0, 1, 1])]
    expect(areaAt(areas, { x: 0.5, y: 0.5 }, WIDE)).toBe(0)
    expect(areaAt(areas, { x: 0.95, y: 0.95 }, WIDE)).toBe(2)
    expect(areaAt([circle()], { x: 0.05, y: 0.05 }, WIDE)).toBe(-1)
    expect(areaAt([], { x: 0.5, y: 0.5 }, WIDE)).toBe(-1)
  })
})

describe('a polygon', () => {
  it('loses a point, and is no area when it has fewer than three', () => {
    expect(removePoint(poly([0.1, 0.1, 0.9, 0.1, 0.5, 0.9, 0.2, 0.5]), 3).coords).toEqual([0.1, 0.1, 0.9, 0.1, 0.5, 0.9])
    expect(removePoint(poly(), 0)).toBe(null)
  })

  it('gives its points as an svg attribute in pixels', () => {
    expect(svgPoints(poly([0.1, 0.2, 0.5, 0.5, 0.9, 1]), 1000, 500)).toBe('100,100 500,250 900,500')
  })
})

describe('isSafeHref', () => {
  it('takes what the server takes, and nothing that runs a script', () => {
    for (const href of ['', '  ', 'https://example.com', 'HTTP://x.y', 'mailto:a@b.c', 'tel:+441', '/pricing', '#top', '?page=2']) {
      expect(isSafeHref(href), href).toBe(true)
    }
    for (const href of ['javascript:alert(1)', ' JavaScript:1', 'data:text/html,x', '//evil.example', 'example.com', 'ftp://x', 'java\nscript:1', '/a\tb', '/' + 'x'.repeat(2048)]) {
      expect(isSafeHref(href), JSON.stringify(href)).toBe(false)
    }
  })
})

describe('the kinds of link', () => {
  const refs = { references: ['pages'] }

  it('are an address, and a record when the field has resources, by default', () => {
    expect(linkKinds({})).toEqual(['url'])
    expect(linkKinds(refs)).toEqual(['url', 'record'])
    expect(linkKinds({ options: refs })).toEqual(['url', 'record'])
  })

  it('are the ones the field lists, in the usual order whatever the order it lists them in', () => {
    expect(linkKinds({ ...refs, links: 'record' })).toEqual(['record'])
    expect(linkKinds({ links: 'value' })).toEqual(['value'])
    expect(linkKinds({ ...refs, links: ['value', 'record', 'url'] })).toEqual(['url', 'record', 'value'])
    expect(linkKinds({ ...refs, links: ['record', 'value'] })).toEqual(['record', 'value'])
    expect(linkKinds({ options: { ...refs, links: ['url', 'value'] } })).toEqual(['url', 'value'])
  })

  it('offer no record without a resource to take it from, and never none at all', () => {
    expect(linkKinds({ links: 'record' })).toEqual(['url'])
    expect(linkKinds({ links: ['record', 'value'] })).toEqual(['value'])
    expect(linkKinds({ ...refs, links: [] })).toEqual(['url'])
    expect(linkKinds({ ...refs, links: ['nothing'] })).toEqual(['url'])
    expect(linkKinds({ ...refs, links: 5 })).toEqual(['url', 'record'])
  })

  it('are told of an area by what it has, and an area with no link takes the first the field allows', () => {
    const kinds = ['record', 'value']
    expect(kindOf({ ref: { resource: 'pages', id: '' } }, kinds)).toBe('record')
    expect(kindOf({ value: ' room 4 ' }, kinds)).toBe('value')
    expect(kindOf({ href: '/a' }, kinds)).toBe('url')
    expect(kindOf({}, kinds)).toBe('record')
    expect(kindOf({ value: '  ', href: '' }, ['url'])).toBe('url')
    expect(kindOf({}, [])).toBe('url')
  })
})

describe('keeping the map', () => {
  it('reads the areas of what an attachment keeps, as copies with an id', () => {
    const kept = { areas: [{ shape: 'rect', coords: [0, 0, 1, 1] }, { id: 'x', shape: 'circle', coords: [0.5, 0.5, 0.1] }] }
    const areas = readAreas(kept)
    expect(areas.map(area => area.id)).toEqual(['area-1', 'x'])
    areas[0].coords[0] = 0.5
    expect(kept.areas[0].coords[0]).toBe(0)
    expect(readAreas(undefined)).toEqual([])
  })

  it('builds what to keep: the areas as they are, trimmed, nothing empty, a flag for the editor', () => {
    const map = buildMap([
      { id: 'a', shape: 'rect', coords: [0.123456789, 0, 1, 1], title: '  Kitchen ', href: ' /kitchen ', ref: null, target: '_top' },
      { id: 'b', shape: 'circle', coords: [0.5, 0.5, 0.1], title: '', href: '', ref: { resource: 'articles', id: 'x' }, target: '_blank' },
      { id: 'c', shape: 'poly', coords: [0, 0, 1, 0, 1, 1], ref: { resource: 'articles', id: '' } }
    ])
    expect(map.updated).toBe(true)
    expect(map.areas[0]).toEqual({ id: 'a', shape: 'rect', coords: [0.12346, 0, 1, 1], title: 'Kitchen', href: '/kitchen', target: '_self' })
    expect(map.areas[1]).toEqual({ id: 'b', shape: 'circle', coords: [0.5, 0.5, 0.1], ref: { resource: 'articles', id: 'x' }, target: '_blank' })
    expect(map.areas[2]).toEqual({ id: 'c', shape: 'poly', coords: [0, 0, 1, 0, 1, 1], target: '_self' })
  })

  it('keeps a value, trimmed, and nothing for an empty one', () => {
    const map = buildMap([{ id: 'a', shape: 'rect', coords: [0, 0, 1, 1], value: '  room-4  ' }, { id: 'b', shape: 'rect', coords: [0, 0, 1, 1], value: '   ' }])
    expect(map.areas[0].value).toBe('room-4')
    expect(map.areas[1]).not.toHaveProperty('value')
  })

  it('counts the areas', () => {
    expect(countAreas({ areas: [{}, {}] })).toBe(2)
    expect(countAreas({ areas: [] })).toBe(0)
    expect(countAreas(undefined)).toBe(0)
  })

  it('says where an area links', () => {
    expect(linkText({ href: '/kitchen' })).toBe('/kitchen')
    expect(linkText({ href: '/x', ref: { resource: 'articles', id: 'abc' } })).toBe('articles: abc')
    expect(linkText({ value: 'room-4' })).toBe('room-4')
    expect(linkText({ ref: { resource: 'articles', id: '' }, href: '/x' })).toBe('')
    expect(linkText({})).toBe('')
  })
})

describe('the records a link can point to', () => {
  it('are listed by the field as names or as { resource, label, title }', () => {
    expect(referencesOf({ references: ['articles', { resource: 'pages', label: '{{title}}', title: 'Page' }, { label: 'no resource' }, 5] })).toEqual([
      { resource: 'articles', label: '', title: '' }, { resource: 'pages', label: '{{title}}', title: 'Page' }
    ])
    expect(referencesOf({ options: { references: ['articles'] } })).toEqual([{ resource: 'articles', label: '', title: '' }])
    // a title can be one text per language
    expect(referencesOf({ references: [{ resource: 'pages', title: { enUS: 'Page', zhCN: '页面' } }] })[0].title).toEqual({ enUS: 'Page', zhCN: '页面' })
    expect(referencesOf({})).toEqual([])
    expect(referencesOf({ references: 'articles' })).toEqual([])
  })

  describe('recordLabel', () => {
    const resource = { locales: ['enUS', 'zhCN'], schema: [{ field: 'title', input: 'string' }, { field: 'slug', input: 'string', localised: false }] }

    it('renders the template, with the fields of the language of the person', () => {
      expect(recordLabel({ _id: '1', title: { enUS: 'Hello', zhCN: '你好' }, slug: 'hi' }, resource, '{{title}} ({{slug}})', 'zhCN')).toBe('你好 (hi)')
    })

    it('is the first field of the resource when there is no template, in the language of the person', () => {
      expect(recordLabel({ _id: '1', title: { enUS: 'Hello', zhCN: '你好' } }, resource, '', 'enUS')).toBe('Hello')
      expect(recordLabel({ _id: '1', name: 'Plain' }, { schema: [{ field: 'name', input: 'string' }] }, '', 'enUS')).toBe('Plain')
      expect(recordLabel({ _id: '1', slug: 'hi' }, { locales: ['enUS'], schema: [{ field: 'slug', input: 'string', localised: false }] }, '', 'enUS')).toBe('hi')
    })

    it('falls back on the template being empty, then on the id', () => {
      expect(recordLabel({ _id: '1', title: { enUS: 'Hello' } }, resource, '{{nothing}}', 'enUS')).toBe('Hello')
      expect(recordLabel({ _id: 'abc' }, resource, '', 'enUS')).toBe('abc')
      expect(recordLabel({ _id: 'abc' }, undefined, '', 'enUS')).toBe('abc')
    })

    it('does not show an object', () => {
      expect(recordLabel({ _id: 'abc', title: { enUS: 'T' } }, undefined, '{{title}}', 'zhCN')).toBe('abc')
    })
  })
})
