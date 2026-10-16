// Measures items the library hasn't measured yet (pixel size and colour count)
// and stores the results in the library index.

import { useEffect } from 'react'
import type { ComputedMeta, LibraryItem } from '@shared/types'
import { loadImage, readPixels } from '@/lib/canvas'
import { itemUrl } from '@/lib/fileUrl'
import { countColors } from '@/studio/raster'

const MAX_COUNT_PIXELS = 512 * 512
const BATCH = 16
const attempted = new Set<string>()

async function measure(item: LibraryItem): Promise<ComputedMeta> {
  try {
    const img = await loadImage(itemUrl(item))
    const width = img.naturalWidth
    const height = img.naturalHeight
    let colorCount: number | null = null
    if (item.ext !== 'svg' && width && height && width * height <= MAX_COUNT_PIXELS) {
      colorCount = countColors(readPixels(img, width, height)).size
    }
    return { path: item.path, width, height, colorCount }
  } catch {
    return { path: item.path, width: 0, height: 0, colorCount: null }
  }
}

export function useEnrichment(items: LibraryItem[] | undefined): void {
  useEffect(() => {
    if (!items) return
    // Claim items up front so a re-render while a batch is in flight doesn't measure them twice.
    const pending = items.filter((i) => i.width === null && !attempted.has(`${i.path}@${i.modifiedAt}`))
    pending.forEach((item) => attempted.add(`${item.path}@${item.modifiedAt}`))
    void (async () => {
      for (let i = 0; i < pending.length; i += BATCH) {
        const results = await Promise.all(pending.slice(i, i + BATCH).map(measure))
        await window.api.setComputedMeta(results).catch(() => undefined)
      }
    })()
  }, [items])
}
