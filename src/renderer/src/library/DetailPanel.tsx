import { useEffect, useMemo, useRef, useState } from 'react'
import { stripExt } from '@shared/paths'
import type { LibraryItem } from '@shared/types'
import { Icon } from '@/app/Icon'
import { attempt, useApp } from '@/app/store'
import { itemUrl } from '@/lib/fileUrl'
import { formatBytes, formatDateTime, formatDimensions } from '@/lib/format'
import { openInStudio } from '@/studio/io'

const ZOOMS = ['fit', 1, 2, 4, 8] as const
type Zoom = (typeof ZOOMS)[number]

export function confirmDelete(paths: string[]): Promise<void> | undefined {
  const what = paths.length === 1 ? `"${paths[0].split('/').pop()}"` : `${paths.length} items`
  if (!window.confirm(`Move ${what} to the Trash?`)) return
  return attempt(() => window.api.deleteItems(paths)).then(() => undefined)
}

export function DetailPanel({ allTags }: { allTags: string[] }) {
  const library = useApp((s) => s.library)
  const selection = useApp((s) => s.selection)
  const items = useMemo(() => {
    const chosen = new Set(selection)
    return library?.items.filter((i) => chosen.has(i.path)) ?? []
  }, [library, selection])

  if (items.length === 0) {
    return (
      <aside className="detail empty">
        <p className="muted">Select an image to see its details.</p>
        <p className="muted small">
          Drag files in from Finder, paste an image with ⌘V, or use Import. Double-click a sprite to open it in Pixel
          Studio.
        </p>
      </aside>
    )
  }
  if (items.length > 1) return <BulkPanel items={items} allTags={allTags} folders={library?.folders ?? []} />
  return <SinglePanel key={items[0].path} item={items[0]} allTags={allTags} folders={library?.folders ?? []} />
}

function SinglePanel({ item, allTags, folders }: { item: LibraryItem; allTags: string[]; folders: string[] }) {
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [paused, setPaused] = useState(false)
  const [notes, setNotes] = useState(item.notes)
  const [name, setName] = useState(stripExt(item.name))
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animated = (item.frames ?? 1) > 1

  useEffect(() => setNotes(item.notes), [item.notes])
  useEffect(() => setName(stripExt(item.name)), [item.name])

  // Pausing freezes the current GIF frame by copying it onto a canvas.
  useEffect(() => {
    if (!paused || !imgRef.current || !canvasRef.current) return
    const img = imgRef.current
    const canvas = canvasRef.current
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d')!.drawImage(img, 0, 0)
  }, [paused])

  const update = (patch: Partial<LibraryItem>): void => void attempt(() => window.api.updateMeta([item.path], patch))

  const rename = (): void => {
    if (name.trim() && name.trim() !== stripExt(item.name)) {
      void attempt(async () => useApp.getState().select([await window.api.renameItem(item.path, name)]))
    } else {
      setName(stripExt(item.name))
    }
  }

  // "Fit" scales small sprites up by a whole number so the pixels stay square.
  const fitScale = item.width && item.height ? Math.floor(Math.min(250 / item.width, 216 / item.height)) : 0
  const scale = zoom === 'fit' ? fitScale : zoom
  const previewStyle =
    scale >= 1 && item.width && item.height
      ? { width: item.width * scale, height: item.height * scale, maxWidth: 'none' }
      : { maxWidth: '100%', maxHeight: '100%' }

  return (
    <aside className="detail">
      <div className="preview checker">
        <img
          ref={imgRef}
          src={itemUrl(item)}
          alt=""
          crossOrigin="anonymous"
          className={zoom === 'fit' && (item.width ?? 999) > 256 ? '' : 'pixelated'}
          style={{ ...previewStyle, visibility: paused ? 'hidden' : 'visible', position: paused ? 'absolute' : undefined }}
        />
        {paused && <canvas ref={canvasRef} className="pixelated" style={previewStyle} />}
      </div>
      <div className="preview-controls">
        {ZOOMS.map((z) => (
          <button key={z} className={`chip ${zoom === z ? 'on' : ''}`} onClick={() => setZoom(z)}>
            {z === 'fit' ? 'Fit' : `${z}×`}
          </button>
        ))}
        {animated && (
          <button className="chip" onClick={() => setPaused(!paused)}>
            {paused ? '▶ Play' : '❚❚ Pause'}
          </button>
        )}
      </div>

      <div className="detail-body">
        <div className="name-row">
          <input
            className="input name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setName(stripExt(item.name))
                e.currentTarget.blur()
              }
            }}
            title="Rename"
          />
          <span className="muted">.{item.ext}</span>
          <button
            className={`icon-btn ${item.favorite ? 'fav' : ''}`}
            title={item.favorite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={() => update({ favorite: !item.favorite })}
          >
            <Icon name="star" size={18} filled={item.favorite} />
          </button>
        </div>

        <Stars value={item.rating} onChange={(rating) => update({ rating })} />

        <dl className="info">
          <dt>Dimensions</dt>
          <dd>{formatDimensions(item.width, item.height)}</dd>
          <dt>File size</dt>
          <dd>{formatBytes(item.size)}</dd>
          <dt>Type</dt>
          <dd>
            {item.ext.toUpperCase()}
            {animated ? ` · ${item.frames} frames` : ''}
          </dd>
          <dt>Colours</dt>
          <dd>{item.colorCount ?? '—'}</dd>
          <dt>Folder</dt>
          <dd>
            <select
              className="select small"
              value={item.folder}
              onChange={(e) =>
                void attempt(async () => useApp.getState().select(await window.api.moveItems([item.path], e.target.value)))
              }
            >
              <option value="">Library</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </dd>
          <dt>Added</dt>
          <dd>{formatDateTime(item.addedAt)}</dd>
          <dt>Modified</dt>
          <dd>{formatDateTime(item.modifiedAt)}</dd>
        </dl>

        <TagEditor tags={item.tags} allTags={allTags} onChange={(tags) => update({ tags })} />

        <label className="field">
          <span>Notes</span>
          <textarea
            className="input"
            rows={3}
            value={notes}
            placeholder="Anything worth remembering…"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== item.notes && update({ notes })}
          />
        </label>

        <div className="actions">
          {item.ext !== 'svg' && (
            <button className="btn primary" onClick={() => void openInStudio(item)}>
              <Icon name="studio" /> {item.hasProject ? 'Edit in Pixel Studio' : 'Open in Pixel Studio'}
            </button>
          )}
          <div className="action-row">
            <button className="btn" onClick={() => void attempt(() => window.api.revealItem(item.path))} title="Show in Finder">
              <Icon name="reveal" /> Finder
            </button>
            <button
              className="btn"
              onClick={() =>
                void attempt(async () => useApp.getState().select([await window.api.duplicateItem(item.path)]))
              }
            >
              <Icon name="copy" /> Duplicate
            </button>
            <button className="btn" onClick={() => void attempt(() => window.api.exportItem(item.path))}>
              <Icon name="export" /> Export
            </button>
          </div>
          <button className="btn danger" onClick={() => void confirmDelete([item.path])}>
            <Icon name="trash" /> Move to Trash
          </button>
        </div>
      </div>
    </aside>
  )
}

