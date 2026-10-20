import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '@/app/Icon'
import { useApp } from '@/app/store'
import { ImageChooser } from '@/library/ImageChooser'
import { countColors, parseHex, toHex } from '@/studio/raster'
import {
  commitAdjustments,
  confirmDiscard,
  exportImage,
  openImageInStudio,
  openInEditor,
  resizeSmooth,
  save,
  saveCopy,
  sliceToFiles,
  sliceToStudio,
  turnImage
} from './io'
import { ImageCanvas, type HoverInfo } from './ImageCanvas'
import {
  colorCounts,
  contentBounds,
  crop,
  flipH,
  flipV,
  isIdentity,
  makeTransparent,
  reduceColors,
  removeBackground,
  replaceColor,
  resizeNearest,
  rotate180,
  rotateCCW,
  rotateCW,
  sliceRects,
  trim,
  type Img
} from './ops'
import { MAX_EDIT_SIZE, useEditor } from './store'
import { isTyping, turnFromKey } from '@/lib/dom'

const ZOOMS = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32]

export function EditorView() {
  const image = useEditor((s) => s.image)
  const [picking, setPicking] = useState(false)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  useEditorShortcuts()

  if (!image || picking) {
    return <ImagePicker onCancel={image ? () => setPicking(false) : undefined} onPicked={() => setPicking(false)} />
  }

  return (
    <div className="editor">
      <EditorBar onOpenOther={() => setPicking(true)} />
      <div className="editor-body">
        <div className="canvas-column">
          <ImageCanvas onHover={setHover} />
          <div className="editor-status">
            <span>
              {image.width}×{image.height} px
            </span>
            {hover && (
              <span>
                {hover.x}, {hover.y}
                {hover.color && (
                  <>
                    {' · '}
                    <i className="mini-swatch" style={{ background: hover.color }} /> {hover.color}
                  </>
                )}
              </span>
            )}
            <ModeHint />
          </div>
        </div>
        <EditorPanel />
      </div>
    </div>
  )
}

function useEditorShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const app = useApp.getState()
      if (app.view !== 'editor' || app.prompt || isTyping()) return
      const s = useEditor.getState()
      if (!s.image) return
      if (e.metaKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void (e.shiftKey ? saveCopy() : save())
      } else if (turnFromKey(e)) {
        e.preventDefault()
        turnImage(turnFromKey(e)!)
      } else if (e.key === 'Enter' && s.mode === 'crop' && s.cropRect) {
        applyCrop()
      } else if (e.key === 'Escape') {
        useEditor.setState({ mode: 'none', cropRect: null })
      } else if (e.key === '=' || e.key === '+') {
        stepZoom(1)
      } else if (e.key === '-') {
        stepZoom(-1)
      } else if (e.key === '0') {
        s.setZoom('fit')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function stepZoom(direction: 1 | -1): void {
  const { zoom, image, setZoom } = useEditor.getState()
  if (!image) return
  // From "fit", start at the nearest step to the fitted size.
  const current = typeof zoom === 'number' ? zoom : 1
  const i = ZOOMS.findIndex((z) => z >= current)
  setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i === -1 ? ZOOMS.length - 1 : i) + direction))])
}

function applyCrop(): void {
  const { image, cropRect, apply } = useEditor.getState()
  if (!image || !cropRect) return
  commitAdjustments()
  apply(crop(useEditor.getState().image!, cropRect))
  useEditor.setState({ mode: 'none', cropRect: null })
}

/** Runs an image operation on the current image (folding in any previewed adjustments first). */
function run(op: (img: Img) => Img): void {
  commitAdjustments()
  const { image, apply } = useEditor.getState()
  if (image) apply(op(image))
}

function ModeHint() {
  const mode = useEditor((s) => s.mode)
  const hints: Record<string, string> = {
    crop: 'Drag to mark the area to keep · drag inside to move it · Enter applies, Esc cancels',
    pick: 'Click the image to pick a colour',
    wand: 'Click an area to make it transparent (uses the tolerance setting)',
    slice: 'Blue boxes show where frames will be cut'
  }
  return hints[mode] ? <span className="mode-hint">{hints[mode]}</span> : null
}

