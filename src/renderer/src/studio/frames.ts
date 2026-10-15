// Animation frame operations. Each returns the index of the frame to show afterwards.

import { newId, type Frame, type FrameTag, type SpriteDoc } from './model'

export const DEFAULT_DURATION = 100 // ms, i.e. 10 FPS

const emptyCels = (doc: SpriteDoc): Frame['cels'] =>
  Object.fromEntries(doc.layers.map((l) => [l.id, new Uint8ClampedArray(doc.width * doc.height * 4)]))

/** A frame was inserted right after `index`: tags after it move along, and a tag it lands inside grows. */
function tagsAfterInsert(doc: SpriteDoc, index: number): void {
  for (const t of doc.tags) {
    if (t.from > index) t.from++
    if (t.to >= index && t.from <= index + 1) t.to++
    else if (t.to > index) t.to++
  }
}

/** Adds an empty frame after `index`, with the same duration. */
export function addFrame(doc: SpriteDoc, index: number): number {
  const duration = doc.frames[index]?.duration ?? DEFAULT_DURATION
  doc.frames.splice(index + 1, 0, { id: newId(), duration, cels: emptyCels(doc) })
  tagsAfterInsert(doc, index)
  return index + 1
}

export function duplicateFrame(doc: SpriteDoc, index: number): number {
  const source = doc.frames[index]
  const cels = Object.fromEntries(Object.entries(source.cels).map(([id, px]) => [id, px.slice()]))
  doc.frames.splice(index + 1, 0, { id: newId(), duration: source.duration, cels })
  tagsAfterInsert(doc, index)
  return index + 1
}

/** Removes a frame (never the last one). Tags shrink, and a tag left with no frames goes. */
export function deleteFrame(doc: SpriteDoc, index: number): number {
  if (doc.frames.length <= 1) return index
  doc.frames.splice(index, 1)
  for (const t of doc.tags) {
    if (t.from > index) t.from--
    if (t.to >= index) t.to--
  }
  doc.tags = doc.tags.filter((t) => t.to >= t.from)
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

// ---------- tags (named animations) ----------

export const TAG_COLORS = ['#6c8cff', '#ff7a59', '#4fd18b', '#f5c542', '#c77dff', '#ff5d8f', '#3ec7d6']

/** Names a run of frames. If it overlaps tags, they are kept; engines allow that. */
export function addTag(doc: SpriteDoc, from: number, to: number, name: string): FrameTag {
  const [a, b] = from <= to ? [from, to] : [to, from]
  const tag: FrameTag = {
    id: newId(),
    name: name.trim(),
    from: Math.max(0, a),
    to: Math.min(doc.frames.length - 1, b),
    color: TAG_COLORS[doc.tags.length % TAG_COLORS.length]
  }
  doc.tags.push(tag)
  doc.tags.sort((x, y) => x.from - y.from || x.to - y.to)
  return tag
}

export function renameTag(doc: SpriteDoc, id: string, name: string): void {
  const tag = doc.tags.find((t) => t.id === id)
  if (tag && name.trim()) tag.name = name.trim()
}

export function deleteTag(doc: SpriteDoc, id: string): void {
  doc.tags = doc.tags.filter((t) => t.id !== id)
}
