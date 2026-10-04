import { describe, it, expect } from 'vitest'
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
})
