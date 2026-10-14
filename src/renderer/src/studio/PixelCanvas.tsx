import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { useApp } from '@/app/store'
import { compositeFrame } from './model'
import {
  constrainEnd,
  ellipsePoints,
  floodFillInRegion,
  getPixel,
  inRegion,
  linePoints,
  mirrorPoints,
  normalizeRect,
  parseHex,
  rectPoints,
  setPixel,
  toHex,
  TRANSPARENT,
  type RGBA
} from './raster'
import { useStudio, ZOOM_LEVELS, type Tool } from './store'

type Cell = [number, number]

/** What the pointer is doing between pointerdown and pointerup. */
type Drag =
  | { kind: 'stroke'; done: () => void; last: Cell; color: RGBA }
  | { kind: 'shape'; done: () => void; tool: 'line' | 'rect' | 'ellipse'; start: Cell; base: Uint8ClampedArray; color: RGBA }
  | { kind: 'select'; anchor: Cell; moved: boolean }
  | { kind: 'move'; startCell: Cell; origin: Cell }

/** Tile-grid lines every this many pixels, handy for 8×8 game tiles. */
const MAJOR_GRID = 8

/** Tools that ⌥ temporarily turns into the eyedropper. */
const PICKS_WITH_ALT: Tool[] = ['pencil', 'fill', 'line', 'rect', 'ellipse']

