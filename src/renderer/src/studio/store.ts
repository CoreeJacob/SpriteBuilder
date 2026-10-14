// Pixel Studio state. Pixel buffers are mutated in place for speed; `version` is
// bumped after each change so the canvas knows to redraw.

import { create } from 'zustand'
import { History } from './history'
import { createDoc, type SpriteDoc } from './model'
import type { Palette } from './palettes'

export type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper'

interface CelEdit {
  frame: number
  layerId: string
  before: Uint8ClampedArray
  after: Uint8ClampedArray
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
  zoom: number
  showGrid: boolean
  tileMode: boolean
  dirty: boolean
  canUndo: boolean
  canRedo: boolean

  newDoc(width: number, height: number, palette?: Palette): void
  loadDoc(doc: SpriteDoc, location: DocLocation): void
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

const history = new History<CelEdit>(200)

export const useStudio = create<StudioState>((set, get) => ({
  doc: null,
  version: 0,
  frame: 0,
  layerId: '',
  tool: 'pencil',
  primary: '#000000',
  secondary: '#ffffff',
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
      zoom: fitZoom(doc.width, doc.height),
      dirty: false,
      canUndo: false,
      canRedo: false,
      version: get().version + 1
    })
  },

  activeCel: () => {
    const { doc, frame, layerId } = get()
    return doc?.frames[frame]?.cels[layerId] ?? null
  },

  beginEdit: () => {
    const { frame, layerId } = get()
    const cel = get().activeCel()
    if (!cel) return () => {}
    const before = cel.slice()
    return () => {
      const after = cel.slice()
      if (after.every((v, i) => v === before[i])) return
      history.push({ frame, layerId, before, after })
      set({ canUndo: true, canRedo: false, dirty: true })
    }
  },

  touch: () => set({ version: get().version + 1 }),

  undo: () => {
    const entry = history.undo()
    if (entry) applyEdit(entry, entry.before)
  },

  redo: () => {
    const entry = history.redo()
    if (entry) applyEdit(entry, entry.after)
  },

  clearCanvas: () => {
    const cel = get().activeCel()
    if (!cel) return
    const done = get().beginEdit()
    cel.fill(0)
    done()
    get().touch()
  },

  setTool: (tool) => set({ tool }),
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

  setZoom: (zoom) => set({ zoom: Math.max(ZOOM_LEVELS[0], Math.min(ZOOM_LEVELS.at(-1)!, zoom)) }),
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  toggleTileMode: () => set({ tileMode: !get().tileMode }),
  markSaved: (location) => set({ ...location, dirty: false })
}))

function applyEdit(entry: CelEdit, pixels: Uint8ClampedArray): void {
  const state = useStudio.getState()
  const cel = state.doc?.frames[entry.frame]?.cels[entry.layerId]
  if (cel) cel.set(pixels)
  useStudio.setState({
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    dirty: true,
    version: state.version + 1
  })
}
