// Styled tooltips for anything with a `title`. The title is moved to `data-tip` on
// first hover so the slow native tooltip never shows. A trailing "(B)" or "(⌘S)" in
// the text is shown as a keyboard shortcut.

import { useEffect, useState } from 'react'

interface Tip {
  text: string
  shortcut: string | null
  x: number
  y: number
  side: 'above' | 'below' | 'right'
}

const DELAY_MS = 350
const EDGE = 150 // keep the tooltip's centre this far from the window edges

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    let current: HTMLElement | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const hide = (): void => {
      clearTimeout(timer)
      current = null
      setTip(null)
    }

    const show = (el: HTMLElement): void => {
      if (!el.isConnected) return
      const raw = el.dataset.tip ?? ''
      const match = raw.match(/^(.*?)\s*\(([^()]+)\)$/)
      const rect = el.getBoundingClientRect()
      const text = match ? match[1] : raw
      const shortcut = match ? match[2] : null
      // Buttons in the vertical bars on the left get their tooltip to the side.
      if (el.closest('.toolbox, .rail')) {
        setTip({ text, shortcut, x: rect.right + 8, y: rect.top + rect.height / 2, side: 'right' })
        return
      }
      const below = rect.top < 48
      setTip({
        text,
        shortcut,
        x: Math.min(Math.max(rect.left + rect.width / 2, EDGE), window.innerWidth - EDGE),
        y: below ? rect.bottom + 8 : rect.top - 8,
        side: below ? 'below' : 'above'
      })
    }

    const onOver = (e: MouseEvent): void => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[title], [data-tip]') ?? null
      if (el === current) return
      hide()
      if (!el) return
      // React sets `title` again if the text changes, so always take the latest.
      if (el.title) {
        el.dataset.tip = el.title
        el.removeAttribute('title')
      }
      if (!el.dataset.tip) return
      current = el
      timer = setTimeout(() => show(el), DELAY_MS)
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mousedown', hide)
    document.addEventListener('keydown', hide)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mousedown', hide)
      document.removeEventListener('keydown', hide)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  if (!tip) return null
  return (
    <div className={`tooltip ${tip.side}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.text}
      {tip.shortcut && <kbd>{tip.shortcut}</kbd>}
    </div>
  )
}
