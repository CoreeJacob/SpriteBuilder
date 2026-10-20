import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { useApp } from '@/app/store'
import { pixelsToCanvas } from '@/lib/canvas'
import { compositeAt } from './model'
import {
  brushPoints,
  constrainEnd,
  floodFillInRegion,
  getPixel,
  inRegion,
  isCorner,
  type Region,
  linePoints,
  mirrorPoints,
  normalizeRect,
  parseHex,
  setPixel,
  shapePixels,
  toHex,
  TRANSPARENT,
  type RGBA
} from './raster'
import { BRUSH_TOOLS, useStudio, ZOOM_LEVELS, type Tool } from './store'

type Cell = [number, number]

/** What the pointer is doing between pointerdown and pointerup. */
type Drag =
  | {
      kind: 'stroke'
      done: () => void
      last: Cell
      color: RGBA
      /** Pixel-perfect only: the last few points drawn, and the layer as it was before the stroke. */
      perfect: { trail: Cell[]; base: Uint8ClampedArray } | null
    }
  | { kind: 'shape'; done: () => void; tool: 'line' | 'rect' | 'ellipse'; start: Cell; base: Uint8ClampedArray; color: RGBA }
  | { kind: 'select'; anchor: Cell; moved: boolean }
  | { kind: 'move'; startCell: Cell; origin: Cell }
  | { kind: 'scale'; handle: Handle; origin: Region }

/** A resize handle on the selection: which side it moves (−1 left/top, 1 right/bottom, 0 neither). */
type Handle = [-1 | 0 | 1, -1 | 0 | 1]
const HANDLES: Handle[] = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]
/** Half the size of a handle's grab area, in screen pixels. */
const HANDLE_REACH = 7
const handleCursor = ([hx, hy]: Handle): string =>
  hx === 0 ? 'ns-resize' : hy === 0 ? 'ew-resize' : hx === hy ? 'nwse-resize' : 'nesw-resize'

/** Tile-grid lines every this many pixels, handy for 8×8 game tiles. */
const MAJOR_GRID = 8

/** Tools that ⌥ temporarily turns into the eyedropper. */
const PICKS_WITH_ALT: Tool[] = ['pencil', 'fill', 'line', 'rect', 'ellipse']

