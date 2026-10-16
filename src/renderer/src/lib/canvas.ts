// Moving pixels between raw RGBA buffers, canvases, images and PNG/JPEG bytes.
// Everything that draws, encodes or reads pixels in the UI goes through here.

/** RGBA buffers in this app are always backed by a plain ArrayBuffer, which ImageData needs. */
const asImageBuffer = (pixels: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> => pixels as Uint8ClampedArray<ArrayBuffer>

/** Sizes `canvas` to the pixels and draws them on it (for canvases already on screen). */
export function drawPixels(canvas: HTMLCanvasElement, pixels: Uint8ClampedArray, width: number, height: number): void {
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  canvas.getContext('2d')!.putImageData(new ImageData(asImageBuffer(pixels), width, height), 0, 0)
}

/** A new canvas holding the pixels. */
export function pixelsToCanvas(pixels: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  drawPixels(canvas, pixels, width, height)
  return canvas
}

/** A copy of `source` scaled up by a whole number, with hard pixel edges. */
export function scaleCanvas(source: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale === 1) return source
  const out = document.createElement('canvas')
  out.width = source.width * scale
  out.height = source.height * scale
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, 0, 0, out.width, out.height)
  return out
}

/** A new canvas with an image, bitmap or video frame drawn on it. */
export function imageToCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d', { willReadFrequently: true })!.drawImage(source, 0, 0)
  return canvas
}

/** Reads every pixel of an image, bitmap or video frame. */
export const readPixels = (source: CanvasImageSource, width: number, height: number): Uint8ClampedArray<ArrayBuffer> =>
  imageToCanvas(source, width, height).getContext('2d')!.getImageData(0, 0, width, height).data

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))), type, quality)
  )
}

export async function canvasToBytes(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Uint8Array> {
  return new Uint8Array(await (await canvasToBlob(canvas, type, quality)).arrayBuffer())
}

export const pixelsToPng = (pixels: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> =>
  canvasToBytes(pixelsToCanvas(pixels, width, height))

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
