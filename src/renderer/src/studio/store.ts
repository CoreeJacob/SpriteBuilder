// Pixel Studio state. Pixel buffers are mutated in place for speed; `version` is
// bumped whenever the sprite's pixels or layers change, so the canvas, thumbnails and
// autosave know to catch up. Settings that only change how it's shown or drawn (brush,
// mirror, onion skin, the selection outline) don't bump it: the canvas watches those itself.

import { create } from 'zustand'
import { History } from './history'
import { resizeCanvas, scaleSprite, type Anchor } from './canvasSize'
import { addFrame, addTag, deleteFrame, deleteTag, duplicateFrame, moveFrame, renameTag, setDuration, setFps } from './frames'
import {
  addLayer,
  deleteLayer,
  duplicateLayer,
  mergeDown,
  moveLayer,
  moveLayerTo,
  restoreSnapshot,
  sameSnapshot,
  snapshot,
  snapshotBytes,
  type DocState
} from './layers'
import { createDoc, type Layer, type SpriteDoc } from './model'
import type { Palette } from './palettes'
import { blitRegion, changedRegion, clearRegion, extractRegion, MAX_BRUSH, turnPixels, type BrushShape, type Region, type Turn } from './raster'

export type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'ellipse' | 'select'

export const SHAPE_TOOLS: Tool[] = ['line', 'rect', 'ellipse']

/** Tools that paint with the brush (fill and the eyedropper work on single pixels). */
export const BRUSH_TOOLS: Tool[] = ['pencil', 'eraser', 'line', 'rect', 'ellipse']

type HistoryEntry =
  | {
      /** Drawing: only the rectangle that changed, before and after. */
      kind: 'pixels'
      frameId: string
      layerId: string
      width: number
      height: number
      region: Region
      before: Uint8ClampedArray
      after: Uint8ClampedArray
      bytes: number
    }
  | {
      /** Layer and frame changes: the sprite's structure before and after (pixels shared). */
      kind: 'doc'
      before: DocState
      after: DocState
      layerBefore: string
      layerAfter: string
      frameBefore: number
      frameAfter: number
      bytes: number
    }

/** Pixels lifted off the layer by the select tool, waiting to be dropped somewhere. */
interface Floating extends Region {
  pixels: Uint8ClampedArray
  /** Finishes the undo step that began when the pixels were lifted or pasted. */
  done: () => void
}

/** What ⌘C/⌘X keep; `x`/`y` let ⌘V put pixels back where they came from. */
export interface ClipboardImage extends Region {
  pixels: Uint8ClampedArray
}

export interface DocLocation {
  /** Library path of the saved PNG, or null if the sprite was never saved. */
  savedPath: string | null
  name: string
  folder: string
}

interface StudioState extends DocLocation {
  doc: SpriteDoc | null
  version: number
  frame: number
  /**
   * Follows `version` once edits pause for a moment. Thumbnails and the colour list use
   * it, so they don't redo their work for every pixel of a stroke.
   */
  settledVersion: number
  /** With shift-click, frames from here to `frame` are selected (for tagging and previewing). */
  rangeStart: number | null
  layerId: string
  tool: Tool
  primary: string
  secondary: string
  fillShapes: boolean
  brushSize: number
  brushShape: BrushShape
  /** Freehand 1-pixel lines skip the extra corner pixels of jagged steps. */
  pixelPerfect: boolean
  mirrorX: boolean
  mirrorY: boolean
  selection: Region | null
  floating: Floating | null
  clipboard: ClipboardImage | null
  zoom: number
  showGrid: boolean
  tileMode: boolean
  onionSkin: boolean
  playing: boolean
  dirty: boolean
  canUndo: boolean
  canRedo: boolean

  newDoc(width: number, height: number, palette?: Palette): void
  loadDoc(doc: SpriteDoc, location: DocLocation): void
  /** Closes the sprite (used when its file is deleted); the Studio shows "New Sprite" again. */
  closeDoc(): void
  activeLayer(): Layer | null
  activeCel(): Uint8ClampedArray | null
  /** Call before changing pixels; returns a function to call when the change is done. */
  beginEdit(): () => void
  touch(): void
  undo(): void
  redo(): void
  clearCanvas(): void

