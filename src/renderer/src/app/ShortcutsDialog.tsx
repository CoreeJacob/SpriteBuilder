import { useEffect } from 'react'
import { useApp } from './store'

const GROUPS: Array<{ title: string; keys: Array<[string, string]> }> = [
  {
    title: 'Everywhere',
    keys: [
      ['⌘Z / ⇧⌘Z', 'Undo / Redo'],
      ['⌘A', 'Select all'],
      ['? or ⌘/', 'This list']
    ]
  },
  {
    title: 'Library',
    keys: [
      ['⌘F', 'Search'],
      ['⌘V', 'Paste an image into the open folder'],
      ['⌫', 'Move selected images to Trash'],
      ['Esc', 'Clear the selection'],
      ['⌘-click / ⇧-click', 'Select several images'],
      ['Double-click', 'Open in Pixel Studio'],
      ['Right-click', 'Image and folder actions']
    ]
  },
  {
    title: 'Pixel Studio · tools',
    keys: [
      ['B', 'Pencil'],
      ['E', 'Eraser'],
      ['G', 'Fill'],
      ['I', 'Eyedropper (or hold ⌥)'],
      ['L / R / O', 'Line / Rectangle / Ellipse'],
      ['F', 'Filled or outline shapes'],
      ['[ / ]', 'Smaller / bigger brush'],
      ['M', 'Select'],
      ['X', 'Swap front and back colours'],
      ['⇧ while drawing', 'Straight lines, squares, circles']
    ]
  },
  {
    title: 'Pixel Studio · editing',
    keys: [
      ['⌘C / ⌘X / ⌘V', 'Copy / Cut / Paste'],
      ['Arrows (⇧ = 8px)', 'Nudge the selection'],
      ['⇧H / ⇧V', 'Flip the selection (or layer)'],
      ['⇧R / ⌥⇧R', 'Rotate 90° right / left'],
      ['⌫', 'Clear the selection'],
      ['Enter', 'Drop moved pixels'],
      ['Esc / ⌘D', 'Deselect'],
      [', / .', 'Previous / next frame'],
      ['⇧-click frames', 'Select several frames'],
      ['T', 'Tile preview'],
      ["⌘'", 'Pixel grid'],
      ['+ / − / 0', 'Zoom in / out / fit'],
      ['⌘S / ⇧⌘S', 'Save / Save As'],
      ['⌘N', 'New sprite']
    ]
  },
  {
    title: 'Image Editor',
    keys: [
      ['⌘S / ⇧⌘S', 'Save / Save as Copy'],
      ['Enter', 'Apply crop'],
      ['Esc', 'Cancel crop or tool'],
      ['+ / − / 0', 'Zoom in / out / fit']
    ]
  }
]

export function ShortcutsDialog() {
  const open = useApp((s) => s.showShortcuts)
  const setOpen = useApp((s) => s.setShowShortcuts)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, setOpen])

  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="modal shortcuts-dialog" role="dialog" aria-labelledby="shortcuts-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="shortcuts-head">
          <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
          <button className="icon-btn" onClick={() => setOpen(false)} title="Close (Esc)">
            ×
          </button>
        </div>
        <div className="shortcuts-grid">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.keys.map(([key, what]) => (
                  <div key={key + what} className="shortcut-row">
                    <dt>
                      <kbd>{key}</kbd>
                    </dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
