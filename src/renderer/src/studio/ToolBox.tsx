// The Pixel Studio toolbox: tools, the brush and flip/rotate menus, and the two colours.

import type { ReactNode } from 'react'
import { Dropdown } from '@/app/Dropdown'
import { Icon, type IconName } from '@/app/Icon'
import { MAX_BRUSH, type Turn } from './raster'
import { BRUSH_TOOLS, SHAPE_TOOLS, useStudio, type Rescale, type Tool } from './store'

export const TOOLS: Array<{ tool: Tool; icon: IconName; label: string; key: string; groupStart?: boolean }> = [
  { tool: 'pencil', icon: 'pencil', label: 'Pencil', key: 'B' },
  { tool: 'eraser', icon: 'eraser', label: 'Eraser', key: 'E' },
  { tool: 'fill', icon: 'fill', label: 'Fill', key: 'G' },
  { tool: 'eyedropper', icon: 'eyedropper', label: 'Eyedropper', key: 'I' },
  { tool: 'line', icon: 'line', label: 'Line · ⇧ snaps to 45°', key: 'L', groupStart: true },
  { tool: 'rect', icon: 'rect', label: 'Rectangle · ⇧ for a square', key: 'R' },
  { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse · ⇧ for a circle', key: 'O' },
  { tool: 'select', icon: 'select', label: 'Select · drag inside to move, ⌥-drag to copy', key: 'M', groupStart: true }
]

/** Flips and quarter turns, with the keys that do them (handled in useStudioShortcuts). */
const TURNS: Array<{ turn: Turn; icon: IconName; label: string; keys: string }> = [
  { turn: 'flipH', icon: 'flipH', label: 'Flip horizontally', keys: '⇧H' },
  { turn: 'flipV', icon: 'flipV', label: 'Flip vertically', keys: '⇧V' },
  { turn: 'rotateCW', icon: 'rotateCW', label: 'Rotate 90° right', keys: '⇧R' },
  { turn: 'rotateCCW', icon: 'rotateCCW', label: 'Rotate 90° left', keys: '⌥⇧R' }
]

export function ToolBox() {
  const tool = useStudio((s) => s.tool)
  const primary = useStudio((s) => s.primary)
  const secondary = useStudio((s) => s.secondary)
  const fillShapes = useStudio((s) => s.fillShapes)
  const { setTool, setPrimary, setSecondary, swapColors, toggleFillShapes } = useStudio.getState()

  return (
    <div className="toolbox">
      {TOOLS.map((t) => (
        <div key={t.tool} className="tool-slot">
          {t.groupStart && <div className="tool-divider" />}
          <button className={`tool ${tool === t.tool ? 'on' : ''}`} onClick={() => setTool(t.tool)} title={`${t.label} (${t.key})`}>
            <Icon name={t.icon} size={20} />
          </button>
          {t.tool === 'select' && tool === 'select' && <TurnMenu />}
          {t.tool === 'ellipse' && SHAPE_TOOLS.includes(tool) && (
            <button
              className={`tool small ${fillShapes ? 'on' : ''}`}
              onClick={toggleFillShapes}
              title={`${fillShapes ? 'Filled shapes' : 'Outline shapes'} · click to switch (F)`}
            >
              <Icon name={fillShapes ? 'shapeFilled' : 'rect'} size={14} filled={fillShapes} />
            </button>
          )}
        </div>
      ))}
      {BRUSH_TOOLS.includes(tool) && <BrushMenu />}
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

/** A small toolbox button with a menu that opens to its right. */
function ToolPopover({ label, title, children }: { label: ReactNode; title: string; children: (close: () => void) => ReactNode }) {
  return (
    <Dropdown
      className="tool-popover"
      button={(open, toggle) => (
        <button className={`tool small ${open ? 'on' : ''}`} onClick={toggle} title={title}>
          {label}
        </button>
      )}
    >
      {children}
    </Dropdown>
  )
}

function BrushMenu() {
  const size = useStudio((s) => s.brushSize)
  const shape = useStudio((s) => s.brushShape)
  const pixelPerfect = useStudio((s) => s.pixelPerfect)
  const { setBrushSize, setBrushShape, togglePixelPerfect } = useStudio.getState()
  return (
    <ToolPopover label={<span className="brush-size">{size}px</span>} title={`Brush: ${size}px ${shape} · [ and ] change the size`}>
      {() => (
        <>
          <div className="dropdown-label">Brush size · [ ]</div>
          <div className="filter-options">
            {Array.from({ length: MAX_BRUSH }, (_, i) => i + 1).map((n) => (
              <button key={n} className={`chip ${size === n ? 'on' : ''}`} onClick={() => setBrushSize(n)}>
                {n}
              </button>
            ))}
          </div>
          <div className="dropdown-label">Shape</div>
          <div className="filter-options">
            {(['square', 'round'] as const).map((s) => (
              <button key={s} className={`chip ${shape === s ? 'on' : ''}`} onClick={() => setBrushShape(s)}>
                {s === 'square' ? 'Square' : 'Round'}
              </button>
            ))}
          </div>
          <div className="dropdown-sep" />
          <label className="check" title="Removes the extra corner pixels from jagged freehand lines">
            <input type="checkbox" checked={pixelPerfect} onChange={togglePixelPerfect} />
            Pixel-perfect lines
          </label>
          <p className="muted small">{size === 1 ? 'Freehand pencil and eraser strokes skip stray corner pixels.' : 'Works with the 1px brush.'}</p>
        </>
      )}
    </ToolPopover>
  )
}

const RESCALES: Array<{ how: Rescale; label: string }> = [
  { how: 'double', label: 'Twice as big' },
  { how: 'half', label: 'Half the size' },
  { how: 'fit', label: 'Fill the canvas' }
]

function TurnMenu() {
  const hasSelection = useStudio((s) => s.selection !== null)
  const doc = useStudio((s) => s.doc)
  return (
    <ToolPopover label={<Icon name="rotateCW" size={14} />} title="Flip, rotate or resize the selection (or the whole layer)">
      {(close) => (
        <>
          <div className="dropdown-label">{hasSelection ? 'Selection' : 'Whole layer'}</div>
          {TURNS.map((t) => (
            <button key={t.turn} className="dropdown-item" onClick={() => (useStudio.getState().turn(t.turn), close())}>
              <Icon name={t.icon} /> {t.label} <span className="muted small menu-keys">{t.keys}</span>
            </button>
          ))}
          <div className="dropdown-sep" />
          {RESCALES.map((r) => (
            <button key={r.how} className="dropdown-item" onClick={() => (useStudio.getState().rescale(r.how), close())}>
              <Icon name="resize" /> {r.label}
              {r.how === 'fit' && doc && <span className="muted small menu-keys">{doc.width}×{doc.height}</span>}
            </button>
          ))}
          <p className="muted small">Or drag the handles on the selection (⇧ keeps its shape).</p>
        </>
      )}
    </ToolPopover>
  )
}
