import { describe, expect, it } from 'vitest'
import preTags from './fixtures/pre-tags.sprite.json'
import { addTag } from './frames'
import { compositeAt, compositeFrame, createDoc, docFromFrames, parseDoc, serializeDoc } from './model'

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

// A file saved before animation tags existed, exactly as the app wrote it then.
describe('sprite files from before tags', () => {
  const pixels = (doc: ReturnType<typeof parseDoc>, frame: number, layer: string): number[] => Array.from(doc.frames[frame].cels[layer])

  it('is still in the old shape', () => {
    expect('tags' in preTags).toBe(false)
  })

  it('opens with no tags and everything else intact', () => {
    const doc = parseDoc(JSON.stringify(preTags))
    expect(doc.tags).toEqual([])
    expect([doc.width, doc.height]).toEqual([2, 2])
    expect(doc.palette).toEqual({ name: 'Mine', colors: ['#ff0000', '#00ff00', '#0000ff'] })
    expect(doc.layers.map((l) => l.name)).toEqual(['Background', 'Details'])
    expect(doc.frames.map((f) => f.duration)).toEqual([100, 250])
    expect(pixels(doc, 0, 'bg')).toEqual([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255])
    expect(pixels(doc, 1, 'top')).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 128, 0, 0, 0, 0])
    // The top layer covers the second pixel of frame 1.
    expect(Array.from(compositeFrame(doc, 0).slice(0, 8))).toEqual([255, 0, 0, 255, 0, 0, 255, 255])
  })

  it('saves and reopens unchanged, and can be given tags', () => {
    const doc = parseDoc(JSON.stringify(preTags))
    const resaved = parseDoc(serializeDoc(doc))
    expect(resaved).toEqual(doc)

    addTag(doc, 0, 1, 'walk')
    const tagged = parseDoc(serializeDoc(doc))
    expect(tagged.tags).toMatchObject([{ name: 'walk', from: 0, to: 1 }])
    expect(pixels(tagged, 1, 'bg')).toEqual(pixels(doc, 1, 'bg'))
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

describe('compositeAt', () => {
  it('reuses one result per frame until the version changes', () => {
    const doc = createDoc(1, 1)
    const first = compositeAt(doc, 0, 1)
    expect(compositeAt(doc, 0, 1)).toBe(first) // same version: shared, not recomputed
    doc.frames[0].cels[doc.layers[0].id].set([9, 9, 9, 255])
    const next = compositeAt(doc, 0, 2)
    expect(next).not.toBe(first)
    expect(Array.from(next)).toEqual([9, 9, 9, 255])
  })
})
