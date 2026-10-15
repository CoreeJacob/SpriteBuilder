// Changing a sprite's size, across every layer and frame.

import type { SpriteDoc } from './model'
import { blitRegion } from './raster'

/** Where the existing pixels sit in the new canvas: 0 = left/top, 0.5 = centre, 1 = right/bottom. */
export type Anchor = [number, number]

/** Adds or removes space around the pixels. Pixels outside the new size are cut off. */
export function resizeCanvas(doc: SpriteDoc, width: number, height: number, [ax, ay]: Anchor): void {
  const dx = Math.round((width - doc.width) * ax)
  const dy = Math.round((height - doc.height) * ay)
  for (const frame of doc.frames) {
    for (const [id, cel] of Object.entries(frame.cels)) {
      const out = new Uint8ClampedArray(width * height * 4)
      blitRegion(out, width, height, cel, { x: dx, y: dy, w: doc.width, h: doc.height }, true)
      frame.cels[id] = out
    }
  }
  doc.width = width
  doc.height = height
}

/** Stretches the pixels to the new size (nearest neighbour, so edges stay hard). */
export function scaleSprite(doc: SpriteDoc, width: number, height: number): void {
  for (const frame of doc.frames) {
    for (const [id, cel] of Object.entries(frame.cels)) {
      const out = new Uint8ClampedArray(width * height * 4)
      for (let y = 0; y < height; y++) {
        const sy = Math.min(doc.height - 1, Math.floor(((y + 0.5) * doc.height) / height))
        for (let x = 0; x < width; x++) {
          const sx = Math.min(doc.width - 1, Math.floor(((x + 0.5) * doc.width) / width))
          const si = (sy * doc.width + sx) * 4
          out.set(cel.subarray(si, si + 4), (y * width + x) * 4)
        }
      }
      frame.cels[id] = out
    }
  }
  doc.width = width
  doc.height = height
}
