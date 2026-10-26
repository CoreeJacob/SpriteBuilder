import { useEffect, useRef, useState, type RefObject } from 'react'

export interface Size {
  w: number
  h: number
}

/** Watches an element's size (its content box). Attach the ref; `initial` is used until it's measured. */
export function useElementSize<T extends HTMLElement>(initial: Size): [RefObject<T | null>, Size] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size]
}
