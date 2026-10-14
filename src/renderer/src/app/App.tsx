import { useEffect } from 'react'
import { useEnrichment } from '@/library/enrich'
import { LibraryView } from '@/library/LibraryView'
import { EditorView } from '@/editor/EditorView'
import { StudioView } from '@/studio/StudioView'
import { useStudio } from '@/studio/store'
import { Icon, type IconName } from './Icon'
import { PromptDialog, Toasts } from './Overlays'
import { useApp, type View } from './store'

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
  const dirty = useStudio((s) => s.dirty)

  useEffect(() => {
    void window.api.getLibrary().then(setLibrary)
    return window.api.onLibraryChanged(setLibrary)
  }, [setLibrary])

  // The app menu owns Cmd+Z, so route Undo/Redo to text fields or the Studio.
  useEffect(
    () =>
      window.api.onMenuCommand((command) => {
        if (isTyping()) document.execCommand(command)
        else if (useApp.getState().view === 'studio') useStudio.getState()[command]()
      }),
    []
  )

  // Electron shows a "discard changes?" dialog when this is set (see main process).
  useEffect(() => {
    window.onbeforeunload = dirty ? () => false : null
  }, [dirty])

  useEnrichment(library?.items)

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
            {item.view === 'studio' && dirty && <i className="dot" aria-label="Unsaved changes" />}
          </button>
        ))}
      </nav>
      <main className="content">
        {view === 'library' && <LibraryView />}
        {view === 'studio' && <StudioView />}
        {view === 'editor' && <EditorView />}
      </main>
      <PromptDialog />
      <Toasts />
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
