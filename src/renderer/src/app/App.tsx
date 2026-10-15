import { useEffect } from 'react'
import { useEnrichment } from '@/library/enrich'
import { LibraryView } from '@/library/LibraryView'
import { EditorView } from '@/editor/EditorView'
import { StudioView } from '@/studio/StudioView'
import { useEditor } from '@/editor/store'
import { useStudioAutosave } from '@/studio/autosave'
import { useSavedPalettes } from '@/studio/savedPalettes'
import { useStudio } from '@/studio/store'
import { Icon, type IconName } from './Icon'
import { syncOpenDocuments } from './openDocuments'
import { PromptDialog, Toasts } from './Overlays'
import { backupLibrary, restoreLibrary } from './libraryActions'
import { RecoveryDialog } from './RecoveryDialog'
import { ShortcutsDialog } from './ShortcutsDialog'
import { Tooltips } from './Tooltips'
import { useApp, type Theme, type View } from './store'

const NAV: Array<{ view: View; label: string; icon: IconName }> = [
  { view: 'library', label: 'Library', icon: 'library' },
  { view: 'studio', label: 'Pixel Studio', icon: 'studio' },
  { view: 'editor', label: 'Image Editor', icon: 'editor' }
]

const isTyping = (): boolean => {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
}

export function App() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const library = useApp((s) => s.library)
  const setLibrary = useApp((s) => s.setLibrary)
  const studioDirty = useStudio((s) => s.dirty)
  const editorDirty = useEditor((s) => s.dirty)
  const dirty = studioDirty || editorDirty

  useEffect(() => {
    void window.api.getLibrary().then(setLibrary)
    return window.api.onLibraryChanged((snapshot) => {
      setLibrary(snapshot)
      syncOpenDocuments(snapshot)
    })
  }, [setLibrary])

  // The app menu owns ⌘Z and ⌘A, so route them to text fields or the current screen.
  useEffect(
    () =>
      window.api.onMenuCommand((command) => {
        const view = useApp.getState().view
        if (command === 'backup') return void backupLibrary()
        if (command === 'restore') return void restoreLibrary()
        if (command === 'shortcuts') return useApp.getState().setShowShortcuts(!useApp.getState().showShortcuts)
        if (isTyping()) document.execCommand(command)
        else if (command === 'selectAll') window.dispatchEvent(new Event(`${view}:selectAll`))
        else if (view === 'studio') useStudio.getState()[command]()
        else if (view === 'editor') useEditor.getState()[command]()
      }),
    []
  )

  // Electron shows a "discard changes?" dialog when this is set (see main process).
  useEffect(() => {
    window.onbeforeunload = dirty ? () => false : null
  }, [dirty])

  // Theme: tag <html> so the CSS picks the colours, and follow macOS while on "System".
  const theme = useApp((s) => s.theme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const sync = (): void => useApp.setState({ resolvedTheme: theme === 'system' ? (media.matches ? 'light' : 'dark') : theme })
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [theme])

  // "?" opens the shortcuts list from anywhere (except while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '?' || isTyping() || useApp.getState().prompt) return
      e.preventDefault()
      useApp.getState().setShowShortcuts(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEnrichment(library?.items)
  useStudioAutosave()

  // Saved palettes live in the library folder, so reload them when it changes.
  const root = library?.root
  useEffect(() => {
    if (root) void useSavedPalettes.getState().load()
  }, [root])

  return (
    <div className="app">
      <nav className="rail">
        <div className="brand" title="SpriteBuilder">
          <BrandMark />
        </div>
        {NAV.map((item) => (
          <button
            key={item.view}
            className={`rail-btn ${view === item.view ? 'active' : ''}`}
            onClick={() => setView(item.view)}
            title={item.label}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
            {((item.view === 'studio' && studioDirty) || (item.view === 'editor' && editorDirty)) && (
              <i className="dot" aria-label="Unsaved changes" />
            )}
          </button>
        ))}
        <div className="rail-spacer" />
        <ThemeButton />
      </nav>
      <main className="content">
        {view === 'library' && <LibraryView />}
        {view === 'studio' && <StudioView />}
        {view === 'editor' && <EditorView />}
      </main>
      <PromptDialog />
      <Toasts />
      <Tooltips />
      <RecoveryDialog />
      <ShortcutsDialog />
    </div>
  )
}

/** An 8×8 pixel "S" drawn as rects. */
function BrandMark() {
  const rows = ['.######.', '##....##', '##......', '.######.', '......##', '##....##', '.######.', '........']
  return (
    <svg width="28" height="28" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => (c === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null))
      )}
    </svg>
  )
}

const THEMES: Array<{ theme: Theme; label: string; icon: IconName }> = [
  { theme: 'system', label: 'System', icon: 'themeAuto' },
  { theme: 'dark', label: 'Dark', icon: 'moon' },
  { theme: 'light', label: 'Light', icon: 'sun' }
]

/** Cycles System → Dark → Light. */
function ThemeButton() {
  const theme = useApp((s) => s.theme)
  const setTheme = useApp((s) => s.setTheme)
  const i = THEMES.findIndex((t) => t.theme === theme)
  const current = THEMES[i]
  const next = THEMES[(i + 1) % THEMES.length]
  return (
    <button className="rail-btn theme-btn" onClick={() => setTheme(next.theme)} title={`Theme: ${current.label} · click for ${next.label}`}>
      <Icon name={current.icon} size={18} />
      <span>{current.label}</span>
    </button>
  )
}
