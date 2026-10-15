import { useState } from 'react'
import type { Anchor } from './canvasSize'
import { MAX_SIZE } from './model'
import { useStudio } from './store'

const ANCHORS: Anchor[] = [0, 0.5, 1].flatMap((y) => [0, 0.5, 1].map((x) => [x, y] as Anchor))

export function CanvasSizeDialog({ onClose }: { onClose: () => void }) {
  const doc = useStudio((s) => s.doc)!
  const [width, setWidth] = useState(doc.width)
  const [height, setHeight] = useState(doc.height)
  const [mode, setMode] = useState<'canvas' | 'scale'>('canvas')
  const [anchor, setAnchor] = useState<Anchor>([0.5, 0.5])

  const valid = width >= 1 && height >= 1 && width <= MAX_SIZE && height <= MAX_SIZE
  const changed = width !== doc.width || height !== doc.height
  const shrinking = mode === 'canvas' && (width < doc.width || height < doc.height)

  const apply = (): void => {
    if (!valid || !changed) return
    useStudio.getState().resize(width, height, mode, anchor)
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal canvas-size-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          apply()
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>Canvas Size</h2>
        <p className="muted small">
          Now {doc.width}×{doc.height}. Changes every layer and frame, and can be undone.
        </p>

        <div className="filter-options">
          <button type="button" className={`chip ${mode === 'canvas' ? 'on' : ''}`} onClick={() => setMode('canvas')}>
            Add or remove space
          </button>
          <button type="button" className={`chip ${mode === 'scale' ? 'on' : ''}`} onClick={() => setMode('scale')}>
            Scale the pixels
          </button>
        </div>

        <div className="canvas-size-body">
          <div className="resize-grid">
            <label className="field">
              <span>Width</span>
              <input className="input" type="number" min={1} max={MAX_SIZE} value={width} autoFocus onChange={(e) => setWidth(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Height</span>
              <input className="input" type="number" min={1} max={MAX_SIZE} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
            </label>
            <div className="filter-options size-quick">
              {[8, 16, 24, 32, 48, 64].map((n) => (
                <button key={n} type="button" className="chip" onClick={() => (setWidth(n), setHeight(n))}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {mode === 'canvas' && (
            <div className="field">
              <span>Keep pixels at</span>
              <div className="anchor-grid">
                {ANCHORS.map((a) => (
                  <button
                    key={a.join()}
                    type="button"
                    className={`anchor ${a[0] === anchor[0] && a[1] === anchor[1] ? 'on' : ''}`}
                    onClick={() => setAnchor(a)}
                    title={`${a[1] === 0 ? 'Top' : a[1] === 1 ? 'Bottom' : 'Middle'} ${a[0] === 0 ? 'left' : a[0] === 1 ? 'right' : 'centre'}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {!valid && <p className="error small">Sizes go from 1 to {MAX_SIZE} pixels.</p>}
        {valid && shrinking && <p className="hint small">Pixels outside the new size will be cut off.</p>}
        {mode === 'scale' && (width % doc.width !== 0 || height % doc.height !== 0) && valid && (
          <p className="hint small">Scaling by a whole number (2×, 3×…) keeps every pixel the same size.</p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid || !changed}>
            Apply
          </button>
        </div>
      </form>
    </div>
  )
}
