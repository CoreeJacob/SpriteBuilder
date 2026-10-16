import type { LibraryItem } from '@shared/types'

/** URL the UI uses to load a library file. The version query busts the cache after edits. */
export function itemUrl(item: Pick<LibraryItem, 'path' | 'modifiedAt'>): string {
  const encoded = item.path.split('/').map(encodeURIComponent).join('/')
  return `sprite://library/${encoded}?v=${item.modifiedAt}`
}
