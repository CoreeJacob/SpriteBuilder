import { useCallback, useMemo, useState, type DragEvent } from 'react'
import { basenameRel, dirnameRel, isInside } from '@shared/paths'
import { ContextMenu, type MenuEntry, type MenuRequest } from '@/app/ContextMenu'
import { backupLibrary, changeLibraryFolder, reportImport, restoreLibrary } from '@/app/libraryActions'
import { Icon } from '@/app/Icon'
import { attempt, useApp } from '@/app/store'
import type { Scope } from './filter'

const FOLDER_DRAG_TYPE = 'application/x-spritebuilder-folder'

/** The folder being dragged. Drag data can't be read during dragover, so it's kept here too. */
let draggedFolder: string | null = null

/**
 * Lets a sidebar entry accept drops: other folders (moved inside this one) and files, which are
 * imported, or moved here if they're the library's own images (dragged from a thumbnail).
 */
function useDropTarget(folder: string | null) {
  const [over, setOver] = useState(false)
  if (folder === null) return { over: false, handlers: {} }

  const kind = (e: DragEvent): 'folder' | 'files' | null => {
    const types = e.dataTransfer.types
    if (types.includes(FOLDER_DRAG_TYPE)) {
      // A folder can't go inside itself or stay where it is.
      const source = draggedFolder
      return source && !isInside(folder, source) && dirnameRel(source) !== folder ? 'folder' : null
    }
    if (types.includes('Files')) return 'files'
    return null
  }

  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        const k = kind(e)
        if (!k) return
        e.preventDefault()
        e.dataTransfer.dropEffect = k === 'files' ? 'copy' : 'move'
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false)
        const k = kind(e)
        if (!k) return
        e.preventDefault()
        const app = useApp.getState()
        const where = folder || 'Library'
        if (k === 'folder') {
          const source = e.dataTransfer.getData(FOLDER_DRAG_TYPE)
          void attempt(async () => {
            await window.api.moveFolder(source, folder)
            app.notify(`Moved “${basenameRel(source)}” into ${where}`)
          })
        } else {
          const paths = [...e.dataTransfer.files].map((f) => window.api.getPathForFile(f)).filter(Boolean)
          if (!paths.length) return
          void attempt(async () => reportImport(await window.api.importFiles(folder, paths), folder))
        }
      }
    }
  }
}

