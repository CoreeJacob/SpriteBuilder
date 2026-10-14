import { describe, expect, it } from 'vitest'
import { addLayer, cloneState, deleteLayer, duplicateLayer, mergeDown, moveLayer, restoreState } from './layers'
import { compositeFrame, createDoc } from './model'

describe('layers', () => {
  it('adds, duplicates, moves and deletes layers', () => {
    const doc = createDoc(2, 2)
    const base = doc.layers[0].id
    const added = addLayer(doc, base)
    expect(doc.layers.map((l) => l.id)).toEqual([base, added])
    const copy = duplicateLayer(doc, base)
    expect(doc.layers.map((l) => l.id)).toEqual([base, copy, added])
    moveLayer(doc, added, -1)
    expect(doc.layers.map((l) => l.id)).toEqual([base, added, copy])
    moveLayer(doc, base, -1) // already at the bottom: no change
    expect(doc.layers[0].id).toBe(base)
    expect(deleteLayer(doc, added)).toBe(base)
    expect(doc.frames[0].cels[added]).toBeUndefined()
  })

  it('never deletes the last layer', () => {
    const doc = createDoc(2, 2)
    deleteLayer(doc, doc.layers[0].id)
    expect(doc.layers).toHaveLength(1)
  })

  it('merges down without changing how the sprite looks', () => {
    const doc = createDoc(1, 1)
    const base = doc.layers[0].id
    doc.frames[0].cels[base].set([255, 0, 0, 255])
    const top = addLayer(doc, base)
    doc.frames[0].cels[top].set([0, 0, 255, 255])
    doc.layers[1].opacity = 0.5
    const before = Array.from(compositeFrame(doc))
    expect(mergeDown(doc, top)).toBe(base)
    expect(doc.layers).toHaveLength(1)
    expect(Array.from(compositeFrame(doc))).toEqual(before)
  })

  it('restores a saved state exactly, without sharing pixel buffers', () => {
    const doc = createDoc(1, 1)
    const saved = cloneState(doc)
    addLayer(doc, doc.layers[0].id)
    doc.frames[0].cels[doc.layers[0].id].set([1, 2, 3, 255])
    restoreState(doc, saved)
    expect(doc.layers).toHaveLength(1)
    expect(Array.from(doc.frames[0].cels[doc.layers[0].id])).toEqual([0, 0, 0, 0])
    doc.frames[0].cels[doc.layers[0].id][0] = 9
    expect(saved.frames[0].cels[doc.layers[0].id][0]).toBe(0)
  })
})
