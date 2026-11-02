// Free-shape selections (a box plus a mask of which pixels in it are selected): making one from
// a lasso loop or by colour (the magic wand), adding to and taking away from one, lifting and clearing only the selected pixels, keeping the mask in step when the
// pixels are flipped, turned or resized, and tracing its outline for the marching ants.

import {
  clearRegion,
  colorsMatch,
  extractRegion,
  floodRegion,
  getPixel,
  isSelected,
  linePoints,
  resizePixels,
  turnPixels,
  type Region,
  type Selection,
  type Turn
} from './raster'

/** Crops a full-canvas mask to the box around its selected pixels. A box that's all selected needs no mask. */
function cropToBox(full: Uint8Array, width: number, height: number): Selection | null {
  let [left, top, right, bottom] = [width, height, -1, -1]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!full[y * width + x]) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) return null
  const box: Region = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
  const mask = new Uint8Array(box.w * box.h)
  let all = true
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const on = full[(box.y + y) * width + box.x + x]
      mask[y * box.w + x] = on
      if (!on) all = false
    }
  }
  return all ? box : { ...box, mask }
}

/**
 * Lasso: the pixels inside a drawn loop of pixel positions (the loop closes itself), plus the
 * pixels on the line itself, kept within the canvas. Null if that's nothing.
 */
export function selectionFromLoop(points: Array<[number, number]>, width: number, height: number): Selection | null {
  if (!points.length) return null
  const full = new Uint8Array(width * height)
  const n = points.length
  // A pixel is inside when its centre is inside the loop. Each row, find where the loop crosses
  // the row's centre line and fill between pairs of crossings (so a loop that crosses itself
  // leaves the overlap out, like the even-odd rule in drawing apps).
  for (let y = 0; y < height; y++) {
    const cy = y + 0.5
    const crossings: number[] = []
    for (let i = 0; i < n; i++) {
      const [x1, y1] = points[i]
      const [x2, y2] = points[(i + 1) % n]
      const [ay, by] = [y1 + 0.5, y2 + 0.5]
      if (ay <= cy !== by <= cy) crossings.push(x1 + 0.5 + ((cy - ay) / (by - ay)) * (x2 - x1))
    }
    crossings.sort((a, b) => a - b)
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.max(0, Math.ceil(crossings[k] - 0.5))
      const to = Math.min(width - 1, Math.floor(crossings[k + 1] - 0.5))
      for (let x = from; x <= to; x++) full[y * width + x] = 1
    }
  }
  // The line itself counts too, so a thin stroke or a loop around a single pixel still selects something.
  for (let i = 0; i < n; i++) {
    for (const [x, y] of linePoints(...points[i], ...points[(i + 1) % n])) {
      if (x >= 0 && y >= 0 && x < width && y < height) full[y * width + x] = 1
    }
  }
  return cropToBox(full, width, height)
}

/**
 * Magic wand: the pixels of the same colour as (x, y) that touch it (4-way), counting colours
 * within `tolerance` (0–255 per channel) as the same. All clear pixels count as one colour.
 */
export function selectionFromColor(buf: Uint8ClampedArray, width: number, height: number, x: number, y: number, tolerance: number): Selection | null {
  if (x < 0 || y < 0 || x >= width || y >= height) return null
  const seed = getPixel(buf, width, x, y)
  const clear = seed[3] === 0
  const full = new Uint8Array(width * height)
  const region = floodRegion(width, height, [x, y], (p) => (clear && buf[p * 4 + 3] === 0) || colorsMatch(buf, p * 4, seed, tolerance))
  for (const p of region) full[p] = 1
  return cropToBox(full, width, height)
}

export type SelectMode = 'replace' | 'add' | 'subtract'

/**
 * A new selection combined with the one already there: replacing it, added to it (⇧) or taken
 * away from it (⌥). Kept within the canvas; null if nothing is left.
 */
