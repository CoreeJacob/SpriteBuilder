import { describe, expect, it } from 'vitest'
import { floodFillInRegion, isSelected, type Selection } from './raster'
import { clearSelected, liftSelected, maskOutline, resizeMask, selectionFromLoop, turnMask } from './selection'

/** The selection drawn as rows of '#' (selected) and '.' over a w×h canvas. */
function picture(sel: Selection | null, w: number, h: number): string[] {
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (sel && isSelected(sel, x, y) ? '#' : '.')).join(''))
}

describe('selectionFromLoop (lasso)', () => {
  it('a loop around a square selects the square, as a plain box', () => {
    const sel = selectionFromLoop([[2, 2], [5, 2], [5, 5], [2, 5]], 8, 8)!
    expect(sel).toEqual({ x: 2, y: 2, w: 4, h: 4 }) // all of the box is selected, so no mask is needed
  })

  it('a triangle selects the pixels inside it and on its edge', () => {
    const sel = selectionFromLoop([[0, 0], [6, 0], [0, 6]], 8, 8)!
    expect(sel.mask).toBeDefined()
    expect(picture(sel, 8, 8)).toEqual(['#######.', '######..', '#####...', '####....', '###.....', '##......', '#.......', '........'])
  })

  it('keeps to the canvas, and gives nothing for a loop entirely outside it', () => {
    const sel = selectionFromLoop([[-3, -3], [2, -3], [2, 2], [-3, 2]], 6, 6)!
    expect(sel).toEqual({ x: 0, y: 0, w: 3, h: 3 })
    expect(selectionFromLoop([[10, 10], [12, 10], [12, 12]], 6, 6)).toBeNull()
  })

  it('a thin stroke still selects the pixels it passes through', () => {
    expect(picture(selectionFromLoop([[1, 1], [4, 1]], 6, 3), 6, 3)).toEqual(['......', '.####.', '......'])
  })

  it('where a loop goes round twice, the overlap cancels out (as in drawing apps)', () => {
    const twice: Array<[number, number]> = [[1, 1], [6, 1], [6, 6], [1, 6], [1, 1], [6, 1], [6, 6], [1, 6]]
    const rows = picture(selectionFromLoop(twice, 8, 8), 8, 8)
    expect(rows[3]).toBe('.#....#.') // only the line itself
  })
})

describe('masked selections', () => {
  // A 4×1 canvas of red pixels, and a selection of the middle two inside a 4-wide box.
  const reds = () => new Uint8ClampedArray([1, 2, 3, 4].flatMap((v) => [v, 0, 0, 255]))
  const middle: Selection = { x: 0, y: 0, w: 4, h: 1, mask: Uint8Array.from([0, 1, 1, 0]) }

  it('lifts only the selected pixels, the rest of the box clear', () => {
    expect(Array.from(liftSelected(reds(), 4, 1, middle).filter((_, i) => i % 4 === 0))).toEqual([0, 2, 3, 0])
  })

  it('clears only the selected pixels', () => {
    const buf = reds()
    clearSelected(buf, 4, 1, middle)
    expect(Array.from(buf.filter((_, i) => i % 4 === 3))).toEqual([255, 0, 0, 255])
  })

  it('the paint bucket stays inside the shape', () => {
    const buf = new Uint8ClampedArray(4 * 4)
    expect(floodFillInRegion(buf, 4, 1, 1, 0, [9, 9, 9, 255], middle)).toBe(2)
    expect(Array.from(buf.filter((_, i) => i % 4 === 0))).toEqual([0, 9, 9, 0])
    expect(floodFillInRegion(buf, 4, 1, 0, 0, [9, 9, 9, 255], middle)).toBe(0) // outside the shape
  })

  it('the shape flips, turns and resizes with its pixels', () => {
    const corner = Uint8Array.from([1, 0, 0, 0, 0, 0]) // 3×2, top-left pixel only
    expect(Array.from(turnMask(corner, 3, 2, 'flipH'))).toEqual([0, 0, 1, 0, 0, 0])
    expect(Array.from(turnMask(corner, 3, 2, 'rotateCW'))).toEqual([0, 1, 0, 0, 0, 0]) // now 2×3: top-right
    expect(Array.from(resizeMask(Uint8Array.from([1, 0]), 2, 1, 4, 2))).toEqual([1, 1, 0, 0, 1, 1, 0, 0])
  })

  it('traces the outline of a shape once and reuses it', () => {
    const l: Selection & { mask: Uint8Array } = { x: 0, y: 0, w: 2, h: 2, mask: Uint8Array.from([1, 0, 1, 1]) }
    const outline = maskOutline(l)
    expect(outline.length / 4).toBe(8) // an L of three pixels has 8 outer sides
    expect(maskOutline(l)).toBe(outline)
  })
})
