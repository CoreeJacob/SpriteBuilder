// Deciding what "Save As" / "Save as Copy" should do with the name and folder chosen.

import { joinRel, stripExt } from '@shared/paths'
import type { LibraryItem } from '@shared/types'

type SaveDecision =
  /** Nothing there yet: make a new file. */
  | { kind: 'new'; path: string }
  /** The same file that's open: just save over it. */
  | { kind: 'self'; path: string }
  /** A different existing file: ask before replacing it. */
  | { kind: 'replace'; path: string }
  /** A file that mustn't be overwritten from here. */
  | { kind: 'blocked'; path: string; reason: string }

export function decideSave(
  items: LibraryItem[],
  folder: string,
  name: string,
  currentPath: string | null,
  /** Pixel Studio writes a project with the PNG, so it may replace sprites; the editor may not. */
  { mayReplaceSprites }: { mayReplaceSprites: boolean }
): SaveDecision {
  const path = joinRel(folder, `${stripExt(name.trim())}.png`)
  // macOS folders ignore case, so "Hero.png" and "hero.png" are the same file.
  const existing = items.find((i) => i.path.toLowerCase() === path.toLowerCase())
  if (!existing) return { kind: 'new', path }
  if (existing.hasProject && !mayReplaceSprites) {
    return {
      kind: 'blocked',
      path: existing.path,
      reason: `“${existing.name}” is a Pixel Studio sprite, so it can’t be replaced from here. Choose another name, or edit it in Pixel Studio.`
    }
  }
  if (currentPath && existing.path.toLowerCase() === currentPath.toLowerCase()) return { kind: 'self', path: existing.path }
  return { kind: 'replace', path: existing.path }
}
