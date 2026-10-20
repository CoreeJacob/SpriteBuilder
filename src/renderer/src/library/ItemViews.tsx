import type { DragEvent, MouseEvent } from 'react'
import type { LibraryItem } from '@shared/types'
import { Icon } from '@/app/Icon'
import { useApp } from '@/app/store'
import { itemUrl } from '@/lib/fileUrl'
import { formatBytes, formatDate, formatDimensions } from '@/lib/format'
import { openInStudio } from '@/studio/io'
import type { FolderGroup, SortKey } from './filter'
import { useItemMenu } from './ItemMenu'

interface ViewProps {
  items: LibraryItem[]
  /** When set, items are shown in sections per folder (the open folder plus its subfolders). */
  groups?: FolderGroup[]
  openFolder?: string
}

/** Sections only help when images come from more than one folder. */
const sectioned = (groups: FolderGroup[] | undefined): groups is FolderGroup[] => !!groups && groups.length > 1

/** "Tiles/Water/Deep" seen from "Tiles" → "Water / Deep". */
function relativeLabel(folder: string, openFolder: string): string {
  const rel = openFolder && folder.startsWith(openFolder + '/') ? folder.slice(openFolder.length + 1) : folder
  return rel.split('/').join(' / ')
}

function GroupHeader({ group, openFolder }: { group: FolderGroup; openFolder: string }) {
  const setScope = useApp((s) => s.setScope)
  const own = group.folder === openFolder
  const count = `${group.items.length} image${group.items.length === 1 ? '' : 's'}`
  if (own) {
    return (
      <div className="group-header own">
        <Icon name="folder" size={14} />
        <span className="group-name">In this folder</span>
        <span className="group-count">{count}</span>
      </div>
    )
  }
  return (
    <button
      className="group-header"
      onClick={(e) => {
        e.stopPropagation()
        setScope({ kind: 'folder', path: group.folder })
      }}
      title={`Open ${group.folder}`}
    >
      <Icon name="folder" size={14} />
      <span className="group-name">{relativeLabel(group.folder, openFolder)}</span>
      <span className="group-count">{count}</span>
      <Icon name="chevron" size={12} />
    </button>
  )
}

/** Click, Cmd-click and Shift-click selection over the visible items. */
function useSelection(items: LibraryItem[]) {
  const selection = useApp((s) => s.selection)
  const anchor = useApp((s) => s.selectionAnchor)
  const select = useApp((s) => s.select)
  const chosen = new Set(selection)

  const onClick = (e: MouseEvent, item: LibraryItem): void => {
    if (e.metaKey || e.ctrlKey) {
      const next = chosen.has(item.path) ? selection.filter((p) => p !== item.path) : [...selection, item.path]
      select(next, item.path)
    } else if (e.shiftKey && anchor) {
      const a = items.findIndex((i) => i.path === anchor)
      const b = items.findIndex((i) => i.path === item.path)
      if (a === -1 || b === -1) return select([item.path])
      const [from, to] = a < b ? [a, b] : [b, a]
      select(items.slice(from, to + 1).map((i) => i.path), anchor)
    } else {
      select([item.path])
    }
  }

  /**
   * Dragging hands the files to macOS as a real file drag: they can go to Finder, the Desktop or
   * another app, and dropping them on a library folder moves them there.
   */
  const onDragStart = (e: DragEvent, item: LibraryItem): void => {
    e.preventDefault()
    // Dragging an unselected item drags just that item.
    const paths = chosen.has(item.path) ? selection : [item.path]
    if (!chosen.has(item.path)) select([item.path])
    window.api.startDrag(paths)
  }

  return { chosen, onClick, onDragStart }
}

const canOpenInStudio = (item: LibraryItem): boolean => item.ext !== 'svg'

function Badges({ item }: { item: LibraryItem }) {
  return (
    <div className="badges">
      {(item.frames ?? 1) > 1 && <span className="badge">▶ {item.frames}f</span>}
      {item.hasProject && (
        <span className="badge" title="Editable Pixel Studio sprite">
          <Icon name="studio" size={10} />
        </span>
      )}
      {item.favorite && (
        <span className="badge star">
          <Icon name="star" size={10} filled />
        </span>
      )}
    </div>
  )
}

export function Thumb({ item, box }: { item: LibraryItem; box: number }) {
  // Hard pixel edges only when scaling small sprites up; big images look better smoothed.
  const upscale = (item.width ?? 0) > 0 && Math.max(item.width ?? 0, item.height ?? 0) <= box
  return (
    <img
      src={itemUrl(item)}
      alt=""
      draggable={false}
      loading="lazy"
      className={upscale ? 'pixelated' : ''}
    />
  )
}

