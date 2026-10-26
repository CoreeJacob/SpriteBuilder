// Gathers what goes into a folder's atlas: every image in it, with every frame of animations.

import { extOf, isInside, stripExt } from '@shared/paths'
import type { LibraryItem } from '@shared/types'
import { mapLimited } from '@/lib/async'
import { readItemFrames } from '@/studio/io'
import type { AtlasSprite, AtlasTag } from './atlas'

/** How many images are read at the same time. */
const READS_AT_ONCE = 8

export interface AtlasInput {
  sprites: AtlasSprite[]
  tags: AtlasTag[]
  /** How many library images the sprites came from. */
  images: number
  /** Images that couldn't be read (vector images, damaged files). */
  skipped: string[]
}

/**
 * The images in `folder` (and its subfolders if asked), skipping atlases (so an atlas never packs
 * itself or another one). Frames are named by their path inside the folder, like "bat.png", with
 * animation frames numbered: "walk_0.png", "walk_1.png"…
 */
export async function collectAtlasInput(items: LibraryItem[], folder: string, includeSubfolders: boolean, atlases: string[]): Promise<AtlasInput> {
  const skip = new Set(atlases)
  const chosen = items
    .filter((i) => (includeSubfolders ? isInside(i.path, folder) : i.folder === folder) && !skip.has(i.path))
    .sort((a, b) => a.path.localeCompare(b.path))
  // Read several images at once (they're independent), then add them in order so the atlas never changes.
  const read = await mapLimited(chosen, READS_AT_ONCE, (item) => (item.ext === 'svg' ? Promise.reject(new Error('vector image')) : readItemFrames(item)).catch(() => null))
  const input: AtlasInput = { sprites: [], tags: [], images: 0, skipped: [] }
  chosen.forEach((item, n) => {
    const result = read[n]
    if (!result) return void input.skipped.push(item.name)
    const rel = folder ? item.path.slice(folder.length + 1) : item.path
    const { width, height, frames, tags } = result
    const base = stripExt(rel)
    const names = frames.length === 1 ? [rel] : frames.map((_, i) => `${base}_${i}.${extOf(rel)}`)
    frames.forEach((f, i) => input.sprites.push({ name: names[i], w: width, h: height, pixels: f.pixels, ...(frames.length > 1 ? { duration: f.duration } : {}) }))
    if (frames.length > 1) {
      // Each animation is a tag, and so is each of a Studio sprite's named frame ranges.
      input.tags.push({ name: base, from: names[0], to: names.at(-1)! })
      for (const t of tags) input.tags.push({ name: `${base}/${t.name}`, from: names[t.from], to: names[t.to] })
    }
    input.images++
  })
  return input
}
