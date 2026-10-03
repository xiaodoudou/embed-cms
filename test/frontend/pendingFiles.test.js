import { describe, it, expect } from 'vitest'
import { queueFiles, takeFiles } from '@u/pendingFiles'

// the handoff of a dropped file from the paragraph field to the file field of its block
describe('pendingFiles', () => {
  const file = (name) => new File(['x'], name)

  it('gives the files queued under a key once, then nothing', () => {
    queueFiles('blocks[0].picture', [file('a.jpg')])
    queueFiles('blocks[0].picture', [file('b.jpg')])
    expect(takeFiles('blocks[0].picture').map(f => f.name)).toEqual(['a.jpg', 'b.jpg'])
    expect(takeFiles('blocks[0].picture')).toEqual([])
  })

  it('keeps the keys apart', () => {
    queueFiles('blocks[1].picture', [file('one.jpg')])
    expect(takeFiles('blocks[2].picture')).toEqual([])
    expect(takeFiles('blocks[1].picture').map(f => f.name)).toEqual(['one.jpg'])
  })
})
