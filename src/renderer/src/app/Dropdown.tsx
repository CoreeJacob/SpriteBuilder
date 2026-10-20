import { useState, type ReactNode } from 'react'

/**
 * A button that opens a small menu; clicking anywhere outside closes it. `button` draws the
 * button (it gets whether the menu is open and a toggle), and the menu's contents get `close`.
 */
export function Dropdown({
  button,
  children,
  className = 'menu-anchor',
  menuClassName = ''
}: {
  button: (open: boolean, toggle: () => void) => ReactNode
  children: (close: () => void) => ReactNode
  className?: string
  menuClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const close = (): void => setOpen(false)
  return (
    <div className={className}>
      {button(open, () => setOpen(!open))}
      {open && (
        <>
          <div className="menu-scrim" onMouseDown={close} />
          <div className={`dropdown ${menuClassName}`}>{children(close)}</div>
        </>
      )}
    </div>
  )
}
