// A right-click menu: stays inside the window, closes on Escape, scrolling or a click
// elsewhere, and supports one level of sub-menu (e.g. "Move to ▸").

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type MenuEntry =
  | {
      label: string
      icon?: IconName
      /** Shortcut or note shown on the right. */
      hint?: string
      danger?: boolean
      disabled?: boolean
      onSelect?: () => void
      submenu?: MenuEntry[]
    }
  | 'separator'

export interface MenuRequest {
  x: number
  y: number
  entries: MenuEntry[]
}

const EDGE = 8

/** Moves a menu so it fits inside the window. */
function useFitOnScreen(ref: React.RefObject<HTMLDivElement | null>, x: number, y: number, flipFrom?: number) {
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    let left = x
    // A sub-menu that doesn't fit on the right opens to the left of its parent instead.
    if (left + width > window.innerWidth - EDGE) left = flipFrom !== undefined ? flipFrom - width : window.innerWidth - width - EDGE
    const top = Math.min(y, window.innerHeight - height - EDGE)
    setPos({ left: Math.max(EDGE, left), top: Math.max(EDGE, top) })
  }, [ref, x, y, flipFrom])
  return pos
}

/** A right-click menu for a component: `show` opens it at a point; render `element` somewhere. */
export function useContextMenu(): { show: (x: number, y: number, entries: MenuEntry[]) => void; element: ReactNode } {
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const close = useCallback(() => setMenu(null), [])
  const show = useCallback((x: number, y: number, entries: MenuEntry[]) => setMenu({ x, y, entries }), [])
  return { show, element: menu ? <ContextMenu menu={menu} onClose={close} /> : null }
}

export function ContextMenu({ menu, onClose }: { menu: MenuRequest; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = useFitOnScreen(ref, menu.x, menu.y)

  useEffect(() => {
    const close = (e: Event): void => {
      if (e.type === 'mousedown' && ref.current?.contains(e.target as Node)) return
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      onClose()
    }
    // Wait a tick so the click that opened the menu doesn't close it.
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', close, true)
      document.addEventListener('keydown', close, true)
      document.addEventListener('scroll', close, true)
      window.addEventListener('blur', close)
      window.addEventListener('resize', close)
    })
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', close, true)
      document.removeEventListener('keydown', close, true)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [onClose])

  return (
    <div ref={ref} className="context-menu" role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
      <MenuItems entries={menu.entries} onClose={onClose} />
    </div>
  )
}

function MenuItems({ entries, onClose }: { entries: MenuEntry[]; onClose: () => void }) {
  const [openSub, setOpenSub] = useState<number | null>(null)
  return (
    <>
      {entries.map((entry, i) => {
        if (entry === 'separator') return <div key={i} className="menu-sep" />
        const hasSub = !!entry.submenu
        return (
          <div key={i} className="menu-item-wrap" onMouseEnter={() => setOpenSub(hasSub ? i : null)}>
            <button
              role="menuitem"
              className={`menu-item ${entry.danger ? 'danger' : ''} ${openSub === i ? 'open' : ''}`}
              disabled={entry.disabled}
              onClick={() => {
                if (hasSub) return setOpenSub(i)
                onClose()
                entry.onSelect?.()
              }}
            >
              <span className="menu-icon">{entry.icon && <Icon name={entry.icon} size={14} />}</span>
              <span className="menu-label">{entry.label}</span>
              {entry.hint && <span className="menu-hint">{entry.hint}</span>}
              {hasSub && <Icon name="chevron" size={12} />}
            </button>
            {hasSub && openSub === i && <SubMenu entries={entry.submenu!} onClose={onClose} />}
          </div>
        )
      })}
    </>
  )
}

function SubMenu({ entries, onClose }: { entries: MenuEntry[]; onClose: () => void }) {
  const anchor = useRef<HTMLDivElement>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number; left: number } | null>(null)
  useLayoutEffect(() => {
    const parent = anchor.current?.parentElement?.getBoundingClientRect()
    if (parent) setOrigin({ x: parent.right + 2, y: parent.top - 4, left: parent.left - 2 })
  }, [])
  return (
    <div ref={anchor}>
      {origin && <SubMenuPanel entries={entries} onClose={onClose} origin={origin} />}
    </div>
  )
}

function SubMenuPanel({ entries, onClose, origin }: { entries: MenuEntry[]; onClose: () => void; origin: { x: number; y: number; left: number } }) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = useFitOnScreen(ref, origin.x, origin.y, origin.left)
  return (
    <div ref={ref} className="context-menu submenu" role="menu" style={pos}>
      <MenuItems entries={entries} onClose={onClose} />
    </div>
  )
}