export function PixelCanvas({ onHover }: { onHover: (p: Cell | null) => void }) {
  const doc = useStudio((s) => s.doc)
  const version = useStudio((s) => s.version)
  const settledVersion = useStudio((s) => s.settledVersion)
  const zoom = useStudio((s) => s.zoom)
  const showGrid = useStudio((s) => s.showGrid)
  const tileMode = useStudio((s) => s.tileMode)
  const tool = useStudio((s) => s.tool)
  const selection = useStudio((s) => s.selection)
  const floating = useStudio((s) => s.floating)
  const mirrorX = useStudio((s) => s.mirrorX)
  const mirrorY = useStudio((s) => s.mirrorY)
  const frame = useStudio((s) => s.frame)
  const onionSkin = useStudio((s) => s.onionSkin)
  const brushSize = useStudio((s) => s.brushSize)
  const brushShape = useStudio((s) => s.brushShape)
  const resolvedTheme = useApp((s) => s.resolvedTheme)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)
  const lastClick = useRef<Cell | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [altDown, setAltDown] = useState(false)
  const [hoverHandle, setHoverHandle] = useState<Handle | null>(null)

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
    // Grid and overlay colours come from the current theme.
    const css = getComputedStyle(document.documentElement)
    const theme = {
      grid: css.getPropertyValue('--canvas-grid').trim(),
      gridMajor: css.getPropertyValue('--canvas-grid-major').trim(),
      dim: css.getPropertyValue('--canvas-dim').trim(),
      tileEdge: css.getPropertyValue('--canvas-tile-edge').trim()
    }
    ctx.imageSmoothingEnabled = false

    const source = pixelsToCanvas(compositeAt(doc, frame, version), doc.width, doc.height)

    // Onion skin: the previous frame tinted red and the next tinted blue, faintly
    // underneath. It wraps around, since most game animations loop.
    const onion: Array<{ canvas: HTMLCanvasElement; alpha: number }> = []
    if (onionSkin && doc.frames.length > 1) {
      const neighbours = [
        { index: (frame - 1 + doc.frames.length) % doc.frames.length, tint: 'rgb(255, 70, 90)' },
        { index: (frame + 1) % doc.frames.length, tint: 'rgb(70, 150, 255)' }
      ]
      for (const n of doc.frames.length === 2 ? neighbours.slice(0, 1) : neighbours) {
        const c = pixelsToCanvas(compositeAt(doc, n.index, settledVersion), doc.width, doc.height)
        const cx = c.getContext('2d')!
        cx.globalCompositeOperation = 'source-atop'
        cx.fillStyle = n.tint
        cx.fillRect(0, 0, c.width, c.height)
        onion.push({ canvas: c, alpha: 0.35 })
      }
    }
    const lifted = floating ? pixelsToCanvas(floating.pixels, floating.w, floating.h) : null

    const tileW = doc.width * zoom
    const tileH = doc.height * zoom
    // In tile mode the real sprite is the middle copy.
    const ox = tileMode ? tileW : 0
    const oy = tileMode ? tileH : 0

    for (let ty = 0; ty < repeat; ty++) {
      for (let tx = 0; tx < repeat; tx++) {
        for (const o of onion) {
          ctx.globalAlpha = o.alpha
          ctx.drawImage(o.canvas, tx * tileW, ty * tileH, tileW, tileH)
          ctx.globalAlpha = 1
        }
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
      ctx.fillStyle = theme.dim
      ctx.fillRect(0, 0, cssW, tileH)
      ctx.fillRect(0, tileH * 2, cssW, tileH)
      ctx.fillRect(0, tileH, tileW, tileH)
      ctx.fillRect(tileW * 2, tileH, tileW, tileH)
    }

    if (showGrid && zoom >= 4) {
      const hair = 1 / dpr
      ctx.fillStyle = theme.grid
      for (let x = 0; x <= doc.width * repeat; x++) ctx.fillRect(x * zoom, 0, hair, cssH)
      for (let y = 0; y <= doc.height * repeat; y++) ctx.fillRect(0, y * zoom, cssW, hair)
      ctx.fillStyle = theme.gridMajor
      for (let x = 0; x <= doc.width * repeat; x += MAJOR_GRID) ctx.fillRect(x * zoom, 0, hair, cssH)
      for (let y = 0; y <= doc.height * repeat; y += MAJOR_GRID) ctx.fillRect(0, y * zoom, cssW, hair)
    }
    if (tileMode) {
      ctx.strokeStyle = theme.tileEdge
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
      if (tool === 'select') {
        // Resize handles on the corners and edges.
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
        ctx.lineWidth = 1
        for (const [hx, hy] of HANDLES) {
          const px = Math.round(ox + (selection.x + ((hx + 1) / 2) * selection.w) * zoom) - 3.5
          const py = Math.round(oy + (selection.y + ((hy + 1) / 2) * selection.h) * zoom) - 3.5
          ctx.fillRect(px, py, 7, 7)
          ctx.strokeRect(px, py, 7, 7)
        }
      }
    }

    if (hover && tool !== 'select') {
      // Outline exactly the pixels the brush would paint.
      const brush = BRUSH_TOOLS.includes(tool) && !altDown
      const cells = brush ? brushPoints([hover], brushSize, brushShape) : [hover]
      const covered = new Set(cells.map(([x, y]) => `${x},${y}`))
      const edges = new Path2D()
      for (const [x, y] of cells) {
        const [l, t, r, b] = [x * zoom, y * zoom, (x + 1) * zoom, (y + 1) * zoom]
        if (!covered.has(`${x},${y - 1}`)) (edges.moveTo(l, t), edges.lineTo(r, t))
        if (!covered.has(`${x},${y + 1}`)) (edges.moveTo(l, b), edges.lineTo(r, b))
        if (!covered.has(`${x - 1},${y}`)) (edges.moveTo(l, t), edges.lineTo(l, b))
        if (!covered.has(`${x + 1},${y}`)) (edges.moveTo(r, t), edges.lineTo(r, b))
      }
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.stroke(edges)
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.stroke(edges)
    }
  }, [doc, version, zoom, showGrid, tileMode, repeat, hover, selection, floating, mirrorX, mirrorY, tool, frame, onionSkin, resolvedTheme, settledVersion, brushSize, brushShape, altDown])

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

  /** The resize handle under the pointer, if the select tool is showing handles. */
  const handleAt = (e: PointerEvent): Handle | null => {
    const box = useStudio.getState().selection
    if (tool !== 'select' || !box) return null
    const rect = canvasRef.current!.getBoundingClientRect()
    const [ox, oy] = tileMode ? [W * zoom, H * zoom] : [0, 0]
    return (
      HANDLES.find(([hx, hy]) => {
        const px = ox + (box.x + ((hx + 1) / 2) * box.w) * zoom
        const py = oy + (box.y + ((hy + 1) / 2) * box.h) * zoom
        return Math.abs(e.clientX - rect.left - px) <= HANDLE_REACH && Math.abs(e.clientY - rect.top - py) <= HANDLE_REACH
      }) ?? null
    )
  }

  /** Resizes from a handle: the opposite side stays put; ⇧ keeps the original shape. */
  const scaleTo = (d: Extract<Drag, { kind: 'scale' }>, e: PointerEvent): void => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const [ox, oy] = tileMode ? [W * zoom, H * zoom] : [0, 0]
    // The nearest line between pixels to the pointer.
    const gx = Math.round((e.clientX - rect.left - ox) / zoom)
    const gy = Math.round((e.clientY - rect.top - oy) / zoom)
    const { handle: [hx, hy], origin: o } = d
    let [left, top, right, bottom] = [o.x, o.y, o.x + o.w, o.y + o.h]
    if (hx === -1) left = Math.min(gx, right - 1)
    if (hx === 1) right = Math.max(gx, left + 1)
    if (hy === -1) top = Math.min(gy, bottom - 1)
    if (hy === 1) bottom = Math.max(gy, top + 1)
    let [w, h] = [right - left, bottom - top]
    if (e.shiftKey) {
      // Same shape as before: corners follow whichever side moved further; edges grow the other side evenly.
      const times = hx === 0 ? h / o.h : hy === 0 ? w / o.w : Math.max(w / o.w, h / o.h)
      ;[w, h] = [Math.max(1, Math.round(o.w * times)), Math.max(1, Math.round(o.h * times))]
      left = hx === -1 ? right - w : hx === 1 ? left : Math.round(o.x + (o.w - w) / 2)
      top = hy === -1 ? bottom - h : hy === 1 ? top : Math.round(o.y + (o.h - h) / 2)
    }
    useStudio.getState().scaleFloating({ x: left, y: top, w, h })
  }

  const effectiveTool = (e: { altKey: boolean }): Tool =>
    e.altKey && PICKS_WITH_ALT.includes(tool) ? 'eyedropper' : tool

  /** The pixels a list of brush positions reaches, with brush size, tile wrapping, mirroring and the selection as a stencil. */
  const reach = (points: Cell[], brushed: boolean): Cell[] => {
    const s = useStudio.getState()
    const clip = s.floating ? null : s.selection
    const stamped = (brushed ? brushPoints(points, s.brushSize, s.brushShape) : points).map(wrap)
    return mirrorPoints(stamped, W, H, s.mirrorX, s.mirrorY).filter(([x, y]) => inRegion(clip, x, y))
  }

  /** Paints the brush at each point; `brushed: false` for pixels that already include the brush (shapes). */
  const plot = (points: Cell[], color: RGBA, brushed = true): void => {
    const s = useStudio.getState()
    const cel = s.activeCel()
    if (!cel) return
    for (const [x, y] of reach(points, brushed)) setPixel(cel, W, H, x, y, color)
    s.touch()
  }

  /** Puts pixels back to how they were in `base` (pixel-perfect takes back corner pixels). */
  const unplot = (points: Cell[], base: Uint8ClampedArray): void => {
    const cel = useStudio.getState().activeCel()
    if (!cel) return
    for (const [x, y] of reach(points, true)) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue
      const i = (y * W + x) * 4
      cel.set(base.subarray(i, i + 4), i)
    }
  }

  const drawShape = (d: Extract<Drag, { kind: 'shape' }>, end: Cell, shift: boolean): void => {
    const [x0, y0] = d.start
    const corner = shift ? constrainEnd(x0, y0, end[0], end[1], d.tool === 'line' ? 'line' : 'box') : end
    const { fillShapes, brushSize, brushShape } = useStudio.getState()
    plot(shapePixels(d.tool, d.start, corner, fillShapes, brushSize, brushShape), d.color, false)
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
      const handle = handleAt(e)
      if (handle) {
        if (!s.floating) s.liftSelection()
        const f = useStudio.getState().floating
        if (f) drag.current = { kind: 'scale', handle, origin: { x: f.x, y: f.y, w: f.w, h: f.h } }
        return
      }
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
      const color = getPixel(compositeAt(doc, s.frame, s.version), W, x, y)
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
      drawShape(d, cell, e.shiftKey)
      return
    }

    // Pencil or eraser. Shift-click draws a straight line from the last click.
    const cel = s.activeCel()
    const perfect = s.pixelPerfect && s.brushSize === 1 && cel ? { trail: [cell], base: cel.slice() } : null
    drag.current = { kind: 'stroke', done, last: cell, color, perfect }
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
    if (!d) {
      const handle = handleAt(e)
      if (handle?.join() !== hoverHandle?.join()) setHoverHandle(handle)
      return
    }
    // The button came up somewhere we didn't hear about (e.g. over another app): finish here.
    if (e.buttons === 0) return endDrag()
    const s = useStudio.getState()
    if (d.kind === 'scale') {
      scaleTo(d, e)
    } else if (d.kind === 'stroke') {
      if (cell[0] === d.last[0] && cell[1] === d.last[1]) return
      const points = linePoints(...d.last, ...cell)
      if (d.perfect) {
        // Draw one pixel at a time; when the last three make an L, take the corner back out.
        const { trail, base } = d.perfect
        for (const p of points.slice(1)) {
          trail.push(p)
          plot([p], d.color)
          const n = trail.length
          if (n >= 3 && isCorner(trail[n - 3], trail[n - 2], trail[n - 1])) unplot(trail.splice(n - 2, 1), base)
          if (trail.length > 3) trail.shift()
        }
      } else {
        plot(points, d.color)
      }
      d.last = cell
    } else if (d.kind === 'shape') {
      s.activeCel()?.set(d.base)
      drawShape(d, cell, e.shiftKey)
    } else if (d.kind === 'select') {
      const [l, t, r, b] = normalizeRect(...d.anchor, ...clampCell(unoffset(cell)))
      d.moved = true
      useStudio.setState({ selection: { x: l, y: t, w: r - l + 1, h: b - t + 1 } })
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
      style={tool === 'select' && hoverHandle ? { cursor: handleCursor(hoverHandle) } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        setHover(null)
        onHover(null)
        if (!drag.current) setHoverHandle(null)
      }}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={onWheel}
    />
  )
}
