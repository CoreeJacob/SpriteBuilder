// Moving sprites between the Studio, the library and PNG files.

import { stripExt } from '@shared/paths'
import type { LibraryItem } from '@shared/types'
import { attempt, useApp } from '@/app/store'
import { itemUrl, loadImage } from '@/lib/fileUrl'
import { encodeGif } from './exporters'
import { compositeFrame, docFromPixels, MAX_SIZE, parseDoc, serializeDoc, type SpriteDoc } from './model'
import { useStudio } from './store'

/** Draws one frame onto a new canvas, scaled up with hard pixel edges. */
export function frameCanvas(doc: SpriteDoc, frame = 0, scale = 1): HTMLCanvasElement {
  const source = document.createElement('canvas')
  source.width = doc.width
  source.height = doc.height
  source.getContext('2d')!.putImageData(new ImageData(compositeFrame(doc, frame), doc.width, doc.height), 0, 0)
  if (scale === 1) return source
  const out = document.createElement('canvas')
  out.width = doc.width * scale
  out.height = doc.height * scale
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, 0, 0, out.width, out.height)
  return out
}

export async function pngBytes(doc: SpriteDoc, scale = 1, frame = 0): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => frameCanvas(doc, frame, scale).toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not encode the PNG')
  return new Uint8Array(await blob.arrayBuffer())
}

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

  try {
    const img = await loadImage(itemUrl(item))
    const { naturalWidth: w, naturalHeight: h } = img
    if (!w || !h) throw new Error('This image has no pixel size (vector images cannot be opened in Pixel Studio)')
    if (w > MAX_SIZE || h > MAX_SIZE) {
      throw new Error(`Pixel Studio works on images up to ${MAX_SIZE}×${MAX_SIZE}. This one is ${w}×${h}.`)
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const doc = docFromPixels(w, h, ctx.getImageData(0, 0, w, h).data)
    // Saving writes back to a PNG, so only a PNG can be updated in place.
    useStudio.getState().loadDoc(doc, { ...location, savedPath: item.ext === 'png' ? item.path : null })
    app.setView('studio')
  } catch (err) {
    app.notify((err as Error).message, 'error')
  }
}

export async function saveSprite(saveAs = false): Promise<void> {
  useStudio.getState().commitFloating() // drop any lifted pixels so they're saved
  const studio = useStudio.getState()
  const app = useApp.getState()
  if (!studio.doc) return

  let name = studio.name
  let overwrite = true
  if (saveAs || !studio.savedPath) {
    const answer = await app.ask({
      title: 'Save Sprite',
      label: `Saves a PNG and an editable .sprite.json into "${studio.folder || 'Library'}".`,
      value: studio.name,
      confirmLabel: 'Save'
    })
    if (!answer) return
    name = answer
    overwrite = false
  }

  const doc = studio.doc
  const png = await pngBytes(doc)
  const path = await attempt(() =>
    window.api.saveSprite({ folder: studio.folder, name, png, project: serializeDoc(doc), overwrite })
  )
  if (!path) return
  const fileName = path.slice(path.lastIndexOf('/') + 1)
  useStudio.getState().markSaved({ savedPath: path, name: stripExt(fileName), folder: studio.folder })
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

export async function exportGif(scale: number): Promise<void> {
  useStudio.getState().commitFloating()
  const { doc, name } = useStudio.getState()
  if (!doc) return
  const gif = encodeGif(doc, scale)
  const saved = await attempt(() => window.api.exportGif(`${name}${scale === 1 ? '' : `@${scale}x`}.gif`, gif))
  if (saved) useApp.getState().notify(`Exported ${saved.slice(saved.lastIndexOf('/') + 1)}`)
}
