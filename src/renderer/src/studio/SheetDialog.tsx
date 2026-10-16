import { useEffect, useMemo, useRef, useState } from 'react'
import { attempt, useApp } from '@/app/store'
import { drawPixels, pixelsToPng } from '@/lib/canvas'
import { planSheet, renderSheet, sheetJson, type SheetLayout, type SheetOptions } from './exporters'
import { useStudio } from './store'

const SCALES = [1, 2, 4, 8]
const PREVIEW_W = 440
const PREVIEW_H = 220

export function SheetDialog({ onClose }: { onClose: () => void }) {
  const doc = useStudio((s) => s.doc)!
  const name = useStudio((s) => s.name)
  const folder = useStudio((s) => s.folder)
  const [options, setOptions] = useState<SheetOptions>({ layout: doc.frames.length > 8 ? 'grid' : 'row', columns: 0, padding: 0, scale: 1 })
  const [withJson, setWithJson] = useState(true)
  const [busy, setBusy] = useState(false)
  const previewRef = useRef<HTMLCanvasElement>(null)

  const plan = useMemo(() => planSheet(doc.frames.length, doc.width, doc.height, options), [doc, options])
  const pixels = useMemo(() => renderSheet(doc, plan, options.scale), [doc, plan, options.scale])
  const set = (patch: Partial<SheetOptions>): void => setOptions((current) => ({ ...current, ...patch }))
  const baseName = `${name}-sheet`

  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    drawPixels(canvas, pixels, plan.width, plan.height)
    // Show it as big as fits, in whole-pixel steps so it stays sharp.
    const fit = Math.min(PREVIEW_W / plan.width, PREVIEW_H / plan.height)
    const zoom = fit >= 1 ? Math.floor(fit) : fit
    canvas.style.width = `${plan.width * zoom}px`
    canvas.style.height = `${plan.height * zoom}px`
  }, [pixels, plan])

  const save = async (target: 'file' | 'library'): Promise<void> => {
    setBusy(true)
    try {
      const png = await pixelsToPng(pixels, plan.width, plan.height)
      const json = (file: string): string | null => (withJson ? sheetJson(doc, plan, name, file, options.scale) : null)
      const saved =
        target === 'file'
          ? await attempt(() => window.api.exportSheet(`${baseName}.png`, png, json(`${baseName}.png`)))
          : await attempt(() => window.api.saveSheetToLibrary(folder, baseName, png, json(`${baseName}.png`)))
      if (saved) {
        const file = saved.slice(saved.lastIndexOf('/') + 1)
        useApp.getState().notify(target === 'file' ? `Exported ${file}${withJson ? ' and its .json' : ''}` : `Saved ${file} to the Library`)
        onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  const tooBig = plan.width > 16384 || plan.height > 16384

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal sheet-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>Export Sprite Sheet</h2>

        <div className="sheet-preview checker">
          <canvas ref={previewRef} className="pixelated" />
        </div>
        <p className="muted small">
          {doc.frames.length} frame{doc.frames.length === 1 ? '' : 's'} · {plan.columns}×{plan.rows} · sheet {plan.width}×{plan.height} px
        </p>

        <div className="sheet-options">
          <div className="field">
            <span>Layout</span>
            <div className="filter-options">
              {(['row', 'column', 'grid'] as SheetLayout[]).map((l) => (
                <button key={l} className={`chip ${options.layout === l ? 'on' : ''}`} onClick={() => set({ layout: l })}>
                  {l === 'row' ? 'One row' : l === 'column' ? 'One column' : 'Grid'}
                </button>
              ))}
            </div>
          </div>
          {options.layout === 'grid' && (
            <label className="field">
              <span>Columns</span>
              <input
                className="input"
                type="number"
                min={0}
                max={doc.frames.length}
                value={options.columns || ''}
                placeholder="auto"
                onChange={(e) => set({ columns: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          )}
          <label className="field">
            <span>Padding (px)</span>
            <input
              className="input"
              type="number"
              min={0}
              max={64}
              value={options.padding}
              onChange={(e) => set({ padding: Math.max(0, Math.min(64, Number(e.target.value) || 0)) })}
            />
          </label>
          <div className="field">
            <span>Scale</span>
            <div className="filter-options">
              {SCALES.map((n) => (
                <button key={n} className={`chip ${options.scale === n ? 'on' : ''}`} onClick={() => set({ scale: n })}>
                  {n}×
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="check">
          <input type="checkbox" checked={withJson} onChange={(e) => setWithJson(e.target.checked)} />
          Also save frame data (.json) — positions and timings that game engines read
        </label>
        {tooBig && <p className="error small">This sheet is too large. Try a grid layout or a smaller scale.</p>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={busy || tooBig} onClick={() => void save('library')} title={`Saves into “${folder || 'Library'}”`}>
            Add to Library
          </button>
          <button className="btn primary" disabled={busy || tooBig} onClick={() => void save('file')}>
            Save to File…
          </button>
        </div>
      </div>
    </div>
  )
}
