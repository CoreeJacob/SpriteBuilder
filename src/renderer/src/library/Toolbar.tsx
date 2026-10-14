import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/app/Icon'
import { attempt, useApp } from '@/app/store'
import {
  ADDED_WITHIN,
  countActiveFilters,
  SIZE_RANGES,
  type AddedWithin,
  type Animation,
  type SizeRange,
  type SortKey
} from './filter'

const TYPES = ['png', 'gif', 'jpg', 'webp', 'svg', 'bmp']
const DIMENSIONS = [8, 16, 32, 64, 128, 256]

export const SORT_LABELS: Record<SortKey, string> = {
  name: 'Name',
  addedAt: 'Date added',
  modifiedAt: 'Date modified',
  size: 'File size',
  dimensions: 'Dimensions',
  colorCount: 'Colour count',
  type: 'File type',
  rating: 'Rating'
}

export function Toolbar({ tags, destFolder }: { tags: string[]; destFolder: string }) {
  const filters = useApp((s) => s.filters)
  const setFilters = useApp((s) => s.setFilters)
  const sort = useApp((s) => s.sort)
  const setSort = useApp((s) => s.setSort)
  const layout = useApp((s) => s.layout)
  const setLayout = useApp((s) => s.setLayout)
  const thumbSize = useApp((s) => s.thumbSize)
  const setThumbSize = useApp((s) => s.setThumbSize)
  const scope = useApp((s) => s.scope)
  const includeSubfolders = useApp((s) => s.includeSubfolders)
  const setIncludeSubfolders = useApp((s) => s.setIncludeSubfolders)
  const [showFilters, setShowFilters] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const active = countActiveFilters(filters)

  // Cmd+F focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="toolbar-wrap">
      <div className="toolbar">
        <label className="search">
          <Icon name="search" />
          <input
            ref={searchRef}
            placeholder="Search names, tags, notes…"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            onKeyDown={(e) => e.key === 'Escape' && setFilters({ search: '' })}
          />
        </label>

        <button className={`btn ${showFilters || active ? 'on' : ''}`} onClick={() => setShowFilters(!showFilters)}>
          <Icon name="filter" /> Filters{active ? ` · ${active}` : ''}
        </button>

        <div className="btn-group">
          <select
            className="select"
            value={sort.key}
            onChange={(e) => setSort({ ...sort, key: e.target.value as SortKey })}
            title="Sort by"
          >
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button
            className="btn"
            title={sort.dir === 'asc' ? 'Ascending' : 'Descending'}
            onClick={() => setSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
          >
            {sort.dir === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        {scope.kind === 'folder' && (
          <label className="check">
            <input type="checkbox" checked={includeSubfolders} onChange={(e) => setIncludeSubfolders(e.target.checked)} />
            Subfolders
          </label>
        )}

        <div className="spacer" />

        {layout === 'grid' && (
          <input
            className="slider"
            type="range"
            min={64}
            max={256}
            step={8}
            value={thumbSize}
            onChange={(e) => setThumbSize(Number(e.target.value))}
            title="Thumbnail size"
          />
        )}
        <div className="btn-group">
          <button className={`btn ${layout === 'grid' ? 'on' : ''}`} onClick={() => setLayout('grid')} title="Grid">
            <Icon name="grid" />
          </button>
          <button className={`btn ${layout === 'list' ? 'on' : ''}`} onClick={() => setLayout('list')} title="List">
            <Icon name="list" />
          </button>
        </div>
        <button className="btn primary" onClick={() => void attempt(() => window.api.importFiles(destFolder))}>
          <Icon name="import" /> Import
        </button>
      </div>

      {showFilters && <FilterPanel tags={tags} />}
    </div>
  )
}

function FilterPanel({ tags }: { tags: string[] }) {
  const f = useApp((s) => s.filters)
  const set = useApp((s) => s.setFilters)
  const reset = useApp((s) => s.resetFilters)

  const toggleIn = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  return (
    <div className="filter-panel">
      <FilterGroup label="Type">
        {TYPES.map((t) => (
          <button key={t} className={`chip ${f.types.includes(t) ? 'on' : ''}`} onClick={() => set({ types: toggleIn(f.types, t) })}>
            {t.toUpperCase()}
          </button>
        ))}
      </FilterGroup>

      <FilterGroup label="Animation">
        {(['any', 'static', 'animated'] as Animation[]).map((a) => (
          <button key={a} className={`chip ${f.animation === a ? 'on' : ''}`} onClick={() => set({ animation: a })}>
            {a === 'any' ? 'Any' : a === 'static' ? 'Still' : 'Animated'}
          </button>
        ))}
      </FilterGroup>

      <FilterGroup label="Fits within">
        <button className={`chip ${f.maxDimension === null ? 'on' : ''}`} onClick={() => set({ maxDimension: null })}>
          Any
        </button>
        {DIMENSIONS.map((d) => (
          <button key={d} className={`chip ${f.maxDimension === d ? 'on' : ''}`} onClick={() => set({ maxDimension: d })}>
            {d}×{d}
          </button>
        ))}
      </FilterGroup>

      <FilterGroup label="File size">
        <select className="select" value={f.sizeRange} onChange={(e) => set({ sizeRange: e.target.value as SizeRange })}>
          <option value="any">Any size</option>
          {Object.entries(SIZE_RANGES).map(([key, r]) => (
            <option key={key} value={key}>
              {r.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="Added">
        <select className="select" value={f.addedWithin} onChange={(e) => set({ addedWithin: e.target.value as AddedWithin })}>
          <option value="any">Any time</option>
          {Object.entries(ADDED_WITHIN).map(([key, r]) => (
            <option key={key} value={key}>
              {r.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="Rating">
        {[0, 1, 2, 3, 4, 5].map((r) => (
          <button key={r} className={`chip ${f.minRating === r ? 'on' : ''}`} onClick={() => set({ minRating: r })}>
            {r === 0 ? 'Any' : `${'★'.repeat(r)}+`}
          </button>
        ))}
      </FilterGroup>

      <FilterGroup label="Tags">
        {tags.length === 0 && <span className="muted small">No tags yet. Add them in the details panel.</span>}
        {tags.map((t) => (
          <button key={t} className={`chip ${f.tags.includes(t) ? 'on' : ''}`} onClick={() => set({ tags: toggleIn(f.tags, t) })}>
            #{t}
          </button>
        ))}
      </FilterGroup>

      <FilterGroup label="Other">
        <label className="check">
          <input type="checkbox" checked={f.projectsOnly} onChange={(e) => set({ projectsOnly: e.target.checked })} />
          Made in Pixel Studio
        </label>
        <div className="spacer" />
        <button className="btn small" onClick={reset} disabled={countActiveFilters(f) === 0}>
          Reset filters
        </button>
      </FilterGroup>
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="filter-group">
      <div className="filter-label">{label}</div>
      <div className="filter-options">{children}</div>
    </div>
  )
}
