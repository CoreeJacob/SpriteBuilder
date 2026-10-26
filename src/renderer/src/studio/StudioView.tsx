import { useEffect, useMemo, useRef, useState } from 'react'
import { Dropdown } from '@/app/Dropdown'
import { Icon } from '@/app/Icon'
import { stripExt } from '@shared/paths'
import { useApp } from '@/app/store'
import { readPastedImage, writeSystemClipboard } from './clipboard'
import { confirmDiscard, exportGif, exportPng, insertImage, saveSprite } from './io'
import { CanvasSizeDialog } from './CanvasSizeDialog'
import { ToolBox, TOOLS } from './ToolBox'
import { LayersPanel } from './LayersPanel'
import { PalettePanel } from './PalettePanel'
import { useSavedPalettes } from './savedPalettes'
import { SheetDialog } from './SheetDialog'
import { Timeline } from './Timeline'
import { compositeAt, MAX_SIZE } from './model'
import { PALETTES } from './palettes'
import { PixelCanvas } from './PixelCanvas'
import { countColors, rankColors, toHex } from './raster'
import { fitZoom, previewZoom, useStudio, ZOOM_LEVELS } from './store'
import { pixelsToCanvas } from '@/lib/canvas'
import { isTyping, turnFromKey } from '@/lib/dom'

/** Image files dragged in from Finder land on a new layer, like Insert Image. */
function CanvasDropZone({ children }: { children: React.ReactNode }) {
  const [dropping, setDropping] = useState(false)
  const imageFile = (e: React.DragEvent): File | undefined => [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
  const isFileDrag = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('Files')

  return (
    <div
      className={`canvas-viewport ${dropping ? 'dropping' : ''}`}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDropping(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropping(false)}
      onDrop={(e) => {
        setDropping(false)
        if (!isFileDrag(e)) return
        e.preventDefault()
        const file = imageFile(e)
        if (!file) return useApp.getState().notify('Only image files can be dropped on the canvas.', 'error')
        const url = URL.createObjectURL(file)
        void insertImage(url, stripExt(file.name), false).finally(() => URL.revokeObjectURL(url))
      }}
    >
      {children}
      {dropping && <div className="drop-overlay">Drop to add as a new layer</div>}
    </div>
  )
}

const PRESETS = [8, 16, 32, 64, 128]
const EXPORT_SCALES = [1, 2, 4, 8, 16]

const isPowerOfTwo = (n: number): boolean => (n & (n - 1)) === 0

export function StudioView() {
  const doc = useStudio((s) => s.doc)
  const bigPreview = useApp((s) => s.bigPreview)
  const [showNew, setShowNew] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const [showSize, setShowSize] = useState(false)
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
      <StudioBar onNew={() => confirmDiscard() && setShowNew(true)} onSheet={() => setShowSheet(true)} onSize={() => setShowSize(true)} />
      <div className={`studio-body ${bigPreview ? 'big-preview' : ''}`}>
        <ToolBox />
        <div className="canvas-column">
          <CanvasDropZone>
            <div className="canvas-stage">
              <PixelCanvas onHover={setHover} />
            </div>
          </CanvasDropZone>
          <Timeline />
        </div>
        <SidePanel hover={hover} />
      </div>
      {showSheet && <SheetDialog onClose={() => setShowSheet(false)} />}
      {showSize && <CanvasSizeDialog onClose={() => setShowSize(false)} />}
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
        if (key === 'd') {
          e.preventDefault()
          s.deselect()
        } else if (key === 's') {
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
      if (s.selection && e.key.startsWith('Arrow')) {
        // Nudge the selected pixels; ⇧ moves a whole 8-pixel tile.
        e.preventDefault()
        if (!s.floating) s.liftSelection()
        const f = useStudio.getState().floating
        if (!f) return
        const step = e.shiftKey ? 8 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        s.moveFloating(f.x + dx, f.y + dy)
        return
      }
      if (s.selection && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault()
        s.deleteSelection()
        return
      }
      if (e.key === 'Escape') return s.deselect()
      if (e.key === 'Enter') return s.commitFloating()
      const turn = turnFromKey(e)
      if (turn) {
        e.preventDefault()
        return s.turn(turn)
      }
      if (e.key === '[' || e.key === ']') return s.setBrushSize(s.brushSize + (e.key === ']' ? 1 : -1))
      const tool = TOOLS.find((t) => t.key.toLowerCase() === key)
      if (tool) s.setTool(tool.tool)
      else if (key === 'f') s.toggleFillShapes()
      else if (e.key === ',') s.stepFrame(-1)
      else if (e.key === '.') s.stepFrame(1)
      else if (key === 'x') s.swapColors()
      else if (key === 't') s.toggleTileMode()
      else if (key === '=' || key === '+') stepZoom(1)
      else if (key === '-') stepZoom(-1)
      else if (key === '0') s.setZoom(fitZoom(s.doc.width, s.doc.height))
    }
    // ⌘C/⌘X/⌘V come from the Edit menu as clipboard events.
    const active = (): boolean =>
      useApp.getState().view === 'studio' && !useApp.getState().prompt && !isTyping() && !!useStudio.getState().doc
    const onCopy = (e: ClipboardEvent): void => {
      if (!active()) return
      const image = e.type === 'cut' ? useStudio.getState().cutSelection() : useStudio.getState().copySelection()
      if (!image) return
      e.preventDefault()
      void writeSystemClipboard(image)
    }
    const onPaste = (e: ClipboardEvent): void => {
      if (!active()) return
      e.preventDefault()
      void readPastedImage(e).then((pasted) => {
        const own = useStudio.getState().clipboard
        // Our own copy comes back from the system clipboard too; prefer it, as it remembers where it came from.
        const image = own && (!pasted || (pasted.w === own.w && pasted.h === own.h)) ? own : pasted
        if (image) useStudio.getState().paste(image)
        else useApp.getState().notify('Nothing to paste. Copy a selection (⌘C) or an image first.', 'error')
      })
    }
    const onSelectAll = (): void => {
      if (active()) useStudio.getState().selectAll()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCopy)
    document.addEventListener('paste', onPaste)
    window.addEventListener('studio:selectAll', onSelectAll)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCopy)
      document.removeEventListener('paste', onPaste)
      window.removeEventListener('studio:selectAll', onSelectAll)
    }
  }, [openNew])
}

