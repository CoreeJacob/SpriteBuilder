import { describe, expect, it } from 'vitest'
import { addLayer, deleteLayer, duplicateLayer, mergeDown, moveLayer, moveLayerTo, restoreSnapshot, sameSnapshot, snapshot, snapshotBytes } from './layers'
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

  it('restores a snapshot, sharing pixel buffers instead of copying them', () => {
    const doc = createDoc(1, 1)
    const base = doc.layers[0].id
    const saved = snapshot(doc)
    expect(saved.frames[0].cels[base]).toBe(doc.frames[0].cels[base]) // shared, not copied
    addLayer(doc, base)
    doc.layers[0].name = 'Renamed'
    restoreSnapshot(doc, saved)
    expect(doc.layers.map((l) => l.name)).toEqual(['Layer 1'])
    doc.layers[0].name = 'Changed after'
    expect(saved.layers[0].name).toBe('Layer 1') // the snapshot's own copy of the layer list
  })

  it('merging makes a new buffer, leaving the old one for undo', () => {
    const doc = createDoc(1, 1)
    const base = doc.layers[0].id
    const top = addLayer(doc, base)
    doc.frames[0].cels[top].set([0, 0, 255, 255])
    const before = snapshot(doc)
    mergeDown(doc, top)
    expect(Array.from(before.frames[0].cels[base])).toEqual([0, 0, 0, 0])
    expect(Array.from(doc.frames[0].cels[base])).toEqual([0, 0, 255, 255])
  })

  it('counts only the pixels a change replaced as the cost of undoing it', () => {
    const doc = createDoc(4, 4) // 64 bytes per layer
    const before = snapshot(doc)
    addLayer(doc, doc.layers[0].id)
    const after = snapshot(doc)
    expect(snapshotBytes(before, after)).toBe(64)
    expect(sameSnapshot(before, snapshot(doc))).toBe(false)
    expect(sameSnapshot(after, snapshot(doc))).toBe(true)
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
