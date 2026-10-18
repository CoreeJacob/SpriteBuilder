import { useMemo, useState } from 'react'
import type { LibraryItem } from '@shared/types'
import { Icon } from '@/app/Icon'
import { useApp } from '@/app/store'
import { Thumb } from './ItemViews'

/** A searchable grid of the library's bitmap images, newest first. */
export function ImageChooser({ onChoose }: { onChoose: (item: LibraryItem) => void }) {
  const library = useApp((s) => s.library)
  const [query, setQuery] = useState('')
  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (library?.items ?? [])
      .filter((i) => i.ext !== 'svg' && (!q || `${i.name} ${i.folder} ${i.tags.join(' ')}`.toLowerCase().includes(q)))
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
  }, [library, query])

  return (
    <>
      <label className="search">
        <Icon name="search" />
        <input placeholder="Search the library…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </label>
      {items.length === 0 ? (
        <p className="muted">{library?.items.length ? 'Nothing matches.' : 'Your library is empty. Import some images first.'}</p>
      ) : (
        <div className="grid picker-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
          {items.map((item) => (
            <button key={item.path} className="card" onClick={() => onChoose(item)} title={item.path}>
              <div className="thumb checker" style={{ height: 110 }}>
                <Thumb item={item} box={110} />
              </div>
              <div className="card-name">{item.name}</div>
              <div className="card-meta">
                {item.width}×{item.height}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
