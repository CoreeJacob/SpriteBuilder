// Moving images between the Library, the Image Editor and Pixel Studio.

import { joinRel, stripExt, uniqueName } from '@shared/paths'
import type { LibraryItem } from '@shared/types'
import { decideSave } from '@/app/saveTarget'
import { attempt, useApp } from '@/app/store'
import { canvasToBytes, loadImage, pixelsToCanvas, readPixels } from '@/lib/canvas'
import { itemUrl } from '@/lib/fileUrl'
import { confirmDiscard as confirmStudioDiscard } from '@/studio/io'
import { docFromFrames, MAX_SIZE } from '@/studio/model'
import { useStudio } from '@/studio/store'
import { adjust, crop, isIdentity, sliceRects, type Img } from './ops'
import { MAX_EDIT_SIZE, useEditor, type EditorSource } from './store'

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

const imgToCanvas = (img: Img): HTMLCanvasElement => pixelsToCanvas(img.data, img.width, img.height)

const encode = (img: Img, ext = 'png'): Promise<Uint8Array> => canvasToBytes(imgToCanvas(img), MIME[ext] ?? 'image/png', 0.92)

/** Smooth (non-pixel-art) resize using the browser's high-quality scaler. */
export function resizeSmooth(img: Img, width: number, height: number): Img {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(imgToCanvas(img), 0, 0, width, height)
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}

export function confirmDiscard(): boolean {
  return !useEditor.getState().dirty || window.confirm('Discard unsaved changes in the Image Editor?')
}

/** The image as it will be saved: committed edits plus any adjustments still being previewed. */
function currentImage(): Img | null {
  const { image, adjustments } = useEditor.getState()
  if (!image) return null
  return isIdentity(adjustments) ? image : adjust(image, adjustments)
}

/** Folds previewed adjustments into the image so they are saved and undoable. */
export function commitAdjustments(): void {
  const { image, adjustments, apply, resetAdjustments } = useEditor.getState()
  if (!image || isIdentity(adjustments)) return
  apply(adjust(image, adjustments))
  resetAdjustments()
}

export async function openInEditor(item: LibraryItem): Promise<void> {
  const app = useApp.getState()
  if (!confirmDiscard()) return
  try {
    const el = await loadImage(itemUrl(item))
    const { naturalWidth: w, naturalHeight: h } = el
    if (!w || !h) throw new Error('This image has no pixel size, so it cannot be edited here.')
    if (w > MAX_EDIT_SIZE || h > MAX_EDIT_SIZE) {
      throw new Error(`The Image Editor handles images up to ${MAX_EDIT_SIZE}×${MAX_EDIT_SIZE}. This one is ${w}×${h}.`)
    }
    const image: Img = { width: w, height: h, data: readPixels(el, w, h) }
    useEditor.getState().open(
      { path: item.path, name: stripExt(item.name), folder: item.folder, ext: item.ext, hasProject: item.hasProject },
      image
    )
    app.setView('editor')
    if ((item.frames ?? 1) > 1) {
      app.notify('This image is animated. The editor works on its first frame and saves a still image.')
    }
  } catch (err) {
    app.notify((err as Error).message, 'error')
  }
}

/** Save: overwrite the original where that's safe, otherwise save a copy. */
export async function save(): Promise<void> {
  commitAdjustments()
  const { source, image, canOverwrite, overwriteConfirmed } = useEditor.getState()
  if (!source || !image) return
  if (!canOverwrite) return saveCopy()
  if (!overwriteConfirmed && !window.confirm(`Replace ${source.name}.${source.ext} with your edits?\n\nUse “Save as Copy” to keep the original.`)) return
  const data = await encode(image, source.ext)
  const path = await attempt(() => window.api.replaceItem(source.path, data))
  if (!path) return
  useEditor.getState().markSaved(source)
  useApp.getState().notify(`Saved ${source.name}.${source.ext}`)
}

