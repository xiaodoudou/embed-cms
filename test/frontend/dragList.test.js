import { describe, it, expect, afterEach } from 'vitest'
import DragList from '../../src/mixins/DragList.js'

describe('the options shared by the sortable lists (blocks, images, files)', () => {
  const options = DragList.data().dragOptions

  it('a mouse drags as soon as it moves from the handle, and only a finger waits (a quick drag started nothing with the delay on both)', () => {
    expect(options.delayOnTouchOnly).toBe(true)
    expect(options.delay).toBeGreaterThan(0)
  })

  it('names no group: every list names its own, and a shared one here let a block, an image or a file be dragged into another field', () => {
    expect(options).not.toHaveProperty('group')
    // the mixin gives each list instance its own key, which the lists put in their group name
    const first = DragList.data().key
    const second = DragList.data().key
    expect(first).not.toBe(second)
  })

  it('lists are disabled for nobody by default, and animate', () => {
    expect(options.disabled).toBe(false)
    expect(options.animation).toBeGreaterThan(0)
  })

  describe('what a drag does to the page', () => {
    const { methods } = DragList
    afterEach(() => {
      document.body.className = ''
      document.body.innerHTML = ''
    })

    it('stops the page from selecting text from the press on the handle until it is let go', () => {
      methods.onDragChoose()
      expect(document.body.classList.contains('cms-dragging')).toBe(true)
      methods.onDragUnchoose()
      expect(document.body.classList.contains('cms-dragging')).toBe(false)
    })

    it('lets a list that goes away in the middle of a drag give the page back', () => {
      methods.onDragChoose()
      DragList.beforeUnmount.call(methods)
      expect(document.body.classList.contains('cms-dragging')).toBe(false)
    })

    it('cuts the copy of a block that follows the pointer to its title bar: the forms are taken out of it, the library sized it as the whole block', () => {
      document.body.innerHTML = '<div class="sortable-fallback" style="height: 600px"><div class="paragraph-header"></div><div class="item-main-wrapper"></div></div><div class="sortable-fallback" style="height: 120px"><div class="preview"></div></div>'
      methods.onDragStart()
      const [block, thumbnail] = document.querySelectorAll('.sortable-fallback')
      expect(block.style.height).toBe('auto')
      expect(block.querySelector('.item-main-wrapper')).toBe(null)
      expect(block.querySelector('.paragraph-header')).not.toBe(null)
      // a copy that is not a block (an image, a file) keeps the size it has
      expect(thumbnail.style.height).toBe('120px')
    })

    it('takes the ids off the copy of a block that follows the pointer, so the page does not hold them twice, and leaves the real block alone', () => {
      document.body.innerHTML = '<div class="item"><input id="cms-field-1"></div><div class="sortable-fallback"><input id="cms-field-1"><label id="a"></label></div>'
      methods.onDragStart()
      expect(document.querySelectorAll('.sortable-fallback [id]')).toHaveLength(0)
      expect(document.querySelectorAll('[id="cms-field-1"]')).toHaveLength(1)
      expect(document.querySelector('.item input').id).toBe('cms-field-1')
    })
  })
})
