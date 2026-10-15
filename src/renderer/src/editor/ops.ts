// Image Editor operations. Each takes an image and returns a new one; the input is
// never changed, which keeps undo simple.

import { applyPalette, quantize } from 'gifenc'
import type { RGBA } from '@/studio/raster'

export interface Img {
  width: number
  height: number
  data: Uint8ClampedArray<ArrayBuffer>
}

export const blank = (width: number, height: number): Img => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4)
})

export const copyImg = (img: Img): Img => ({ ...img, data: img.data.slice() })

// ---------- transform ----------

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Clips a rectangle to the image; returns null if nothing is left. */
export function clampRect(img: Img, r: Rect): Rect | null {
  const x = Math.max(0, Math.round(r.x))
  const y = Math.max(0, Math.round(r.y))
  const w = Math.min(img.width, Math.round(r.x + r.w)) - x
  const h = Math.min(img.height, Math.round(r.y + r.h)) - y
  return w > 0 && h > 0 ? { x, y, w, h } : null
}

export function crop(img: Img, rect: Rect): Img {
  const r = clampRect(img, rect)
  if (!r) return copyImg(img)
  const out = blank(r.w, r.h)
  for (let y = 0; y < r.h; y++) {
    const start = ((r.y + y) * img.width + r.x) * 4
    out.data.set(img.data.subarray(start, start + r.w * 4), y * r.w * 4)
  }
  return out
}

/** Smallest rectangle holding every non-transparent pixel, or null if the image is empty. */
export function contentBounds(img: Img): Rect | null {
  let minX = img.width
  let minY = img.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Crops away fully transparent edges. */
export function trim(img: Img): Img {
  const bounds = contentBounds(img)
  return bounds ? crop(img, bounds) : copyImg(img)
}

/** Remaps every pixel: (x, y) in the result comes from `source(x, y)` in the input. */
function remap(img: Img, width: number, height: number, source: (x: number, y: number) => [number, number]): Img {
  const out = blank(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sx, sy] = source(x, y)
      const si = (sy * img.width + sx) * 4
      out.data.set(img.data.subarray(si, si + 4), (y * width + x) * 4)
    }
  }
  return out
}

export const rotateCW = (img: Img): Img => remap(img, img.height, img.width, (x, y) => [y, img.height - 1 - x])
export const rotateCCW = (img: Img): Img => remap(img, img.height, img.width, (x, y) => [img.width - 1 - y, x])
export const rotate180 = (img: Img): Img => remap(img, img.width, img.height, (x, y) => [img.width - 1 - x, img.height - 1 - y])
export const flipH = (img: Img): Img => remap(img, img.width, img.height, (x, y) => [img.width - 1 - x, y])
export const flipV = (img: Img): Img => remap(img, img.width, img.height, (x, y) => [x, img.height - 1 - y])

/** Pixel-perfect resize: each output pixel copies the nearest input pixel. */
export function resizeNearest(img: Img, width: number, height: number): Img {
  return remap(img, width, height, (x, y) => [
    Math.min(img.width - 1, Math.floor(((x + 0.5) * img.width) / width)),
    Math.min(img.height - 1, Math.floor(((y + 0.5) * img.height) / height))
  ])
}

// ---------- adjustments ----------

export interface Adjustments {
  brightness: number // −100…100
  contrast: number // −100…100
  hue: number // −180…180 degrees
  saturation: number // −100…100
  grayscale: boolean
  invert: boolean
}

export const NO_ADJUSTMENTS: Adjustments = { brightness: 0, contrast: 0, hue: 0, saturation: 0, grayscale: false, invert: false }

export const isIdentity = (a: Adjustments): boolean =>
  a.brightness === 0 && a.contrast === 0 && a.hue === 0 && a.saturation === 0 && !a.grayscale && !a.invert

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number): number => {
    t = (((t % 1) + 1) % 1)
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const hn = h / 360
  return [channel(hn + 1 / 3) * 255, channel(hn) * 255, channel(hn - 1 / 3) * 255]
}

/** Applies colour adjustments to every visible pixel; transparency is untouched. */
export function adjust(img: Img, a: Adjustments): Img {
  if (isIdentity(a)) return copyImg(img)
  const out = copyImg(img)
  const d = out.data
  const c = a.contrast * 2.55
  const contrast = (259 * (c + 255)) / (255 * (259 - c))
  const bright = a.brightness * 2.55
  const needsHsl = a.hue !== 0 || a.saturation !== 0
  const satScale = 1 + a.saturation / 100
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    let r = d[i]
    let g = d[i + 1]
    let b = d[i + 2]
    if (needsHsl) {
      const [h, s, l] = rgbToHsl(r, g, b)
      ;[r, g, b] = hslToRgb(h + a.hue, Math.min(1, s * satScale), l)
    }
    if (a.grayscale) r = g = b = 0.299 * r + 0.587 * g + 0.114 * b
    r = contrast * (r + bright - 128) + 128
    g = contrast * (g + bright - 128) + 128
    b = contrast * (b + bright - 128) + 128
    if (a.invert) {
      r = 255 - r
      g = 255 - g
      b = 255 - b
    }
    d[i] = r // Uint8ClampedArray rounds and clamps
    d[i + 1] = g
    d[i + 2] = b
  }
  return out
}

// ---------- colours ----------

/** Colours that differ by at most `tolerance` (0–255) on every channel count as a match. */
const matches = (d: Uint8ClampedArray, i: number, c: RGBA, tolerance: number): boolean =>
  Math.abs(d[i] - c[0]) <= tolerance &&
  Math.abs(d[i + 1] - c[1]) <= tolerance &&
  Math.abs(d[i + 2] - c[2]) <= tolerance &&
  Math.abs(d[i + 3] - c[3]) <= tolerance

