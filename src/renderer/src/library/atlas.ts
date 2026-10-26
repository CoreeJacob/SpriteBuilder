// Texture atlases: many sprites packed tightly into one image, plus JSON saying where each one is
// (the TexturePacker / Aseprite "hash" format the sprite sheet export also uses).

import type { AtlasOptions } from '@shared/types'
import { blitRegion, extractRegion, opaqueBounds, type Region } from '@/studio/raster'

export const DEFAULT_ATLAS_OPTIONS: AtlasOptions = { maxSize: 2048, padding: 2, trim: true, powerOfTwo: false, includeSubfolders: true }

/** One picture to pack: a still image, or one frame of an animation. */
export interface AtlasSprite {
  name: string
  w: number
  h: number
  pixels: Uint8ClampedArray
  duration?: number
}

/** A named run of frames in the atlas, such as one sprite's animation. */
export interface AtlasTag {
  name: string
  /** Names of the first and last frames. */
  from: string
  to: string
}

interface Size {
  w: number
  h: number
}

const overlaps = (a: Region, b: Region): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const contains = (a: Region, b: Region): boolean => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h

/**
 * Places rectangles in a binW × binH area (the "MaxRects" method with best-short-side fit, which
 * packs tightly). Returns each one's top-left corner in the input order, or null if they don't fit.
 */
function maxRects(sizes: Size[], binW: number, binH: number): Array<[number, number]> | null {
  let free: Region[] = [{ x: 0, y: 0, w: binW, h: binH }]
  // Biggest first packs best; ties keep the input order so results never change between runs.
  const order = sizes.map((_, i) => i).sort((a, b) => Math.max(sizes[b].w, sizes[b].h) - Math.max(sizes[a].w, sizes[a].h) || sizes[b].w * sizes[b].h - sizes[a].w * sizes[a].h || a - b)
  const placed: Array<[number, number]> = new Array(sizes.length)
  for (const i of order) {
    const { w, h } = sizes[i]
    let best: Region | null = null
    let bestShort = Infinity
    let bestLong = Infinity
    for (const f of free) {
      if (w > f.w || h > f.h) continue
      const short = Math.min(f.w - w, f.h - h)
      const long = Math.max(f.w - w, f.h - h)
      if (short < bestShort || (short === bestShort && (long < bestLong || (long === bestLong && best && (f.y < best.y || (f.y === best.y && f.x < best.x)))))) {
        ;[best, bestShort, bestLong] = [f, short, long]
      }
    }
    if (!best) return null
    const r: Region = { x: best.x, y: best.y, w, h }
    placed[i] = [r.x, r.y]
    // Cut the placed rectangle out of every free space it overlaps…
    const kept: Region[] = []
    const created: Region[] = []
    for (const f of free) {
      if (!overlaps(f, r)) {
        kept.push(f)
        continue
      }
      if (r.x > f.x) created.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h })
      if (r.x + r.w < f.x + f.w) created.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h })
      if (r.y > f.y) created.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y })
      if (r.y + r.h < f.y + f.h) created.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h })
    }
    // …then drop new spaces that sit entirely inside another. Only the new ones need checking: the
    // untouched ones were never inside each other, and can't be inside a piece of a space they weren't in.
    const fresh = created.filter((a, ai) => !kept.some((b) => contains(b, a)) && !created.some((b, bi) => bi !== ai && contains(b, a) && (!contains(a, b) || bi < ai)))
    free = kept.concat(fresh)
  }
  return placed
}

const nextPowerOfTwo = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, n)))

export interface Packing {
  width: number
  height: number
  /** Top-left corner of each rectangle, in the order given. */
  positions: Array<[number, number]>
}

/**
 * Finds a small, roughly square atlas the rectangles fit in (no bigger than `maxSize` on either
 * side), with `padding` empty pixels between neighbours. Square-ish atlases suit engines and
 * graphics cards best; a long thin strip runs into the size limit far sooner.
 */