  setTool(tool: Tool): void
  setPrimary(color: string): void
  setSecondary(color: string): void
  swapColors(): void
  setPalette(palette: Palette): void
  addToPalette(color: string): void
  removeFromPalette(color: string): void
  toggleFillShapes(): void
  setBrushSize(size: number): void
  setBrushShape(shape: BrushShape): void
  togglePixelPerfect(): void
  toggleMirrorX(): void
  toggleMirrorY(): void

  setSelection(region: Region | null): void
  selectAll(): void
  deselect(): void
  /** Lifts the selected pixels so they can be moved. With `keepOriginal` the move leaves a copy behind. */
  liftSelection(keepOriginal?: boolean): void
  moveFloating(x: number, y: number): void
  commitFloating(): void
  deleteSelection(): void
  copySelection(): ClipboardImage | null
  cutSelection(): ClipboardImage | null
  paste(image: ClipboardImage): void
  /** Flips or turns the selection, or the whole layer when nothing is selected. */
  turn(turn: Turn): void
  /** Puts a picture on a new layer above the current one, centred and still movable; one undo step. */
  insertImage(image: Pick<ClipboardImage, 'w' | 'h' | 'pixels'>, name: string): void

  setActiveLayer(id: string): void
  moveLayerTo(id: string, targetId: string, position: 'above' | 'below'): void
  addLayer(): void
  duplicateLayer(): void
  deleteLayer(): void
  moveLayer(direction: 1 | -1): void
  mergeDown(): void
  renameLayer(id: string, name: string): void
  toggleLayerVisible(id: string): void
  /** Starts a layer change made in steps (like dragging the opacity slider); call the result when finished. */
  beginLayerChange(): () => void
  setLayerOpacity(id: string, opacity: number): void

  /** Changes the sprite's size: 'canvas' adds or cuts space around the pixels, 'scale' stretches them. */
  resize(width: number, height: number, mode: 'canvas' | 'scale', anchor: Anchor): void

  setFrame(index: number, extendRange?: boolean): void
  /** The selected run of frames as [first, last]; a single frame when nothing is shift-selected. */
  frameRange(): [number, number]
  addTag(name: string): void
  renameTag(id: string, name: string): void
  deleteTag(id: string): void
  selectTag(id: string): void
  stepFrame(direction: 1 | -1): void
  addFrame(): void
  duplicateFrame(): void
  deleteFrame(): void
  moveFrame(from: number, to: number): void
  setFrameDuration(index: number, ms: number): void
  setFps(fps: number): void
  toggleOnionSkin(): void
  togglePlaying(): void

  setZoom(zoom: number): void
  toggleGrid(): void
  toggleTileMode(): void
  markSaved(location: DocLocation): void
}

export const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64]

/** A zoom that makes the sprite roughly fill a 640px-wide area. */
export function fitZoom(width: number, height: number): number {
  const target = 640 / Math.max(width, height)
  return [...ZOOM_LEVELS].reverse().find((z) => z <= target) ?? 1
}

/** Undo keeps up to this many steps, and forgets the oldest ones once they hold this much. */
const UNDO_STEPS = 100
const UNDO_BYTES = 256 * 1024 * 1024
const history = new History<HistoryEntry>(UNDO_STEPS, UNDO_BYTES, (e) => e.bytes)

/** Memory currently held by undo and redo (for tests and diagnostics). */
export const undoMemory = (): number => history.bytes

