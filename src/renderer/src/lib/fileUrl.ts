import type { LibraryItem } from '@shared/types'

/** URL the UI uses to load a library file. The version query busts the cache after edits. */
export function itemUrl(item: Pick<LibraryItem, 'path' | 'modifiedAt'>): string {
  const encoded = item.path.split('/').map(encodeURIComponent).join('/')
  return `sprite://library/${encoded}?v=${item.modifiedAt}`
}

/** Loads an image so its pixels can be read from a canvas. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${url}`))
    img.src = url
  })
}