export function PixelCanvas({ onHover }: { onHover: (p: Cell | null) => void }) {
  const doc = useStudio((s) => s.doc)
  const version = useStudio((s) => s.version)
  const zoom = useStudio((s) => s.zoom)
  const showGrid = useStudio((s) => s.showGrid)
  const tileMode = useStudio((s) => s.tileMode)
  const tool = useStudio((s) => s.tool)
  const selection = useStudio((s) => s.selection)
  const floating = useStudio((s) => s.floating)
  const mirrorX = useStudio((s) => s.mirrorX)
  const mirrorY = useStudio((s) => s.mirrorY)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)
  const lastClick = useRef<Cell | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [altDown, setAltDown] = useState(false)

  const repeat = tileMode ? 3 : 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => setAltDown(e.altKey)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !doc) return
    const dpr = window.devicePixelRatio || 1
    const cssW = doc.width * zoom * repeat
    const cssH = doc.height * zoom * repeat
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)

    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false

    const toCanvas = (pixels: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): HTMLCanvasElement => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d')!.putImageData(new ImageData(pixels, w, h), 0, 0)
      return c
    }
    const source = toCanvas(compositeFrame(doc, 0), doc.width, doc.height)
    const lifted = floating ? toCanvas(floating.pixels.slice() as Uint8ClampedArray<ArrayBuffer>, floating.w, floating.h) : null

    const tileW = doc.width * zoom
    const tileH = doc.height * zoom
    // In tile mode the real sprite is the middle copy.
    const ox = tileMode ? tileW : 0
    const oy = tileMode ? tileH : 0

    for (let ty = 0; ty < repeat; ty++) {
      for (let tx = 0; tx < repeat; tx++) {
        ctx.drawImage(source, tx * tileW, ty * tileH, tileW, tileH)
        if (lifted && floating) {
          ctx.save()
          ctx.beginPath()
          ctx.rect(tx * tileW, ty * tileH, tileW, tileH)
          ctx.clip()
          ctx.drawImage(lifted, tx * tileW + floating.x * zoom, ty * tileH + floating.y * zoom, floating.w * zoom, floating.h * zoom)
          ctx.restore()
        }
      }
    }
    if (tileMode) {
      // Dim the copies so the real tile in the middle stands out.
      ctx.fillStyle = 'rgba(20, 21, 26, 0.45)'
      ctx.fillRect(0, 0, cssW, tileH)
      ctx.fillRect(0, tileH * 2, cssW, tileH)
      ctx.fillRect(0, tileH, tileW, tileH)
      ctx.fillRect(tileW * 2, tileH, tileW, tileH)
    }

    if (showGrid && zoom >= 4) {
      const hair = 1 / dpr
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'
      for (let x = 0; x <= doc.width * repeat; x++) ctx.fillRect(x * zoom, 0, hair, cssH)
      for (let y = 0; y <= doc.height * repeat; y++) ctx.fillRect(0, y * zoom, cssW, hair)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
      for (let x = 0; x <= doc.width * repeat; x += MAJOR_GRID) ctx.fillRect(x * zoom, 0, hair, cssH)
      for (let y = 0; y <= doc.height * repeat; y += MAJOR_GRID) ctx.fillRect(0, y * zoom, cssW, hair)
    }
    if (tileMode) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.lineWidth = 1
      ctx.strokeRect(tileW + 0.5, tileH + 0.5, tileW - 1, tileH - 1)
    }

    // Mirror guides through the middle of the sprite.
    ctx.save()
    ctx.strokeStyle = 'rgba(108, 140, 255, 0.85)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    if (mirrorX) {
      ctx.beginPath()
      ctx.moveTo(ox + tileW / 2, oy)
      ctx.lineTo(ox + tileW / 2, oy + tileH)
      ctx.stroke()
    }
    if (mirrorY) {
      ctx.beginPath()
      ctx.moveTo(ox, oy + tileH / 2)
      ctx.lineTo(ox + tileW, oy + tileH / 2)
      ctx.stroke()
    }
    ctx.restore()

    if (selection) {
      // "Marching ants": a white dash with black in the gaps reads on any colour.
      const x = ox + selection.x * zoom + 0.5
      const y = oy + selection.y * zoom + 0.5
      const w = selection.w * zoom - 1
      const h = selection.h * zoom - 1
      ctx.save()
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = '#000'
      ctx.strokeRect(x, y, w, h)
      ctx.lineDashOffset = 4
      ctx.strokeStyle = '#fff'
      ctx.strokeRect(x, y, w, h)
      ctx.restore()
    }

    if (hover && tool !== 'select') {
      const [hx, hy] = hover
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = 1
      ctx.strokeRect(hx * zoom + 0.5, hy * zoom + 0.5, zoom - 1, zoom - 1)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.strokeRect(hx * zoom - 0.5, hy * zoom - 0.5, zoom + 1, zoom + 1)
    }
  }, [doc, version, zoom, showGrid, tileMode, repeat, hover, selection, floating, mirrorX, mirrorY, tool])

  if (!doc) return null
  const W = doc.width
  const H = doc.height

  /** Screen position → canvas cell (unwrapped, so tile mode lines stay continuous). */
  const cellAt = (e: PointerEvent): Cell => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return [Math.floor((e.clientX - rect.left) / zoom), Math.floor((e.clientY - rect.top) / zoom)]
  }
  const wrap = ([x, y]: Cell): Cell => (tileMode ? [((x % W) + W) % W, ((y % H) + H) % H] : [x, y])
  const unoffset = ([x, y]: Cell): Cell => (tileMode ? [x - W, y - H] : [x, y])
  const clampCell = ([x, y]: Cell): Cell => [Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y))]

  const effectiveTool = (e: { altKey: boolean }): Tool =>
    e.altKey && PICKS_WITH_ALT.includes(tool) ? 'eyedropper' : tool

  /** Draws points with tile wrapping, mirroring and the selection as a stencil. */
  const plot = (points: Cell[], color: RGBA): void => {
    const s = useStudio.getState()
    const cel = s.activeCel()
    if (!cel) return
    const clip = s.floating ? null : s.selection
    for (const [x, y] of mirrorPoints(points.map(wrap), W, H, s.mirrorX, s.mirrorY)) {
      if (inRegion(clip, x, y)) setPixel(cel, W, H, x, y, color)
    }
    s.touch()
  }

  const shapePoints = (d: Extract<Drag, { kind: 'shape' }>, end: Cell, shift: boolean): Cell[] => {
    const [x0, y0] = d.start
    const [x1, y1] = shift ? constrainEnd(x0, y0, end[0], end[1], d.tool === 'line' ? 'line' : 'box') : end
    const filled = useStudio.getState().fillShapes
    if (d.tool === 'line') return linePoints(x0, y0, x1, y1)
    if (d.tool === 'rect') return rectPoints(x0, y0, x1, y1, filled)
    return ellipsePoints(x0, y0, x1, y1, filled)
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0 && e.button !== 2) return
    const s = useStudio.getState()
    const cell = cellAt(e)
    const [x, y] = wrap(cell)
    const current = effectiveTool(e)
    const outside = x < 0 || y < 0 || x >= W || y >= H

    if (current === 'select') {
      e.currentTarget.setPointerCapture(e.pointerId)
      const [sx, sy] = unoffset(cell)
      if (s.floating && inRegion(s.floating, sx, sy)) {
        drag.current = { kind: 'move', startCell: cell, origin: [s.floating.x, s.floating.y] }
      } else if (s.selection && inRegion(s.selection, sx, sy)) {
        s.liftSelection(e.altKey)
        drag.current = { kind: 'move', startCell: cell, origin: [s.selection.x, s.selection.y] }
      } else {
        s.setSelection(null)
        drag.current = { kind: 'select', anchor: clampCell([sx, sy]), moved: false }
      }
      return
    }
    if (outside) return

    if (current === 'eyedropper') {
      const color = getPixel(compositeFrame(doc, s.frame), W, x, y)
      if (color[3] === 0) return
      const hex = toHex([color[0], color[1], color[2], 255])
      if (e.button === 2) s.setSecondary(hex)
      else s.setPrimary(hex)
      return
    }

    if (s.activeLayer()?.visible === false) {
      useApp.getState().notify('This layer is hidden. Show it (the eye icon) before drawing on it.', 'error')
      return
    }

    const color = current === 'eraser' ? TRANSPARENT : parseHex(e.button === 2 ? s.secondary : s.primary)

    if (current === 'fill') {
      const cel = s.activeCel()
      if (!cel) return
      const done = s.beginEdit()
      const clip = s.floating ? null : s.selection
      const seeds = mirrorPoints([[x, y]], W, H, s.mirrorX, s.mirrorY)
      for (const [fx, fy] of seeds) floodFillInRegion(cel, W, H, fx, fy, color, clip)
      done()
      s.touch()
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    const done = s.beginEdit()

    if (current === 'line' || current === 'rect' || current === 'ellipse') {
      const cel = s.activeCel()
      if (!cel) return
      const d: Drag = { kind: 'shape', done, tool: current, start: cell, base: cel.slice(), color }
      drag.current = d
      plot(shapePoints(d, cell, e.shiftKey), color)
      return
    }

    // Pencil or eraser. Shift-click draws a straight line from the last click.
    drag.current = { kind: 'stroke', done, last: cell, color }
    plot(e.shiftKey && lastClick.current ? linePoints(...lastClick.current, ...cell) : [cell], color)
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>): void => {
    const cell = cellAt(e)
    const [x, y] = wrap(cell)
    const inside = x >= 0 && y >= 0 && x < W && y < H
    const shown: Cell | null = inside ? cell : null
    if (shown?.[0] !== hover?.[0] || shown?.[1] !== hover?.[1]) {
      setHover(shown)
      onHover(inside ? [x, y] : null)
    }

    const d = drag.current
    if (!d) return
    const s = useStudio.getState()
    if (d.kind === 'stroke') {
      if (cell[0] === d.last[0] && cell[1] === d.last[1]) return
      plot(linePoints(...d.last, ...cell), d.color)
      d.last = cell
    } else if (d.kind === 'shape') {
      s.activeCel()?.set(d.base)
      plot(shapePoints(d, cell, e.shiftKey), d.color)
    } else if (d.kind === 'select') {
      const [l, t, r, b] = normalizeRect(...d.anchor, ...clampCell(unoffset(cell)))
      d.moved = true
      useStudio.setState({ selection: { x: l, y: t, w: r - l + 1, h: b - t + 1 }, version: s.version + 1 })
    } else {
      s.moveFloating(d.origin[0] + cell[0] - d.startCell[0], d.origin[1] + cell[1] - d.startCell[1])
    }
  }

  const endDrag = (): void => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'stroke') {
      d.done()
      lastClick.current = d.last
    } else if (d.kind === 'shape') {
      d.done()
    } else if (d.kind === 'select' && !d.moved) {
      useStudio.getState().setSelection(null) // a plain click clears the selection
    }
  }

  const onWheel = (e: WheelEvent): void => {
    // Pinch-to-zoom on a trackpad arrives as a wheel event with ctrlKey set.
    if (!e.ctrlKey && !e.metaKey) return
    const i = ZOOM_LEVELS.indexOf(zoom)
    const next = e.deltaY < 0 ? ZOOM_LEVELS[Math.min(i + 1, ZOOM_LEVELS.length - 1)] : ZOOM_LEVELS[Math.max(i - 1, 0)]
    useStudio.getState().setZoom(next)
  }

  const hoverInSelection = (() => {
    if (!hover) return false
    const [hx, hy] = unoffset(hover)
    return inRegion(floating ?? selection, hx, hy) && (floating ?? selection) !== null
  })()
  const cursorTool = altDown && PICKS_WITH_ALT.includes(tool) ? 'eyedropper' : tool
  const cursorClass = tool === 'select' && hoverInSelection ? 'tool-move' : `tool-${cursorTool}`

  return (
    <canvas
      ref={canvasRef}
      className={`pixel-canvas checker ${cursorClass}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        setHover(null)
        onHover(null)
      }}
      onLostPointerCapture={endDrag}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={onWheel}
    />
  )
}
