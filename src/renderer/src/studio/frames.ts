// Animation frame operations. Each returns the index of the frame to show afterwards.

import { newId, type Frame, type SpriteDoc } from './model'

export const DEFAULT_DURATION = 100 // ms, i.e. 10 FPS

const emptyCels = (doc: SpriteDoc): Frame['cels'] =>
  Object.fromEntries(doc.layers.map((l) => [l.id, new Uint8ClampedArray(doc.width * doc.height * 4)]))

/** Adds an empty frame after `index`, with the same duration. */
export function addFrame(doc: SpriteDoc, index: number): number {
  const duration = doc.frames[index]?.duration ?? DEFAULT_DURATION
  doc.frames.splice(index + 1, 0, { id: newId(), duration, cels: emptyCels(doc) })
  return index + 1
}

export function duplicateFrame(doc: SpriteDoc, index: number): number {
  const source = doc.frames[index]
  const cels = Object.fromEntries(Object.entries(source.cels).map(([id, px]) => [id, px.slice()]))
  doc.frames.splice(index + 1, 0, { id: newId(), duration: source.duration, cels })
  return index + 1
}

/** Removes a frame (never the last one). */
export function deleteFrame(doc: SpriteDoc, index: number): number {
  if (doc.frames.length <= 1) return index
  doc.frames.splice(index, 1)
  return Math.min(index, doc.frames.length - 1)
}

/** Drag and drop: moves the frame at `from` so it ends up at position `to`. */
export function moveFrame(doc: SpriteDoc, from: number, to: number): number {
  const target = Math.max(0, Math.min(doc.frames.length - 1, to))
  if (from === target) return from
  const [frame] = doc.frames.splice(from, 1)
  doc.frames.splice(target, 0, frame)
  return target
}

export function setDuration(doc: SpriteDoc, index: number, ms: number): void {
  doc.frames[index].duration = clampDuration(ms)
}

/** Sets every frame to the same speed. */
export function setFps(doc: SpriteDoc, fps: number): void {
  const ms = clampDuration(1000 / Math.max(1, Math.min(60, fps)))
  for (const f of doc.frames) f.duration = ms
}

export const clampDuration = (ms: number): number => Math.round(Math.max(10, Math.min(10000, ms || DEFAULT_DURATION)))

/** The FPS if every frame shares one duration, otherwise null. */
export function sharedFps(doc: SpriteDoc): number | null {
  const first = doc.frames[0].duration
  return doc.frames.every((f) => f.duration === first) ? Math.round(1000 / first) : null
}