function stepZoom(direction: 1 | -1): void {
  const { zoom, setZoom } = useStudio.getState()
  const i = ZOOM_LEVELS.findIndex((z) => z >= zoom)
  setZoom(ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i + direction))])
}

function StudioBar({ onNew, onSheet, onSize }: { onNew: () => void; onSheet: () => void; onSize: () => void }) {
  const name = useStudio((s) => s.name)
  const dirty = useStudio((s) => s.dirty)
  const folder = useStudio((s) => s.folder)
  const savedPath = useStudio((s) => s.savedPath)
  const zoom = useStudio((s) => s.zoom)
  const showGrid = useStudio((s) => s.showGrid)
  const tileMode = useStudio((s) => s.tileMode)
  const docSize = useStudio((s) => (s.doc ? `${s.doc.width}×${s.doc.height}` : ''))
  const mirrorX = useStudio((s) => s.mirrorX)
  const mirrorY = useStudio((s) => s.mirrorY)
  // Lifted pixels (pasted, inserted, being moved) can always be undone, even before they're put down.
  const canUndo = useStudio((s) => s.canUndo || s.floating !== null)
  const canRedo = useStudio((s) => s.canRedo)
  const s = useStudio.getState()

  return (
    <header className="studio-bar">
      <button className="btn" onClick={onNew} title="New sprite (⌘N)">
        <Icon name="plus" /> New
      </button>
      <button
        className="btn"
        onClick={() => confirmDiscard() && useStudio.getState().closeDoc()}
        title="Close this sprite (asks first if it has unsaved changes)"
      >
        <Icon name="close" /> Close
      </button>
      <button className="btn primary" onClick={() => void saveSprite()} title="Save to library (⌘S)">
        <Icon name="save" /> Save
      </button>
      <button className="btn" onClick={() => void saveSprite(true)} title="Save as a new sprite (⇧⌘S)">
        Save As…
      </button>
      <ExportMenu onSheet={onSheet} />

      <div className="doc-title">
        <span className="doc-name">
          {name}
          {dirty && <i className="dot" title="Unsaved changes" />}
        </span>
        <span
          className="muted small"
          title={savedPath ? `Saved as ${savedPath}` : 'Not saved yet · Save asks where to put it'}
        >
          in {folder || 'Library'}
          {!savedPath && ' · not saved yet'}
        </span>
      </div>

      <div className="spacer" />

      <button className="btn small" onClick={onSize} title="Change the sprite's size">
        <Icon name="resize" size={14} /> {docSize}
      </button>
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
      <button className={`icon-btn ${mirrorX ? 'on' : ''}`} onClick={s.toggleMirrorX} title="Mirror left ↔ right">
        <Icon name="mirrorX" />
      </button>
      <button className={`icon-btn ${mirrorY ? 'on' : ''}`} onClick={s.toggleMirrorY} title="Mirror top ↕ bottom">
        <Icon name="mirrorY" />
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

function ExportMenu({ onSheet }: { onSheet: () => void }) {
  const frames = useStudio((s) => s.doc?.frames.length ?? 1)
  const ranged = useStudio((s) => s.rangeStart !== null)
  const [rangeFrom, rangeTo] = useStudio.getState().frameRange()
  const [scale, setScale] = useState(4)
  return (
    <Dropdown
      button={(open, toggle) => (
        <button className={`btn ${open ? 'on' : ''}`} onClick={toggle} title="Export to a file on your Mac">
          <Icon name="export" /> Export
        </button>
      )}
    >
      {(close) => {
        const run = (action: () => void): void => (close(), action())
        return (
          <>
            <div className="dropdown-label">Scale</div>
            <div className="filter-options">
              {EXPORT_SCALES.map((n) => (
                <button key={n} className={`chip ${scale === n ? 'on' : ''}`} onClick={() => setScale(n)}>
                  {n}×
                </button>
              ))}
            </div>
            <div className="dropdown-sep" />
            <button className="dropdown-item" onClick={() => run(() => void exportPng(scale))}>
              <Icon name="file" /> PNG image <span className="muted small">{frames > 1 ? 'this frame' : ''}</span>
            </button>
            <button className="dropdown-item" onClick={() => run(() => void exportGif(scale))}>
              <Icon name="play" /> Animated GIF <span className="muted small">{frames} frame{frames === 1 ? '' : 's'}</span>
            </button>
            {ranged && (
              <button className="dropdown-item" onClick={() => run(() => void exportGif(scale, true))}>
                <Icon name="play" /> GIF of selected frames <span className="muted small">{rangeFrom + 1}–{rangeTo + 1}</span>
              </button>
            )}
            <button className="dropdown-item" onClick={() => run(onSheet)}>
              <Icon name="grid" /> Sprite sheet… <span className="muted small">PNG + JSON</span>
            </button>
          </>
        )
      }}
    </Dropdown>
  )
}

function SidePanel({ hover }: { hover: [number, number] | null }) {
  const doc = useStudio((s) => s.doc)!
  const version = useStudio((s) => s.version)
  const primary = useStudio((s) => s.primary)
  const secondary = useStudio((s) => s.secondary)
  const floating = useStudio((s) => s.floating)
  const [tiled, setTiled] = useState(false)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 236, h: 210 })
  const bigPreview = useApp((s) => s.bigPreview)
  const previewSize = useApp((s) => s.previewSize)
  const { setBigPreview, setPreviewSize } = useApp.getState()
  const { setPrimary, setSecondary } = useStudio.getState()

  const frame = useStudio((s) => s.frame)
  const playing = useStudio((s) => s.playing)
  const rangeStart = useStudio((s) => s.rangeStart)
  const [tick, setTick] = useState(0)

  // While playing, step through the frames using each frame's own duration.
  // With several frames shift-selected (or a tag clicked), only those frames play.
  useEffect(() => {
    if (!playing) return
    const [first, last] = rangeStart === null ? [0, doc.frames.length - 1] : useStudio.getState().frameRange()
    let i = first
    let timer: ReturnType<typeof setTimeout>
    const step = (): void => {
      setTick(i)
      timer = setTimeout(() => {
        i = i >= last ? first : i + 1
        step()
      }, doc.frames[i]?.duration ?? 100)
    }
    step()
    return () => clearTimeout(timer)
  }, [playing, doc, frame, rangeStart])
  const shown = playing ? Math.min(tick, doc.frames.length - 1) : frame

  // Colours across every frame, so the palette view covers the whole animation.
  const settledVersion = useStudio((s) => s.settledVersion)
  const used = useMemo(() => {
    const counts = new Map<number, number>()
    doc.frames.forEach((_, i) => {
      for (const [key, n] of countColors(compositeAt(doc, i, settledVersion))) counts.set(key, (counts.get(key) ?? 0) + n)
    })
    return rankColors(counts).map(({ color }) => toHex(color))
  }, [doc, settledVersion])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Live preview, drawn at its real size; the page enlarges it (with hard pixel edges) to fit.
  const repeat = tiled ? 3 : 1
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    const { width: w, height: h } = doc
    canvas.width = w * repeat
    canvas.height = h * repeat
    const ctx = canvas.getContext('2d')!
    // Shares the canvas's composite of this frame rather than blending the layers again.
    const image = pixelsToCanvas(compositeAt(doc, shown, version), w, h)
    // Pixels being moved by the select tool aren't on the layer yet; draw them on top.
    const lifted = floating && shown === frame ? pixelsToCanvas(floating.pixels, floating.w, floating.h) : null
    for (let y = 0; y < repeat; y++) {
      for (let x = 0; x < repeat; x++) {
        ctx.drawImage(image, x * w, y * h)
        if (lifted && floating) {
          ctx.save()
          ctx.beginPath()
          ctx.rect(x * w, y * h, w, h)
          ctx.clip()
          ctx.drawImage(lifted, x * w + floating.x, y * h + floating.y)
          ctx.restore()
        }
      }
    }
  }, [doc, version, repeat, floating, shown, frame])
  // 1× (as it would look in a game) only in the big preview; otherwise as big as fits.
  const actual = bigPreview && previewSize === 'actual'
  const zoom = actual ? 1 : previewZoom(doc.width * repeat, doc.height * repeat, box.w - 4, box.h - 4)
  const zoomLabel = zoom >= 1 ? `${zoom}×` : `${Math.round(zoom * 100)}%`

  const sizeHint = !isPowerOfTwo(doc.width) || !isPowerOfTwo(doc.height)

  return (
    <aside className="studio-panel">
      <section>
        <div className="panel-heading">
          <span>
            Preview
            {doc.frames.length > 1 && (
              <span className="preview-frame">
                {' '}
                · {shown + 1}/{doc.frames.length}
                {playing ? ' ▶' : ''}
              </span>
            )}
          </span>
          <div className="preview-actions">
            {bigPreview && (
              <div className="filter-options">
                <button className={`chip ${!actual ? 'on' : ''}`} onClick={() => setPreviewSize('fit')} title="As big as fits">
                  Fit
                </button>
                <button className={`chip ${actual ? 'on' : ''}`} onClick={() => setPreviewSize('actual')} title="Actual size, as it would look in a game">
                  1×
                </button>
              </div>
            )}
            <label className="check small">
              <input type="checkbox" checked={tiled} onChange={(e) => setTiled(e.target.checked)} /> Tiled 3×3
            </label>
            <button
              className={`icon-btn ${bigPreview ? 'on' : ''}`}
              onClick={() => setBigPreview(!bigPreview)}
              title={bigPreview ? 'Smaller preview' : 'Bigger preview, to see the whole sprite'}
            >
              <Icon name={bigPreview ? 'collapse' : 'expand'} size={14} />
            </button>
          </div>
        </div>
        <div className={`studio-preview checker ${actual ? 'actual' : ''}`} ref={boxRef}>
          <canvas ref={previewRef} style={{ width: doc.width * repeat * zoom, height: doc.height * repeat * zoom }} title={`Preview at ${zoomLabel}`} />
        </div>
      </section>

      <LayersPanel />

      <PalettePanel
        used={used}
        swatches={(colors, onRemove) => (
          <Swatches colors={colors} primary={primary} secondary={secondary} onPrimary={setPrimary} onSecondary={setSecondary} onRemove={onRemove} />
        )}
      />

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
  const saved = useSavedPalettes((s) => s.list)

  const valid = width >= 1 && height >= 1 && width <= MAX_SIZE && height <= MAX_SIZE

  const create = (): void => {
    if (!valid) return
    // New sprites save into whichever library folder is open.
    useStudio.setState({ folder: scope.kind === 'folder' ? scope.path : '' })
    const palette = paletteName.startsWith('mine:')
      ? saved.find((p) => `mine:${p.name}` === paletteName)
      : PALETTES.find((p) => p.name === paletteName)
    useStudio.getState().newDoc(width, height, palette)
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
            <optgroup label="Built in">
              {PALETTES.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} ({p.colors.length})
                </option>
              ))}
            </optgroup>
            {saved.length > 0 && (
              <optgroup label="My palettes">
                {saved.map((p) => (
                  <option key={`mine-${p.name}`} value={`mine:${p.name}`}>
                    {p.name} ({p.colors.length})
                  </option>
                ))}
              </optgroup>
            )}
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
