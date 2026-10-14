// App-wide state: current view, the library snapshot, library view settings, and
// the small dialogs and toasts every screen can use.

import { create } from 'zustand'
import type { LibrarySnapshot } from '@shared/types'
import { DEFAULT_FILTERS, type LibraryFilters, type Scope, type SortOrder } from '@/library/filter'

export type View = 'library' | 'editor' | 'studio'
export type LayoutMode = 'grid' | 'list'

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
}

export interface PromptRequest {
  title: string
  label?: string
  value: string
  confirmLabel?: string
  resolve: (value: string | null) => void
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
  selection: string[]
  /** Anchor for shift-click range selection. */
  selectionAnchor: string | null

  toasts: Toast[]
  prompt: PromptRequest | null

  setView(view: View): void
  setLibrary(snapshot: LibrarySnapshot): void
  setScope(scope: Scope): void
  setIncludeSubfolders(value: boolean): void
  setFilters(patch: Partial<LibraryFilters>): void
  resetFilters(): void
  setSort(sort: SortOrder): void
  setLayout(layout: LayoutMode): void
  setThumbSize(size: number): void
  select(paths: string[], anchor?: string | null): void

  notify(message: string, kind?: Toast['kind']): void
  dismissToast(id: number): void
  ask(request: Omit<PromptRequest, 'resolve'>): Promise<string | null>
  closePrompt(value: string | null): void
}

const PREFS_KEY = 'spritebuilder.prefs'

interface Prefs {
  layout: LayoutMode
  thumbSize: number
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
    layout: state.layout,
    thumbSize: state.thumbSize,
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
  selection: [],
  selectionAnchor: null,

  toasts: [],
  prompt: null,

  setView: (view) => set({ view }),
  setLibrary: (library) => {
    // Drop selected items that no longer exist (deleted, moved or renamed).
    const present = new Set(library.items.map((i) => i.path))
    const selection = get().selection.filter((p) => present.has(p))
    const scope = get().scope
    const scopeGone = scope.kind === 'folder' && scope.path !== '' && !library.folders.includes(scope.path)
    set({ library, selection, ...(scopeGone ? { scope: { kind: 'all' as const } } : {}) })
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
      get().prompt?.resolve(null)
      set({ prompt: { ...request, resolve } })
    }),
  closePrompt: (value) => {
    get().prompt?.resolve(value)
    set({ prompt: null })
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
