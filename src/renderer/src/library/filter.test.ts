import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '@shared/types'
import { DEFAULT_FILTERS, visibleItems } from './filter'

const DAY = 86_400_000
const NOW = 100 * DAY

const item = (path: string, extra: Partial<LibraryItem> = {}): LibraryItem => {
  const name = path.split('/').pop()!
  return {
    path,
    name,
    folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
    ext: name.split('.').pop()!,
    size: 1000,
    addedAt: NOW - DAY,
    modifiedAt: NOW - DAY,
    width: 16,
    height: 16,
    frames: 1,
    colorCount: 4,
    tags: [],
    favorite: false,
    rating: 0,
    notes: '',
    hasProject: false,
    ...extra
  }
}

const items = [
  item('hero.png', { tags: ['character'], favorite: true, size: 500 }),
  item('Tiles/grass.png', { tags: ['tile'], width: 32, height: 32, size: 50_000 }),
  item('Tiles/Water/water.gif', { frames: 4, size: 2_000_000, addedAt: NOW - 60 * DAY }),
  item('photo.jpeg', { width: 800, height: 600 })
]

const names = (list: LibraryItem[]): string[] => list.map((i) => i.name)
const byName = { key: 'name', dir: 'asc' } as const

describe('visibleItems', () => {
  it('scopes to a folder with and without subfolders', () => {
    expect(names(visibleItems(items, { kind: 'folder', path: 'Tiles' }, false, DEFAULT_FILTERS, byName, NOW))).toEqual([
      'grass.png'
    ])
    expect(names(visibleItems(items, { kind: 'folder', path: 'Tiles' }, true, DEFAULT_FILTERS, byName, NOW))).toEqual([
      'grass.png',
      'water.gif'
    ])
  })

  it('filters favourites, tags, type, animation, size, dimensions and date', () => {
    const run = (patch: Partial<typeof DEFAULT_FILTERS>): string[] =>
      names(visibleItems(items, { kind: 'all' }, true, { ...DEFAULT_FILTERS, ...patch }, byName, NOW))
    expect(names(visibleItems(items, { kind: 'favorites' }, true, DEFAULT_FILTERS, byName, NOW))).toEqual(['hero.png'])
    expect(run({ tags: ['tile'] })).toEqual(['grass.png'])
    expect(run({ types: ['jpg'] })).toEqual(['photo.jpeg'])
    expect(run({ animation: 'animated' })).toEqual(['water.gif'])
    expect(run({ sizeRange: 'large' })).toEqual(['water.gif'])
    expect(run({ maxDimension: 16 })).toEqual(['hero.png', 'water.gif'])
    expect(run({ addedWithin: 'month' })).toEqual(['grass.png', 'hero.png', 'photo.jpeg'])
    expect(run({ search: 'CHARACTER' })).toEqual(['hero.png'])
  })

  it('sorts by size descending', () => {
    const sorted = visibleItems(items, { kind: 'all' }, true, DEFAULT_FILTERS, { key: 'size', dir: 'desc' }, NOW)
    expect(names(sorted)).toEqual(['water.gif', 'grass.png', 'photo.jpeg', 'hero.png'])
  })
})

import { groupByFolder } from './filter'

describe('groupByFolder', () => {
  it('puts the open folder first, then subfolders in tree order, keeping the sort inside groups', () => {
    const list = [
      item('Tiles/Water/b.png'),
      item('Tiles/z.png'),
      item('Tiles/Lava/a.png'),
      item('Tiles/a.png'),
      item('Tiles/Water/Deep/c.png'),
      item('Tiles/Lava Rock/d.png')
    ]
    const groups = groupByFolder(list, 'Tiles')
    expect(groups.map((g) => g.folder)).toEqual(['Tiles', 'Tiles/Lava', 'Tiles/Lava Rock', 'Tiles/Water', 'Tiles/Water/Deep'])
    expect(groups[0].items.map((i) => i.name)).toEqual(['z.png', 'a.png']) // input order kept
  })

  it('works when the open folder has no images of its own', () => {
    expect(groupByFolder([item('A/B/x.png')], 'A').map((g) => g.folder)).toEqual(['A/B'])
  })
})
