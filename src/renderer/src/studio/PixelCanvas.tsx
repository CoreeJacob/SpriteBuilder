import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { compositeFrame } from './model'
import { floodFill, getPixel, linePoints, parseHex, setPixel, toHex, TRANSPARENT, type RGBA } from './raster'
import { useStudio, ZOOM_LEVELS, type Tool } from './store'

interface Stroke {
  done: () => void
  last: [number, number]
  color: RGBA
}

/** Tile-grid lines every this many pixels, handy for 8×8 game tiles. */
const MAJOR_GRID = 8

export function PixelCanvas({ onHover }: { onHover: (p: [number, number] | null) => void }) {
  const doc = useStudio((s) => s.doc)
  const version = useStudio((s) => s.version)
  const zoom = useStudio((s) => s.zoom)
  const showGrid = useStudio((s) => s.showGrid)
  const tileMode = useStudio((s) => s.tileMode)
  const tool = useStudio((s) => s.tool)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stroke = useRef<Stroke | null>(null)
  const lastClick = useRef<[number, number] | null>(null)
  const [hover, setHover] = useState<[number, number] | null>(null)
  const [altDown, setAltDown] = useState(false)

  const repeat = tileMode ? 3 : 1

  // Alt temporarily switches pencil/fill to the eyedropper.
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

    const source = document.createElement('canvas')
    source.width = doc.width
    source.height = doc.height
    source.getContext('2d')!.putImageData(new ImageData(compositeFrame(doc, 0), doc.width, doc.height), 0, 0)

    const tileW = doc.width * zoom
    const tileH = doc.height * zoom
    for (let ty = 0; ty < repeat; ty++) {
      for (let tx = 0; tx < repeat; tx++) ctx.drawImage(source, tx * tileW, ty * tileH, tileW, tileH)
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

    if (hover) {
      const [hx, hy] = hover
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = 1
      ctx.strokeRect(hx * zoom + 0.5, hy * zoom + 0.5, zoom - 1, zoom - 1)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.strokeRect(hx * zoom - 0.5, hy * zoom - 0.5, zoom + 1, zoom + 1)
    }
  }, [doc, version, zoom, showGrid, tileMode, repeat, hover])

  if (!doc) return null

  /** Screen position → canvas cell (unwrapped, so tile mode lines stay continuous). */
  const cellAt = (e: PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return [Math.floor((e.clientX - rect.left) / zoom), Math.floor((e.clientY - rect.top) / zoom)]
  }
  const wrap = ([x, y]: [number, number]): [number, number] =>
    tileMode ? [((x % doc.width) + doc.width) % doc.width, ((y % doc.height) + doc.height) % doc.height] : [x, y]

  const effectiveTool = (e: PointerEvent): Tool => (e.altKey && (tool === 'pencil' || tool === 'fill') ? 'eyedropper' : tool)

  const paint = (points: Array<[number, number]>, color: RGBA): void => {
    const cel = useStudio.getState().activeCel()
    if (!cel) return
    for (const p of points) {
      const [x, y] = wrap(p)
      setPixel(cel, doc.width, doc.height, x, y, color)
    }
    useStudio.getState().touch()
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0 && e.button !== 2) return
    const state = useStudio.getState()
    const cell = cellAt(e)
    const [x, y] = wrap(cell)
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return
    const secondary = e.button === 2
    const current = effectiveTool(e)

    if (current === 'eyedropper') {
      const color = getPixel(compositeFrame(doc, state.frame), doc.width, x, y)
      if (color[3] === 0) return
      const hex = toHex([color[0], color[1], color[2], 255])
      if (secondary) state.setSecondary(hex)
      else state.setPrimary(hex)
      return
    }

    const color = current === 'eraser' ? TRANSPARENT : parseHex(secondary ? state.secondary : state.primary)

    if (current === 'fill') {
      const cel = state.activeCel()
      if (!cel) return
      const done = state.beginEdit()
      floodFill(cel, doc.width, doc.height, x, y, color)
      done()
      state.touch()
      return
    }

    // Pencil or eraser. Shift-click draws a straight line from the last click.
    e.currentTarget.setPointerCapture(e.pointerId)
    const done = state.beginEdit()
    stroke.current = { done, last: cell, color }
    paint(e.shiftKey && lastClick.current ? linePoints(...lastClick.current, ...cell) : [cell], color)
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>): void => {
    const cell = cellAt(e)
    const [x, y] = wrap(cell)
    const inside = x >= 0 && y >= 0 && x < doc.width && y < doc.height
    const shown: [number, number] | null = inside ? cell : null
    if (shown?.[0] !== hover?.[0] || shown?.[1] !== hover?.[1]) {
      setHover(shown)
      onHover(inside ? [x, y] : null)
    }
    const s = stroke.current
    if (!s) return
    if (cell[0] === s.last[0] && cell[1] === s.last[1]) return
    paint(linePoints(...s.last, ...cell), s.color)
    s.last = cell
  }

  const endStroke = (): void => {
    if (!stroke.current) return
    stroke.current.done()
    lastClick.current = stroke.current.last
    stroke.current = null
  }

  const onWheel = (e: WheelEvent): void => {
    // Pinch-to-zoom on a trackpad arrives as a wheel event with ctrlKey set.
    if (!e.ctrlKey && !e.metaKey) return
    const i = ZOOM_LEVELS.indexOf(zoom)
    const next = e.deltaY < 0 ? ZOOM_LEVELS[Math.min(i + 1, ZOOM_LEVELS.length - 1)] : ZOOM_LEVELS[Math.max(i - 1, 0)]
    useStudio.getState().setZoom(next)
  }

  const cursorTool = altDown && (tool === 'pencil' || tool === 'fill') ? 'eyedropper' : tool

  return (
    <canvas
      ref={canvasRef}
      className={`pixel-canvas checker tool-${cursorTool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={() => {
        setHover(null)
        onHover(null)
      }}
      onLostPointerCapture={endStroke}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={onWheel}
    />
  )
}
