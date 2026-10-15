// The Pixel Studio document and its `.sprite.json` file format.
// Frames are part of the format from the start; the Studio edits frame 0 until
// animation arrives.

import { DEFAULT_PALETTE, type Palette } from './palettes'
import { blendOver, uniqueColors } from './raster'

export interface Layer {
  id: string
  name: string
  visible: boolean
  opacity: number // 0–1
}

export interface Frame {
  id: string
  duration: number // milliseconds
  /** Pixels per layer id, RGBA, width × height × 4 bytes. */
  cels: Record<string, Uint8ClampedArray>
}

/** A named run of frames, such as "walk" or "idle" (inclusive indexes). */
export interface FrameTag {
  id: string
  name: string
  from: number
  to: number
  color: string
}

export interface SpriteDoc {
  width: number
  height: number
  palette: Palette
  layers: Layer[] // bottom first
  frames: Frame[]
  tags: FrameTag[]
}

export const FILE_FORMAT = 'spritebuilder-sprite'
export const MAX_SIZE = 512

export const newId = (): string => Math.random().toString(36).slice(2, 10)

export function createDoc(width: number, height: number, palette: Palette = DEFAULT_PALETTE): SpriteDoc {
  const layer: Layer = { id: newId(), name: 'Layer 1', visible: true, opacity: 1 }
  return {
    width,
    height,
    palette: { name: palette.name, colors: [...palette.colors] },
    layers: [layer],
    frames: [{ id: newId(), duration: 100, cels: { [layer.id]: new Uint8ClampedArray(width * height * 4) } }],
    tags: []
  }
}

/** A one-layer document from existing pixels, with a palette of the colours it uses. */
export function docFromPixels(width: number, height: number, pixels: Uint8ClampedArray): SpriteDoc {
  const doc = createDoc(width, height)
  doc.frames[0].cels[doc.layers[0].id].set(pixels)
  const colors = uniqueColors(pixels, 64)
  if (colors.length) doc.palette = { name: 'Image colours', colors }
  return doc
}

/** A one-layer animation from a list of frames, with a palette of the colours they use. */
export function docFromFrames(width: number, height: number, frames: Array<{ pixels: Uint8ClampedArray; duration: number }>): SpriteDoc {
  const doc = createDoc(width, height)
  const layer = doc.layers[0].id
  doc.frames = frames.map((f) => ({
    id: newId(),
    duration: Math.round(Math.max(10, Math.min(10000, f.duration || 100))),
    cels: { [layer]: f.pixels.slice() }
  }))
  const all = new Uint8ClampedArray(frames.reduce((n, f) => n + f.pixels.length, 0))
  frames.reduce((offset, f) => (all.set(f.pixels, offset), offset + f.pixels.length), 0)
  const colors = uniqueColors(all, 64)
  if (colors.length) doc.palette = { name: 'Image colours', colors }
  return doc
}

/** Blends the visible layers of one frame into a single RGBA buffer. */
export function compositeFrame(doc: SpriteDoc, frameIndex = 0): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(doc.width * doc.height * 4)
  const frame = doc.frames[frameIndex]
  for (const layer of doc.layers) {
    const cel = frame.cels[layer.id]
    if (layer.visible && cel) blendOver(out, cel, layer.opacity)
  }
  return out
}

function toBase64(bytes: Uint8ClampedArray): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(text: string): Uint8ClampedArray {
  const binary = atob(text)
  const bytes = new Uint8ClampedArray(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function serializeDoc(doc: SpriteDoc): string {
  return JSON.stringify({
    format: FILE_FORMAT,
    version: 1,
    width: doc.width,
    height: doc.height,
    palette: doc.palette,
    layers: doc.layers,
    tags: doc.tags,
    frames: doc.frames.map((f) => ({
      id: f.id,
      duration: f.duration,
      cels: Object.fromEntries(Object.entries(f.cels).map(([id, px]) => [id, toBase64(px)]))
    }))
  })
}

export function parseDoc(text: string): SpriteDoc {
  const raw = JSON.parse(text)
  if (raw?.format !== FILE_FORMAT || raw.version !== 1) throw new Error('This is not a SpriteBuilder sprite file')
  const { width, height } = raw
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('The sprite file has an invalid size')
  }
  const expected = width * height * 4
  const doc: SpriteDoc = {
    width,
    height,
    palette: raw.palette ?? DEFAULT_PALETTE,
    layers: raw.layers,
    // Tags arrived after the first files were saved, so they may be missing.
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t: FrameTag) => t && typeof t.name === 'string') : [],
    frames: raw.frames.map((f: { id: string; duration: number; cels: Record<string, string> }) => ({
      id: f.id,
      duration: f.duration,
      cels: Object.fromEntries(
        Object.entries(f.cels).map(([id, b64]) => {
          const px = fromBase64(b64)
          if (px.length !== expected) throw new Error('The sprite file is damaged (wrong pixel count)')
          return [id, px]
        })
      )
    }))
  }
  if (!doc.layers?.length || !doc.frames?.length) throw new Error('The sprite file has no layers or frames')
  return doc
}
