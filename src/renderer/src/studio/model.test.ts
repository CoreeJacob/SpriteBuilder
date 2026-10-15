import { describe, expect, it } from 'vitest'
import { compositeFrame, createDoc, parseDoc, serializeDoc } from './model'
import { History } from './history'

describe('sprite file format', () => {
  it('round-trips a document', () => {
    const doc = createDoc(16, 8)
    const cel = doc.frames[0].cels[doc.layers[0].id]
    cel.set([10, 20, 30, 255], 4 * 5)
    const copy = parseDoc(serializeDoc(doc))
    expect(copy.width).toBe(16)
    expect(copy.height).toBe(8)
    expect(Array.from(copy.frames[0].cels[copy.layers[0].id].slice(20, 24))).toEqual([10, 20, 30, 255])
  })
  it('rejects other JSON', () => {
    expect(() => parseDoc('{"hello":1}')).toThrow()
  })
})

describe('compositeFrame', () => {
  it('stacks layers and skips hidden ones', () => {
    const doc = createDoc(1, 1)
    const top = { id: 'top', name: 'Top', visible: true, opacity: 1 }
    doc.layers.push(top)
    doc.frames[0].cels[doc.layers[0].id].set([255, 0, 0, 255])
    doc.frames[0].cels.top = new Uint8ClampedArray([0, 0, 255, 255])
    expect(Array.from(compositeFrame(doc))).toEqual([0, 0, 255, 255])
    top.visible = false
    expect(Array.from(compositeFrame(doc))).toEqual([255, 0, 0, 255])
  })
})

describe('History', () => {
  it('undoes and redoes in order and drops redo after a new push', () => {
    const h = new History<number>(3)
    h.push(1)
    h.push(2)
    expect(h.undo()).toBe(2)
    expect(h.redo()).toBe(2)
    expect(h.undo()).toBe(2)
    h.push(3)
    expect(h.canRedo).toBe(false)
    h.push(4)
    h.push(5)
    // The limit of 3 drops the oldest entry.
    expect([h.undo(), h.undo(), h.undo(), h.undo()]).toEqual([5, 4, 3, null])
  })
})

import { docFromFrames } from './model'

describe('docFromFrames', () => {
  it('builds one frame per image with clamped timings and a palette', () => {
    const red = new Uint8ClampedArray([255, 0, 0, 255])
    const blue = new Uint8ClampedArray([0, 0, 255, 255])
    const doc = docFromFrames(1, 1, [
      { pixels: red, duration: 0 },
      { pixels: blue, duration: 250 }
    ])
    expect(doc.frames.map((f) => f.duration)).toEqual([100, 250])
    expect(Array.from(doc.frames[1].cels[doc.layers[0].id])).toEqual([0, 0, 255, 255])
    expect(doc.palette.colors.sort()).toEqual(['#0000ff', '#ff0000'])
    red[0] = 1
    expect(doc.frames[0].cels[doc.layers[0].id][0]).toBe(255) // copied, not shared
  })
})
