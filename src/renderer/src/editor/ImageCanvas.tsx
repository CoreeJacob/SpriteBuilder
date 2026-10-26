import { useEffect, useMemo, useRef, type PointerEvent } from 'react'
import { drawPixels } from '@/lib/canvas'
import { useElementSize } from '@/lib/useElementSize'
import { normalizeRect, toHex } from '@/studio/raster'
import { adjust, clampRect, isIdentity, makeTransparent, pixelAt, sliceRects, type Img, type Rect } from './ops'
import { useEditor } from './store'

const PADDING = 48

type Drag = { kind: 'new'; anchor: [number, number] } | { kind: 'move'; start: [number, number]; origin: Rect }

export interface HoverInfo {
  x: number
  y: number
  color: string | null
}

export function ImageCanvas({ onHover }: { onHover: (info: HoverInfo | null) => void }) {
  const image = useEditor((s) => s.image)!
  const adjustments = useEditor((s) => s.adjustments)
  const zoom = useEditor((s) => s.zoom)
  const mode = useEditor((s) => s.mode)
  const cropRect = useEditor((s) => s.cropRect)
  const slice = useEditor((s) => s.slice)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)
  const [viewportRef, viewport] = useElementSize<HTMLDivElement>({ w: 800, h: 600 })

  // Adjustments preview live without changing the image until applied.
  const shown: Img = useMemo(() => (isIdentity(adjustments) ? image : adjust(image, adjustments)), [image, adjustments])
  const sliceCells = useMemo(() => (mode === 'slice' ? sliceRects(shown, slice) : []), [mode, shown, slice])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawPixels(canvas, shown.data, shown.width, shown.height)
  }, [shown])

  // "Fit" fills the space; small images get a whole-number zoom so pixels stay square.
  const fit = Math.min((viewport.w - PADDING * 2) / image.width, (viewport.h - PADDING * 2) / image.height)
  const scale = zoom === 'fit' ? (fit >= 1 ? Math.floor(fit) : Math.max(fit, 0.05)) : zoom
  const cssW = image.width * scale
  const cssH = image.height * scale

  const cellAt = (e: PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return [Math.floor((e.clientX - rect.left) / scale), Math.floor((e.clientY - rect.top) / scale)]
  }
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < image.width && y < image.height
  const clampCell = ([x, y]: [number, number]): [number, number] => [
    Math.max(0, Math.min(image.width - 1, x)),
    Math.max(0, Math.min(image.height - 1, y))
  ]

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const [x, y] = cellAt(e)
    const s = useEditor.getState()
    if (mode === 'crop') {
      e.currentTarget.setPointerCapture(e.pointerId)
      const r = s.cropRect
      if (r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) {
        drag.current = { kind: 'move', start: [x, y], origin: r }
      } else {
        const anchor = clampCell([x, y])
        drag.current = { kind: 'new', anchor }
        s.setCropRect({ x: anchor[0], y: anchor[1], w: 1, h: 1 })
      }
      return
    }
    if (!inside(x, y)) return
    if (mode === 'pick') {
      s.setPicked(pixelAt(shown, x, y))
    } else if (mode === 'wand') {
      const color = pixelAt(image, x, y)
      if (color[3] !== 0) s.apply(makeTransparent(image, color, s.tolerance, { x, y }))
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const [x, y] = cellAt(e)
    if (inside(x, y)) {
      const p = pixelAt(shown, x, y)
      onHover({ x, y, color: p[3] === 0 ? null : toHex(p) })
    } else {
      onHover(null)
    }
    const d = drag.current
    if (!d) return
    const s = useEditor.getState()
    if (d.kind === 'new') {
      const [l, t, r, b] = normalizeRect(...d.anchor, ...clampCell([x, y]))
      s.setCropRect({ x: l, y: t, w: r - l + 1, h: b - t + 1 })
    } else {
      const dx = x - d.start[0]
      const dy = y - d.start[1]
      const nx = Math.max(0, Math.min(image.width - d.origin.w, d.origin.x + dx))
      const ny = Math.max(0, Math.min(image.height - d.origin.h, d.origin.y + dy))
      s.setCropRect({ ...d.origin, x: nx, y: ny })
    }
  }

  const visibleCrop = mode === 'crop' && cropRect ? clampRect(image, cropRect) : null

  return (
    <div className="canvas-viewport editor-viewport" ref={viewportRef}>
      <div className="canvas-stage" style={{ padding: PADDING }}>
        <div
          className={`editor-canvas-wrap mode-${mode}`}
          style={{ width: cssW, height: cssH }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => onHover(null)}
        >
          <canvas
            ref={canvasRef}
            className="editor-canvas checker"
            style={{ width: cssW, height: cssH, imageRendering: scale >= 1 ? 'pixelated' : 'auto' }}
          />
          <svg className="editor-overlay" width={cssW} height={cssH} viewBox={`0 0 ${image.width} ${image.height}`} preserveAspectRatio="none">
            {visibleCrop && (
              <>
                <path
                  className="crop-shade"
                  fillRule="evenodd"
                  d={`M0 0H${image.width}V${image.height}H0Z M${visibleCrop.x} ${visibleCrop.y}h${visibleCrop.w}v${visibleCrop.h}h${-visibleCrop.w}Z`}
                />
                <rect className="crop-box" x={visibleCrop.x} y={visibleCrop.y} width={visibleCrop.w} height={visibleCrop.h} />
              </>
            )}
            {sliceCells.map((r, i) => (
              <rect key={i} className="slice-cell" x={r.x} y={r.y} width={r.w} height={r.h} />
            ))}
          </svg>
          {visibleCrop && (
            <div
              className="crop-label"
              style={{ left: visibleCrop.x * scale, top: Math.max(0, visibleCrop.y * scale - 24) }}
            >
              {visibleCrop.w}×{visibleCrop.h}
            </div>
          )}
        </div>
      </div>
      <div className="zoom-readout">{Math.round(scale * 100)}%</div>
    </div>
  )
}
