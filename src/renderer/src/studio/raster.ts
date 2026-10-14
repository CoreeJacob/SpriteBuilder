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

  const visited = new Uint8Array(width * height)
  const stack = [x, y]
  let changed = 0
  while (stack.length) {
    const py = stack.pop()!
    const px = stack.pop()!
    const p = py * width + px
    if (visited[p]) continue
    visited[p] = 1
    const i = p * 4
    if (!same(i)) continue
    buf.set(color, i)
    changed++
    if (px > 0) stack.push(px - 1, py)
    if (px < width - 1) stack.push(px + 1, py)
    if (py > 0) stack.push(px, py - 1)
    if (py < height - 1) stack.push(px, py + 1)
  }
  return changed
}

/** Distinct visible colours, most used first. */
export function uniqueColors(buf: Uint8ClampedArray, limit = Infinity): string[] {
  const counts = new Map<number, number>()
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue
    const key = ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => toHex([key >>> 24, (key >>> 16) & 255, (key >>> 8) & 255, key & 255]))
}
