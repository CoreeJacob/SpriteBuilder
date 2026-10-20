import { useEffect, useRef } from 'react'
import { drawPixels } from '@/lib/canvas'

/** Pixels shown as big as fits the box, in whole-pixel steps when enlarged so they stay sharp. */
export function PixelPreview({ pixels, width, height, maxW, maxH }: { pixels: Uint8ClampedArray; width: number; height: number; maxW: number; maxH: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    drawPixels(canvas, pixels, width, height)
    const fit = Math.min(maxW / width, maxH / height)
    const zoom = fit >= 1 ? Math.floor(fit) : fit
    canvas.style.width = `${width * zoom}px`
    canvas.style.height = `${height * zoom}px`
  }, [pixels, width, height, maxW, maxH])
  return <canvas ref={ref} className="pixelated" />
}
