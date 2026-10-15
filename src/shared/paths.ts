// Helpers for library-relative paths (always forward slashes, "" = root).

import { PROJECT_SUFFIX } from './types'

export function joinRel(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name
}

export function dirnameRel(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

export function basenameRel(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase()
}

export function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i <= 0 ? name : name.slice(0, i)
}

/** `Heroes/knight.png` → `Heroes/knight.sprite.json` */
export function projectPathFor(imagePath: string): string {
  return stripExt(imagePath) + PROJECT_SUFFIX
}

/** True when `path` is `folder` itself or sits anywhere inside it. */
export function isInside(path: string, folder: string): boolean {
  if (folder === '') return true
  return path === folder || path.startsWith(folder + '/')
}

/** Points a sprite sheet's frame data at the image file it was finally saved as. */
export function withSheetImage(json: string, imageFile: string): string {
  try {
    const data = JSON.parse(json)
    if (data && typeof data === 'object' && data.meta) data.meta.image = imageFile
    return JSON.stringify(data, null, 2)
  } catch {
    return json
  }
}

/** Rejects names that would escape a folder or create hidden files. */
export function isValidName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length > 0 && !trimmed.startsWith('.') && !/[/\\:]/.test(trimmed)
}

/** "hero.png" → "hero 2.png", "hero 3.png", … until `exists` returns false. */
export function uniqueName(name: string, exists: (candidate: string) => boolean): string {
  if (!exists(name)) return name
  const lower = name.toLowerCase()
  const base = lower.endsWith(PROJECT_SUFFIX) ? name.slice(0, -PROJECT_SUFFIX.length) : stripExt(name)
  const suffix = name.slice(base.length)
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}${suffix}`
    if (!exists(candidate)) return candidate
  }
}
