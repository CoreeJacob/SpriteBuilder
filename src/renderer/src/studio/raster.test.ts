import { describe, expect, it } from 'vitest'
import { floodFill, getPixel, linePoints, parseHex, setPixel, toHex, uniqueColors } from './raster'

const RED = parseHex('#ff0000')
const BLUE = parseHex('#0000ff')

describe('colours', () => {
  it('round-trips hex', () => {
    expect(parseHex('#1d2b53')).toEqual([29, 43, 83, 255])
    expect(parseHex('#f00')).toEqual([255, 0, 0, 255])
    expect(toHex([29, 43, 83, 255])).toBe('#1d2b53')
    expect(toHex([255, 0, 0, 128])).toBe('#ff000080')
  })
})

describe('linePoints', () => {
  it('includes both ends and has no gaps', () => {
    const pts = linePoints(0, 0, 5, 2)
    expect(pts[0]).toEqual([0, 0])
    expect(pts.at(-1)).toEqual([5, 2])
    expect(pts).toHaveLength(6)
  })
  it('handles a single point', () => {
    expect(linePoints(3, 3, 3, 3)).toEqual([[3, 3]])
  })
})

describe('floodFill', () => {
  it('fills only the connected region', () => {
    const w = 4
    const h = 4
    const buf = new Uint8ClampedArray(w * h * 4)
    // A vertical wall at x = 2 splits the canvas.
    for (let y = 0; y < h; y++) setPixel(buf, w, h, 2, y, BLUE)
    expect(floodFill(buf, w, h, 0, 0, RED)).toBe(8)
    expect(getPixel(buf, w, 1, 3)).toEqual(RED)
    expect(getPixel(buf, w, 3, 0)).toEqual([0, 0, 0, 0])
    expect(getPixel(buf, w, 2, 0)).toEqual(BLUE)
  })
  it('does nothing when the colour already matches', () => {
    const buf = new Uint8ClampedArray(2 * 2 * 4)
    expect(floodFill(buf, 2, 2, 0, 0, [0, 0, 0, 0])).toBe(0)
  })
})

describe('uniqueColors', () => {
  it('ignores transparent pixels and orders by use', () => {
    const buf = new Uint8ClampedArray(4 * 4)
    setPixel(buf, 4, 1, 0, 0, RED)
    setPixel(buf, 4, 1, 1, 0, BLUE)
    setPixel(buf, 4, 1, 2, 0, BLUE)
    expect(uniqueColors(buf)).toEqual(['#0000ff', '#ff0000'])
  })
})
