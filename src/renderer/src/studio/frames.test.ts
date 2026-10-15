import { describe, expect, it } from 'vitest'
import { addFrame, deleteFrame, duplicateFrame, moveFrame, setFps, sharedFps } from './frames'
import { moveLayerTo, addLayer } from './layers'
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

describe('moveLayerTo', () => {
  it('drops a layer above or below another', () => {
    const doc = createDoc(1, 1)
    const a = doc.layers[0].id
    const b = addLayer(doc, a)
    const c = addLayer(doc, b)
    moveLayerTo(doc, c, a, 'below')
    expect(doc.layers.map((l) => l.id)).toEqual([c, a, b])
    moveLayerTo(doc, c, b, 'above')
    expect(doc.layers.map((l) => l.id)).toEqual([a, b, c])
    moveLayerTo(doc, a, a, 'above')
    expect(doc.layers.map((l) => l.id)).toEqual([a, b, c])
  })
})