/** Replaces one colour (and near matches) everywhere in the image. */
export function replaceColor(img: Img, from: RGBA, to: RGBA, tolerance = 0): Img {
  const out = copyImg(img)
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] !== 0 && matches(out.data, i, from, tolerance)) out.data.set(to, i)
  }
  return out
}

/** Clears pixels of one colour: everywhere, or only the area connected to (x, y). */
export function makeTransparent(img: Img, color: RGBA, tolerance: number, at?: { x: number; y: number }): Img {
  if (!at) return replaceColor(img, color, [0, 0, 0, 0], tolerance)
  return floodClear(img, color, tolerance, [at.x, at.y])
}

/** Clears every matching pixel connected to any of the seed points (x, y pairs). */
function floodClear(img: Img, color: RGBA, tolerance: number, seeds: number[]): Img {
  const out = copyImg(img)
  const { width: w, height: h } = img
  const visited = new Uint8Array(w * h)
  const stack = [...seeds]
  while (stack.length) {
    const y = stack.pop()!
    const x = stack.pop()!
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const p = y * w + x
    if (visited[p]) continue
    visited[p] = 1
    if (out.data[p * 4 + 3] === 0 || !matches(img.data, p * 4, color, tolerance)) continue
    out.data.fill(0, p * 4, p * 4 + 4)
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }
  return out
}

/**
 * Removes a flat background: whatever colour fills the corners, cleared only where
 * it touches the image edges, so the same colour inside the sprite survives.
 */
export function removeBackground(img: Img, tolerance = 8): Img {
  const { width: w, height: h } = img
  const corner = (x: number, y: number): RGBA => {
    const i = (y * w + x) * 4
    return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]
  }
  const corners = [corner(0, 0), corner(w - 1, 0), corner(0, h - 1), corner(w - 1, h - 1)]
  // The most common corner colour is the background.
  const key = (c: RGBA): string => c.join()
  const counts = new Map<string, number>()
  corners.forEach((c) => counts.set(key(c), (counts.get(key(c)) ?? 0) + 1))
  const bg = corners.reduce((best, c) => ((counts.get(key(c)) ?? 0) > (counts.get(key(best)) ?? 0) ? c : best))
  if (bg[3] === 0) return copyImg(img)
  // Seed one flood from every edge pixel, so separate patches of background all go.
  const seeds: number[] = []
  for (let x = 0; x < w; x++) seeds.push(x, 0, x, h - 1)
  for (let y = 0; y < h; y++) seeds.push(0, y, w - 1, y)
  return floodClear(img, bg, tolerance, seeds)
}

/** Reduces the image to at most `count` colours (no dithering, which suits pixel art). */
export function reduceColors(img: Img, count: number): Img {
  const out = copyImg(img)
  const opaque: number[] = []
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] !== 0) opaque.push(img.data[i], img.data[i + 1], img.data[i + 2], 255)
  if (!opaque.length) return out
  const rgba = new Uint8Array(opaque)
  const palette = quantize(rgba, Math.max(2, Math.min(256, count)))
  const index = applyPalette(rgba, palette)
  for (let i = 0, p = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue
    const [r, g, b] = palette[index[p++]]
    out.data[i] = r
    out.data[i + 1] = g
    out.data[i + 2] = b
  }
  return out
}

// ---------- sprite-sheet slicing ----------

export interface SliceOptions {
  /** 'size' uses cellW/cellH; 'count' divides the image into columns × rows. */
  mode: 'size' | 'count'
  cellW: number
  cellH: number
  columns: number
  rows: number
  offsetX: number
  offsetY: number
  spacingX: number
  spacingY: number
  skipEmpty: boolean
}

export function sliceRects(img: Img, o: SliceOptions): Rect[] {
  const usableW = img.width - o.offsetX
  const usableH = img.height - o.offsetY
  const cols = o.mode === 'count' ? Math.max(1, o.columns) : Math.floor((usableW + o.spacingX) / (Math.max(1, o.cellW) + o.spacingX))
  const rows = o.mode === 'count' ? Math.max(1, o.rows) : Math.floor((usableH + o.spacingY) / (Math.max(1, o.cellH) + o.spacingY))
  const cellW = o.mode === 'count' ? Math.floor((usableW - (cols - 1) * o.spacingX) / cols) : o.cellW
  const cellH = o.mode === 'count' ? Math.floor((usableH - (rows - 1) * o.spacingY) / rows) : o.cellH
  if (cellW < 1 || cellH < 1) return []
  const rects: Rect[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rect = { x: o.offsetX + c * (cellW + o.spacingX), y: o.offsetY + r * (cellH + o.spacingY), w: cellW, h: cellH }
      if (rect.x + rect.w > img.width || rect.y + rect.h > img.height) continue
      if (o.skipEmpty && !contentBounds(crop(img, rect))) continue
      rects.push(rect)
    }
  }
  return rects
}

// ---------- reading pixels ----------

export function pixelAt(img: Img, x: number, y: number): RGBA {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]
}

/** Distinct visible colours with how often each appears, most used first. */
export function colorCounts(img: Img, limit = 256): Array<{ color: RGBA; count: number }> {
  const counts = new Map<number, number>()
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue
    const key = ((img.data[i] << 24) | (img.data[i + 1] << 16) | (img.data[i + 2] << 8) | img.data[i + 3]) >>> 0
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, count]) => ({ color: [k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255, k & 255] as RGBA, count }))
}

export const distinctColorCount = (img: Img): number => colorCounts(img, Infinity).length
