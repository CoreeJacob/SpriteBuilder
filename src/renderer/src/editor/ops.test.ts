import { describe, expect, it } from 'vitest'
import {
  adjust,
  blank,
  colorCounts,
  contentBounds,
  crop,
  flipH,
  makeTransparent,
  NO_ADJUSTMENTS,
  pixelAt,
  reduceColors,
  removeBackground,
  replaceColor,
  resizeNearest,
  rotate180,
  rotateCCW,
  rotateCW,
  sliceRects,
  trim,
  type Img
} from './ops'
import type { RGBA } from '@/studio/raster'

const RED: RGBA = [255, 0, 0, 255]
const BLUE: RGBA = [0, 0, 255, 255]
const WHITE: RGBA = [255, 255, 255, 255]
const CLEAR: RGBA = [0, 0, 0, 0]

/** Builds an image from rows of characters using a colour key. */
function img(rows: string[], key: Record<string, RGBA>): Img {
  const out = blank(rows[0].length, rows.length)
  rows.forEach((row, y) => [...row].forEach((ch, x) => out.data.set(key[ch] ?? CLEAR, (y * out.width + x) * 4)))
  return out
}
const K = { r: RED, b: BLUE, w: WHITE }
const rows = (im: Img): string[] =>
  Array.from({ length: im.height }, (_, y) =>
    Array.from({ length: im.width }, (_, x) => {
      const p = pixelAt(im, x, y)
      return p[3] === 0 ? '.' : (Object.entries(K).find(([, c]) => c.join() === p.join())?.[0] ?? '?')
    }).join('')
  )

describe('transform', () => {
  const src = img(['rb.', '...'], K)
  it('rotates and flips', () => {
    expect(rows(rotateCW(src))).toEqual(['.r', '.b', '..'])
    expect(rows(rotateCCW(src))).toEqual(['..', 'b.', 'r.'])
    expect(rows(rotate180(src))).toEqual(['...', '.br'])
    expect(rows(flipH(src))).toEqual(['.br', '...'])
    expect(rows(rotateCW(rotateCCW(src)))).toEqual(rows(src))
  })
  it('crops, clamping to the image', () => {
    expect(rows(crop(src, { x: 1, y: 0, w: 5, h: 1 }))).toEqual(['b.'])
  })
  it('trims transparent edges', () => {
    const padded = img(['....', '.rb.', '....'], K)
    expect(contentBounds(padded)).toEqual({ x: 1, y: 1, w: 2, h: 1 })
    expect(rows(trim(padded))).toEqual(['rb'])
  })
  it('resizes pixel-perfectly', () => {
    expect(rows(resizeNearest(img(['rb'], K), 4, 2))).toEqual(['rrbb', 'rrbb'])
    expect(rows(resizeNearest(img(['rrbb', 'rrbb'], K), 2, 1))).toEqual(['rb'])
  })
})

describe('adjust', () => {
  it('leaves the image alone with no adjustments', () => {
    const src = img(['rb'], K)
    expect(Array.from(adjust(src, NO_ADJUSTMENTS).data)).toEqual(Array.from(src.data))
  })
  it('inverts, greys and brightens, keeping transparency', () => {
    const src = img(['r.'], K)
    expect(pixelAt(adjust(src, { ...NO_ADJUSTMENTS, invert: true }), 0, 0)).toEqual([0, 255, 255, 255])
    const grey = pixelAt(adjust(src, { ...NO_ADJUSTMENTS, grayscale: true }), 0, 0)
    expect(grey[0]).toBe(grey[1])
    expect(pixelAt(adjust(src, { ...NO_ADJUSTMENTS, brightness: 100 }), 0, 0)).toEqual([255, 255, 255, 255])
    expect(pixelAt(adjust(src, { ...NO_ADJUSTMENTS, invert: true }), 1, 0)).toEqual(CLEAR)
  })
  it('rotates hue (red → green at 120°)', () => {
    expect(pixelAt(adjust(img(['r'], K), { ...NO_ADJUSTMENTS, hue: 120 }), 0, 0)).toEqual([0, 255, 0, 255])
  })
})

describe('colours', () => {
  it('replaces a colour within tolerance', () => {
    const near = img(['r'], K)
    near.data[1] = 10 // almost red
    expect(pixelAt(replaceColor(near, RED, BLUE, 0), 0, 0)).not.toEqual(BLUE)
    expect(pixelAt(replaceColor(near, RED, BLUE, 16), 0, 0)).toEqual(BLUE)
  })
  it('makes a colour transparent globally or only where connected', () => {
    const src = img(['rbr'], K)
    expect(rows(makeTransparent(src, RED, 0))).toEqual(['.b.'])
    expect(rows(makeTransparent(src, RED, 0, { x: 0, y: 0 }))).toEqual(['.br'])
  })
  it('removes a flat background but keeps the same colour inside the sprite', () => {
    const src = img(['wwwww', 'wbbbw', 'wbwbw', 'wbbbw', 'wwwww'], K)
    expect(rows(removeBackground(src))).toEqual(['.....', '.bbb.', '.bwb.', '.bbb.', '.....'])
  })
  it('reduces colours', () => {
    const src = blank(16, 1)
    for (let x = 0; x < 16; x++) src.data.set([x * 16, 255 - x * 16, 100, 255], x * 4)
    expect(colorCounts(src).length).toBe(16)
    expect(colorCounts(reduceColors(src, 4)).length).toBeLessThanOrEqual(4)
  })
})

describe('sliceRects', () => {
  const sheet = img(['rr..bb', 'rr..bb'], K) // three 2×2 cells, the middle one empty
  const base = { mode: 'size' as const, cellW: 2, cellH: 2, columns: 1, rows: 1, offsetX: 0, offsetY: 0, spacingX: 0, spacingY: 0, skipEmpty: false }
  it('slices by cell size and can skip empty cells', () => {
    expect(sliceRects(sheet, base)).toHaveLength(3)
    expect(sliceRects(sheet, { ...base, skipEmpty: true }).map((r) => r.x)).toEqual([0, 4])
  })
  it('slices by column and row count, with spacing', () => {
    expect(sliceRects(sheet, { ...base, mode: 'count', columns: 3, rows: 1 })).toEqual([
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 2, y: 0, w: 2, h: 2 },
      { x: 4, y: 0, w: 2, h: 2 }
    ])
    expect(sliceRects(sheet, { ...base, cellW: 2, spacingX: 2 }).map((r) => r.x)).toEqual([0, 4])
  })
})
