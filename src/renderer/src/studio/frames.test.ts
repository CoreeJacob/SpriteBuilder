import { describe, expect, it } from 'vitest'
import { addFrame, addTag, deleteFrame, deleteTag, duplicateFrame, moveFrame, setFps, sharedFps } from './frames'
import { createDoc } from './model'

describe('frames', () => {
  it('adds empty frames and duplicates existing ones', () => {
    const doc = createDoc(1, 1)
    const layer = doc.layers[0].id
    doc.frames[0].cels[layer].set([1, 2, 3, 255])
    expect(addFrame(doc, 0)).toBe(1)
    expect(Array.from(doc.frames[1].cels[layer])).toEqual([0, 0, 0, 0])
    expect(duplicateFrame(doc, 0)).toBe(1)
    expect(Array.from(doc.frames[1].cels[layer])).toEqual([1, 2, 3, 255])
    doc.frames[1].cels[layer][0] = 9
    expect(doc.frames[0].cels[layer][0]).toBe(1) // the copy doesn't share pixels
    expect(doc.frames).toHaveLength(3)
  })

  it('reorders and deletes frames, keeping at least one', () => {
    const doc = createDoc(1, 1)
    addFrame(doc, 0)
    addFrame(doc, 1)
    const ids = doc.frames.map((f) => f.id)
    expect(moveFrame(doc, 0, 2)).toBe(2)
    expect(doc.frames.map((f) => f.id)).toEqual([ids[1], ids[2], ids[0]])
    expect(deleteFrame(doc, 2)).toBe(1)
    deleteFrame(doc, 0)
    deleteFrame(doc, 0)
    expect(doc.frames).toHaveLength(1)
  })

  it('sets the speed for every frame', () => {
    const doc = createDoc(1, 1)
    addFrame(doc, 0)
    setFps(doc, 12)
    expect(doc.frames.map((f) => f.duration)).toEqual([83, 83])
    expect(sharedFps(doc)).toBe(12)
    doc.frames[1].duration = 200
    expect(sharedFps(doc)).toBeNull()
  })
})

describe('tags follow frame edits', () => {
  const setup = () => {
    const doc = createDoc(1, 1)
    for (let i = 0; i < 5; i++) addFrame(doc, i) // 6 frames: 0–5
    const idle = addTag(doc, 0, 1, 'idle')
    const walk = addTag(doc, 2, 4, 'walk')
    return { doc, idle, walk }
  }

  it('grows a tag when a frame is added inside or at its end, and shifts later tags', () => {
    const { doc, idle, walk } = setup()
    addFrame(doc, 1) // after idle's last frame → joins idle
    expect([idle.from, idle.to, walk.from, walk.to]).toEqual([0, 2, 3, 5])
    duplicateFrame(doc, 3) // inside walk
    expect([walk.from, walk.to]).toEqual([3, 6])
  })

  it('shrinks tags when frames are deleted and drops a tag with no frames left', () => {
    const { doc, idle, walk } = setup()
    deleteFrame(doc, 0)
    expect([idle.from, idle.to, walk.from, walk.to]).toEqual([0, 0, 1, 3])
    deleteFrame(doc, 0)
    expect(doc.tags.map((t) => t.name)).toEqual(['walk'])
    expect([walk.from, walk.to]).toEqual([0, 2])
  })

  it('keeps tags in order and inside the frames', () => {
    const doc = createDoc(1, 1)
    addFrame(doc, 0)
    const t = addTag(doc, 5, -2, ' jump ')
    expect([t.from, t.to, t.name]).toEqual([0, 1, 'jump'])
    deleteTag(doc, t.id)
    expect(doc.tags).toEqual([])
  })
})
