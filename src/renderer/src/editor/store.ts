// Image Editor state. Every applied change replaces `image` with a new Img and pushes
// the old one onto the undo stack.

import { create } from 'zustand'
import type { RGBA } from '@/studio/raster'
import { NO_ADJUSTMENTS, type Adjustments, type Img, type Rect, type SliceOptions } from './ops'

type EditorMode = 'none' | 'crop' | 'pick' | 'wand' | 'slice'

/** The library file being edited. */
export interface EditorSource {
  path: string
  name: string // without extension
  folder: string
  ext: string
  hasProject: boolean
}

export const MAX_EDIT_SIZE = 4096
/** Undo keeps old images until they add up to this many bytes. */
const HISTORY_BYTES = 384 * 1024 * 1024

/** Formats Save can write back to faithfully. Others are saved as a PNG copy. */
const REWRITABLE = ['png', 'jpg', 'jpeg', 'webp']

const DEFAULT_SLICE: SliceOptions = {
  mode: 'size',
  cellW: 16,
  cellH: 16,
  columns: 4,
  rows: 1,
  offsetX: 0,
  offsetY: 0,
  spacingX: 0,
  spacingY: 0,
  skipEmpty: true
}

interface EditorState {
  source: EditorSource | null
  image: Img | null
  /** Unsaved adjustments shown live on top of `image`. */
  adjustments: Adjustments
  past: Img[]
  future: Img[]
  dirty: boolean
  /** Whether Save may overwrite the original file. */
  canOverwrite: boolean
  /** The user has agreed to overwrite this file once already. */
  overwriteConfirmed: boolean
  zoom: number | 'fit'
  mode: EditorMode
  cropRect: Rect | null
  picked: RGBA | null
  tolerance: number
  slice: SliceOptions

  open(source: EditorSource, image: Img): void
  apply(next: Img): void
  undo(): void
  redo(): void
  setAdjustments(patch: Partial<Adjustments>): void
  resetAdjustments(): void
  setZoom(zoom: number | 'fit'): void
  setMode(mode: EditorMode): void
  setCropRect(rect: Rect | null): void
  setPicked(color: RGBA | null): void
  setTolerance(tolerance: number): void
  setSlice(patch: Partial<SliceOptions>): void
  markSaved(source: EditorSource): void
  close(): void
}

const bytes = (list: Img[]): number => list.reduce((n, img) => n + img.data.byteLength, 0)

export const useEditor = create<EditorState>((set, get) => ({
  source: null,
  image: null,
  adjustments: NO_ADJUSTMENTS,
  past: [],
  future: [],
  dirty: false,
  canOverwrite: false,
  overwriteConfirmed: false,
  zoom: 'fit',
  mode: 'none',
  cropRect: null,
  picked: null,
  tolerance: 0,
  slice: DEFAULT_SLICE,

  open: (source, image) =>
    set({
      source,
      image,
      adjustments: NO_ADJUSTMENTS,
      past: [],
      future: [],
      dirty: false,
      canOverwrite: REWRITABLE.includes(source.ext) && !source.hasProject,
      overwriteConfirmed: false,
      zoom: 'fit',
      mode: 'none',
      cropRect: null,
      picked: null,
      // Sprite sheets are usually laid out in cells of the image's height.
      slice: { ...DEFAULT_SLICE, cellW: Math.min(image.height, image.width), cellH: image.height }
    }),

  apply: (next) => {
    const { image, past } = get()
    if (!image) return
    const history = [...past, image]
    while (history.length > 1 && bytes(history) > HISTORY_BYTES) history.shift()
    set({ image: next, past: history, future: [], dirty: true, cropRect: null })
  },

  undo: () => {
    const { image, past, future } = get()
    const previous = past[past.length - 1]
    if (!image || !previous) return
    set({ image: previous, past: past.slice(0, -1), future: [...future, image], dirty: true, cropRect: null })
  },

  redo: () => {
    const { image, past, future } = get()
    const next = future[future.length - 1]
    if (!image || !next) return
    set({ image: next, past: [...past, image], future: future.slice(0, -1), dirty: true, cropRect: null })
  },

  setAdjustments: (patch) => set({ adjustments: { ...get().adjustments, ...patch } }),
  resetAdjustments: () => set({ adjustments: NO_ADJUSTMENTS }),
  setZoom: (zoom) => set({ zoom }),
  setMode: (mode) => set({ mode: get().mode === mode ? 'none' : mode, cropRect: mode === 'crop' ? get().cropRect : null }),
  setCropRect: (cropRect) => set({ cropRect }),
  setPicked: (picked) => set({ picked }),
  setTolerance: (tolerance) => set({ tolerance }),
  setSlice: (patch) => set({ slice: { ...get().slice, ...patch } }),
  markSaved: (source) =>
    set({
      source,
      dirty: false,
      canOverwrite: REWRITABLE.includes(source.ext) && !source.hasProject,
      overwriteConfirmed: true
    }),
  close: () => set({ source: null, image: null, past: [], future: [], dirty: false, mode: 'none', cropRect: null })
}))