export function ItemGrid({ items, groups, openFolder = '' }: ViewProps) {
  const thumbSize = useApp((s) => s.thumbSize)
  const { chosen, onClick, onDragStart } = useSelection(items)
  const menu = useItemMenu()
  const grid = (list: LibraryItem[]) => (
    <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}>
      {list.map((item) => (
        <div
          key={item.path}
          className={`card ${chosen.has(item.path) ? 'selected' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onClick(e, item)
          }}
          onDoubleClick={() => canOpenInStudio(item) && void openInStudio(item)}
          onContextMenu={(e) => menu.open(e, item)}
          draggable
          onDragStart={(e) => onDragStart(e, item)}
          title={item.path}
        >
          <div className="thumb checker" style={{ height: thumbSize }}>
            <Thumb item={item} box={thumbSize} />
            <Badges item={item} />
          </div>
          <div className="card-name">{item.name}</div>
          <div className="card-meta">
            {formatDimensions(item.width, item.height)} · {formatBytes(item.size)}
          </div>
        </div>
      ))}
    </div>
  )
  if (!sectioned(groups)) {
    return (
      <>
        {grid(items)}
        {menu.element}
      </>
    )
  }
  return (
    <div className="folder-groups">
      {menu.element}
      {groups.map((g) => (
        <section key={g.folder} className="folder-group">
          <GroupHeader group={g} openFolder={openFolder} />
          {grid(g.items)}
        </section>
      ))}
    </div>
  )
}

const COLUMNS: Array<{ key: SortKey | null; label: string; className?: string }> = [
  { key: null, label: '', className: 'col-thumb' },
  { key: 'name', label: 'Name' },
  { key: null, label: 'Folder' },
  { key: 'type', label: 'Type' },
  { key: 'dimensions', label: 'Size (px)' },
  { key: 'size', label: 'File size' },
  { key: 'colorCount', label: 'Colours' },
  { key: 'addedAt', label: 'Added' },
  { key: 'modifiedAt', label: 'Modified' }
]

export function ItemList({ items, groups, openFolder = '' }: ViewProps) {
  const sort = useApp((s) => s.sort)
  const setSort = useApp((s) => s.setSort)
  const { chosen, onClick, onDragStart } = useSelection(items)
  const menu = useItemMenu()

  return (
    <>
    {menu.element}
    <table className="list">
      <thead>
        <tr>
          {COLUMNS.map((col, i) => (
            <th
              key={i}
              className={`${col.className ?? ''} ${col.key ? 'sortable' : ''}`}
              onClick={() =>
                col.key &&
                setSort({ key: col.key, dir: sort.key === col.key && sort.dir === 'asc' ? 'desc' : 'asc' })
              }
            >
              {col.label}
              {col.key && sort.key === col.key && (sort.dir === 'asc' ? ' ↑' : ' ↓')}
            </th>
          ))}
        </tr>
      </thead>
      {(sectioned(groups) ? groups : [{ folder: '', items }]).map((g) => (
      <tbody key={g.folder}>
        {sectioned(groups) && (
          <tr className="group-row">
            <td colSpan={COLUMNS.length}>
              <GroupHeader group={g} openFolder={openFolder} />
            </td>
          </tr>
        )}
        {g.items.map((item) => (
          <tr
            key={item.path}
            className={chosen.has(item.path) ? 'selected' : ''}
            onClick={(e) => {
              e.stopPropagation()
              onClick(e, item)
            }}
            onDoubleClick={() => canOpenInStudio(item) && void openInStudio(item)}
          onContextMenu={(e) => menu.open(e, item)}
            draggable
            onDragStart={(e) => onDragStart(e, item)}
          >
            <td className="col-thumb">
              <div className="mini checker">
                <Thumb item={item} box={32} />
              </div>
            </td>
            <td>
              <span className="row-name">{item.name}</span>
              {item.favorite && <Icon name="star" size={12} filled />}
              {item.tags.map((t) => (
                <span key={t} className="tag small">
                  #{t}
                </span>
              ))}
            </td>
            <td className="muted">{item.folder || '—'}</td>
            <td>{item.ext.toUpperCase()}{(item.frames ?? 1) > 1 ? ` · ${item.frames}f` : ''}</td>
            <td>{formatDimensions(item.width, item.height)}</td>
            <td>{formatBytes(item.size)}</td>
            <td>{item.colorCount ?? '—'}</td>
            <td>{formatDate(item.addedAt)}</td>
            <td>{formatDate(item.modifiedAt)}</td>
          </tr>
        ))}
      </tbody>
      ))}
    </table>
    </>
  )
}
