// Copy and paste between the Studio and the Mac clipboard.

import { canvasToBlob, pixelsToCanvas, readPixels } from '@/lib/canvas'
import type { ClipboardImage } from './store'

const LARGEST_PASTE = 1024

/** Also puts copied pixels on the system clipboard as a PNG, so other apps can paste them. */
export async function writeSystemClipboard(image: ClipboardImage): Promise<void> {
  try {
    const blob = await canvasToBlob(pixelsToCanvas(image.pixels, image.w, image.h))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  } catch {
    // The Studio's own clipboard still works if the system one refuses.
  }
}

/** The image in a paste event, if there is one. */
export async function readPastedImage(e: ClipboardEvent): Promise<ClipboardImage | null> {
  const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
  if (!file) return null
  try {
    const bitmap = await createImageBitmap(file)
    if (bitmap.width > LARGEST_PASTE || bitmap.height > LARGEST_PASTE) return null
    return { x: 0, y: 0, w: bitmap.width, h: bitmap.height, pixels: readPixels(bitmap, bitmap.width, bitmap.height) }
  } catch {
    return null
  }
}
