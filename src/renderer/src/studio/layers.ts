// Layer operations. Each returns the id of the layer that should be active afterwards.

import { newId, type Layer, type SpriteDoc } from './model'
import { blendOver } from './raster'

/** A deep copy of everything undo needs to restore after a layer change. */
export interface DocState {
  layers: Layer[]
  frames: SpriteDoc['frames']
}

export function cloneState(doc: SpriteDoc): DocState {
  return {
    layers: doc.layers.map((l) => ({ ...l })),
    frames: doc.frames.map((f) => ({
      ...f,
      cels: Object.fromEntries(Object.entries(f.cels).map(([id, px]) => [id, px.slice()]))
    }))
  }
}

export function restoreState(doc: SpriteDoc, state: DocState): void {
  const copy = cloneState({ ...doc, ...state })
  doc.layers = copy.layers
  doc.frames = copy.frames
}

const indexOf = (doc: SpriteDoc, id: string): number => doc.layers.findIndex((l) => l.id === id)

function nextName(doc: SpriteDoc, base: string): string {
  const names = new Set(doc.layers.map((l) => l.name))
  for (let n = doc.layers.length + 1; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`
}

/** Adds an empty layer directly above `aboveId`. */
export function addLayer(doc: SpriteDoc, aboveId: string): string {
  const layer: Layer = { id: newId(), name: nextName(doc, 'Layer'), visible: true, opacity: 1 }
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
    if (src && dst && top.visible) blendOver(dst, src, top.opacity)
    delete f.cels[top.id]
  }
  doc.layers.splice(i, 1)
  return below.id
}