export const useStudio = create<StudioState>((set, get) => {
  /** Applies a layer or frame change as one undo step. */
  const changeDoc = (change: (doc: SpriteDoc, at: { layerId: string; frame: number }) => { layerId?: string; frame?: number } | void): void => {
    const { doc, layerId, frame } = get()
    if (!doc) return
    get().commitFloating()
    const before = snapshot(doc)
    const next = change(doc, { layerId, frame }) ?? {}
    const nextLayer = next.layerId ?? layerId
    const nextFrame = next.frame ?? frame
    const after = snapshot(doc)
    if (sameSnapshot(before, after) && nextLayer === layerId && nextFrame === frame) return
    history.push({
      kind: 'doc',
      before,
      after,
      layerBefore: layerId,
      layerAfter: nextLayer,
      frameBefore: frame,
      frameAfter: nextFrame,
      bytes: snapshotBytes(before, after)
    })
    set({ layerId: nextLayer, frame: nextFrame, canUndo: true, canRedo: false, dirty: true, version: get().version + 1 })
  }
  const changeLayers = (change: (doc: SpriteDoc, active: string) => string): void =>
    changeDoc((doc, at) => ({ layerId: change(doc, at.layerId) }))

  const applyEntry = (entry: HistoryEntry, direction: 'undo' | 'redo'): void => {
    const doc = get().doc
    if (!doc) return
    if (entry.kind === 'pixels') {
      const frameIndex = doc.frames.findIndex((f) => f.id === entry.frameId)
      const cel = doc.frames[frameIndex]?.cels[entry.layerId]
      if (cel && doc.width === entry.width && doc.height === entry.height) {
        blitRegion(cel, doc.width, doc.height, direction === 'undo' ? entry.before : entry.after, entry.region, true)
      }
      // Show the frame and layer that changed, so the undo is visible.
      if (frameIndex !== -1) set({ frame: frameIndex })
      if (doc.layers.some((l) => l.id === entry.layerId)) set({ layerId: entry.layerId })
    } else {
      restoreSnapshot(doc, direction === 'undo' ? entry.before : entry.after)
      const wanted = direction === 'undo' ? entry.layerBefore : entry.layerAfter
      const wantedFrame = direction === 'undo' ? entry.frameBefore : entry.frameAfter
      set({
        layerId: doc.layers.some((l) => l.id === wanted) ? wanted : doc.layers[doc.layers.length - 1].id,
        frame: Math.min(wantedFrame, doc.frames.length - 1)
      })
    }
    set({ canUndo: history.canUndo, canRedo: history.canRedo, dirty: true, version: get().version + 1 })
  }

  return {
    doc: null,
    version: 0,
    frame: 0,
    settledVersion: 0,
    rangeStart: null,
    layerId: '',
    tool: 'pencil',
    primary: '#000000',
    secondary: '#ffffff',
    fillShapes: false,
    brushSize: 1,
    brushShape: 'square',
    pixelPerfect: false,
    mirrorX: false,
    mirrorY: false,
    selection: null,
    floating: null,
    clipboard: null,
    zoom: 16,
    showGrid: true,
    tileMode: false,
    onionSkin: false,
    playing: false,
    dirty: false,
    canUndo: false,
    canRedo: false,
    savedPath: null,
    name: 'Untitled',
    folder: '',

    newDoc: (width, height, palette) => {
      const doc = createDoc(width, height, palette)
      get().loadDoc(doc, { savedPath: null, name: 'Untitled', folder: get().folder })
      set({ primary: doc.palette.colors[0] ?? '#000000' })
    },

    loadDoc: (doc, location) => {
      history.clear()
      set({
        doc,
        ...location,
        frame: 0,
        rangeStart: null,
        layerId: doc.layers[doc.layers.length - 1].id,
        selection: null,
        floating: null,
        playing: false,
        zoom: fitZoom(doc.width, doc.height),
        dirty: false,
        canUndo: false,
        canRedo: false,
        version: get().version + 1
      })
    },

    closeDoc: () => {
      history.clear()
      set({
        doc: null,
        savedPath: null,
        selection: null,
        floating: null,
        rangeStart: null,
        playing: false,
        dirty: false,
        canUndo: false,
        canRedo: false,
        version: get().version + 1
      })
    },

    activeLayer: () => get().doc?.layers.find((l) => l.id === get().layerId) ?? null,

    activeCel: () => {
      const { doc, frame, layerId } = get()
      return doc?.frames[frame]?.cels[layerId] ?? null
    },

    beginEdit: () => {
      const { doc, frame, layerId } = get()
      const cel = get().activeCel()
      if (!doc || !cel) return () => {}
      const { width, height } = doc
      const frameId = doc.frames[frame].id
      const before = cel.slice()
      return () => {
        const region = changedRegion(before, cel, width, height)
        if (!region) return
        const bytes = region.w * region.h * 4
        history.push({
          kind: 'pixels',
          frameId,
          layerId,
          width,
          height,
          region,
          before: extractRegion(before, width, height, region),
          after: extractRegion(cel, width, height, region),
          bytes: bytes * 2
        })
        set({ canUndo: true, canRedo: false, dirty: true })
      }
    },

    touch: () => set({ version: get().version + 1 }),

    undo: () => {
      get().commitFloating()
      const entry = history.undo()
      if (entry) applyEntry(entry, 'undo')
    },

    redo: () => {
      get().commitFloating()
      const entry = history.redo()
      if (entry) applyEntry(entry, 'redo')
    },

    clearCanvas: () => {
      get().commitFloating()
      const cel = get().activeCel()
      if (!cel) return
      const done = get().beginEdit()
      cel.fill(0)
      done()
      get().touch()
    },

    setTool: (tool) => {
      if (tool !== 'select') get().commitFloating()
      set({ tool })
    },
    setPrimary: (primary) => set({ primary }),
    setSecondary: (secondary) => set({ secondary }),
    swapColors: () => set({ primary: get().secondary, secondary: get().primary }),

    setPalette: (palette) => {
      const doc = get().doc
      if (!doc) return
      doc.palette = { name: palette.name, colors: [...palette.colors] }
      set({ dirty: true, version: get().version + 1 })
    },
    addToPalette: (color) => {
      const doc = get().doc
      if (!doc || doc.palette.colors.includes(color)) return
      doc.palette = { name: `${doc.palette.name.replace(/ \(edited\)$/, '')} (edited)`, colors: [...doc.palette.colors, color] }
      set({ dirty: true, version: get().version + 1 })
    },
    removeFromPalette: (color) => {
      const doc = get().doc
      if (!doc) return
      doc.palette = {
        name: `${doc.palette.name.replace(/ \(edited\)$/, '')} (edited)`,
        colors: doc.palette.colors.filter((c) => c !== color)
      }
      set({ dirty: true, version: get().version + 1 })
    },
    toggleFillShapes: () => set({ fillShapes: !get().fillShapes }),
    setBrushSize: (size) => set({ brushSize: Math.max(1, Math.min(MAX_BRUSH, Math.round(size))) }),
    setBrushShape: (brushShape) => set({ brushShape }),
    togglePixelPerfect: () => set({ pixelPerfect: !get().pixelPerfect }),
    toggleMirrorX: () => set({ mirrorX: !get().mirrorX }),
    toggleMirrorY: () => set({ mirrorY: !get().mirrorY }),

    // ---------- selection ----------

    setSelection: (selection) => {
      get().commitFloating()
      set({ selection })
    },

    selectAll: () => {
      const doc = get().doc
      if (!doc) return
      get().setSelection({ x: 0, y: 0, w: doc.width, h: doc.height })
      set({ tool: 'select' })
    },

    deselect: () => get().setSelection(null),

    liftSelection: (keepOriginal = false) => {
      const { doc, selection, floating } = get()
      const cel = get().activeCel()
      if (!doc || !cel || !selection || floating) return
      const done = get().beginEdit()
      const pixels = extractRegion(cel, doc.width, doc.height, selection)
      if (!keepOriginal) clearRegion(cel, doc.width, doc.height, selection)
      set({ floating: { ...selection, pixels, done }, version: get().version + 1 })
    },

    moveFloating: (x, y) => {
      const floating = get().floating
      if (!floating) return
      set({
        floating: { ...floating, x, y },
        selection: { x, y, w: floating.w, h: floating.h },
        version: get().version + 1
      })
    },

    commitFloating: () => {
      const { doc, floating } = get()
      if (!floating) return
      const cel = get().activeCel()
      if (doc && cel) blitRegion(cel, doc.width, doc.height, floating.pixels, floating)
      set({ floating: null })
      floating.done()
      set({ version: get().version + 1 })
    },

    deleteSelection: () => {
      const { doc, selection, floating } = get()
      if (floating) {
        // Dropping lifted pixels without placing them deletes them.
        set({ floating: null, selection: null })
        floating.done()
        set({ version: get().version + 1 })
        return
      }
      const cel = get().activeCel()
      if (!doc || !cel || !selection) return
      const done = get().beginEdit()
      clearRegion(cel, doc.width, doc.height, selection)
      done()
      get().touch()
    },

    copySelection: () => {
      const { doc, selection, floating } = get()
      const cel = get().activeCel()
      if (!doc || !cel || !selection) return null
      const clipboard: ClipboardImage = floating
        ? { ...selection, pixels: floating.pixels.slice() }
        : { ...selection, pixels: extractRegion(cel, doc.width, doc.height, selection) }
      set({ clipboard })
      return clipboard
    },

    cutSelection: () => {
      const clipboard = get().copySelection()
      if (clipboard) get().deleteSelection()
      return clipboard
    },

    paste: (image) => {
      const doc = get().doc
      if (!doc || !get().activeCel()) return
      get().commitFloating()
      // Put pixels back where they were copied from, unless that spot is off the canvas.
      const fits = image.x >= 0 && image.y >= 0 && image.x < doc.width && image.y < doc.height
      const x = fits ? image.x : 0
      const y = fits ? image.y : 0
      const done = get().beginEdit()
      set({
        tool: 'select',
        floating: { x, y, w: image.w, h: image.h, pixels: image.pixels.slice(), done },
        selection: { x, y, w: image.w, h: image.h },
        version: get().version + 1
      })
    },

    turn: (kind) => {
      const doc = get().doc
      if (!doc || !get().activeCel()) return
      // With nothing selected, the whole layer turns.
      const whole = !get().selection
      if (whole) set({ selection: { x: 0, y: 0, w: doc.width, h: doc.height } })
      if (!get().floating) get().liftSelection()
      const f = get().floating
      if (!f) return
      const t = turnPixels(f.pixels, f.w, f.h, kind)
      // Turn about the selection's centre; a 90° turn swaps its width and height.
      const region = { x: f.x + Math.floor((f.w - t.w) / 2), y: f.y + Math.floor((f.h - t.h) / 2), w: t.w, h: t.h }
      set({ floating: { ...f, ...region, pixels: t.pixels }, selection: region, version: get().version + 1 })
      if (whole && t.w === doc.width && t.h === doc.height) {
        // The layer still fits the canvas exactly, so put it straight back down.
        get().commitFloating()
        set({ selection: null })
      } else {
        // Leave it lifted, ready to drag into place.
        set({ tool: 'select' })
      }
    },

    insertImage: (image, name) => {
      const { doc, layerId, frame } = get()
      if (!doc) return
      get().commitFloating()
      const before = snapshot(doc)
      const id = addLayer(doc, layerId, name)
      const region = { x: Math.floor((doc.width - image.w) / 2), y: Math.floor((doc.height - image.h) / 2), w: image.w, h: image.h }
      // Placing the pixels finishes the step, so undo takes away the layer and the picture together.
      const done = (): void => {
        const after = snapshot(doc)
        history.push({ kind: 'doc', before, after, layerBefore: layerId, layerAfter: id, frameBefore: frame, frameAfter: frame, bytes: snapshotBytes(before, after) })
        set({ canUndo: true, canRedo: false, dirty: true })
      }
      set({
        layerId: id,
        tool: 'select',
        floating: { ...region, pixels: image.pixels.slice(), done },
        selection: region,
        dirty: true,
        version: get().version + 1
      })
    },

    // ---------- layers ----------

    setActiveLayer: (id) => {
      get().commitFloating()
      set({ layerId: id })
    },
    moveLayerTo: (id, targetId, position) => changeLayers((doc, active) => (moveLayerTo(doc, id, targetId, position), active)),
    addLayer: () => changeLayers((doc, active) => addLayer(doc, active)),
    duplicateLayer: () => changeLayers((doc, active) => duplicateLayer(doc, active)),
    deleteLayer: () => changeLayers((doc, active) => deleteLayer(doc, active)),
    moveLayer: (direction) => changeLayers((doc, active) => moveLayer(doc, active, direction)),
    mergeDown: () => changeLayers((doc, active) => mergeDown(doc, active)),
    renameLayer: (id, name) =>
      changeLayers((doc, active) => {
        const layer = doc.layers.find((l) => l.id === id)
        if (layer && name.trim()) layer.name = name.trim()
        return active
      }),
    toggleLayerVisible: (id) =>
      changeLayers((doc, active) => {
        const layer = doc.layers.find((l) => l.id === id)
        if (layer) layer.visible = !layer.visible
        return active
      }),

    beginLayerChange: () => {
      const { doc, layerId } = get()
      if (!doc) return () => {}
      get().commitFloating()
      const before = snapshot(doc)
      return () => {
        const after = snapshot(doc)
        if (sameSnapshot(before, after)) return
        const frame = get().frame
        history.push({ kind: 'doc', before, after, layerBefore: layerId, layerAfter: get().layerId, frameBefore: frame, frameAfter: frame, bytes: snapshotBytes(before, after) })
        set({ canUndo: true, canRedo: false, dirty: true })
      }
    },

    setLayerOpacity: (id, opacity) => {
      const layer = get().doc?.layers.find((l) => l.id === id)
      if (!layer) return
      layer.opacity = Math.max(0, Math.min(1, opacity))
      set({ dirty: true, version: get().version + 1 })
    },

    resize: (width, height, mode, anchor) => {
      const doc = get().doc
      if (!doc || (width === doc.width && height === doc.height)) return
      useStudio.setState({ selection: null })
      changeDoc((d) => (mode === 'scale' ? scaleSprite(d, width, height) : resizeCanvas(d, width, height, anchor)))
      set({ zoom: fitZoom(width, height) })
    },

    // ---------- frames ----------

    setFrame: (index, extendRange = false) => {
      const doc = get().doc
      if (!doc) return
      get().commitFloating()
      const frame = Math.max(0, Math.min(doc.frames.length - 1, index))
      const rangeStart = extendRange ? (get().rangeStart ?? get().frame) : null
      set({ frame, rangeStart: rangeStart === frame ? null : rangeStart, version: get().version + 1 })
    },
    frameRange: () => {
      const { frame, rangeStart, doc } = get()
      const last = (doc?.frames.length ?? 1) - 1
      const start = Math.min(rangeStart ?? frame, last)
      return start <= frame ? [start, frame] : [frame, start]
    },
    addTag: (name) => {
      const [from, to] = get().frameRange()
      changeDoc((doc) => void addTag(doc, from, to, name))
    },
    renameTag: (id, name) => changeDoc((doc) => renameTag(doc, id, name)),
    deleteTag: (id) => changeDoc((doc) => deleteTag(doc, id)),
    selectTag: (id) => {
      const tag = get().doc?.tags.find((t) => t.id === id)
      if (!tag) return
      get().commitFloating()
      set({ frame: tag.to, rangeStart: tag.from === tag.to ? null : tag.from, version: get().version + 1 })
    },
    stepFrame: (direction) => {
      const doc = get().doc
      if (!doc) return
      // Wraps around, like the animation does.
      get().setFrame((get().frame + direction + doc.frames.length) % doc.frames.length)
    },
    addFrame: () => (set({ rangeStart: null }), changeDoc((doc, at) => ({ frame: addFrame(doc, at.frame) }))),
    duplicateFrame: () => (set({ rangeStart: null }), changeDoc((doc, at) => ({ frame: duplicateFrame(doc, at.frame) }))),
    deleteFrame: () => (set({ rangeStart: null }), changeDoc((doc, at) => ({ frame: deleteFrame(doc, at.frame) }))),
    moveFrame: (from, to) => (set({ rangeStart: null }), changeDoc((doc) => ({ frame: moveFrame(doc, from, to) }))),
    setFrameDuration: (index, ms) => changeDoc((doc) => setDuration(doc, index, ms)),
    setFps: (fps) => changeDoc((doc) => setFps(doc, fps)),
    toggleOnionSkin: () => set({ onionSkin: !get().onionSkin }),
    togglePlaying: () => set({ playing: !get().playing }),

    setZoom: (zoom) => set({ zoom: Math.max(ZOOM_LEVELS[0], Math.min(ZOOM_LEVELS.at(-1)!, zoom)) }),
    toggleGrid: () => set({ showGrid: !get().showGrid }),
    toggleTileMode: () => set({ tileMode: !get().tileMode }),
    markSaved: (location) => set({ ...location, dirty: false })
  }
})

const SETTLE_MS = 200
let settleTimer: ReturnType<typeof setTimeout> | undefined
useStudio.subscribe((state, prev) => {
  if (state.version === prev.version) return
  clearTimeout(settleTimer)
  // A new or reopened sprite shows its thumbnails straight away.
  if (state.doc !== prev.doc) return useStudio.setState({ settledVersion: state.version })
  settleTimer = setTimeout(() => useStudio.setState({ settledVersion: useStudio.getState().version }), SETTLE_MS)
})
