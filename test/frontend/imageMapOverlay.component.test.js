import { describe, it, expect, afterEach } from 'vitest'
import ImageMapOverlay from '@c/attachments/ImageMapOverlay.vue'
import { mountComponent } from './helpers/mountField.js'

// The areas of a map over the picture in the field: a view only, drawn in a box of the shape of the picture.

const AREAS = [
  { id: 'r', shape: 'rect', coords: [0.1, 0.2, 0.5, 0.6] },
  { id: 'c', shape: 'circle', coords: [0.7, 0.5, 0.1] },
  { id: 'p', shape: 'poly', coords: [0.1, 0.1, 0.9, 0.1, 0.5, 0.9] }
]

let wrapper
const overlay = (props = {}) => {
  wrapper = mountComponent(ImageMapOverlay, { props: { areas: AREAS, aspect: 2, ...props } })
  return wrapper
}

afterEach(() => wrapper?.unmount())

describe('ImageMapOverlay', () => {
  it('draws each area as its shape, in units of the picture', () => {
    overlay()
    // a picture twice as wide as high: 1000 x 500 units
    expect(wrapper.get('svg').attributes('viewBox')).toBe('0 0 1000 500')
    expect(wrapper.get('rect').attributes()).toMatchObject({ x: '100', y: '100', width: '400', height: '200' })
    // the radius is a fraction of the width, so the circle stays round on a wide picture
    expect(wrapper.get('circle').attributes()).toMatchObject({ cx: '700', cy: '250', r: '100' })
    expect(wrapper.get('polygon').attributes('points')).toBe('100,50 900,50 500,450')
  })

  it('takes the shape of the picture it is over', () => {
    overlay({ aspect: 0.5 })
    expect(wrapper.get('svg').attributes('viewBox')).toBe('0 0 1000 2000')
    expect(wrapper.get('rect').attributes()).toMatchObject({ y: '400', height: '800' })
  })

  it('has a shape of its own when it is not told one, or told nonsense', () => {
    overlay({ aspect: 0 })
    expect(wrapper.get('svg').attributes('viewBox')).toBe('0 0 1000 625')
    wrapper.unmount()
    overlay({ aspect: -3 })
    expect(wrapper.get('svg').attributes('viewBox')).toBe('0 0 1000 625')
  })

  it('draws nothing for no area', () => {
    overlay({ areas: [] })
    expect(wrapper.findAll('rect, circle, polygon')).toHaveLength(0)
  })

  it('is a picture only: hidden from a screen reader, out of the tab order', () => {
    overlay()
    expect(wrapper.get('svg').attributes()).toMatchObject({ 'aria-hidden': 'true', focusable: 'false' })
    expect(wrapper.get('svg').classes()).toContain('map-overlay-view')
  })
})
