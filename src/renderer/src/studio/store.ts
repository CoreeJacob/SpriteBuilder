// Pixel Studio state. Pixel buffers are mutated in place for speed; `version` is
// bumped after each change so the canvas knows to redraw.

import { create } from 'zustand'
import { History } from './history'
import {
  addLayer,
  cloneState,
  deleteLayer,
  duplicateLayer,
  mergeDown,
  moveLayer,
  restoreState,
  type DocState
} from './layers'
import { createDoc, type Layer, type SpriteDoc } from './model'
import type { Palette } from './palettes'
import { blitRegion, clearRegion, extractRegion, type Region } from './raster'

export type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'ellipse' | 'select'

export const SHAPE_TOOLS: Tool[] = ['line', 'rect', 'ellipse']

type HistoryEntry =
  | { kind: 'cels'; frameId: string; layerId: string; before: Uint8ClampedArray; after: Uint8ClampedArray }
  | { kind: 'doc'; before: DocState; after: DocState; layerBefore: string; layerAfter: string }

/** Pixels lifted off the layer by the select tool, waiting to be dropped somewhere. */
export interface Floating extends Region {
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
  layerId: string
  tool: Tool
  primary: string
  secondary: string
  fillShapes: boolean
  mirrorX: boolean
  mirrorY: boolean
  selection: Region | null
  floating: Floating | null
  clipboard: ClipboardImage | null
  zoom: number
  showGrid: boolean
  tileMode: boolean
  dirty: boolean
  canUndo: boolean
  canRedo: boolean

  newDoc(width: number, height: number, palette?: Palette): void
  loadDoc(doc: SpriteDoc, location: DocLocation): void
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

  setActiveLayer(id: string): void
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

const history = new History<HistoryEntry>(100)

const sameBytes = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

const sameState = (a: DocState, b: DocState): boolean =>
  JSON.stringify(a.layers) === JSON.stringify(b.layers) &&
  a.frames.every((f, i) => {
    const g = b.frames[i]
    const ids = Object.keys(f.cels)
    return g && ids.length === Object.keys(g.cels).length && ids.every((id) => g.cels[id] && sameBytes(f.cels[id], g.cels[id]))
  })

export const useStudio = create<StudioState>((set, get) => {
  /** Applies a layer change as one undo step. `change` returns the layer to make active. */
  const changeLayers = (change: (doc: SpriteDoc, active: string) => string): void => {
    const { doc, layerId } = get()
    if (!doc) return
    get().commitFloating()
    const before = cloneState(doc)
    const next = change(doc, layerId)
    const after = cloneState(doc)
    if (sameState(before, after) && next === layerId) return
    history.push({ kind: 'doc', before, after, layerBefore: layerId, layerAfter: next })
    set({ layerId: next, canUndo: true, canRedo: false, dirty: true, version: get().version + 1 })
  }

  const applyEntry = (entry: HistoryEntry, direction: 'undo' | 'redo'): void => {
    const doc = get().doc
    if (!doc) return
    if (entry.kind === 'cels') {
      const cel = doc.frames.find((f) => f.id === entry.frameId)?.cels[entry.layerId]
      if (cel) cel.set(direction === 'undo' ? entry.before : entry.after)
      // Show the layer that changed, so the undo is visible.
      if (doc.layers.some((l) => l.id === entry.layerId)) set({ layerId: entry.layerId })
    } else {
      restoreState(doc, direction === 'undo' ? entry.before : entry.after)
      const wanted = direction === 'undo' ? entry.layerBefore : entry.layerAfter
      set({ layerId: doc.layers.some((l) => l.id === wanted) ? wanted : doc.layers[doc.layers.length - 1].id })
    }
    set({ canUndo: history.canUndo, canRedo: history.canRedo, dirty: true, version: get().version + 1 })
  }

  return {
    doc: null,
    version: 0,
    frame: 0,
    layerId: '',
    tool: 'pencil',
    primary: '#000000',
    secondary: '#ffffff',
    fillShapes: false,
    mirrorX: false,
    mirrorY: false,
    selection: null,
    floating: null,
    clipboard: null,
    zoom: 16,
    showGrid: true,
    tileMode: false,
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
        layerId: doc.layers[doc.layers.length - 1].id,
        selection: null,
        floating: null,
        zoom: fitZoom(doc.width, doc.height),
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
      const frameId = doc.frames[frame].id
      const before = cel.slice()
      return () => {
        const after = cel.slice()
        if (sameBytes(before, after)) return
        history.push({ kind: 'cels', frameId, layerId, before, after })
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
    toggleMirrorX: () => set({ mirrorX: !get().mirrorX, version: get().version + 1 }),
    toggleMirrorY: () => set({ mirrorY: !get().mirrorY, version: get().version + 1 }),

    // ---------- selection ----------

    setSelection: (selection) => {
      get().commitFloating()
      set({ selection, version: get().version + 1 })
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

    // ---------- layers ----------

    setActiveLayer: (id) => {
      get().commitFloating()
      set({ layerId: id })
    },
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
      const before = cloneState(doc)
      return () => {
        const after = cloneState(doc)
        if (sameState(before, after)) return
        history.push({ kind: 'doc', before, after, layerBefore: layerId, layerAfter: get().layerId })
        set({ canUndo: true, canRedo: false, dirty: true })
      }
    },

    setLayerOpacity: (id, opacity) => {
      const layer = get().doc?.layers.find((l) => l.id === id)
      if (!layer) return
      layer.opacity = Math.max(0, Math.min(1, opacity))
      set({ dirty: true, version: get().version + 1 })
    },

    setZoom: (zoom) => set({ zoom: Math.max(ZOOM_LEVELS[0], Math.min(ZOOM_LEVELS.at(-1)!, zoom)) }),
    toggleGrid: () => set({ showGrid: !get().showGrid }),
    toggleTileMode: () => set({ tileMode: !get().tileMode }),
    markSaved: (location) => set({ ...location, dirty: false })
  }
})