export function FolderSidebar() {
  const library = useApp((s) => s.library)
  const scope = useApp((s) => s.scope)
  const setScope = useApp((s) => s.setScope)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  const counts = useMemo(() => {
    const direct = new Map<string, number>()
    for (const item of library?.items ?? []) direct.set(item.folder, (direct.get(item.folder) ?? 0) + 1)
    return direct
  }, [library])

  if (!library) return <aside className="sidebar" />

  const favorites = library.items.filter((i) => i.favorite).length
  const isActive = (s: Scope): boolean =>
    s.kind === scope.kind && (s.kind !== 'folder' || (scope.kind === 'folder' && scope.path === s.path))

  const toggle = (folder: string): void => {
    const next = new Set(collapsed)
    if (next.has(folder)) next.delete(folder)
    else next.add(folder)
    setCollapsed(next)
  }

  const visibleFolders = library.folders.filter((f) => {
    // Hidden when any ancestor is collapsed.
    for (let p = dirnameRel(f); ; p = dirnameRel(p)) {
      if (collapsed.has(p)) return false
      if (p === '') return true
    }
  })

  const newFolder = async (parent: string): Promise<void> => {
    const name = await useApp.getState().ask({
      title: 'New Folder',
      label: `Inside "${parent || 'Library'}"`,
      value: 'New Folder',
      confirmLabel: 'Create'
    })
    if (!name) return
    const created = await attempt(() => window.api.createFolder(parent, name))
    if (created !== undefined) {
      const next = new Set(collapsed)
      next.delete(parent)
      setCollapsed(next)
      setScope({ kind: 'folder', path: created })
    }
  }

  const renameFolder = async (folder: string): Promise<void> => {
    const name = await useApp.getState().ask({ title: 'Rename Folder', value: basenameRel(folder), confirmLabel: 'Rename' })
    if (!name) return
    const renamed = await attempt(() => window.api.renameFolder(folder, name))
    if (renamed !== undefined && scope.kind === 'folder' && isInside(scope.path, folder)) {
      setScope({ kind: 'folder', path: renamed + scope.path.slice(folder.length) })
    }
  }

  const deleteFolder = async (folder: string): Promise<void> => {
    if (!window.confirm(`Move "${basenameRel(folder)}" and everything in it to the Trash?`)) return
    await attempt(() => window.api.deleteFolder(folder))
  }

  const folderMenu = (folder: string): MenuEntry[] => [
    { label: 'New Folder Inside…', icon: 'folderPlus', onSelect: () => void newFolder(folder) },
    ...(folder
      ? ([{ label: 'Rename…', icon: 'rename', onSelect: () => void renameFolder(folder) }] satisfies MenuEntry[])
      : []),
    { label: 'Show in Finder', icon: 'reveal', onSelect: () => void attempt(() => window.api.revealItem(folder)) },
    ...(folder
      ? (['separator', { label: 'Move to Trash', icon: 'trash', danger: true, onSelect: () => void deleteFolder(folder) }] satisfies MenuEntry[])
      : [])
  ]

  const currentFolder = scope.kind === 'folder' ? scope.path : ''

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <SidebarEntry
          icon="all"
          label="All Images"
          count={library.items.length}
          active={isActive({ kind: 'all' })}
          onClick={() => setScope({ kind: 'all' })}
          dropFolder={null}
        />
        <SidebarEntry
          icon="star"
          label="Favourites"
          count={favorites}
          active={isActive({ kind: 'favorites' })}
          onClick={() => setScope({ kind: 'favorites' })}
          dropFolder={null}
        />
      </div>

      <div className="sidebar-heading">
        <span>Folders</span>
        <button className="icon-btn" title="New folder" onClick={() => void newFolder(currentFolder)}>
          <Icon name="folderPlus" />
        </button>
      </div>
      <div className="sidebar-section tree">
        <SidebarEntry
          icon="folder"
          label="Library"
          count={counts.get('') ?? 0}
          active={isActive({ kind: 'folder', path: '' })}
          onClick={() => setScope({ kind: 'folder', path: '' })}
          onMenu={(e) => setMenu({ x: e.clientX, y: e.clientY, entries: folderMenu('') })}
          dropFolder=""
        />
        {visibleFolders.map((folder) => {
          const hasChildren = library.folders.some((f) => dirnameRel(f) === folder)
          return (
            <SidebarEntry
              key={folder}
              icon="folder"
              label={basenameRel(folder)}
              depth={folder.split('/').length}
              count={counts.get(folder) ?? 0}
              active={isActive({ kind: 'folder', path: folder })}
              onClick={() => setScope({ kind: 'folder', path: folder })}
              onMenu={(e) => setMenu({ x: e.clientX, y: e.clientY, entries: folderMenu(folder) })}
              expander={hasChildren ? { open: !collapsed.has(folder), toggle: () => toggle(folder) } : undefined}
              dropFolder={folder}
              dragFolder={folder}
            />
          )
        })}
      </div>

      <div className="sidebar-footer">
        <div className="muted small" title={library.root}>
          {library.root.replace(/^\/Users\/[^/]+/, '~')}
        </div>
        <div className="footer-actions">
          <button className="btn small" onClick={() => void changeLibraryFolder()} title="Open a different folder as the library">
            Change Folder…
          </button>
          <button
            className="icon-btn"
            title="Back up or restore the library"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenu({
                x: r.left,
                y: r.top - 4,
                entries: [
                  { label: 'Back Up Library…', icon: 'archive', onSelect: () => void backupLibrary() },
                  { label: 'Restore from Backup…', icon: 'import', onSelect: () => void restoreLibrary() },
                  'separator',
                  { label: 'Show Library in Finder', icon: 'reveal', onSelect: () => void attempt(() => window.api.revealItem('')) }
                ]
              })
            }}
          >
            <Icon name="more" />
          </button>
        </div>
      </div>

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </aside>
  )
}

interface EntryProps {
  icon: 'all' | 'star' | 'folder'
  label: string
  count: number
  active: boolean
  depth?: number
  onClick: () => void
  onMenu?: (e: React.MouseEvent) => void
  expander?: { open: boolean; toggle: () => void }
  dropFolder: string | null
  /** Set on folders that can be dragged to move them. */
  dragFolder?: string
}

function SidebarEntry({ icon, label, count, active, depth = 0, onClick, onMenu, expander, dropFolder, dragFolder }: EntryProps) {
  const drop = useDropTarget(dropFolder)
  return (
    <div
      className={`sidebar-entry ${active ? 'active' : ''} ${drop.over ? 'drop-over' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={onClick}
      draggable={dragFolder !== undefined}
      onDragStart={(e) => {
        if (dragFolder === undefined) return
        draggedFolder = dragFolder
        e.dataTransfer.setData(FOLDER_DRAG_TYPE, dragFolder)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => (draggedFolder = null)}
      onContextMenu={(e) => {
        if (!onMenu) return
        e.preventDefault()
        e.stopPropagation()
        onMenu(e)
      }}
      {...drop.handlers}
    >
      <span
        className={`expander ${expander ? '' : 'hidden'} ${expander?.open ? 'open' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          expander?.toggle()
        }}
      >
        <Icon name="chevron" size={12} />
      </span>
      <Icon name={icon} filled={icon === 'star' && active} />
      <span className="entry-label">{label}</span>
      <span className="entry-count">{count}</span>
    </div>
  )
}