function EditorBar({ onOpenOther }: { onOpenOther: () => void }) {
  const source = useEditor((s) => s.source)!
  const dirty = useEditor((s) => s.dirty)
  const canOverwrite = useEditor((s) => s.canOverwrite)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const zoom = useEditor((s) => s.zoom)
  const s = useEditor.getState()

  const saveTip = canOverwrite
    ? `Replace ${source.name}.${source.ext} with your edits (⌘S)`
    : source.hasProject
      ? 'This image has a Pixel Studio project, so edits are saved as a copy (⌘S)'
      : `${source.ext.toUpperCase()} files are saved as a PNG copy (⌘S)`

  return (
    <header className="studio-bar">
      <button className="btn" onClick={onOpenOther} title="Choose another image from the Library">
        <Icon name="library" /> Open…
      </button>
      <button
        className="btn"
        onClick={() => confirmDiscard() && useEditor.getState().close()}
        title="Close this image (asks first if it has unsaved edits)"
      >
        <Icon name="close" /> Close
      </button>
      <button className="btn primary" onClick={() => void save()} title={saveTip}>
        <Icon name="save" /> {canOverwrite ? 'Save' : 'Save Copy'}
      </button>
      {canOverwrite && (
        <button className="btn" onClick={() => void saveCopy()} title="Save the edits as a new PNG and keep the original (⇧⌘S)">
          Save as Copy…
        </button>
      )}
      <button className="btn" onClick={() => void exportImage()} title="Export a PNG anywhere on your Mac">
        <Icon name="export" /> Export
      </button>
      <button className="btn" onClick={openImageInStudio} title="Open this image in Pixel Studio as a new sprite">
        <Icon name="studio" /> Pixel Studio
      </button>

      <div className="doc-title">
        <span className="doc-name">
          <span>
            {source.name}
            <span className="muted">.{source.ext}</span>
          </span>
          {dirty && <i className="dot" title="Unsaved changes" />}
        </span>
        {source.folder && <span className="muted small">in {source.folder}</span>}
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
        <button className={`btn small ${zoom === 'fit' ? 'on' : ''}`} onClick={() => s.setZoom('fit')} title="Fit to window (0)">
          Fit
        </button>
        <button className="icon-btn" onClick={() => stepZoom(1)} title="Zoom in (+)">
          <Icon name="zoomIn" />
        </button>
      </div>
    </header>
  )
}

// ---------- side panel ----------

function EditorPanel() {
  return (
    <aside className="studio-panel editor-panel">
      <TransformSection />
      <AdjustSection />
      <ColourSection />
      <SliceSection />
    </aside>
  )
}

/** Which panel sections are open, remembered while switching between screens. */
const openSections = new Map<string, boolean>()

function Section(props: { id: string; title: string; icon: IconName; children: ReactNode; defaultOpen?: boolean }) {
  const { id, title, icon, children, defaultOpen = true } = props
  const [open, setOpenState] = useState(openSections.get(id) ?? defaultOpen)
  const setOpen = (value: boolean): void => {
    openSections.set(id, value)
    setOpenState(value)
  }
  return (
    <section className={`panel-section ${open ? 'open' : ''}`}>
      <button className="section-toggle" onClick={() => setOpen(!open)}>
        <Icon name={icon} size={14} />
        <span>{title}</span>
        <span className={`expander ${open ? 'open' : ''}`}>
          <Icon name="chevron" size={12} />
        </span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  )
}

