// Pixel operations on RGBA buffers (4 bytes per pixel, row by row).

export type RGBA = [number, number, number, number]

export const TRANSPARENT: RGBA = [0, 0, 0, 0]

export function parseHex(hex: string): RGBA {
  const h = hex.replace('#', '')
  const full = h.length === 3 || h.length === 4 ? [...h].map((c) => c + c).join('') : h
  const n = (i: number): number => parseInt(full.slice(i, i + 2), 16)
  return [n(0), n(2), n(4), full.length >= 8 ? n(6) : 255]
}

export function toHex([r, g, b, a]: RGBA): string {
  const hex = (v: number): string => v.toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}${a < 255 ? hex(a) : ''}`
}

export function getPixel(buf: Uint8ClampedArray, width: number, x: number, y: number): RGBA {
  const i = (y * width + x) * 4
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]
}

/** Returns true if the pixel actually changed. Out-of-bounds writes are ignored. */
export function setPixel(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  [r, g, b, a]: RGBA
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  const i = (y * width + x) * 4
  if (buf[i] === r && buf[i + 1] === g && buf[i + 2] === b && buf[i + 3] === a) return false
  buf[i] = r
  buf[i + 1] = g
  buf[i + 2] = b
  buf[i + 3] = a
  return true
}

/** All pixels on a straight line between two points (Bresenham), both ends included. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const points: Array<[number, number]> = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0
  for (;;) {
    points.push([x, y])
    if (x === x1 && y === y1) return points
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

/**
 * Fills the area of same-coloured pixels touching (x, y) (4-way, like classic paint
 * buckets). Returns how many pixels changed.
 */
export function floodFill(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: RGBA
): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0
  const target = getPixel(buf, width, x, y)
  // Fully transparent pixels count as the same colour whatever their RGB values.
  const same = (i: number): boolean =>
    target[3] === 0
      ? buf[i + 3] === 0
      : buf[i] === target[0] && buf[i + 1] === target[1] && buf[i + 2] === target[2] && buf[i + 3] === target[3]
  if (target.every((v, k) => v === color[k]) || (target[3] === 0 && color[3] === 0)) return 0
  const region = floodRegion(width, height, [x, y], (p) => same(p * 4))
  for (const p of region) buf.set(color, p * 4)
  return region.length
}

/**
 * Every pixel reachable (4-way) from the seed points (x, y pairs) through pixels for
 * which `include` is true. Returns pixel indexes (y × width + x). This is the engine
 * behind the paint bucket, the magic eraser and background removal.
 */
export function floodRegion(width: number, height: number, seeds: number[], include: (p: number) => boolean): number[] {
  const visited = new Uint8Array(width * height)
  const region: number[] = []
  const stack = [...seeds]
  while (stack.length) {
    const py = stack.pop()!
    const px = stack.pop()!
    if (px < 0 || py < 0 || px >= width || py >= height) continue
    const p = py * width + px
    if (visited[p]) continue
    visited[p] = 1
    if (!include(p)) continue
    region.push(p)
    stack.push(px - 1, py, px + 1, py, px, py - 1, px, py + 1)
  }
  return region
}

/** Pixel-perfect resize: every output pixel copies the nearest input pixel. */
export function resizePixels(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh))
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw))
      const si = (sy * sw + sx) * 4
      out.set(src.subarray(si, si + 4), (y * dw + x) * 4)
    }
  }
  return out
}

/** How many pixels use each visible colour, keyed by the colour packed into one number. */
export function countColors(buf: Uint8ClampedArray): Map<number, number> {
  const counts = new Map<number, number>()
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue
    const key = ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

const unpack = (key: number): RGBA => [key >>> 24, (key >>> 16) & 255, (key >>> 8) & 255, key & 255]

/** Colour counts (from `countColors`) as a list, most used first. */
export const rankColors = (counts: Map<number, number>, limit = Infinity): Array<{ color: RGBA; count: number }> =>
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ color: unpack(key), count }))

/** Visible colours with how often each appears, most used first. */
export const colorsByUse = (buf: Uint8ClampedArray, limit = Infinity): Array<{ color: RGBA; count: number }> =>
  rankColors(countColors(buf), limit)

/** Distinct visible colours as hex, most used first. */
export const uniqueColors = (buf: Uint8ClampedArray, limit = Infinity): string[] =>
  colorsByUse(buf, limit).map(({ color }) => toHex(color))

// ---------- shapes ----------

/** Corners in any order → [left, top, right, bottom]. */
export function normalizeRect(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]
}

export function rectPoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Array<[number, number]> {
  const [l, t, r, b] = normalizeRect(x0, y0, x1, y1)
  const points: Array<[number, number]> = []
  for (let y = t; y <= b; y++) {
    for (let x = l; x <= r; x++) {
      if (filled || x === l || x === r || y === t || y === b) points.push([x, y])
    }
  }
  return points
}

/**
 * Ellipse that fits the box between two corners. A pixel is inside when its centre
 * is inside the ellipse; the outline is the inside pixels that touch the outside,
 * which keeps the shape symmetric and gap-free at any size.
 */
export function ellipsePoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Array<[number, number]> {
  const [l, t, r, b] = normalizeRect(x0, y0, x1, y1)
  const w = r - l + 1
  const h = b - t + 1
  const rx = w / 2
  const ry = h / 2
  const inside = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false
    const dx = (x + 0.5 - rx) / rx
    const dy = (y + 0.5 - ry) / ry
    return dx * dx + dy * dy <= 1
  }
  const points: Array<[number, number]> = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)
      if (filled || edge) points.push([l + x, t + y])
    }
  }
  // Very thin boxes have no "inside" pixel centres; fall back to the box itself.
  return points.length ? points : rectPoints(l, t, r, b, true)
}

/** Shift-drag: square box, circle, or a line snapped to 45° steps. */
export function constrainEnd(x0: number, y0: number, x1: number, y1: number, mode: 'box' | 'line'): [number, number] {
  const dx = x1 - x0
  const dy = y1 - y0
  if (mode === 'box') {
    const size = Math.max(Math.abs(dx), Math.abs(dy))
    return [x0 + Math.sign(dx || 1) * size, y0 + Math.sign(dy || 1) * size]
  }
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  const length = Math.max(Math.abs(dx), Math.abs(dy))
  const sx = Math.round(Math.cos(angle))
  const sy = Math.round(Math.sin(angle))
  return [x0 + sx * length, y0 + sy * length]
}

/** Adds the mirrored copies of each point for horizontal and/or vertical symmetry. */
export function mirrorPoints(
  points: Array<[number, number]>,
  width: number,
  height: number,
  mirrorX: boolean,
  mirrorY: boolean
): Array<[number, number]> {
  if (!mirrorX && !mirrorY) return points
  const out: Array<[number, number]> = []
  for (const [x, y] of points) {
    out.push([x, y])
    if (mirrorX) out.push([width - 1 - x, y])
    if (mirrorY) out.push([x, height - 1 - y])
    if (mirrorX && mirrorY) out.push([width - 1 - x, height - 1 - y])
  }
  return out
}

// ---------- regions (selection, copy and paste) ----------

export interface Region {
  x: number
  y: number
  w: number
  h: number
}

export function inRegion(region: Region | null, x: number, y: number): boolean {
  return !region || (x >= region.x && y >= region.y && x < region.x + region.w && y < region.y + region.h)
}

/** Copies a rectangle of pixels out into its own buffer. Parts outside the canvas come back transparent. */
export function extractRegion(buf: Uint8ClampedArray, width: number, height: number, r: Region): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(r.w * r.h * 4)
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const sx = r.x + x
      const sy = r.y + y
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
      const si = (sy * width + sx) * 4
      out.set(buf.subarray(si, si + 4), (y * r.w + x) * 4)
    }
  }
  return out
}

export function clearRegion(buf: Uint8ClampedArray, width: number, height: number, r: Region): void {
  for (let y = Math.max(0, r.y); y < Math.min(height, r.y + r.h); y++) {
    buf.fill(0, (y * width + Math.max(0, r.x)) * 4, (y * width + Math.min(width, r.x + r.w)) * 4)
  }
}

/**
 * Draws `src` (w × h) onto `buf` at (x, y). With `replace` every pixel is copied,
 * otherwise transparent source pixels leave the destination alone (a stamp).
 */
export function blitRegion(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  src: Uint8ClampedArray,
  r: Region,
  replace = false
): void {
  for (let y = 0; y < r.h; y++) {
    const dy = r.y + y
    if (dy < 0 || dy >= height) continue
    for (let x = 0; x < r.w; x++) {
      const dx = r.x + x
      if (dx < 0 || dx >= width) continue
      const si = (y * r.w + x) * 4
      if (!replace && src[si + 3] === 0) continue
      buf.set(src.subarray(si, si + 4), (dy * width + dx) * 4)
    }
  }
}

/** Flood fill that can't leak outside `region`. */
export function floodFillInRegion(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: RGBA,
  region: Region | null
): number {
  if (!region) return floodFill(buf, width, height, x, y, color)
  if (!inRegion(region, x, y)) return 0
  const local = extractRegion(buf, width, height, region)
  const changed = floodFill(local, region.w, region.h, x - region.x, y - region.y, color)
  if (changed) blitRegion(buf, width, height, local, region, true)
  return changed
}

/** Alpha-blends `src` over `dst` (same size), scaling the source alpha by `opacity`. */
export function blendOver(dst: Uint8ClampedArray, src: Uint8ClampedArray, opacity = 1): void {
  for (let i = 0; i < dst.length; i += 4) {
    const sa = (src[i + 3] / 255) * opacity
    if (sa === 0) continue
    const da = dst[i + 3] / 255
    const a = sa + da * (1 - sa)
    for (let c = 0; c < 3; c++) dst[i + c] = (src[i + c] * sa + dst[i + c] * da * (1 - sa)) / a
    dst[i + 3] = a * 255
  }
}
