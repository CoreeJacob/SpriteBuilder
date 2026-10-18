// Moving sprites between the Studio, the library and PNG files.

import { stripExt } from '@shared/paths'
import type { LibraryItem } from '@shared/types'
import { decideSave } from '@/app/saveTarget'
import { attempt, useApp } from '@/app/store'
import { canvasToBytes, loadImage, pixelsToCanvas, readPixels, scaleCanvas } from '@/lib/canvas'
import { itemUrl } from '@/lib/fileUrl'
import { encodeGif } from './exporters'
import { compositeFrame, docFromFrames, MAX_SIZE, parseDoc, serializeDoc, type SpriteDoc } from './model'
import { fitWithin, resizePixels } from './raster'
import { useStudio } from './store'

/** Draws one frame onto a new canvas, scaled up with hard pixel edges. */
export function frameCanvas(doc: SpriteDoc, frame = 0, scale = 1): HTMLCanvasElement {
  return scaleCanvas(pixelsToCanvas(compositeFrame(doc, frame), doc.width, doc.height), scale)
}

const pngBytes = (doc: SpriteDoc, scale = 1, frame = 0): Promise<Uint8Array> => canvasToBytes(frameCanvas(doc, frame, scale))

/** Asks before throwing away unsaved Studio work. */
export function confirmDiscard(): boolean {
  return !useStudio.getState().dirty || window.confirm('Discard unsaved changes in Pixel Studio?')
}

export async function openInStudio(item: LibraryItem): Promise<void> {
  const app = useApp.getState()
  if (!confirmDiscard()) return
  const location = { name: stripExt(item.name), folder: item.folder }

  if (item.hasProject) {
    const text = await attempt(() => window.api.readProject(item.path))
    if (text) {
      try {
        useStudio.getState().loadDoc(parseDoc(text), { ...location, savedPath: item.path })
        app.setView('studio')
        return
      } catch (err) {
        app.notify(`Couldn't read the sprite project, so the PNG was opened instead. ${(err as Error).message}`, 'error')
      }
    }
  }

  // Animated GIF/WebP/PNG: bring in every frame with its timing.
  if ((item.frames ?? 1) > 1 && ANIMATED_TYPES[item.ext]) {
    try {
      const frames = await decodeFrames(itemUrl(item), ANIMATED_TYPES[item.ext])
      const { width, height } = frames[0]
      if (width > MAX_SIZE || height > MAX_SIZE) {
        throw new Error(`Pixel Studio works on images up to ${MAX_SIZE}×${MAX_SIZE}. This one is ${width}×${height}.`)
      }
      const doc = docFromFrames(width, height, frames)
      // Saving would replace the animated file with a still PNG, so this saves as a new sprite.
      useStudio.getState().loadDoc(doc, { ...location, savedPath: null })
      useStudio.setState({ dirty: true })
      app.setView('studio')
      app.notify(`Opened ${frames.length} frames. Save makes a new sprite; the original ${item.ext.toUpperCase()} is left alone.`)
      return
    } catch (err) {
      app.notify(`${(err as Error).message} Opening the first frame instead.`, 'error')
    }
  }

  try {
    const img = await loadImage(itemUrl(item))
    const { naturalWidth: w, naturalHeight: h } = img
    if (!w || !h) throw new Error('This image has no pixel size (vector images cannot be opened in Pixel Studio)')
    if (w > MAX_SIZE || h > MAX_SIZE) {
      throw new Error(`Pixel Studio works on images up to ${MAX_SIZE}×${MAX_SIZE}. This one is ${w}×${h}.`)
    }
    const doc = docFromFrames(w, h, [{ pixels: readPixels(img, w, h), duration: 100 }])
    // Saving writes back to a PNG, so only a PNG can be updated in place.
    useStudio.getState().loadDoc(doc, { ...location, savedPath: item.ext === 'png' ? item.path : null })
    app.setView('studio')
  } catch (err) {
    app.notify((err as Error).message, 'error')
  }
}

/** Pictures bigger than this are always scaled down to fit the canvas when inserted. */
const LARGEST_INSERT = 1024

/**
 * Puts a picture (a library image or a dropped file) on a new layer, centred and still movable.
 * Animated images bring their first frame. `fit` scales it down to fit the canvas.
 */
export async function insertImage(url: string, name: string, fit: boolean): Promise<boolean> {
  const doc = useStudio.getState().doc
  const app = useApp.getState()
  if (!doc) return false
  try {
    const img = await loadImage(url)
    const { naturalWidth: w, naturalHeight: h } = img
    if (!w || !h) throw new Error('This image has no pixel size (vector images cannot be inserted).')
    const tooBig = w > LARGEST_INSERT || h > LARGEST_INSERT
    const [fw, fh] = fit || tooBig ? fitWithin(w, h, doc.width, doc.height) : [w, h]
    const pixels = readPixels(img, w, h)
    useStudio.getState().insertImage({ w: fw, h: fh, pixels: fw === w && fh === h ? pixels : resizePixels(pixels, w, h, fw, fh) }, name)
    if (tooBig && !fit) app.notify(`That image is ${w}×${h}, so it was scaled down to ${fw}×${fh} to fit.`)
    return true
  } catch (err) {
    app.notify((err as Error).message, 'error')
    return false
  }
}

