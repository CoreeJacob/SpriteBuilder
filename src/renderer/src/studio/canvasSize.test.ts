import { describe, expect, it } from 'vitest'
import { resizeCanvas, scaleSprite } from './canvasSize'
import { addFrame } from './frames'
import { addLayer } from './layers'
import { createDoc } from './model'
import { getPixel, setPixel } from './raster'

const RED: [number, number, number, number] = [255, 0, 0, 255]

describe('canvas size', () => {
  it('adds space on the chosen side, for every layer and frame', () => {
    const doc = createDoc(2, 2)
    addLayer(doc, doc.layers[0].id)
    addFrame(doc, 0)
    const id = doc.layers[0].id
    setPixel(doc.frames[0].cels[id], 2, 2, 0, 0, RED)
    resizeCanvas(doc, 4, 4, [1, 1]) // keep pixels at the bottom-right
    expect(doc.width).toBe(4)
    expect(getPixel(doc.frames[0].cels[id], 4, 2, 2)).toEqual(RED)
    expect(getPixel(doc.frames[0].cels[id], 4, 0, 0)).toEqual([0, 0, 0, 0])
    for (const f of doc.frames) for (const cel of Object.values(f.cels)) expect(cel.length).toBe(4 * 4 * 4)
  })

  it('centres when growing and cuts off edges when shrinking', () => {
    const doc = createDoc(4, 4)
    const id = doc.layers[0].id
    setPixel(doc.frames[0].cels[id], 4, 4, 1, 1, RED)
    resizeCanvas(doc, 2, 2, [0.5, 0.5]) // keeps the middle 2×2
    expect(getPixel(doc.frames[0].cels[id], 2, 0, 0)).toEqual(RED)
    resizeCanvas(doc, 1, 1, [1, 1])
    expect(getPixel(doc.frames[0].cels[id], 1, 0, 0)).toEqual([0, 0, 0, 0])
  })

  it('scales pixels up and down with hard edges', () => {
    const doc = createDoc(2, 1)
    const id = doc.layers[0].id
    setPixel(doc.frames[0].cels[id], 2, 1, 0, 0, RED)
    scaleSprite(doc, 4, 2)
    expect([0, 1].map((x) => getPixel(doc.frames[0].cels[id], 4, x, 1))).toEqual([RED, RED])
    expect(getPixel(doc.frames[0].cels[id], 4, 2, 0)).toEqual([0, 0, 0, 0])
    scaleSprite(doc, 2, 1)
    expect(getPixel(doc.frames[0].cels[id], 2, 0, 0)).toEqual(RED)
  })
})
