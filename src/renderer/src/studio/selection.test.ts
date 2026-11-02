import { describe, expect, it } from 'vitest'
import { floodFillInRegion, isSelected, type Selection } from './raster'
import { clearSelected, combineSelections, liftSelected, maskOutline, resizeMask, selectionFromColor, selectionFromLoop, turnMask } from './selection'

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

/** A canvas from rows of letters: '.' is clear, and each letter is its own colour. */
function canvas(rows: string[]): Uint8ClampedArray {
  const colours: Record<string, number[]> = { r: [200, 0, 0, 255], s: [210, 10, 0, 255], b: [0, 0, 200, 255], '.': [0, 0, 0, 0], ',': [90, 90, 90, 0] }
  return Uint8ClampedArray.from(rows.flatMap((row) => [...row].flatMap((c) => colours[c])))
}

describe('selectionFromColor (magic wand)', () => {
  const art = canvas(['rr.b', 'r..b', 'rsbb', 'b..r'])

  it('picks the exact colour, only where it touches the clicked pixel (not diagonally)', () => {
    expect(picture(selectionFromColor(art, 4, 4, 0, 0, 0), 4, 4)).toEqual(['##..', '#...', '#...', '....'])
  })

  it('tolerance lets similar shades in too', () => {
    // s is within 10 of r on every channel
    expect(picture(selectionFromColor(art, 4, 4, 0, 0, 10), 4, 4)).toEqual(['##..', '#...', '##..', '....'])
    expect(picture(selectionFromColor(art, 4, 4, 0, 0, 9), 4, 4)).toEqual(['##..', '#...', '#...', '....'])
  })

  it('all clear pixels count as one colour, whatever is hidden in them', () => {
    const mixed = canvas(['.,b', ',.b'])
    expect(picture(selectionFromColor(mixed, 3, 2, 0, 0, 0), 3, 2)).toEqual(['##.', '##.'])
  })

  it('a click off the canvas picks nothing', () => {
    expect(selectionFromColor(art, 4, 4, 4, 0, 0)).toBeNull()
  })
})

describe('combineSelections (⇧ adds, ⌥ takes away)', () => {
  const box = (x: number, y: number, w: number, h: number): Selection => ({ x, y, w, h })

  it('replace ignores what was there', () => {
    expect(combineSelections(box(0, 0, 2, 2), box(3, 3, 1, 1), 'replace', 6, 6)).toEqual(box(3, 3, 1, 1))
  })

  it('adding joins two shapes, with a mask where the box has gaps', () => {
    const sel = combineSelections(box(0, 0, 2, 2), box(3, 1, 2, 2), 'add', 6, 4)
    expect(picture(sel, 6, 4)).toEqual(['##....', '##.##.', '...##.', '......'])
    expect(sel).toMatchObject({ x: 0, y: 0, w: 5, h: 3 })
  })

  it('adding side by side pieces that fill their box needs no mask', () => {
    expect(combineSelections(box(0, 0, 2, 2), box(2, 0, 2, 2), 'add', 6, 6)).toEqual(box(0, 0, 4, 2))
  })

  it('taking away cuts a hole, or trims an edge', () => {
    expect(picture(combineSelections(box(0, 0, 4, 4), box(1, 1, 2, 2), 'subtract', 4, 4), 4, 4)).toEqual(['####', '#..#', '#..#', '####'])
    expect(combineSelections(box(0, 0, 4, 4), box(2, 0, 9, 9), 'subtract', 4, 4)).toEqual(box(0, 0, 2, 4))
  })

  it('works with free shapes, and keeps to the canvas', () => {
    const triangle = selectionFromLoop([[0, 0], [3, 0], [0, 3]], 4, 4)
    expect(picture(combineSelections(triangle, box(-2, -2, 3, 3), 'subtract', 4, 4), 4, 4)).toEqual(['.###', '###.', '##..', '#...'])
    expect(combineSelections(box(-2, -2, 4, 4), box(3, 3, 9, 9), 'add', 4, 4)).toMatchObject({ x: 0, y: 0, w: 4, h: 4 })
  })

  it('with nothing selected: adding is a plain new selection, taking away leaves nothing', () => {
    expect(combineSelections(null, box(1, 1, 2, 2), 'add', 4, 4)).toEqual(box(1, 1, 2, 2))
    expect(combineSelections(null, box(1, 1, 2, 2), 'subtract', 4, 4)).toBeNull()
    expect(combineSelections(box(1, 1, 2, 2), box(0, 0, 4, 4), 'subtract', 4, 4)).toBeNull()
    expect(combineSelections(box(1, 1, 2, 2), null, 'add', 4, 4)).toEqual(box(1, 1, 2, 2))
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