export function combineSelections(base: Selection | null, next: Selection | null, mode: SelectMode, width: number, height: number): Selection | null {
  if (mode === 'replace' || !base) return mode === 'subtract' ? null : next
  if (!next) return base
  const full = new Uint8Array(width * height)
  for (const [sel, on] of [[base, 1], [next, mode === 'add' ? 1 : 0]] as const) {
    for (let y = Math.max(0, sel.y); y < Math.min(height, sel.y + sel.h); y++) {
      for (let x = Math.max(0, sel.x); x < Math.min(width, sel.x + sel.w); x++) if (isSelected(sel, x, y)) full[y * width + x] = on
    }
  }
  return cropToBox(full, width, height)
}

/** The selected pixels, copied out into their own box-sized buffer; unselected ones come back clear. */
export function liftSelected(buf: Uint8ClampedArray, width: number, height: number, sel: Selection): Uint8ClampedArray<ArrayBuffer> {
  const pixels = extractRegion(buf, width, height, sel)
  if (sel.mask) sel.mask.forEach((on, i) => !on && pixels.fill(0, i * 4, i * 4 + 4))
  return pixels
}

/** Makes the selected pixels clear (only those inside the shape). */
export function clearSelected(buf: Uint8ClampedArray, width: number, height: number, sel: Selection): void {
  if (!sel.mask) return clearRegion(buf, width, height, sel)
  for (let y = 0; y < sel.h; y++) {
    for (let x = 0; x < sel.w; x++) {
      const [cx, cy] = [sel.x + x, sel.y + y]
      if (sel.mask[y * sel.w + x] && cx >= 0 && cy >= 0 && cx < width && cy < height) buf.fill(0, (cy * width + cx) * 4, (cy * width + cx) * 4 + 4)
    }
  }
}

/** Runs a pixel transform (flip, turn or resize, on RGBA) on a mask, by treating it as an alpha channel. */
function transformMask(mask: Uint8Array, w: number, h: number, change: (rgba: Uint8ClampedArray) => { w: number; h: number; pixels: Uint8ClampedArray }): Uint8Array {
  const rgba = new Uint8ClampedArray(w * h * 4)
  mask.forEach((on, i) => (rgba[i * 4 + 3] = on ? 255 : 0))
  const out = change(rgba).pixels
  return Uint8Array.from({ length: out.length / 4 }, (_, i) => (out[i * 4 + 3] ? 1 : 0))
}

/** The mask after the same flip or quarter turn as its pixels. */
export const turnMask = (mask: Uint8Array, w: number, h: number, turn: Turn): Uint8Array => transformMask(mask, w, h, (rgba) => turnPixels(rgba, w, h, turn))

/** The mask resized like its pixels (pixel-perfect). */
export const resizeMask = (mask: Uint8Array, w: number, h: number, nw: number, nh: number): Uint8Array =>
  transformMask(mask, w, h, (rgba) => ({ w: nw, h: nh, pixels: resizePixels(rgba, w, h, nw, nh) }))

/**
 * The outline around a set of pixels, as line segments [x1, y1, x2, y2] in pixel units: every
 * side of a pixel whose neighbour on that side isn't in the set. Used for marching ants and the
 * brush outline.
 */
export function outlineSegments(cells: Iterable<[number, number]>, isIn: (x: number, y: number) => boolean): number[] {
  const out: number[] = []
  for (const [x, y] of cells) {
    if (!isIn(x, y - 1)) out.push(x, y, x + 1, y)
    if (!isIn(x, y + 1)) out.push(x, y + 1, x + 1, y + 1)
    if (!isIn(x - 1, y)) out.push(x, y, x, y + 1)
    if (!isIn(x + 1, y)) out.push(x + 1, y, x + 1, y + 1)
  }
  return out
}

const outlines = new WeakMap<Uint8Array, number[]>()

/** The outline of a masked selection, relative to its box (worked out once per mask). */
export function maskOutline(sel: Selection & { mask: Uint8Array }): number[] {
  const hit = outlines.get(sel.mask)
  if (hit) return hit
  const { w, h, mask } = sel
  const isIn = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1
  function* cells(): Generator<[number, number]> {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) yield [x, y]
  }
  const segments = outlineSegments(cells(), isIn)
  outlines.set(sel.mask, segments)
  return segments
}