const ANIMATED_TYPES: Record<string, string> = { gif: 'image/gif', webp: 'image/webp', png: 'image/apng' }

interface DecodedFrame {
  width: number
  height: number
  pixels: Uint8ClampedArray
  duration: number // ms
}

/** Decodes every frame of an animated image, fully drawn (not just the changed parts). */
async function decodeFrames(url: string, type: string): Promise<DecodedFrame[]> {
  const data = await (await fetch(url)).arrayBuffer()
  if (!(await ImageDecoder.isTypeSupported(type))) throw new Error(`Can't read the frames of this ${type} file.`)
  const decoder = new ImageDecoder({ data, type })
  try {
    await decoder.tracks.ready
    const count = decoder.tracks.selectedTrack?.frameCount ?? 1
    const frames: DecodedFrame[] = []
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i })
      const width = image.displayWidth
      const height = image.displayHeight
      // Durations come in microseconds; a missing or zero delay plays at 10 FPS like browsers do.
      frames.push({ width, height, pixels: readPixels(image, width, height), duration: image.duration ? image.duration / 1000 : 100 })
      image.close()
    }
    return frames
  } finally {
    decoder.close()
  }
}

export async function saveSprite(saveAs = false): Promise<void> {
  useStudio.getState().commitFloating() // drop any lifted pixels so they're saved
  const studio = useStudio.getState()
  const app = useApp.getState()
  if (!studio.doc) return

  let name = studio.name
  let folder = studio.folder
  let overwrite = true
  if (saveAs || !studio.savedPath) {
    const current = studio.savedPath ? `“${studio.savedPath.split('/').pop()}”` : null
    const answer = await app.askNameAndFolder({
      title: saveAs ? 'Save Sprite As' : 'Save Sprite',
      label: `Saves a PNG plus an editable .sprite.json.${current ? ` Keep the name to update ${current}.` : ''}`,
      value: studio.name,
      folder: studio.folder,
      confirmLabel: 'Save'
    })
    if (!answer) return
    const decision = decideSave(app.library?.items ?? [], answer.folder, answer.name, studio.savedPath, { mayReplaceSprites: true })
    if (decision.kind === 'replace' && !window.confirm(`“${decision.path}” already exists. Replace it?`)) return
    name = answer.name
    folder = answer.folder
    overwrite = decision.kind !== 'new'
  }

  const doc = studio.doc
  const png = await pngBytes(doc)
  const path = await attempt(() => window.api.saveSprite({ folder, name, png, project: serializeDoc(doc), overwrite }))
  if (!path) return
  const fileName = path.slice(path.lastIndexOf('/') + 1)
  useStudio.getState().markSaved({ savedPath: path, name: stripExt(fileName), folder })
  app.notify(`Saved ${fileName}`)
}

/** Exports the frame being edited as a PNG. */
export async function exportPng(scale: number): Promise<void> {
  useStudio.getState().commitFloating()
  const { doc, name, frame } = useStudio.getState()
  if (!doc) return
  const png = await pngBytes(doc, scale, frame)
  const suffix = `${doc.frames.length > 1 ? `-${frame + 1}` : ''}${scale === 1 ? '' : `@${scale}x`}`
  const saved = await attempt(() => window.api.exportPng(`${name}${suffix}.png`, png))
  if (saved) useApp.getState().notify(`Exported ${saved.slice(saved.lastIndexOf('/') + 1)}`)
}

/** Exports every frame as a GIF, or only the selected run of frames (e.g. one named animation). */
export async function exportGif(scale: number, selectedOnly = false): Promise<void> {
  useStudio.getState().commitFloating()
  const { doc, name, frameRange } = useStudio.getState()
  if (!doc) return
  const range = selectedOnly ? frameRange() : undefined
  const tag = range && doc.tags.find((t) => t.from === range[0] && t.to === range[1])
  const gif = encodeGif(doc, scale, range)
  const label = tag ? `-${tag.name}` : range ? `-${range[0] + 1}-${range[1] + 1}` : ''
  const saved = await attempt(() => window.api.exportGif(`${name}${label}${scale === 1 ? '' : `@${scale}x`}.gif`, gif))
  if (saved) useApp.getState().notify(`Exported ${saved.slice(saved.lastIndexOf('/') + 1)}`)
}
