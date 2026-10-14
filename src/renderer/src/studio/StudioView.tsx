import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from '@/app/Icon'
import { useApp } from '@/app/store'
import { confirmDiscard, exportPng, frameCanvas, saveSprite } from './io'
import { compositeFrame, MAX_SIZE } from './model'
import { PALETTES, type Palette } from './palettes'
import { PixelCanvas } from './PixelCanvas'
import { uniqueColors } from './raster'
import { fitZoom, useStudio, ZOOM_LEVELS, type Tool } from './store'

const TOOLS: Array<{ tool: Tool; icon: IconName; label: string; key: string }> = [
  { tool: 'pencil', icon: 'pencil', label: 'Pencil', key: 'B' },
  { tool: 'eraser', icon: 'eraser', label: 'Eraser', key: 'E' },
  { tool: 'fill', icon: 'fill', label: 'Fill', key: 'G' },
  { tool: 'eyedropper', icon: 'eyedropper', label: 'Eyedropper', key: 'I' }
]

const PRESETS = [8, 16, 32, 64, 128]
const EXPORT_SCALES = [1, 2, 4, 8, 16]

const isTyping = (): boolean => {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
}

const isPowerOfTwo = (n: number): boolean => (n & (n - 1)) === 0

export function StudioView() {
  const doc = useStudio((s) => s.doc)
  const [showNew, setShowNew] = useState(false)
  const [hover, setHover] = useState<[number, number] | null>(null)

  useStudioShortcuts(() => setShowNew(true))

  if (!doc) {
    return (
      <div className="studio">
        <NewSpritePanel onCreated={() => setShowNew(false)} />
      </div>
    )
  }

  return (
    <div className="studio">
      <StudioBar onNew={() => confirmDiscard() && setShowNew(true)} />
      <div className="studio-body">
        <ToolBox />
        <div className="canvas-viewport">
          <div className="canvas-stage">
            <PixelCanvas onHover={setHover} />
          </div>
        </div>
        <SidePanel hover={hover} />
      </div>
      {showNew && (
        <div className="modal-backdrop" onMouseDown={() => setShowNew(false)}>
          <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
            <NewSpritePanel onCreated={() => setShowNew(false)} onCancel={() => setShowNew(false)} />
          </div>
        </div>
      )}
    </div>
  )
}

function useStudioShortcuts(openNew: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (useApp.getState().view !== 'studio' || useApp.getState().prompt || isTyping()) return
      const s = useStudio.getState()
      const key = e.key.toLowerCase()
      if (e.metaKey) {
        if (key === 's') {
          e.preventDefault()
          void saveSprite(e.shiftKey)
        } else if (key === 'n') {
          e.preventDefault()
          if (confirmDiscard()) openNew()
        } else if (key === "'") {
          e.preventDefault()
          s.toggleGrid()
        }
        return
      }
      if (!s.doc) return
      const tool = TOOLS.find((t) => t.key.toLowerCase() === key)
      if (tool) s.setTool(tool.tool)
      else if (key === 'x') s.swapColors()
      else if (key === 't') s.toggleTileMode()
      else if (key === '=' || key === '+') stepZoom(1)
      else if (key === '-') stepZoom(-1)
      else if (key === '0') s.setZoom(fitZoom(s.doc.width, s.doc.height))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openNew])
}

function stepZoom(direction: 1 | -1): void {
  const { zoom, setZoom } = useStudio.getState()
  const i = ZOOM_LEVELS.findIndex((z) => z >= zoom)
  setZoom(ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i + direction))])
}