/** Saves the edited image as a new PNG next to the original, and keeps editing that copy. */
export async function saveCopy(): Promise<void> {
  commitAdjustments()
  const { source, image } = useEditor.getState()
  if (!source || !image) return
  const app = useApp.getState()
  const answer = await app.askNameAndFolder({
    title: 'Save as Copy',
    label: 'Saves a new PNG. The original is left as it is.',
    value: `${source.name}-edited`,
    folder: source.folder,
    confirmLabel: 'Save'
  })
  if (!answer) return
  const decision = decideSave(app.library?.items ?? [], answer.folder, answer.name, source.path, { mayReplaceSprites: false })
  if (decision.kind === 'blocked') return void app.notify(decision.reason, 'error')
  if (decision.kind === 'replace' && !window.confirm(`“${decision.path}” already exists. Replace it?`)) return
  const data = await encode(image, 'png')
  // A name that's already taken replaces that file (after asking); a new name makes a new file.
  const path =
    decision.kind === 'new'
      ? (await attempt(() => window.api.importData(answer.folder, [{ name: `${stripExt(answer.name)}.png`, data }])))?.[0]
      : await attempt(() => window.api.replaceItem(decision.path, data))
  if (!path) return
  const file = path.slice(path.lastIndexOf('/') + 1)
  const copy: EditorSource = { path, name: stripExt(file), folder: answer.folder, ext: 'png', hasProject: false }
  useEditor.getState().markSaved(copy)
  useApp.getState().notify(`Saved ${file}`)
}

export async function exportImage(): Promise<void> {
  const img = currentImage()
  const source = useEditor.getState().source
  if (!img || !source) return
  const data = await encode(img, 'png')
  const saved = await attempt(() => window.api.exportPng(`${source.name}.png`, data))
  if (saved) useApp.getState().notify(`Exported ${saved.slice(saved.lastIndexOf('/') + 1)}`)
}

/** Opens the current image in Pixel Studio as a new, unsaved sprite. */
export function openImageInStudio(): void {
  const img = currentImage()
  const source = useEditor.getState().source
  if (!img || !source) return
  if (img.width > MAX_SIZE || img.height > MAX_SIZE) {
    useApp.getState().notify(`Pixel Studio works on images up to ${MAX_SIZE}×${MAX_SIZE}. Resize or crop it first.`, 'error')
    return
  }
  framesToStudio([img], source, source.name)
}

/** Slices the image with the current settings into frames of a new Pixel Studio animation. */
export function sliceToStudio(): void {
  const img = currentImage()
  const { source, slice } = useEditor.getState()
  if (!img || !source) return
  const frames = sliceRects(img, slice).map((r) => crop(img, r))
  if (!frames.length) return void useApp.getState().notify('The slice settings give no frames.', 'error')
  if (frames[0].width > MAX_SIZE || frames[0].height > MAX_SIZE) {
    return void useApp.getState().notify(`Frames must be at most ${MAX_SIZE}×${MAX_SIZE} for Pixel Studio.`, 'error')
  }
  framesToStudio(frames, source, `${source.name}-anim`)
}

function framesToStudio(frames: Img[], source: EditorSource, name: string): void {
  if (!confirmStudioDiscard()) return
  const { width, height } = frames[0]
  const doc = docFromFrames(width, height, frames.map((f) => ({ pixels: f.data, duration: 100 })))
  useStudio.getState().loadDoc(doc, { savedPath: null, name, folder: source.folder })
  useStudio.setState({ dirty: true }) // a new sprite that hasn't been saved yet
  useApp.getState().setView('studio')
  useApp.getState().notify(frames.length > 1 ? `Opened ${frames.length} frames in Pixel Studio` : 'Opened in Pixel Studio')
}

/** Slices the image and saves every frame as its own PNG in a new library folder. */
export async function sliceToFiles(): Promise<void> {
  const img = currentImage()
  const { source, slice } = useEditor.getState()
  const app = useApp.getState()
  if (!img || !source) return
  const rects = sliceRects(img, slice)
  if (!rects.length) return void app.notify('The slice settings give no frames.', 'error')
  const folders = new Set((app.library?.folders ?? []).map((f) => f.toLowerCase()))
  const suggested = uniqueName(`${source.name} frames`, (c) => folders.has(joinRel(source.folder, c).toLowerCase()))
  const folderName = await app.ask({
    title: 'Save Frames as PNGs',
    label: `Creates a new folder inside “${source.folder || 'Library'}” with ${rects.length} PNG files.`,
    value: suggested,
    confirmLabel: 'Save Frames'
  })
  if (!folderName) return
  const folder = await attempt(() => window.api.createFolder(source.folder, folderName))
  if (folder === undefined) return
  const digits = String(rects.length).length
  const files = await Promise.all(
    rects.map(async (r, i) => ({ name: `${source.name}-${String(i + 1).padStart(digits, '0')}.png`, data: await encode(crop(img, r)) }))
  )
  const added = await attempt(() => window.api.importData(folder, files))
  if (added) app.notify(`Saved ${added.length} frames into “${folder}”`)
}
