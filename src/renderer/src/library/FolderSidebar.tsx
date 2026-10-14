import { useMemo, useState, type DragEvent } from 'react'
import { basenameRel, dirnameRel, isInside } from '@shared/paths'
import { Icon } from '@/app/Icon'
import { attempt, useApp } from '@/app/store'
import type { Scope } from './filter'

export const ITEM_DRAG_TYPE = 'application/x-spritebuilder-items'

interface MenuState {
  folder: string
  x: number
  y: number
}

/** Handlers that let a sidebar entry accept library items dragged onto it. */
function useDropTarget(folder: string | null) {
  const [over, setOver] = useState(false)
  if (folder === null) return { over: false, handlers: {} }
  const accepts = (e: DragEvent): boolean => e.dataTransfer.types.includes(ITEM_DRAG_TYPE)
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!accepts(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false)
        if (!accepts(e)) return
        e.preventDefault()
        const paths: string[] = JSON.parse(e.dataTransfer.getData(ITEM_DRAG_TYPE))
        void attempt(async () => {
          const moved = await window.api.moveItems(paths, folder)
          useApp.getState().select(moved)
          useApp.getState().notify(`Moved ${moved.length} item${moved.length === 1 ? '' : 's'} to ${folder || 'Library'}`)
        })
      }
    }
  }
}

export function FolderSidebar() {
  const library = useApp((s) => s.library)
  const scope = useApp((s) => s.scope)
  const setScope = useApp((s) => s.setScope)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<MenuState | null>(null)

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
    setMenu(null)
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
    setMenu(null)
    const name = await useApp.getState().ask({ title: 'Rename Folder', value: basenameRel(folder), confirmLabel: 'Rename' })
    if (!name) return
    const renamed = await attempt(() => window.api.renameFolder(folder, name))
    if (renamed !== undefined && scope.kind === 'folder' && isInside(scope.path, folder)) {
      setScope({ kind: 'folder', path: renamed + scope.path.slice(folder.length) })
    }
  }

  const deleteFolder = async (folder: string): Promise<void> => {
    setMenu(null)
    if (!window.confirm(`Move "${basenameRel(folder)}" and everything in it to the Trash?`)) return
    await attempt(() => window.api.deleteFolder(folder))
  }

  const currentFolder = scope.kind === 'folder' ? scope.path : ''

  return (
    <aside className="sidebar" onClick={() => setMenu(null)}>
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
          onMenu={(e) => setMenu({ folder: '', x: e.clientX, y: e.clientY })}
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
              onMenu={(e) => setMenu({ folder, x: e.clientX, y: e.clientY })}
              expander={hasChildren ? { open: !collapsed.has(folder), toggle: () => toggle(folder) } : undefined}
              dropFolder={folder}
            />
          )
        })}
      </div>

      <div className="sidebar-footer">
        <div className="muted small" title={library.root}>
          {library.root.replace(/^\/Users\/[^/]+/, '~')}
        </div>
        <button
          className="btn small"
          onClick={() => void attempt(async () => {
            const snapshot = await window.api.chooseLibraryRoot()
            if (snapshot) {
              useApp.getState().setLibrary(snapshot)
              setScope({ kind: 'all' })
            }
          })}
        >
          Change Folder…
        </button>
      </div>

      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => void newFolder(menu.folder)}>New Folder Inside</button>
          {menu.folder !== '' && <button onClick={() => void renameFolder(menu.folder)}>Rename…</button>}
          {menu.folder !== '' && (
            <button className="danger" onClick={() => void deleteFolder(menu.folder)}>
              Move to Trash
            </button>
          )}
        </div>
      )}
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
}

function SidebarEntry({ icon, label, count, active, depth = 0, onClick, onMenu, expander, dropFolder }: EntryProps) {
  const drop = useDropTarget(dropFolder)
  return (
    <div
      className={`sidebar-entry ${active ? 'active' : ''} ${drop.over ? 'drop-over' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={onClick}
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