function TransformSection() {
  const image = useEditor((s) => s.image)!
  const mode = useEditor((s) => s.mode)
  const cropRect = useEditor((s) => s.cropRect)
  const s = useEditor.getState()
  const [width, setWidth] = useState(image.width)
  const [height, setHeight] = useState(image.height)
  const [lock, setLock] = useState(true)
  const [smooth, setSmooth] = useState(false)

  useEffect(() => {
    setWidth(image.width)
    setHeight(image.height)
  }, [image.width, image.height])

  const setW = (w: number): void => {
    setWidth(w)
    if (lock) setHeight(Math.max(1, Math.round((w * image.height) / image.width)))
  }
  const setH = (h: number): void => {
    setHeight(h)
    if (lock) setWidth(Math.max(1, Math.round((h * image.width) / image.height)))
  }
  const validSize = width >= 1 && height >= 1 && width <= MAX_EDIT_SIZE && height <= MAX_EDIT_SIZE
  const resize = (w: number, h: number): void => run((img) => (smooth ? resizeSmooth(img, w, h) : resizeNearest(img, w, h)))
  const trimmable = useMemo(() => {
    const b = contentBounds(image)
    return b !== null && (b.w !== image.width || b.h !== image.height)
  }, [image])

  return (
    <Section id="transform" title="Transform" icon="rect">
      <div className="button-row">
        <button className="icon-btn" onClick={() => run(rotateCCW)} title="Rotate 90° left">
          <Icon name="undo" />
        </button>
        <button className="icon-btn" onClick={() => run(rotateCW)} title="Rotate 90° right">
          <Icon name="redo" />
        </button>
        <button className="btn small" onClick={() => run(rotate180)} title="Rotate 180°">
          180°
        </button>
        <button className="icon-btn" onClick={() => run(flipH)} title="Flip left ↔ right">
          <Icon name="mirrorX" />
        </button>
        <button className="icon-btn" onClick={() => run(flipV)} title="Flip top ↕ bottom">
          <Icon name="mirrorY" />
        </button>
      </div>

      <div className="button-row">
        <button className={`btn small ${mode === 'crop' ? 'on' : ''}`} onClick={() => s.setMode('crop')} title="Drag on the image to choose what to keep">
          <Icon name="select" size={14} /> Crop
        </button>
        {mode === 'crop' && (
          <button className="btn small primary" disabled={!cropRect} onClick={applyCrop} title="Keep only the marked area (Enter)">
            Apply crop
          </button>
        )}
        <button className="btn small" disabled={!trimmable} onClick={() => run(trim)} title="Cut away fully transparent edges">
          Trim edges
        </button>
      </div>

      <div className="resize-grid">
        <label className="field">
          <span>Width</span>
          <input className="input" type="number" min={1} max={MAX_EDIT_SIZE} value={width} onChange={(e) => setW(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Height</span>
          <input className="input" type="number" min={1} max={MAX_EDIT_SIZE} value={height} onChange={(e) => setH(Number(e.target.value))} />
        </label>
      </div>
      <div className="button-row">
        <label className="check small">
          <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> Keep proportions
        </label>
        <label className="check small" title="Pixel-perfect keeps hard pixel edges; smooth blends them (better for photos)">
          <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} /> Smooth
        </label>
      </div>
      <div className="button-row">
        {[0.5, 2, 3, 4].map((f) => (
          <button
            key={f}
            className="chip"
            disabled={Math.round(image.width * f) < 1 || image.width * f > MAX_EDIT_SIZE || image.height * f > MAX_EDIT_SIZE}
            onClick={() => resize(Math.max(1, Math.round(image.width * f)), Math.max(1, Math.round(image.height * f)))}
          >
            {f === 0.5 ? '½×' : `${f}×`}
          </button>
        ))}
        <div className="spacer" />
        <button
          className="btn small primary"
          disabled={!validSize || (width === image.width && height === image.height)}
          onClick={() => resize(width, height)}
        >
          Resize
        </button>
      </div>
    </Section>
  )
}

function AdjustSection() {
  const a = useEditor((s) => s.adjustments)
  const s = useEditor.getState()
  const slider = (key: 'brightness' | 'contrast' | 'hue' | 'saturation', label: string, min: number, max: number) => (
    <label className="adjust-row">
      <span>{label}</span>
      <input className="slider" type="range" min={min} max={max} value={a[key]} onChange={(e) => s.setAdjustments({ [key]: Number(e.target.value) })} />
      <span className="adjust-value" onDoubleClick={() => s.setAdjustments({ [key]: 0 })} title="Double-click to reset">
        {a[key]}
      </span>
    </label>
  )
  return (
    <Section id="adjust" title="Adjust" icon="editor">
      {slider('brightness', 'Brightness', -100, 100)}
      {slider('contrast', 'Contrast', -100, 100)}
      {slider('hue', 'Hue', -180, 180)}
      {slider('saturation', 'Saturation', -100, 100)}
      <div className="button-row">
        <label className="check small">
          <input type="checkbox" checked={a.grayscale} onChange={(e) => s.setAdjustments({ grayscale: e.target.checked })} /> Grayscale
        </label>
        <label className="check small">
          <input type="checkbox" checked={a.invert} onChange={(e) => s.setAdjustments({ invert: e.target.checked })} /> Invert
        </label>
      </div>
      <div className="button-row">
        <span className="muted small">{isIdentity(a) ? 'Changes preview live.' : 'Previewing…'}</span>
        <div className="spacer" />
        <button className="btn small" disabled={isIdentity(a)} onClick={s.resetAdjustments}>
          Reset
        </button>
        <button className="btn small primary" disabled={isIdentity(a)} onClick={commitAdjustments}>
          Apply
        </button>
      </div>
    </Section>
  )
}

function ColourSection() {
  const image = useEditor((s) => s.image)!
  const picked = useEditor((s) => s.picked)
  const mode = useEditor((s) => s.mode)
  const tolerance = useEditor((s) => s.tolerance)
  const s = useEditor.getState()
  const [target, setTarget] = useState('#ffffff')
  const [reduceTo, setReduceTo] = useState(16)

  const counts = useMemo(() => countColors(image.data), [image])
  const colours = useMemo(() => colorCounts(image, 256), [image])
  const total = counts.size
  const pickedHex = picked ? toHex(picked) : null

  return (
    <Section id="colours" title={`Colours · ${total.toLocaleString()}`} icon="fill">
      <div className="swatches editor-swatches">
        {colours.slice(0, 64).map(({ color, count }) => {
          const hex = toHex(color)
          return (
            <button
              key={hex}
              className={`swatch ${pickedHex === hex ? 'primary' : ''}`}
              style={{ background: hex }}
              title={`${hex} · ${count} pixel${count === 1 ? '' : 's'}`}
              onClick={() => s.setPicked(color)}
            />
          )
        })}
      </div>
      {colours.length > 64 && <p className="muted small">Showing the 64 most used colours.</p>}

      <div className="button-row">
        <button className={`btn small ${mode === 'pick' ? 'on' : ''}`} onClick={() => s.setMode('pick')} title="Click the image to choose a colour">
          <Icon name="eyedropper" size={14} /> Pick
        </button>
        <span className="picked">
          {pickedHex ? (
            <>
              <i className="mini-swatch" style={{ background: pickedHex }} /> {pickedHex}
            </>
          ) : (
            <span className="muted small">No colour chosen</span>
          )}
        </span>
      </div>

      <label className="adjust-row" title="How different a colour can be and still count as a match">
        <span>Tolerance</span>
        <input className="slider" type="range" min={0} max={128} value={tolerance} onChange={(e) => s.setTolerance(Number(e.target.value))} />
        <span className="adjust-value">{tolerance}</span>
      </label>

      <div className="button-row">
        <span className="small muted">Replace with</span>
        <input className="color-input" type="color" value={target} onChange={(e) => setTarget(e.target.value)} />
        <div className="spacer" />
        <button className="btn small" disabled={!picked} onClick={() => run((img) => replaceColor(img, picked!, parseHex(target), tolerance))}>
          Replace
        </button>
      </div>
      <div className="button-row">
        <button className="btn small" disabled={!picked} onClick={() => run((img) => makeTransparent(img, picked!, tolerance))} title="Clear this colour everywhere in the image">
          Make transparent
        </button>
        <button className={`btn small ${mode === 'wand' ? 'on' : ''}`} onClick={() => s.setMode('wand')} title="Click areas of the image to clear just those">
          <Icon name="eraser" size={14} /> Magic eraser
        </button>
      </div>
      <button className="btn small" onClick={() => run((img) => removeBackground(img, Math.max(8, tolerance)))} title="Clears the colour around the edges (taken from the corners)">
        Remove background
      </button>

      <div className="button-row">
        <span className="small muted">Reduce to</span>
        <input className="input number" type="number" min={2} max={256} value={reduceTo} onChange={(e) => setReduceTo(Number(e.target.value))} />
        <span className="small muted">colours</span>
        <div className="spacer" />
        <button className="btn small" disabled={reduceTo < 2 || reduceTo >= total} onClick={() => run((img) => reduceColors(img, reduceTo))}>
          Reduce
        </button>
      </div>
    </Section>
  )
}

function SliceSection() {
  const image = useEditor((s) => s.image)!
  const slice = useEditor((s) => s.slice)
  const mode = useEditor((s) => s.mode)
  const s = useEditor.getState()
  const rects = useMemo(() => sliceRects(image, slice), [image, slice])
  const num = (key: keyof typeof slice, label: string, min = 0) => (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        min={min}
        value={slice[key] as number}
        onChange={(e) => s.setSlice({ [key]: Math.max(min, Number(e.target.value) || 0) })}
      />
    </label>
  )
  return (
    <Section id="slice" title="Slice sprite sheet" icon="grid" defaultOpen={false}>
      <div className="button-row">
        <button className={`chip ${slice.mode === 'size' ? 'on' : ''}`} onClick={() => s.setSlice({ mode: 'size' })}>
          By cell size
        </button>
        <button className={`chip ${slice.mode === 'count' ? 'on' : ''}`} onClick={() => s.setSlice({ mode: 'count' })}>
          By rows × columns
        </button>
      </div>
      <div className="resize-grid">
        {slice.mode === 'size' ? (
          <>
            {num('cellW', 'Cell width', 1)}
            {num('cellH', 'Cell height', 1)}
          </>
        ) : (
          <>
            {num('columns', 'Columns', 1)}
            {num('rows', 'Rows', 1)}
          </>
        )}
        {num('offsetX', 'Offset X')}
        {num('offsetY', 'Offset Y')}
        {num('spacingX', 'Gap X')}
        {num('spacingY', 'Gap Y')}
      </div>
      <div className="button-row">
        <label className="check small">
          <input type="checkbox" checked={slice.skipEmpty} onChange={(e) => s.setSlice({ skipEmpty: e.target.checked })} /> Skip empty cells
        </label>
        <div className="spacer" />
        <button className={`btn small ${mode === 'slice' ? 'on' : ''}`} onClick={() => s.setMode('slice')}>
          <Icon name="grid" size={14} /> Show grid
        </button>
      </div>
      <p className="small muted">
        {rects.length ? `${rects.length} frame${rects.length === 1 ? '' : 's'} of ${rects[0].w}×${rects[0].h}` : 'No frames with these settings'}
      </p>
      <button className="btn small primary" disabled={!rects.length} onClick={sliceToStudio}>
        <Icon name="studio" size={14} /> Open as animation in Pixel Studio
      </button>
      <button className="btn small" disabled={!rects.length} onClick={() => void sliceToFiles()}>
        <Icon name="folderPlus" size={14} /> Save frames as PNG files…
      </button>
    </Section>
  )
}

// ---------- picker ----------

function ImagePicker({ onCancel, onPicked }: { onCancel?: () => void; onPicked: () => void }) {
  return (
    <div className="editor-picker">
      <div className="picker-head">
        <div>
          <h1>Image Editor</h1>
          <p className="muted">Pick an image to crop, resize, recolour or slice. Or use “Edit Image” on any image in the Library.</p>
        </div>
        <div className="spacer" />
        {onCancel && (
          <button className="btn" onClick={onCancel}>
            Back to editing
          </button>
        )}
      </div>
      <ImageChooser onChoose={(item) => void openInEditor(item).then(() => useEditor.getState().source?.path === item.path && onPicked())} />
    </div>
  )
}
