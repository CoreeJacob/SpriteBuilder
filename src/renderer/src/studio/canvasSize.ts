// Changing a sprite's size, across every layer and frame.

import type { SpriteDoc } from './model'
import { blitRegion, resizePixels } from './raster'

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
    for (const [id, cel] of Object.entries(frame.cels)) frame.cels[id] = resizePixels(cel, doc.width, doc.height, width, height)
  }
  doc.width = width
  doc.height = height
}
