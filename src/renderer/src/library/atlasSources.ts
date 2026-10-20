// Gathers what goes into a folder's atlas: every image in it, with every frame of animations.

import { extOf, isInside, stripExt } from '@shared/paths'
import type { LibraryItem } from '@shared/types'
import { readItemFrames } from '@/studio/io'
import type { AtlasSprite, AtlasTag } from './atlas'

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
  const input: AtlasInput = { sprites: [], tags: [], images: 0, skipped: [] }
  for (const item of chosen) {
    const rel = folder ? item.path.slice(folder.length + 1) : item.path
    try {
      if (item.ext === 'svg') throw new Error('vector image')
      const { width, height, frames, tags } = await readItemFrames(item)
      const base = stripExt(rel)
      const names = frames.length === 1 ? [rel] : frames.map((_, i) => `${base}_${i}.${extOf(rel)}`)
      frames.forEach((f, i) => input.sprites.push({ name: names[i], w: width, h: height, pixels: f.pixels, ...(frames.length > 1 ? { duration: f.duration } : {}) }))
      if (frames.length > 1) {
        // Each animation is a tag, and so is each of a Studio sprite's named frame ranges.
        input.tags.push({ name: base, from: names[0], to: names.at(-1)! })
        for (const t of tags) input.tags.push({ name: `${base}/${t.name}`, from: names[t.from], to: names[t.to] })
      }
      input.images++
    } catch {
      input.skipped.push(item.name)
    }
  }
  return input
}