function StudioBar({ onNew }: { onNew: () => void }) {
  const name = useStudio((s) => s.name)
  const dirty = useStudio((s) => s.dirty)
  const folder = useStudio((s) => s.folder)
  const savedPath = useStudio((s) => s.savedPath)
  const zoom = useStudio((s) => s.zoom)
  const showGrid = useStudio((s) => s.showGrid)
  const tileMode = useStudio((s) => s.tileMode)
  const canUndo = useStudio((s) => s.canUndo)
  const canRedo = useStudio((s) => s.canRedo)
  const folders = useApp((s) => s.library?.folders ?? [])
  const [scale, setScale] = useState(4)
  const s = useStudio.getState()

  return (
    <header className="studio-bar">
      <button className="btn" onClick={onNew} title="New sprite (⌘N)">
        <Icon name="plus" /> New
      </button>
      <button className="btn primary" onClick={() => void saveSprite()} title="Save to library (⌘S)">
        <Icon name="save" /> Save
      </button>
      <button className="btn" onClick={() => void saveSprite(true)} title="Save as a new sprite (⇧⌘S)">
        Save As…
      </button>
      <div className="btn-group">
        <button className="btn" onClick={() => void exportPng(scale)} title="Export a PNG file anywhere on your Mac">
          <Icon name="export" /> Export PNG
        </button>
        <select className="select" value={scale} onChange={(e) => setScale(Number(e.target.value))} title="Export scale">
          {EXPORT_SCALES.map((n) => (
            <option key={n} value={n}>
              {n}×
            </option>
          ))}
        </select>
      </div>

      <div className="doc-title">
        <span className="doc-name">
          {name}
          {dirty && <i className="dot" title="Unsaved changes" />}
        </span>
        <span className="muted small">in</span>
        <select
          className="select small"
          value={folder}
          disabled={savedPath !== null}
          title={savedPath ? 'Use Save As… to save into another folder' : 'Folder to save into'}
          onChange={(e) => useStudio.setState({ folder: e.target.value })}
        >
          <option value="">Library</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className="spacer" />

      <button className="icon-btn" disabled={!canUndo} onClick={s.undo} title="Undo (⌘Z)">
        <Icon name="undo" />
      </button>
      <button className="icon-btn" disabled={!canRedo} onClick={s.redo} title="Redo (⇧⌘Z)">
        <Icon name="redo" />
      </button>
      <div className="btn-group zoom">
        <button className="icon-btn" onClick={() => stepZoom(-1)} title="Zoom out (−)">
          <Icon name="zoomOut" />
        </button>
        <span className="zoom-label">{zoom}×</span>
        <button className="icon-btn" onClick={() => stepZoom(1)} title="Zoom in (+)">
          <Icon name="zoomIn" />
        </button>
      </div>
      <button className={`icon-btn ${showGrid ? 'on' : ''}`} onClick={s.toggleGrid} title="Pixel grid (⌘')">
        <Icon name="grid" />
      </button>
      <button className={`icon-btn ${tileMode ? 'on' : ''}`} onClick={s.toggleTileMode} title="Tile preview: draw seamless tiles (T)">
        <Icon name="tile" />
      </button>
      <button
        className="icon-btn"
        onClick={() => window.confirm('Clear the whole canvas? (You can undo this.)') && s.clearCanvas()}
        title="Clear canvas"
      >
        <Icon name="trash" />
      </button>
    </header>
  )
}

function ToolBox() {
  const tool = useStudio((s) => s.tool)
  const primary = useStudio((s) => s.primary)
  const secondary = useStudio((s) => s.secondary)
  const { setTool, setPrimary, setSecondary, swapColors } = useStudio.getState()

  return (
    <div className="toolbox">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`tool ${tool === t.tool ? 'on' : ''}`}
          onClick={() => setTool(t.tool)}
          title={`${t.label} (${t.key})`}
        >
          <Icon name={t.icon} size={20} />
        </button>
      ))}
      <div className="color-pair">
        <label className="swatch-big primary" style={{ background: primary }} title={`Front colour ${primary} · left click paints with it`}>
          <input type="color" value={primary.slice(0, 7)} onChange={(e) => setPrimary(e.target.value)} />
        </label>
        <label className="swatch-big secondary" style={{ background: secondary }} title={`Back colour ${secondary} · right click paints with it`}>
          <input type="color" value={secondary.slice(0, 7)} onChange={(e) => setSecondary(e.target.value)} />
        </label>
        <button className="swap" onClick={swapColors} title="Swap colours (X)">
          <Icon name="swap" size={12} />
        </button>
      </div>
    </div>
  )
}