function BulkPanel({ items, allTags, folders }: { items: LibraryItem[]; allTags: string[]; folders: string[] }) {
  const paths = items.map((i) => i.path)
  const totalSize = items.reduce((sum, i) => sum + i.size, 0)
  const allFavorite = items.every((i) => i.favorite)
  const shared = allTags.filter((t) => items.every((i) => i.tags.includes(t)))

  const addTag = (tag: string): void => {
    void attempt(async () => {
      for (const item of items) {
        if (!item.tags.includes(tag)) await window.api.updateMeta([item.path], { tags: [...item.tags, tag] })
      }
    })
  }
  const removeTag = (tag: string): void => {
    void attempt(async () => {
      for (const item of items) await window.api.updateMeta([item.path], { tags: item.tags.filter((t) => t !== tag) })
    })
  }

  return (
    <aside className="detail">
      <div className="stack-preview">
        {items.slice(0, 4).map((item, i) => (
          <div key={item.path} className="stack-card checker" style={{ transform: `rotate(${(i - 1.5) * 5}deg)` }}>
            <img src={itemUrl(item)} alt="" className="pixelated" />
          </div>
        ))}
      </div>
      <div className="detail-body">
        <h2>{items.length} items selected</h2>
        <p className="muted">{formatBytes(totalSize)} in total</p>

        <button className="btn" onClick={() => void attempt(() => window.api.updateMeta(paths, { favorite: !allFavorite }))}>
          <Icon name="star" filled={allFavorite} /> {allFavorite ? 'Remove from favourites' : 'Add to favourites'}
        </button>

        <TagEditor
          label="Tags on every selected item"
          tags={shared}
          allTags={allTags}
          onChange={(tags) => {
            const added = tags.find((t) => !shared.includes(t))
            const removed = shared.find((t) => !tags.includes(t))
            if (added) addTag(added)
            if (removed) removeTag(removed)
          }}
        />

        <label className="field">
          <span>Move to folder</span>
          <select
            className="select"
            value="__"
            onChange={(e) => void attempt(async () => useApp.getState().select(await window.api.moveItems(paths, e.target.value)))}
          >
            <option value="__" disabled>
              Choose a folder…
            </option>
            <option value="">Library</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <button className="btn danger" onClick={() => void confirmDelete(paths)}>
          <Icon name="trash" /> Move {items.length} items to Trash
        </button>
      </div>
    </aside>
  )
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="stars" title="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={n <= value ? 'on' : ''} onClick={() => onChange(n === value ? 0 : n)}>
          ★
        </button>
      ))}
    </div>
  )
}

function TagEditor({
  tags,
  allTags,
  onChange,
  label = 'Tags'
}: {
  tags: string[]
  allTags: string[]
  onChange: (tags: string[]) => void
  label?: string
}) {
  const [draft, setDraft] = useState('')
  const add = (): void => {
    const tag = draft.trim().replace(/^#/, '').toLowerCase()
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setDraft('')
  }
  return (
    <div className="field">
      <span>{label}</span>
      <div className="tags">
        {tags.map((t) => (
          <span key={t} className="tag">
            #{t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} title="Remove tag">
              ×
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          list="all-tags"
          placeholder="Add tag…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
        />
        <datalist id="all-tags">
          {allTags.filter((t) => !tags.includes(t)).map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
    </div>
  )
}
