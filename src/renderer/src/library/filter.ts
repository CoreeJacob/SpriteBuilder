// Pure filtering and sorting for the library view.

import { isInside } from '@shared/paths'
import type { LibraryItem } from '@shared/types'

export type Scope = { kind: 'all' } | { kind: 'favorites' } | { kind: 'folder'; path: string }

export type SizeRange = 'any' | 'tiny' | 'small' | 'medium' | 'large'
export type AddedWithin = 'any' | 'day' | 'week' | 'month' | 'year'
export type Animation = 'any' | 'animated' | 'static'

export interface LibraryFilters {
  search: string
  types: string[] // empty = any type
  animation: Animation
  sizeRange: SizeRange
  /** Only items whose width and height both fit within this many pixels. */
  maxDimension: number | null
  addedWithin: AddedWithin
  tags: string[] // item must have every tag listed
  minRating: number
  projectsOnly: boolean
}

export type SortKey =
  | 'name'
  | 'size'
  | 'addedAt'
  | 'modifiedAt'
  | 'dimensions'
  | 'colorCount'
  | 'type'
  | 'rating'

export interface SortOrder {
  key: SortKey
  dir: 'asc' | 'desc'
}

export const DEFAULT_FILTERS: LibraryFilters = {
  search: '',
  types: [],
  animation: 'any',
  sizeRange: 'any',
  maxDimension: null,
  addedWithin: 'any',
  tags: [],
  minRating: 0,
  projectsOnly: false
}

export const SIZE_RANGES: Record<Exclude<SizeRange, 'any'>, { label: string; min: number; max: number }> = {
  tiny: { label: 'Under 10 KB', min: 0, max: 10 * 1024 },
  small: { label: '10–100 KB', min: 10 * 1024, max: 100 * 1024 },
  medium: { label: '100 KB–1 MB', min: 100 * 1024, max: 1024 * 1024 },
  large: { label: 'Over 1 MB', min: 1024 * 1024, max: Infinity }
}

const DAY = 24 * 60 * 60 * 1000
export const ADDED_WITHIN: Record<Exclude<AddedWithin, 'any'>, { label: string; ms: number }> = {
  day: { label: 'Today', ms: DAY },
  week: { label: 'Past week', ms: 7 * DAY },
  month: { label: 'Past month', ms: 30 * DAY },
  year: { label: 'Past year', ms: 365 * DAY }
}

/** jpg and jpeg are one type as far as the user is concerned. */
export const normalizeType = (ext: string): string => (ext === 'jpeg' ? 'jpg' : ext)

export function countActiveFilters(f: LibraryFilters): number {
  return (
    (f.types.length ? 1 : 0) +
    (f.animation !== 'any' ? 1 : 0) +
    (f.sizeRange !== 'any' ? 1 : 0) +
    (f.maxDimension !== null ? 1 : 0) +
    (f.addedWithin !== 'any' ? 1 : 0) +
    (f.tags.length ? 1 : 0) +
    (f.minRating > 0 ? 1 : 0) +
    (f.projectsOnly ? 1 : 0)
  )
}

export function inScope(item: LibraryItem, scope: Scope, includeSubfolders: boolean): boolean {
  switch (scope.kind) {
    case 'all':
      return true
    case 'favorites':
      return item.favorite
    case 'folder':
      return includeSubfolders ? isInside(item.folder, scope.path) : item.folder === scope.path
  }
}

export function matchesFilters(item: LibraryItem, f: LibraryFilters, now: number): boolean {
  const query = f.search.trim().toLowerCase()
  if (query) {
    const haystack = [item.name, item.folder, item.notes, ...item.tags].join(' ').toLowerCase()
    if (!query.split(/\s+/).every((word) => haystack.includes(word))) return false
  }
  if (f.types.length && !f.types.includes(normalizeType(item.ext))) return false
  if (f.animation === 'animated' && !((item.frames ?? 1) > 1)) return false
  if (f.animation === 'static' && (item.frames ?? 1) > 1) return false
  if (f.sizeRange !== 'any') {
    const { min, max } = SIZE_RANGES[f.sizeRange]
    if (item.size < min || item.size >= max) return false
  }
  if (f.maxDimension !== null) {
    if (item.width === null || item.height === null) return false
    if (item.width > f.maxDimension || item.height > f.maxDimension) return false
  }
  if (f.addedWithin !== 'any' && now - item.addedAt > ADDED_WITHIN[f.addedWithin].ms) return false
  if (f.tags.length && !f.tags.every((t) => item.tags.includes(t))) return false
  if (item.rating < f.minRating) return false
  if (f.projectsOnly && !item.hasProject) return false
  return true
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function compare(a: LibraryItem, b: LibraryItem, key: SortKey): number {
  switch (key) {
    case 'name':
      return collator.compare(a.name, b.name)
    case 'size':
      return a.size - b.size
    case 'addedAt':
      return a.addedAt - b.addedAt
    case 'modifiedAt':
      return a.modifiedAt - b.modifiedAt
    case 'dimensions':
      return (a.width ?? 0) * (a.height ?? 0) - (b.width ?? 0) * (b.height ?? 0)
    case 'colorCount':
      return (a.colorCount ?? -1) - (b.colorCount ?? -1)
    case 'type':
      return collator.compare(normalizeType(a.ext), normalizeType(b.ext))
    case 'rating':
      return a.rating - b.rating
  }
}

export function sortItems(items: LibraryItem[], order: SortOrder): LibraryItem[] {
  const sign = order.dir === 'asc' ? 1 : -1
  // Ties fall back to name so the order is stable and predictable.
  return [...items].sort((a, b) => sign * compare(a, b, order.key) || collator.compare(a.name, b.name))
}

export function visibleItems(
  items: LibraryItem[],
  scope: Scope,
  includeSubfolders: boolean,
  filters: LibraryFilters,
  order: SortOrder,
  now = Date.now()
): LibraryItem[] {
  return sortItems(
    items.filter((item) => inScope(item, scope, includeSubfolders) && matchesFilters(item, filters, now)),
    order
  )
}

export function allTags(items: LibraryItem[]): string[] {
  return [...new Set(items.flatMap((i) => i.tags))].sort(collator.compare)
}

export interface FolderGroup {
  folder: string
  items: LibraryItem[]
}

/**
 * Splits items into one group per folder: the open folder's own images first, then
 * each subfolder in tree order. Order inside a group follows the current sort.
 */
export function groupByFolder(items: LibraryItem[], openFolder: string): FolderGroup[] {
  const groups = new Map<string, LibraryItem[]>()
  for (const item of items) {
    const list = groups.get(item.folder)
    if (list) list.push(item)
    else groups.set(item.folder, [item])
  }
  // Sorting folder paths piece by piece keeps parents directly above their children.
  const key = (folder: string): string[] => folder.split('/').map((p) => p.toLowerCase())
  const compare = (a: string, b: string): number => {
    if (a === openFolder) return -1
    if (b === openFolder) return 1
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
      const c = collator.compare(ka[i], kb[i])
      if (c) return c
    }
    return ka.length - kb.length
  }
  return [...groups.keys()].sort(compare).map((folder) => ({ folder, items: groups.get(folder)! }))
}
