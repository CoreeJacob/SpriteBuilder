// Turning a sprite's frames into game-ready files: animated GIFs and sprite sheets.

import { applyPalette, GIFEncoder, quantize, type Palette } from 'gifenc'
import { compositeFrame, type SpriteDoc } from './model'
import { blitRegion, resizePixels, type Region } from './raster'

/** Whole-number upscale with hard pixel edges. */
export const scalePixels = (px: Uint8ClampedArray, w: number, h: number, scale: number): Uint8ClampedArray<ArrayBuffer> =>
  resizePixels(px, w, h, w * scale, h * scale)

// ---------- GIF ----------

/**
 * Encodes the frames (all, or a range) as one looping GIF. Up to 255 colours are kept exact (most
 * pixel art); beyond that the colours are reduced. Index 0 is transparent.
 */
export function encodeGif(doc: SpriteDoc, scale = 1, range?: [number, number]): Uint8Array {
  const w = doc.width * scale
  const h = doc.height * scale
  const [first, last] = range ?? [0, doc.frames.length - 1]
  const indexes = Array.from({ length: last - first + 1 }, (_, i) => first + i)
  const frames = indexes.map((i) => scalePixels(compositeFrame(doc, i), doc.width, doc.height, scale))

  // GIF transparency is all or nothing, so semi-transparent pixels are rounded.
  const colors = new Map<number, number>()
  for (const px of frames) {
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue
      const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2]
      if (!colors.has(key)) colors.set(key, colors.size + 1)
    }
  }

  let palette: Palette
  let toIndex: (px: Uint8ClampedArray) => Uint8Array
  if (colors.size <= 255) {
    palette = [[0, 0, 0], ...[...colors.keys()].map((k) => [k >> 16, (k >> 8) & 255, k & 255])]
    toIndex = (px) => {
      const index = new Uint8Array(px.length / 4)
      for (let p = 0, i = 0; i < px.length; i += 4, p++) {
        index[p] = px[i + 3] < 128 ? 0 : colors.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2])!
      }
      return index
    }
  } else {
    const all = new Uint8ClampedArray(frames.reduce((n, f) => n + f.length, 0))
    frames.reduce((offset, f) => (all.set(f, offset), offset + f.length), 0)
    const reduced = quantize(all, 255)
    palette = [[0, 0, 0], ...reduced]
    toIndex = (px) => {
      const mapped = applyPalette(px, reduced)
      const index = new Uint8Array(mapped.length)
      for (let p = 0; p < mapped.length; p++) index[p] = px[p * 4 + 3] < 128 ? 0 : mapped[p] + 1
      return index
    }
  }
  // GIF palettes come in powers of two.
  while (palette.length & (palette.length - 1)) palette.push([0, 0, 0])

  const gif = GIFEncoder()
  frames.forEach((px, i) => {
    gif.writeFrame(toIndex(px), w, h, {
      palette: i === 0 ? palette : undefined,
      delay: doc.frames[indexes[i]].duration,
      transparent: true,
      transparentIndex: 0,
      repeat: 0
    })
  })
  gif.finish()
  return gif.bytes()
}

// ---------- sprite sheets ----------

export type SheetLayout = 'row' | 'column' | 'grid'

export interface SheetOptions {
  layout: SheetLayout
  /** Columns for the grid layout; 0 picks a near-square grid. */
  columns: number
  /** Empty pixels between frames (some engines need this to avoid bleeding). */
  padding: number
  scale: number
}

interface SheetPlan {
  width: number
  height: number
  columns: number
  rows: number
  /** Where each frame goes, in sheet pixels. */
  rects: Region[]
}

export function planSheet(frameCount: number, frameW: number, frameH: number, o: SheetOptions): SheetPlan {
  const w = frameW * o.scale
  const h = frameH * o.scale
  const columns =
    o.layout === 'row'
      ? frameCount
      : o.layout === 'column'
        ? 1
        : Math.max(1, Math.min(frameCount, o.columns || Math.ceil(Math.sqrt(frameCount))))
  const rows = Math.ceil(frameCount / columns)
  const rects = Array.from({ length: frameCount }, (_, i) => ({
    x: (i % columns) * (w + o.padding),
    y: Math.floor(i / columns) * (h + o.padding),
    w,
    h
  }))
  return { width: columns * w + (columns - 1) * o.padding, height: rows * h + (rows - 1) * o.padding, columns, rows, rects }
}

export function renderSheet(doc: SpriteDoc, plan: SheetPlan, scale: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(plan.width * plan.height * 4)
  doc.frames.forEach((_, i) => {
    const px = scalePixels(compositeFrame(doc, i), doc.width, doc.height, scale)
    blitRegion(out, plan.width, plan.height, px, plan.rects[i], true)
  })
  return out
}

/**
 * Frame data in the JSON-hash format Aseprite and TexturePacker write, which Phaser,
 * Godot importers, PixiJS and most other engines can read.
 */
export function sheetJson(doc: SpriteDoc, plan: SheetPlan, name: string, imageFile: string, scale: number): string {
  const frames = Object.fromEntries(
    plan.rects.map((r, i) => [
      `${name} ${i}`,
      {
        frame: { x: r.x, y: r.y, w: r.w, h: r.h },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
        sourceSize: { w: r.w, h: r.h },
        duration: doc.frames[i].duration
      }
    ])
  )
  return JSON.stringify(
    {
      frames,
      meta: {
        app: 'SpriteBuilder',
        version: '1.0',
        image: imageFile,
        format: 'RGBA8888',
        size: { w: plan.width, h: plan.height },
        scale: String(scale),
        // Named animations; a sprite with none is one animation named after the sprite.
        frameTags: doc.tags.length
          ? doc.tags.map((t) => ({ name: t.name, from: t.from, to: t.to, direction: 'forward', color: t.color }))
          : [{ name, from: 0, to: plan.rects.length - 1, direction: 'forward' }]
      }
    },
    null,
    2
  )
}