function SidePanel({ hover }: { hover: [number, number] | null }) {
  const doc = useStudio((s) => s.doc)!
  const version = useStudio((s) => s.version)
  const primary = useStudio((s) => s.primary)
  const secondary = useStudio((s) => s.secondary)
  const [tiled, setTiled] = useState(false)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const { setPrimary, setSecondary, setPalette, addToPalette, removeFromPalette } = useStudio.getState()

  const used = useMemo(() => uniqueColors(compositeFrame(doc, 0)), [doc, version])

  // Live preview at a whole-number scale that fits the panel.
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    const repeat = tiled ? 3 : 1
    const scale = Math.max(1, Math.floor(200 / (Math.max(doc.width, doc.height) * repeat)))
    const frame = frameCanvas(doc, 0, scale)
    canvas.width = frame.width * repeat
    canvas.height = frame.height * repeat
    const ctx = canvas.getContext('2d')!
    for (let y = 0; y < repeat; y++) for (let x = 0; x < repeat; x++) ctx.drawImage(frame, x * frame.width, y * frame.height)
  }, [doc, version, tiled])

  const sizeHint = !isPowerOfTwo(doc.width) || !isPowerOfTwo(doc.height)

  return (
    <aside className="studio-panel">
      <section>
        <div className="panel-heading">
          <span>Preview</span>
          <label className="check small">
            <input type="checkbox" checked={tiled} onChange={(e) => setTiled(e.target.checked)} /> Tiled 3×3
          </label>
        </div>
        <div className="studio-preview checker">
          <canvas ref={previewRef} />
        </div>
      </section>

      <section>
        <div className="panel-heading">
          <span>Palette</span>
          <select
            className="select small"
            value={PALETTES.some((p) => p.name === doc.palette.name) ? doc.palette.name : ''}
            onChange={(e) => {
              const p = PALETTES.find((x) => x.name === e.target.value)
              if (p) setPalette(p)
            }}
          >
            {!PALETTES.some((p) => p.name === doc.palette.name) && <option value="">{doc.palette.name}</option>}
            {PALETTES.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <Swatches
          colors={doc.palette.colors}
          primary={primary}
          secondary={secondary}
          onPrimary={setPrimary}
          onSecondary={setSecondary}
          onRemove={removeFromPalette}
        />
        <div className="palette-actions">
          <button className="btn small" onClick={() => addToPalette(primary)} disabled={doc.palette.colors.includes(primary)}>
            <Icon name="plus" size={12} /> Add front colour
          </button>
          {used.length > 0 && (
            <button
              className="btn small"
              onClick={() => setPalette({ name: 'Sprite colours', colors: used.slice(0, 64) } satisfies Palette)}
              title="Replace the palette with the colours used in this sprite"
            >
              From sprite
            </button>
          )}
        </div>
        <p className="muted small">Click: front colour · Right-click: back colour · ⌥-click: remove</p>
      </section>

      <section>
        <div className="panel-heading">
          <span>Colours used ({used.length})</span>
        </div>
        <Swatches colors={used} primary={primary} secondary={secondary} onPrimary={setPrimary} onSecondary={setSecondary} />
      </section>

      <section className="canvas-info">
        <dl className="info">
          <dt>Canvas</dt>
          <dd>
            {doc.width}×{doc.height}
            {sizeHint && <span className="hint" title="Many engines and GPUs prefer power-of-two sizes like 16, 32 or 64"> · not power of 2</span>}
          </dd>
          <dt>Cursor</dt>
          <dd>{hover ? `${hover[0]}, ${hover[1]}` : '—'}</dd>
        </dl>
        <p className="muted small">⇧-click draws a line · ⌥ picks a colour · ⌘/pinch-scroll zooms</p>
      </section>
    </aside>
  )
}

function Swatches(props: {
  colors: string[]
  primary: string
  secondary: string
  onPrimary: (c: string) => void
  onSecondary: (c: string) => void
  onRemove?: (c: string) => void
}) {
  const { colors, primary, secondary, onPrimary, onSecondary, onRemove } = props
  if (!colors.length) return <p className="muted small">Nothing yet.</p>
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          className={`swatch ${c === primary ? 'primary' : ''} ${c === secondary ? 'secondary' : ''}`}
          style={{ background: c }}
          title={c}
          onClick={(e) => (e.altKey && onRemove ? onRemove(c) : onPrimary(c))}
          onContextMenu={(e) => {
            e.preventDefault()
            onSecondary(c)
          }}
        />
      ))}
    </div>
  )
}

function NewSpritePanel({ onCreated, onCancel }: { onCreated: () => void; onCancel?: () => void }) {
  const scope = useApp((s) => s.scope)
  const [width, setWidth] = useState(16)
  const [height, setHeight] = useState(16)
  const [paletteName, setPaletteName] = useState(PALETTES[0].name)

  const valid = width >= 1 && height >= 1 && width <= MAX_SIZE && height <= MAX_SIZE

  const create = (): void => {
    if (!valid) return
    // New sprites save into whichever library folder is open.
    useStudio.setState({ folder: scope.kind === 'folder' ? scope.path : '' })
    useStudio.getState().newDoc(width, height, PALETTES.find((p) => p.name === paletteName))
    onCreated()
  }

  return (
    <div className="new-sprite">
      <h1>New Sprite</h1>
      <div className="presets">
        {PRESETS.map((n) => (
          <button
            key={n}
            className={`preset ${width === n && height === n ? 'on' : ''}`}
            onClick={() => {
              setWidth(n)
              setHeight(n)
            }}
            onDoubleClick={create}
          >
            <span className="preset-box" style={{ width: 12 + Math.log2(n) * 8, height: 12 + Math.log2(n) * 8 }} />
            {n}×{n}
          </button>
        ))}
      </div>
      <div className="custom-size">
        <label className="field inline">
          <span>Width</span>
          <input className="input" type="number" min={1} max={MAX_SIZE} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        </label>
        <span className="muted">×</span>
        <label className="field inline">
          <span>Height</span>
          <input className="input" type="number" min={1} max={MAX_SIZE} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
        </label>
        <label className="field inline">
          <span>Palette</span>
          <select className="select" value={paletteName} onChange={(e) => setPaletteName(e.target.value)}>
            {PALETTES.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.colors.length})
              </option>
            ))}
          </select>
        </label>
      </div>
      {!valid && <p className="error small">Sizes go from 1 to {MAX_SIZE} pixels.</p>}
      <div className="modal-actions">
        {onCancel && (
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn primary" onClick={create} disabled={!valid}>
          Create
        </button>
      </div>
      {!onCancel && <p className="muted small">Or double-click any PNG in the Library to open it here.</p>}
    </div>
  )
}
