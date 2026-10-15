import { useEffect } from 'react'
import { useEnrichment } from '@/library/enrich'
import { LibraryView } from '@/library/LibraryView'
import { EditorView } from '@/editor/EditorView'
import { StudioView } from '@/studio/StudioView'
import { useEditor } from '@/editor/store'
import { useStudio } from '@/studio/store'
import { Icon, type IconName } from './Icon'
import { PromptDialog, Toasts } from './Overlays'
import { Tooltips } from './Tooltips'
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
  const studioDirty = useStudio((s) => s.dirty)
  const editorDirty = useEditor((s) => s.dirty)
  const dirty = studioDirty || editorDirty

  useEffect(() => {
    void window.api.getLibrary().then(setLibrary)
    return window.api.onLibraryChanged(setLibrary)
  }, [setLibrary])

  // The app menu owns ⌘Z and ⌘A, so route them to text fields or the current screen.
  useEffect(
    () =>
      window.api.onMenuCommand((command) => {
        const view = useApp.getState().view
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
            {((item.view === 'studio' && studioDirty) || (item.view === 'editor' && editorDirty)) && (
              <i className="dot" aria-label="Unsaved changes" />
            )}
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
      <Tooltips />
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