export function pack(sizes: Size[], { maxSize, padding, powerOfTwo }: Pick<AtlasOptions, 'maxSize' | 'padding' | 'powerOfTwo'>): Packing | null {
  if (!sizes.length) return null
  const widest = Math.max(...sizes.map((s) => s.w))
  const tallest = Math.max(...sizes.map((s) => s.h))
  if (widest > maxSize || tallest > maxSize) return null
  // Each rectangle carries its gap on the right and bottom; the bin grows by one gap to match.
  const padded = sizes.map(({ w, h }) => ({ w: w + padding, h: h + padding }))
  const area = padded.reduce((a, s) => a + s.w * s.h, 0)
  const tryBin = (w: number, h: number) => maxRects(padded, w + padding, h + padding)
  const finish = (positions: Array<[number, number]>): Packing => {
    // Crop to the space actually used.
    let width = Math.max(...positions.map(([x], i) => x + sizes[i].w))
    let height = Math.max(...positions.map(([, y], i) => y + sizes[i].h))
    if (powerOfTwo) [width, height] = [nextPowerOfTwo(width), nextPowerOfTwo(height)]
    return { width, height, positions }
  }

  if (powerOfTwo) {
    // Power-of-two sizes from smallest up (squarer first when the same size), until one fits.
    const sides: number[] = []
    for (let n = 1; n <= maxSize; n *= 2) sides.push(n)
    const bins = sides
      .flatMap((w) => sides.map((h) => [w, h] as const))
      .filter(([w, h]) => w >= widest && h >= tallest && (w + padding) * (h + padding) >= area)
      .sort((a, b) => a[0] * a[1] - b[0] * b[1] || Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]))
    for (const [w, h] of bins) {
      const positions = tryBin(w, h)
      if (positions) return finish(positions)
    }
    return null
  }

  // The smallest square that holds them all: halve the gap between "too small" and "fits" each try.
  let fitting = tryBin(maxSize, maxSize)
  if (!fitting) return null
  let lo = Math.max(widest, tallest, Math.ceil(Math.sqrt(area)) - padding)
  let hi = maxSize
  while (lo < hi) {
    const side = Math.floor((lo + hi) / 2)
    const positions = tryBin(side, side)
    if (positions) [hi, fitting] = [side, positions]
    else lo = side + 1
  }
  return finish(fitting)
}

export interface Atlas extends Packing {
  pixels: Uint8ClampedArray<ArrayBuffer>
  frames: Array<{ name: string; frame: Region; source: Region; sourceSize: Size; duration?: number }>
}

/** Trims (if asked), packs and draws the sprites. Null when they can't fit in `maxSize`. */
export function buildAtlas(sprites: AtlasSprite[], options: AtlasOptions): Atlas | null {
  // A fully transparent sprite still gets a 1×1 spot, so engines can find every name.
  const parts = sprites.map((s) => ({ sprite: s, area: (options.trim ? opaqueBounds(s.pixels, s.w, s.h) ?? { x: 0, y: 0, w: 1, h: 1 } : { x: 0, y: 0, w: s.w, h: s.h }) }))
  const packing = pack(parts.map((p) => p.area), options)
  if (!packing) return null
  const pixels = new Uint8ClampedArray(packing.width * packing.height * 4)
  const frames = parts.map(({ sprite, area }, i) => {
    const [x, y] = packing.positions[i]
    blitRegion(pixels, packing.width, packing.height, extractRegion(sprite.pixels, sprite.w, sprite.h, area), { x, y, w: area.w, h: area.h }, true)
    return { name: sprite.name, frame: { x, y, w: area.w, h: area.h }, source: area, sourceSize: { w: sprite.w, h: sprite.h }, duration: sprite.duration }
  })
  return { ...packing, pixels, frames }
}

/** The atlas's JSON, in the same format as the sprite sheet export. */
export function atlasJson(atlas: Atlas, imageFile: string, tags: AtlasTag[]): string {
  const index = new Map(atlas.frames.map((f, i) => [f.name, i]))
  return JSON.stringify(
    {
      frames: Object.fromEntries(
        atlas.frames.map((f) => [
          f.name,
          {
            frame: f.frame,
            rotated: false,
            trimmed: f.source.w !== f.sourceSize.w || f.source.h !== f.sourceSize.h,
            spriteSourceSize: f.source,
            sourceSize: f.sourceSize,
            ...(f.duration === undefined ? {} : { duration: f.duration })
          }
        ])
      ),
      meta: {
        app: 'SpriteBuilder',
        version: '1.0',
        image: imageFile,
        format: 'RGBA8888',
        size: { w: atlas.width, h: atlas.height },
        scale: '1',
        frameTags: tags.map((t) => ({ name: t.name, from: index.get(t.from), to: index.get(t.to), direction: 'forward' }))
      }
    },
    null,
    2
  )
}
