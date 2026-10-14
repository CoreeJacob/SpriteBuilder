// Copy and paste between the Studio and the Mac clipboard.

import type { ClipboardImage } from './store'

const LARGEST_PASTE = 1024

/** Also puts copied pixels on the system clipboard as a PNG, so other apps can paste them. */
export async function writeSystemClipboard(image: ClipboardImage): Promise<void> {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = image.w
    canvas.height = image.h
    canvas.getContext('2d')!.putImageData(new ImageData(image.pixels.slice() as Uint8ClampedArray<ArrayBuffer>, image.w, image.h), 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (blob) await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
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
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    return { x: 0, y: 0, w: bitmap.width, h: bitmap.height, pixels: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data }
  } catch {
    return null
  }
}
