import { useRef } from 'react'
import { Dropdown } from '@/app/Dropdown'
import { Icon } from '@/app/Icon'
import { attempt, useApp } from '@/app/store'
import { lospecSlug, PALETTES, parsePaletteFile, type Palette } from './palettes'
import { useSavedPalettes } from './savedPalettes'
import { useStudio } from './store'

interface Props {
  used: string[]
  swatches: (colors: string[], onRemove?: (c: string) => void) => React.ReactNode
}

export function PalettePanel({ used, swatches }: Props) {
  const doc = useStudio((s) => s.doc)!
  const primary = useStudio((s) => s.primary)
  useStudio((s) => s.version) // palette edits change the doc in place
  const saved = useSavedPalettes((s) => s.list)
  const fileRef = useRef<HTMLInputElement>(null)
  const s = useStudio.getState()
  const app = useApp.getState()

  const builtIn = PALETTES.find((p) => p.name === doc.palette.name)
  const mine = saved.find((p) => p.name === doc.palette.name)
  const value = builtIn ? `b:${builtIn.name}` : mine ? `s:${mine.name}` : ''

  const choose = (v: string): void => {
    const [kind, name] = [v.slice(0, 1), v.slice(2)]
    const p = (kind === 'b' ? PALETTES : saved).find((x) => x.name === name)
    if (p) s.setPalette(p)
  }

  /** Saves a palette to "My palettes" and switches the sprite to it. */
  const keep = async (p: Palette): Promise<void> => {
    if (await useSavedPalettes.getState().save(p)) {
      s.setPalette(p)
      app.notify(`Saved palette “${p.name}” (${p.colors.length} colours)`)
    }
  }

  const saveAs = async (): Promise<void> => {
    const name = await app.ask({
      title: 'Save Palette',
      label: 'Saved palettes appear under “My palettes” for every sprite in this library.',
      value: doc.palette.name.replace(/ \(edited\)$/, ''),
      confirmLabel: 'Save'
    })
    if (name) await keep({ name, colors: doc.palette.colors })
  }

  const importLospec = async (): Promise<void> => {
    const input = await app.ask({
      title: 'Import from Lospec',
      label: 'Paste a link from lospec.com/palette-list, or type the palette’s name (for example “sweetie-16”).',
      value: '',
      confirmLabel: 'Import'
    })
    if (!input) return
    const p = await attempt(() => window.api.fetchLospecPalette(lospecSlug(input)))
    if (p) await keep(p)
  }

  const importFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    try {
      await keep(parsePaletteFile(file.name, await file.text()))
    } catch (err) {
      app.notify((err as Error).message, 'error')
    }
  }

  return (
    <section>
      <div className="panel-heading">
        <span>Palette</span>
        <div className="palette-picker">
          <select className="select small" value={value} onChange={(e) => choose(e.target.value)}>
            {!value && <option value="">{doc.palette.name}</option>}
            <optgroup label="Built in">
              {PALETTES.map((p) => (
                <option key={p.name} value={`b:${p.name}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            {saved.length > 0 && (
              <optgroup label="My palettes">
                {saved.map((p) => (
                  <option key={p.name} value={`s:${p.name}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <Dropdown
            menuClassName="right"
            button={(open, toggle) => (
              <button className={`icon-btn ${open ? 'on' : ''}`} onClick={toggle} title="Save, import or delete palettes">
                <Icon name="more" size={14} />
              </button>
            )}
          >
            {(close) => (
              <>
                <button className="dropdown-item" onClick={() => (close(), void saveAs())}>
                  <Icon name="save" /> Save palette as…
                </button>
                <button className="dropdown-item" onClick={() => (close(), fileRef.current?.click())}>
                  <Icon name="file" /> Import palette file… <span className="muted small">.hex .gpl .pal</span>
                </button>
                <button className="dropdown-item" onClick={() => (close(), void importLospec())}>
                  <Icon name="import" /> Import from Lospec…
                </button>
                {mine && (
                  <>
                    <div className="dropdown-sep" />
                    <button
                      className="dropdown-item danger"
                      onClick={() => {
                        close()
                        if (window.confirm(`Delete the saved palette “${mine.name}”? Sprites using it keep their colours.`)) {
                          void useSavedPalettes.getState().remove(mine.name)
                        }
                      }}
                    >
                      <Icon name="trash" /> Delete “{mine.name}”
                    </button>
                  </>
                )}
              </>
            )}
          </Dropdown>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".hex,.gpl,.pal,.txt"
          hidden
          onChange={(e) => {
            void importFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {swatches(doc.palette.colors, s.removeFromPalette)}
      <div className="palette-actions">
        <button className="btn small" onClick={() => s.addToPalette(primary)} disabled={doc.palette.colors.includes(primary)}>
          <Icon name="plus" size={12} /> Add front colour
        </button>
        {used.length > 0 && (
          <button
            className="btn small"
            onClick={() => s.setPalette({ name: 'Sprite colours', colors: used.slice(0, 64) })}
            title="Replace the palette with the colours used in this sprite"
          >
            From sprite
          </button>
        )}
      </div>
      <p className="muted small">Click: front colour · Right-click: back colour · ⌥-click: remove</p>
    </section>
  )
}
