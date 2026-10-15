import { describe, expect, it } from 'vitest'
import { compositeFrame, createDoc, docFromFrames, parseDoc, serializeDoc } from './model'

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
