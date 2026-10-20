import { describe, expect, it } from 'vitest'
import {
  blitRegion,
  brushOffsets,
  brushPoints,
  changedRegion,
  constrainEnd,
  ellipsePoints,
  extractRegion,
  fitWithin,
  floodFill,
  floodFillInRegion,
  getPixel,
  isCorner,
  linePoints,
  mirrorPoints,
  parseHex,
  rectPoints,
  setPixel,
  shapePixels,
  toHex,
  turnPixels,
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

describe('fitWithin', () => {
  it('shrinks to fit, keeping the shape, and never enlarges', () => {
    expect(fitWithin(64, 32, 16, 16)).toEqual([16, 8])
    expect(fitWithin(10, 40, 16, 16)).toEqual([4, 16])
    expect(fitWithin(8, 8, 16, 16)).toEqual([8, 8])
    expect(fitWithin(1000, 1, 16, 16)).toEqual([16, 1]) // never below one pixel
  })
})

describe('changedRegion', () => {
  it('finds the smallest rectangle around every changed pixel', () => {
    const a = new Uint8ClampedArray(5 * 4 * 4)
    const b = a.slice()
    expect(changedRegion(a, b, 5, 4)).toBeNull()
    b[(1 * 5 + 3) * 4 + 3] = 255 // (3,1)
    b[(2 * 5 + 1) * 4] = 7 // (1,2)
    expect(changedRegion(a, b, 5, 4)).toEqual({ x: 1, y: 1, w: 3, h: 2 })
  })
})

describe('turnPixels', () => {
  // 3×2 image numbered by pixel: 1 2 3 / 4 5 6 (red channel only)
  const img = new Uint8ClampedArray([1, 2, 3, 4, 5, 6].flatMap((v) => [v, 0, 0, 255]))
  const reds = (t: { pixels: Uint8ClampedArray }) => Array.from(t.pixels.filter((_, i) => i % 4 === 0))

  it('flips and turns, swapping the size for quarter turns', () => {
    expect(reds(turnPixels(img, 3, 2, 'flipH'))).toEqual([3, 2, 1, 6, 5, 4])
    expect(reds(turnPixels(img, 3, 2, 'flipV'))).toEqual([4, 5, 6, 1, 2, 3])
    expect(reds(turnPixels(img, 3, 2, 'rotate180'))).toEqual([6, 5, 4, 3, 2, 1])
    const cw = turnPixels(img, 3, 2, 'rotateCW')
    expect([cw.w, cw.h]).toEqual([2, 3])
    expect(reds(cw)).toEqual([4, 1, 5, 2, 6, 3])
    expect(reds(turnPixels(img, 3, 2, 'rotateCCW'))).toEqual([3, 6, 2, 5, 1, 4])
  })

  it('four quarter turns get back to the start', () => {
    let t = { w: 3, h: 2, pixels: img }
    for (let i = 0; i < 4; i++) t = turnPixels(t.pixels, t.w, t.h, 'rotateCW')
    expect(Array.from(t.pixels)).toEqual(Array.from(img))
  })
})

describe('brushes', () => {
  const draw = (offsets: Array<[number, number]>, size: number) => {
    const rows: string[] = []
    const start = -Math.floor((size - 1) / 2)
    for (let y = start; y < start + size; y++) {
      let row = ''
      for (let x = start; x < start + size; x++) row += offsets.some(([dx, dy]) => dx === x && dy === y) ? '#' : '.'
      rows.push(row)
    }
    return rows
  }

  it('square brushes cover the whole square; even sizes reach right and down', () => {
    expect(brushOffsets(1, 'square')).toEqual([[0, 0]])
    expect(brushOffsets(2, 'square')).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]])
    expect(brushOffsets(3, 'square')).toHaveLength(9)
    expect(brushOffsets(3, 'square')[0]).toEqual([-1, -1])
  })

  it('round brushes drop the corners', () => {
    expect(draw(brushOffsets(3, 'round'), 3)).toEqual(['.#.', '###', '.#.'])
    expect(draw(brushOffsets(4, 'round'), 4)).toEqual(['.##.', '####', '####', '.##.'])
    expect(draw(brushOffsets(5, 'round'), 5)).toEqual(['.###.', '#####', '#####', '#####', '.###.'])
  })

  it('stamps along a path, each pixel once', () => {
    expect(brushPoints([[5, 5]], 1, 'square')).toEqual([[5, 5]])
    const line = brushPoints([[0, 0], [1, 0]], 2, 'square')
    expect(line).toHaveLength(6) // a 3×2 block, the shared column counted once
  })
})

describe('isCorner (pixel-perfect)', () => {
  it('spots the inside corner of an L step', () => {
    expect(isCorner([0, 0], [1, 0], [1, 1])).toBe(true)
    expect(isCorner([0, 0], [0, 1], [1, 1])).toBe(true)
  })
  it('leaves straight runs and true diagonals alone', () => {
    expect(isCorner([0, 0], [1, 0], [2, 0])).toBe(false)
    expect(isCorner([0, 0], [1, 1], [2, 2])).toBe(false)
    expect(isCorner([0, 0], [1, 0], [2, 1])).toBe(false)
  })
})

describe('shapePixels', () => {
  const key = (cells: Array<[number, number]>) => new Set(cells.map(([x, y]) => `${x},${y}`))

  it('a filled shape paints the same pixels as brushing every pixel inside it would', () => {
    for (const [tool, size, shape] of [['rect', 3, 'square'], ['rect', 4, 'round'], ['ellipse', 5, 'round'], ['ellipse', 2, 'square']] as const) {
      const solid = tool === 'rect' ? rectPoints(2, 3, 14, 11, true) : ellipsePoints(2, 3, 14, 11, true)
      const fast = key(shapePixels(tool, [2, 3], [14, 11], true, size, shape))
      const slow = key(brushPoints(solid, size, shape))
      expect([...fast].sort(), `${tool} ${size}px ${shape}`).toEqual([...slow].sort())
    }
  })

  it('a big filled shape with a big brush stays quick', () => {
    const start = performance.now()
    shapePixels('rect', [0, 0], [511, 511], true, 8, 'square')
    shapePixels('ellipse', [0, 0], [511, 511], true, 8, 'round')
    expect(performance.now() - start).toBeLessThan(100) // was about 700 ms per mouse move
  })
})
