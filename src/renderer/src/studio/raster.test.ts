import { describe, expect, it } from 'vitest'
import {
  blitRegion,
  constrainEnd,
  ellipsePoints,
  extractRegion,
  floodFill,
  floodFillInRegion,
  getPixel,
  linePoints,
  mirrorPoints,
  parseHex,
  rectPoints,
  setPixel,
  toHex,
  uniqueColors
} from './raster'

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

const key = (pts: Array<[number, number]>): string[] => pts.map(([x, y]) => `${x},${y}`).sort()

describe('shapes', () => {
  it('draws rectangle outlines and fills', () => {
    expect(rectPoints(0, 0, 2, 2, false)).toHaveLength(8)
    expect(rectPoints(2, 2, 0, 0, true)).toHaveLength(9)
  })

  it('draws symmetric, gap-free ellipses', () => {
    const pts = ellipsePoints(0, 0, 9, 5, false)
    const set = new Set(key(pts))
    for (const [x, y] of pts) {
      expect(set.has(`${9 - x},${y}`)).toBe(true)
      expect(set.has(`${x},${5 - y}`)).toBe(true)
    }
    // Touches all four sides of its box.
    expect(Math.min(...pts.map((p) => p[0]))).toBe(0)
    expect(Math.max(...pts.map((p) => p[0]))).toBe(9)
    expect(Math.min(...pts.map((p) => p[1]))).toBe(0)
    expect(Math.max(...pts.map((p) => p[1]))).toBe(5)
    expect(ellipsePoints(0, 0, 9, 5, true).length).toBeGreaterThan(pts.length)
  })

  it('handles one-pixel-thin boxes', () => {
    expect(ellipsePoints(3, 3, 3, 6, false)).toHaveLength(4)
  })

  it('constrains shift-drags', () => {
    expect(constrainEnd(0, 0, 5, 2, 'box')).toEqual([5, 5])
    expect(constrainEnd(0, 0, -3, 7, 'box')).toEqual([-7, 7])
    expect(constrainEnd(0, 0, 10, 1, 'line')).toEqual([10, 0])
    expect(constrainEnd(0, 0, 6, 5, 'line')).toEqual([6, 6])
  })

  it('mirrors points', () => {
    expect(key(mirrorPoints([[0, 0]], 4, 4, true, true))).toEqual(['0,0', '0,3', '3,0', '3,3'])
  })
})

describe('regions', () => {
  it('extracts and stamps pixels, skipping transparent ones', () => {
    const w = 4
    const buf = new Uint8ClampedArray(w * w * 4)
    setPixel(buf, w, w, 1, 1, RED)
    const piece = extractRegion(buf, w, w, { x: 1, y: 1, w: 2, h: 2 })
    expect(Array.from(piece.slice(0, 4))).toEqual(RED)
    const dest = new Uint8ClampedArray(w * w * 4)
    setPixel(dest, w, w, 3, 3, BLUE)
    blitRegion(dest, w, w, piece, { x: 2, y: 2, w: 2, h: 2 })
    expect(getPixel(dest, w, 2, 2)).toEqual(RED)
    expect(getPixel(dest, w, 3, 3)).toEqual(BLUE) // transparent source pixel left it alone
  })

  it('keeps flood fill inside the selection', () => {
    const w = 4
    const buf = new Uint8ClampedArray(w * w * 4)
    expect(floodFillInRegion(buf, w, w, 0, 0, RED, { x: 0, y: 0, w: 2, h: 2 })).toBe(4)
    expect(getPixel(buf, w, 2, 2)).toEqual([0, 0, 0, 0])
    expect(floodFillInRegion(buf, w, w, 3, 3, RED, { x: 0, y: 0, w: 2, h: 2 })).toBe(0)
  })
})
