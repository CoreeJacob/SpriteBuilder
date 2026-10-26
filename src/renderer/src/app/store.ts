// App-wide state: current view, the library snapshot, library view settings, and
// the small dialogs and toasts every screen can use.

import { create } from 'zustand'
import { followMoves } from '@shared/paths'
import type { LibrarySnapshot } from '@shared/types'
import { DEFAULT_FILTERS, type LibraryFilters, type Scope, type SortOrder } from '@/library/filter'

export type View = 'library' | 'editor' | 'studio'
export type Theme = 'system' | 'dark' | 'light'
type LayoutMode = 'grid' | 'list'

interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
}

interface PromptRequest {
  title: string
  label?: string
  value: string
  confirmLabel?: string
  /** When set, the dialog also offers a folder picker starting at this folder ("" = library root). */
  folder?: string
  resolve: (value: string | null, folder: string) => void
}

interface NameAndFolder {
  name: string
  folder: string
}

interface AppState {
  view: View
  library: LibrarySnapshot | null

  scope: Scope
  includeSubfolders: boolean
  filters: LibraryFilters
  sort: SortOrder
  layout: LayoutMode
  thumbSize: number
  /** Pixel Studio's preview: shown big (a wider side panel), and at fit or actual size. */
  bigPreview: boolean
  previewSize: PreviewSize
  selection: string[]
  /** Anchor for shift-click range selection. */
  selectionAnchor: string | null

  toasts: Toast[]
  prompt: PromptRequest | null
  showShortcuts: boolean
  setShowShortcuts(open: boolean): void
  theme: Theme
  /** What "system" currently means, so canvases can redraw when macOS switches. */
  resolvedTheme: 'dark' | 'light'
  setTheme(theme: Theme): void

  setView(view: View): void
  setLibrary(snapshot: LibrarySnapshot): void
  setScope(scope: Scope): void
  setIncludeSubfolders(value: boolean): void
  setFilters(patch: Partial<LibraryFilters>): void
  resetFilters(): void
  setSort(sort: SortOrder): void
  setLayout(layout: LayoutMode): void
  setThumbSize(size: number): void
  setBigPreview(big: boolean): void
  setPreviewSize(size: PreviewSize): void
  select(paths: string[], anchor?: string | null): void

  notify(message: string, kind?: Toast['kind']): void
  dismissToast(id: number): void
  ask(request: Omit<PromptRequest, 'resolve' | 'folder'>): Promise<string | null>
  /** Asks for a name and a library folder to save into. */
  askNameAndFolder(request: Omit<PromptRequest, 'resolve'> & { folder: string }): Promise<NameAndFolder | null>
  closePrompt(value: string | null, folder?: string): void
}

/**
 * Use this instead of `?? []` inside a store selector: a new empty array on every call
 * looks like a change, which makes React re-render forever.
 */
const NO_FOLDERS: string[] = []
export const selectFolders = (s: { library: LibrarySnapshot | null }): string[] => s.library?.folders ?? NO_FOLDERS

const PREFS_KEY = 'spritebuilder.prefs'

/** 'fit' fills the preview box (whole-number zoom when enlarging); 'actual' is 1×, as in a game. */
export type PreviewSize = 'fit' | 'actual'

interface Prefs {
  theme: Theme
  layout: LayoutMode
  thumbSize: number
  bigPreview: boolean
  previewSize: PreviewSize
  sort: SortOrder
  includeSubfolders: boolean
}

function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function savePrefs(state: AppState): void {
  const prefs: Prefs = {
    theme: state.theme,
    layout: state.layout,
    thumbSize: state.thumbSize,
    bigPreview: state.bigPreview,
    previewSize: state.previewSize,
    sort: state.sort,
    includeSubfolders: state.includeSubfolders
  }
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}

const prefs = loadPrefs()

const systemIsLight = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: light)').matches
function resolveTheme(theme: Theme): 'dark' | 'light' {
  return theme === 'system' ? (systemIsLight() ? 'light' : 'dark') : theme
}
let toastId = 0

export const useApp = create<AppState>((set, get) => ({
  view: 'library',
  library: null,

  scope: { kind: 'all' },
  includeSubfolders: prefs.includeSubfolders ?? true,
  filters: DEFAULT_FILTERS,
  sort: prefs.sort ?? { key: 'addedAt', dir: 'desc' },
  layout: prefs.layout ?? 'grid',
  thumbSize: prefs.thumbSize ?? 128,
  bigPreview: prefs.bigPreview ?? false,
  previewSize: prefs.previewSize ?? 'fit',
  selection: [],
  selectionAnchor: null,

  toasts: [],
  prompt: null,
  showShortcuts: false,
  setShowShortcuts: (showShortcuts) => set({ showShortcuts }),
  theme: prefs.theme ?? 'dark',
  resolvedTheme: resolveTheme(prefs.theme ?? 'dark'),
  setTheme: (theme) => {
    set({ theme, resolvedTheme: resolveTheme(theme) })
    savePrefs(get())
  },

  setView: (view) => set({ view }),
  setLibrary: (library) => {
    // Follow anything the app just moved or renamed, then drop what no longer exists.
    const moves = library.moved ?? []
    const present = new Set(library.items.map((i) => i.path))
    const selection = get()
      .selection.map((p) => followMoves(p, moves))
      .filter((p) => present.has(p))
    let scope = get().scope
    if (scope.kind === 'folder' && moves.length) scope = { kind: 'folder', path: followMoves(scope.path, moves) }
    if (scope.kind === 'folder' && scope.path !== '' && !library.folders.includes(scope.path)) scope = { kind: 'all' }
    set({ library, selection, scope })
  },
  setScope: (scope) => set({ scope, selection: [], selectionAnchor: null }),
  setIncludeSubfolders: (includeSubfolders) => {
    set({ includeSubfolders })
    savePrefs(get())
  },
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS, search: get().filters.search } }),
  setSort: (sort) => {
    set({ sort })
    savePrefs(get())
  },
  setLayout: (layout) => {
    set({ layout })
    savePrefs(get())
  },
  setThumbSize: (thumbSize) => {
    set({ thumbSize })
    savePrefs(get())
  },
  setBigPreview: (bigPreview) => {
    set({ bigPreview })
    savePrefs(get())
  },
  setPreviewSize: (previewSize) => {
    set({ previewSize })
    savePrefs(get())
  },
  select: (selection, anchor) =>
    set({ selection, selectionAnchor: anchor === undefined ? (selection[0] ?? null) : anchor }),

  notify: (message, kind = 'info') => {
    const id = ++toastId
    set({ toasts: [...get().toasts, { id, message, kind }] })
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3000)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  ask: (request) =>
    new Promise((resolve) => {
      get().prompt?.resolve(null, '')
      set({ prompt: { ...request, resolve: (value) => resolve(value) } })
    }),
  askNameAndFolder: (request) =>
    new Promise((resolve) => {
      get().prompt?.resolve(null, '')
      set({ prompt: { ...request, resolve: (name, folder) => resolve(name === null ? null : { name, folder }) } })
    }),
  closePrompt: (value, folder) => {
    const prompt = get().prompt
    set({ prompt: null })
    prompt?.resolve(value, folder ?? prompt.folder ?? '')
  }
}))

/** Runs an API call and shows any error as a toast instead of throwing. */
export async function attempt<T>(task: () => Promise<T>): Promise<T | undefined> {
  try {
    return await task()
  } catch (err) {
    const message = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
    useApp.getState().notify(message, 'error')
    return undefined
  }
}
