const { expect } = require('chai')
const { normalizeImageMap } = require('../../lib/util/imageMap')

// The image map of a picture is data from a client that whoever reads the record turns into links: it is checked on the way in.

const rect = { shape: 'rect', coords: [0.1, 0.2, 0.5, 0.6] }
const circle = { shape: 'circle', coords: [0.5, 0.5, 0.1] }
const poly = { shape: 'poly', coords: [0.1, 0.1, 0.9, 0.1, 0.5, 0.9] }
const map = (...areas) => ({ areas })
const refused = (value, pattern) => {
  let error
  try {
    normalizeImageMap(value)
  } catch (thrown) {
    error = thrown
  }
  expect(error, JSON.stringify(value)).to.be.an('object')
  expect(error.code).to.equal(400)
  expect(error.message).to.match(pattern)
}

describe('image map (unit)', () => {
  describe('what is no map', () => {
    it('is null for nothing, and for what the admin sends for no map', () => {
      expect(normalizeImageMap(null)).to.equal(null)
      expect(normalizeImageMap(undefined)).to.equal(null)
      expect(normalizeImageMap({})).to.equal(null)
      expect(normalizeImageMap({ updated: true })).to.equal(null)
    })

    it('is a map with no area when the areas are empty', () => {
      expect(normalizeImageMap({ areas: [], updated: true })).to.deep.equal({ areas: [] })
    })

    it('refuses what is not a map', () => {
      for (const value of ['map', 5, [], { areas: 'x' }, { areas: {} }, { other: 1 }]) {
        refused(value, /is \{ areas/)
      }
    })
  })

  describe('an area', () => {
    it('keeps the shape, the coordinates, the title, the link and the target, and gives an id', () => {
      const result = normalizeImageMap(map({ ...rect, title: '  Kitchen ', href: 'https://example.com/kitchen', target: '_blank', extra: 'dropped' }))
      expect(result.areas).to.have.length(1)
      const [area] = result.areas
      expect(area).to.have.keys('id', 'shape', 'coords', 'title', 'href', 'target')
      expect(area).to.include({ shape: 'rect', title: 'Kitchen', href: 'https://example.com/kitchen', target: '_blank' })
      expect(area.id).to.match(/^[0-9a-f]{8}$/)
    })

    it('opens in the same tab unless it says otherwise, and leaves out what is empty', () => {
      const [area] = normalizeImageMap(map({ ...circle, title: '', href: '', id: 'a1' })).areas
      expect(area).to.deep.equal({ id: 'a1', shape: 'circle', coords: [0.5, 0.5, 0.1], target: '_self' })
    })

    it('keeps the id it is given, and refuses two areas with the same one', () => {
      expect(normalizeImageMap(map({ ...rect, id: 'kitchen' })).areas[0].id).to.equal('kitchen')
      refused(map({ ...rect, id: 'x' }, { ...circle, id: 'x' }), /ids/)
    })

    it('refuses what is not an area, and a shape it does not know', () => {
      refused(map('area'), /area 1 is an object/)
      refused(map(rect, { shape: 'star', coords: [0, 0, 1, 1] }), /area 2: shape is rect, circle, poly/)
      refused(map({ coords: [0, 0, 1, 1] }), /shape/)
    })

    it('keeps the coordinates to five decimals and inside the picture', () => {
      const [area] = normalizeImageMap(map({ shape: 'rect', coords: [-0.5, 0.123456789, 2, 0.9] })).areas
      expect(area.coords).to.deep.equal([0, 0.12346, 1, 0.9])
    })

    it('refuses coordinates that are not numbers', () => {
      for (const coords of [['0', 0, 1, 1], [null, 0, 1, 1], [NaN, 0, 1, 1], [Infinity, 0, 1, 1], 'x', {}]) {
        refused(map({ shape: 'rect', coords }), /coord/)
      }
    })

    it('refuses a text that is too long, or that is not a text', () => {
      refused(map({ ...rect, title: 'x'.repeat(201) }), /title is at most 200/)
      refused(map({ ...rect, title: 5 }), /title is a text/)
      refused(map({ ...rect, href: '/' + 'x'.repeat(2048) }), /href is at most 2048/)
    })

    it('refuses a target that is not one', () => {
      refused(map({ ...rect, target: '_top' }), /target is _self or _blank/)
    })
  })

  describe('the shapes', () => {
    it('puts the corners of a rectangle in order, whichever way it was drawn', () => {
      expect(normalizeImageMap(map({ shape: 'rect', coords: [0.6, 0.9, 0.2, 0.3] })).areas[0].coords).to.deep.equal([0.2, 0.3, 0.6, 0.9])
    })

    it('refuses a rectangle with no width or no height, or without four coordinates', () => {
      refused(map({ shape: 'rect', coords: [0.2, 0.2, 0.2, 0.8] }), /width and a height/)
      refused(map({ shape: 'rect', coords: [0.2, 0.2, 0.8, 0.2] }), /width and a height/)
      refused(map({ shape: 'rect', coords: [0.2, 0.2, 0.8] }), /four coordinates/)
    })

    it('takes a circle as a centre and a radius above 0', () => {
      expect(normalizeImageMap(map(circle)).areas[0].coords).to.deep.equal([0.5, 0.5, 0.1])
      refused(map({ shape: 'circle', coords: [0.5, 0.5, 0] }), /radius above 0/)
      refused(map({ shape: 'circle', coords: [0.5, 0.5] }), /three coordinates/)
    })

    it('takes a polygon of three points or more, and not more than a hundred', () => {
      expect(normalizeImageMap(map(poly)).areas[0].coords).to.have.length(6)
      refused(map({ shape: 'poly', coords: [0.1, 0.1, 0.9, 0.9] }), /three to 100 points/)
      refused(map({ shape: 'poly', coords: [0.1, 0.1, 0.9, 0.9, 0.5, 0.5, 0.3] }), /three to 100 points/)
      refused(map({ shape: 'poly', coords: new Array(202).fill(0.5) }), /three to 100 points/)
    })
  })

  describe('the link', () => {
    it('takes a web address, mail, a phone number and a path of the site', () => {
      for (const href of ['https://example.com/a?b=1#c', 'http://example.com', 'HTTPS://EXAMPLE.COM', 'mailto:hi@example.com', 'tel:+4412345', '/pricing', '/a/b?c=d', '#top', '?page=2']) {
        expect(normalizeImageMap(map({ ...rect, href })).areas[0].href, href).to.equal(href)
      }
    })

    it('refuses what could run a script or load something else when it is shown as a link', () => {
      for (const href of ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', '//evil.example.com', 'ftp://example.com', 'example.com', 'java\nscript:alert(1)', '/ok\u0000bad', '/ok\tbad']) {
        refused(map({ ...rect, href }), /link starts with/)
      }
    })

    it('points at a record with a resource and an id', () => {
      expect(normalizeImageMap(map({ ...rect, ref: { resource: 'articles', id: 'abc123', extra: 1 } })).areas[0].ref).to.deep.equal({ resource: 'articles', id: 'abc123' })
    })

    it('has no reference when it is empty, and refuses half of one', () => {
      expect(normalizeImageMap(map({ ...rect, ref: null })).areas[0]).to.not.have.property('ref')
      expect(normalizeImageMap(map({ ...rect, ref: { resource: '', id: '' } })).areas[0]).to.not.have.property('ref')
      refused(map({ ...rect, ref: { resource: 'articles' } }), /ref is \{ resource, id \}/)
      refused(map({ ...rect, ref: { id: 'x' } }), /ref is \{ resource, id \}/)
      refused(map({ ...rect, ref: 'articles/x' }), /ref is \{ resource, id \}/)
    })

    it('can have both a link and a reference', () => {
      const [area] = normalizeImageMap(map({ ...rect, href: '/fallback', ref: { resource: 'articles', id: 'x' } })).areas
      expect(area).to.include({ href: '/fallback' })
      expect(area.ref).to.deep.equal({ resource: 'articles', id: 'x' })
    })
  })

  describe('the value', () => {
    it('is a text the person typed, trimmed, and not checked as a link', () => {
      const [area] = normalizeImageMap(map({ ...rect, value: '  room-12/B  ' })).areas
      expect(area.value).to.equal('room-12/B')
      expect(normalizeImageMap(map({ ...rect, value: 'javascript:alert(1)' })).areas[0].value).to.equal('javascript:alert(1)')
    })

    it('is left out when it is empty, and refused when it is not a text or too long', () => {
      expect(normalizeImageMap(map({ ...rect, value: '   ' })).areas[0]).to.not.have.property('value')
      refused(map({ ...rect, value: 5 }), /value is a text/)
      refused(map({ ...rect, value: 'x'.repeat(501) }), /value is at most 500/)
    })
  })

  describe('limits', () => {
    it('takes 200 areas and refuses 201', () => {
      const many = (n) => map(...Array.from({ length: n }, (_, i) => ({ ...rect, id: `a${i}` })))
      expect(normalizeImageMap(many(200)).areas).to.have.length(200)
      refused(many(201), /at most 200 areas/)
    })
  })

  it('gives the same map when it is cleaned again', () => {
    const once = normalizeImageMap(map({ ...rect, title: 'A', href: '/a' }, circle, poly))
    expect(normalizeImageMap(once)).to.deep.equal(once)
  })
})
