import { describe, expect, it } from 'vitest'
import { countFrames } from '@shared/imageInfo'
import { addFrame } from './frames'
import { encodeGif, planSheet, renderSheet, scalePixels, sheetJson } from './exporters'
import { createDoc } from './model'

describe('scalePixels', () => {
  it('repeats each pixel into a block', () => {
    const out = scalePixels(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), 2, 1, 2)
    expect(out.length).toBe(4 * 2 * 4)
    expect(Array.from(out.slice(0, 8))).toEqual([255, 0, 0, 255, 255, 0, 0, 255])
    expect(Array.from(out.slice(16, 20))).toEqual([255, 0, 0, 255]) // second row, first pixel
  })
})

describe('sprite sheets', () => {
  it('lays out rows, columns and grids with padding', () => {
    const base = { columns: 0, padding: 0, scale: 1 }
    expect(planSheet(4, 16, 8, { ...base, layout: 'row' })).toMatchObject({ width: 64, height: 8, columns: 4, rows: 1 })
    expect(planSheet(4, 16, 8, { ...base, layout: 'column' })).toMatchObject({ width: 16, height: 32 })
    const grid = planSheet(5, 16, 16, { ...base, layout: 'grid', padding: 2 })
    expect(grid).toMatchObject({ columns: 3, rows: 2, width: 52, height: 34 })
    expect(grid.rects[4]).toEqual({ x: 18, y: 18, w: 16, h: 16 })
    expect(planSheet(2, 8, 8, { ...base, layout: 'row', scale: 4 }).width).toBe(64)
  })

  it('renders frames into place and writes matching JSON', () => {
    const doc = createDoc(2, 2)
    addFrame(doc, 0)
    doc.frames[1].cels[doc.layers[0].id].set([0, 255, 0, 255])
    const plan = planSheet(2, 2, 2, { layout: 'row', columns: 0, padding: 1, scale: 1 })
    const px = renderSheet(doc, plan, 1)
    const at = (x: number, y: number): number[] => Array.from(px.slice((y * plan.width + x) * 4, (y * plan.width + x) * 4 + 4))
    expect(at(3, 0)).toEqual([0, 255, 0, 255]) // frame 1 starts at x = 2 + 1 padding
    expect(at(2, 0)).toEqual([0, 0, 0, 0]) // padding column stays empty
    const json = JSON.parse(sheetJson(doc, plan, 'hero', 'hero.png', 1))
    expect(json.frames['hero 1'].frame).toEqual({ x: 3, y: 0, w: 2, h: 2 })
    expect(json.meta.size).toEqual({ w: 5, h: 2 })
    expect(json.frames['hero 0'].duration).toBe(100)
  })
})

describe('encodeGif', () => {
  it('writes one GIF frame per sprite frame', () => {
    const doc = createDoc(4, 4)
    doc.frames[0].cels[doc.layers[0].id].set([255, 0, 0, 255])
    addFrame(doc, 0)
    addFrame(doc, 1)
    const gif = encodeGif(doc, 2)
    expect(new TextDecoder().decode(gif.slice(0, 6))).toBe('GIF89a')
    expect(gif[6] | (gif[7] << 8)).toBe(8) // width after 2× scale
    expect(countFrames(gif, 'gif')).toBe(3)
  })
})
