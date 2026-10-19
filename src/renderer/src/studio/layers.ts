// Layer operations. Each returns the id of the layer that should be active afterwards.

import { newId, type FrameTag, type Layer, type SpriteDoc } from './model'
import { blendOver } from './raster'

/**
 * Everything undo needs to put a layer or frame change back. Pixel buffers are shared with
 * the sprite rather than copied: changes made through this module always put new buffers in
 * place instead of painting over old ones, and drawing (which does paint in place) has its
 * own undo steps. So an unchanged layer costs nothing to remember.
 */
export interface DocState {
  width: number
  height: number
  layers: Layer[]
  frames: SpriteDoc['frames']
  tags: FrameTag[]
}

/** Copies the small parts (names, order, timings) and keeps references to the pixel buffers. */
export function snapshot(doc: Pick<SpriteDoc, keyof DocState>): DocState {
  return {
    width: doc.width,
    height: doc.height,
    tags: doc.tags.map((t) => ({ ...t })),
    layers: doc.layers.map((l) => ({ ...l })),
    frames: doc.frames.map((f) => ({ ...f, cels: { ...f.cels } }))
  }
}

export function restoreSnapshot(doc: SpriteDoc, state: DocState): void {
  // Copy again, so later edits to the sprite's layer list or timings can't change the snapshot.
  Object.assign(doc, snapshot(state))
}

/** True when two snapshots describe the same sprite (pixel buffers compared by identity). */
export function sameSnapshot(a: DocState, b: DocState): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    JSON.stringify(a.tags) === JSON.stringify(b.tags) &&
    JSON.stringify(a.layers) === JSON.stringify(b.layers) &&
    a.frames.length === b.frames.length &&
    a.frames.every((f, i) => {
      const g = b.frames[i]
      const ids = Object.keys(f.cels)
      return f.id === g.id && f.duration === g.duration && ids.length === Object.keys(g.cels).length && ids.every((id) => f.cels[id] === g.cels[id])
    })
  )
}

/** Bytes of pixels that only one of the two snapshots holds: what keeping this undo step costs. */
export function snapshotBytes(a: DocState, b: DocState): number {
  const buffers = (s: DocState): Set<Uint8ClampedArray> => new Set(s.frames.flatMap((f) => Object.values(f.cels)))
  const inA = buffers(a)
  const inB = buffers(b)
  let bytes = 0
  for (const buf of inA) if (!inB.has(buf)) bytes += buf.byteLength
  for (const buf of inB) if (!inA.has(buf)) bytes += buf.byteLength
  return bytes
}

const indexOf = (doc: SpriteDoc, id: string): number => doc.layers.findIndex((l) => l.id === id)

function nextName(doc: SpriteDoc, base: string): string {
  const names = new Set(doc.layers.map((l) => l.name))
  for (let n = doc.layers.length + 1; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`
}

/** Adds an empty layer directly above `aboveId`. */
export function addLayer(doc: SpriteDoc, aboveId: string, name = nextName(doc, 'Layer')): string {
  const layer: Layer = { id: newId(), name, visible: true, opacity: 1 }
  doc.layers.splice(indexOf(doc, aboveId) + 1, 0, layer)
  for (const f of doc.frames) f.cels[layer.id] = new Uint8ClampedArray(doc.width * doc.height * 4)
  return layer.id
}

export function duplicateLayer(doc: SpriteDoc, id: string): string {
  const i = indexOf(doc, id)
  const source = doc.layers[i]
  const copy: Layer = { ...source, id: newId(), name: `${source.name} copy` }
  doc.layers.splice(i + 1, 0, copy)
  for (const f of doc.frames) f.cels[copy.id] = (f.cels[id] ?? new Uint8ClampedArray(doc.width * doc.height * 4)).slice()
  return copy.id
}

/** Removes a layer (never the last one) and returns the layer below it, or the new bottom. */
export function deleteLayer(doc: SpriteDoc, id: string): string {
  if (doc.layers.length <= 1) return id
  const i = indexOf(doc, id)
  doc.layers.splice(i, 1)
  for (const f of doc.frames) delete f.cels[id]
  return doc.layers[Math.max(0, i - 1)].id
}

/** Moves a layer up (+1, towards the top) or down (−1). */
export function moveLayer(doc: SpriteDoc, id: string, direction: 1 | -1): string {
  const i = indexOf(doc, id)
  const j = i + direction
  if (j < 0 || j >= doc.layers.length) return id
  ;[doc.layers[i], doc.layers[j]] = [doc.layers[j], doc.layers[i]]
  return id
}

/** Drag and drop: puts a layer directly above or below another one. */
export function moveLayerTo(doc: SpriteDoc, id: string, targetId: string, position: 'above' | 'below'): string {
  if (id === targetId) return id
  const i = indexOf(doc, id)
  if (i === -1 || indexOf(doc, targetId) === -1) return id
  const [layer] = doc.layers.splice(i, 1)
  const t = indexOf(doc, targetId)
  doc.layers.splice(position === 'above' ? t + 1 : t, 0, layer)
  return id
}

/** Blends a layer into the one below it (keeping its opacity) and removes it. */
export function mergeDown(doc: SpriteDoc, id: string): string {
  const i = indexOf(doc, id)
  if (i <= 0) return id
  const top = doc.layers[i]
  const below = doc.layers[i - 1]
  for (const f of doc.frames) {
    const src = f.cels[top.id]
    const dst = f.cels[below.id]
    if (src && dst && top.visible) {
      // A new buffer, so undo can keep sharing the old one.
      const merged = dst.slice()
      blendOver(merged, src, top.opacity)
      f.cels[below.id] = merged
    }
    delete f.cels[top.id]
  }
  doc.layers.splice(i, 1)
  return below.id
}
