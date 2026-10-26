import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { basenameRel } from '@shared/paths'
import type { ImportedFile } from '@shared/types'
import { Icon } from '@/app/Icon'
import { reportImport } from '@/app/libraryActions'
import { attempt, useApp } from '@/app/store'
import { formatBytes } from '@/lib/format'
import { confirmDelete, DetailPanel } from './DetailPanel'
import { allTags as collectTags, countActiveFilters, groupByFolder, inScope, visibleItems } from './filter'
import { FolderSidebar } from './FolderSidebar'
import { ItemGrid, ItemList } from './ItemViews'
import { Toolbar } from './Toolbar'
import { isTyping } from '@/lib/dom'

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp'
}

async function readBrowserFiles(files: File[]): Promise<ImportedFile[]> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
  return Promise.all(
    files
      .filter((f) => MIME_EXT[f.type])
      .map(async (f, i) => ({
        // Pasted images arrive as "image.png"; give them a dated name instead.
        name: f.name && f.name !== 'image.png' ? f.name : `pasted-${stamp}${i ? `-${i + 1}` : ''}.${MIME_EXT[f.type]}`,
        data: new Uint8Array(await f.arrayBuffer())
      }))
  )
}

export function LibraryView() {
  const library = useApp((s) => s.library)
  const bigLibraryPreview = useApp((s) => s.bigLibraryPreview)
  const scope = useApp((s) => s.scope)
  const includeSubfolders = useApp((s) => s.includeSubfolders)
  const filters = useApp((s) => s.filters)
  const sort = useApp((s) => s.sort)
  const layout = useApp((s) => s.layout)
  const selection = useApp((s) => s.selection)
  const [dropping, setDropping] = useState(false)

  const sorted = useMemo(
    () => (library ? visibleItems(library.items, scope, includeSubfolders, filters, sort) : []),
    [library, scope, includeSubfolders, filters, sort]
  )
  // In a folder with subfolders included, show a section per folder. `items` follows the
  // on-screen order so shift-click ranges and ⌘A match what you see.
  const openFolder = scope.kind === 'folder' ? scope.path : ''
  const groups = useMemo(
    () => (scope.kind === 'folder' && includeSubfolders ? groupByFolder(sorted, openFolder) : undefined),
    [sorted, scope.kind, includeSubfolders, openFolder]
  )
  const items = useMemo(() => (groups ? groups.flatMap((g) => g.items) : sorted), [groups, sorted])
  const tags = useMemo(() => collectTags(library?.items ?? []), [library])
  const destFolder = scope.kind === 'folder' ? scope.path : ''

  const importInto = async (files: ImportedFile[] | string[]): Promise<void> => {
    if (!files.length) return
    const result = await attempt(async () =>
      typeof files[0] === 'string'
        ? window.api.importFiles(destFolder, files as string[])
        : { imported: await window.api.importData(destFolder, files as ImportedFile[]), moved: [], unchanged: [] }
    )
    if (result) reportImport(result, destFolder)
  }

  // Cancelling the Open dialog also returns no files, so stay quiet in that case.
  const importWithDialog = async (): Promise<void> => {
    const result = await attempt(() => window.api.importFiles(destFolder))
    if (result) reportImport(result, destFolder, true)
  }

  // Paste an image from the clipboard (e.g. a screenshot) into the current folder.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      if (isTyping() || useApp.getState().prompt) return
      const files = [...(e.clipboardData?.files ?? [])]
      if (!files.length) return
      e.preventDefault()
      void readBrowserFiles(files).then(importInto)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  })

  // Keyboard: Delete moves to Trash, Esc clears; ⌘A (from the menu) selects everything shown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTyping() || useApp.getState().prompt) return
      const { selection: sel, select } = useApp.getState()
      if ((e.key === 'Backspace' || e.key === 'Delete') && sel.length) {
        e.preventDefault()
        void confirmDelete(sel)
      } else if (e.key === 'Escape') {
        select([])
      }
    }
    const onSelectAll = (): void => useApp.getState().select(items.map((i) => i.path))
    window.addEventListener('keydown', onKey)
    window.addEventListener('library:selectAll', onSelectAll)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('library:selectAll', onSelectAll)
    }
  }, [items])

  const isFileDrag = (e: DragEvent): boolean => e.dataTransfer.types.includes('Files')

  const onDrop = (e: DragEvent): void => {
    setDropping(false)
    if (!isFileDrag(e)) return
    e.preventDefault()
    const files = [...e.dataTransfer.files]
    const paths = files.map((f) => window.api.getPathForFile(f)).filter(Boolean)
    if (paths.length) void importInto(paths)
    else void readBrowserFiles(files).then(importInto)
  }

  if (!library) return <div className="loading">Opening library…</div>

  const scopeTitle =
    scope.kind === 'all' ? 'All Images' : scope.kind === 'favorites' ? 'Favourites' : scope.path ? basenameRel(scope.path) : 'Library'
  const totalSize = items.reduce((sum, i) => sum + i.size, 0)
  const hiddenByFilters = countActiveFilters(filters) > 0 || filters.search.trim() !== ''
  const hiddenCount = library.items.filter((i) => inScope(i, scope, includeSubfolders)).length - items.length

  return (
    <div className={`library ${bigLibraryPreview ? 'big-preview' : ''}`}>
      <FolderSidebar />
      <section className="lib-main">
        <header className="lib-header">
          <h1>{scopeTitle}</h1>
          {scope.kind === 'folder' && scope.path.includes('/') && <span className="muted">{scope.path}</span>}
          <div className="spacer" />
          <button
            className="btn primary"
            onClick={() => void importWithDialog()}
            title={`Copy images into “${destFolder || 'Library'}”`}
          >
            <Icon name="import" /> Import
          </button>
        </header>
        <Toolbar tags={tags} />
        <div
          className={`lib-items ${dropping ? 'dropping' : ''}`}
          onClick={() => useApp.getState().select([])}
          onDragOver={(e) => {
            if (!isFileDrag(e)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            setDropping(true)
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDropping(false)
          }}
          onDrop={onDrop}
        >
          {items.length === 0 ? (
            <div className="empty-state">
              {library.items.length === 0 ? (
                <>
                  <h2>Your library is empty</h2>
                  <p className="muted">
                    Drag images here from Finder, paste with ⌘V, or click Import. Sprites you draw in Pixel Studio
                    are saved here too.
                  </p>
                </>
              ) : (
                <>
                  <h2>Nothing matches</h2>
                  <p className="muted">
                    {hiddenByFilters ? 'Try clearing the search or filters.' : 'This folder is empty. Drop images here to add them.'}
                  </p>
                </>
              )}
            </div>
          ) : layout === 'grid' ? (
            <ItemGrid items={items} groups={groups} openFolder={openFolder} />
          ) : (
            <ItemList items={items} groups={groups} openFolder={openFolder} />
          )}
          {dropping && <div className="drop-overlay">Drop to add to “{destFolder || 'Library'}”</div>}
        </div>
        <footer className="statusbar">
          <span>
            {items.length} item{items.length === 1 ? '' : 's'} · {formatBytes(totalSize)}
          </span>
          {selection.length > 0 && <span>{selection.length} selected</span>}
          {hiddenCount > 0 && <span className="muted">{hiddenCount} hidden by filters</span>}
        </footer>
      </section>
      <DetailPanel allTags={tags} />
    </div>
  )
}
