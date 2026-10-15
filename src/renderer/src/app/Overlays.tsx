import { useEffect, useRef, useState } from 'react'
import { attempt, selectFolders, useApp } from './store'

const NEW_FOLDER = '\u0000new'

export function PromptDialog() {
  const prompt = useApp((s) => s.prompt)
  const closePrompt = useApp((s) => s.closePrompt)
  const folders = useApp(selectFolders)
  const [value, setValue] = useState('')
  const [folder, setFolder] = useState('')
  const [newFolder, setNewFolder] = useState<{ parent: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!prompt) return
    setValue(prompt.value)
    setFolder(prompt.folder ?? '')
    setNewFolder(null)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [prompt])

  if (!prompt) return null
  const withFolder = prompt.folder !== undefined

  const submit = async (): Promise<void> => {
    const name = value.trim()
    if (!name) return
    let target = folder
    if (newFolder) {
      // Make the new folder first, then save into it.
      if (!newFolder.name.trim()) return
      setBusy(true)
      const created = await attempt(() => window.api.createFolder(newFolder.parent, newFolder.name.trim()))
      setBusy(false)
      if (created === undefined) return
      target = created
    }
    closePrompt(name, target)
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => closePrompt(null)}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        onKeyDown={(e) => e.key === 'Escape' && closePrompt(null)}
      >
        <h2>{prompt.title}</h2>
        {prompt.label && <p className="muted">{prompt.label}</p>}
        <input ref={inputRef} className="input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        {withFolder && (
          <label className="field">
            <span>Save in</span>
            <select
              className="select"
              value={newFolder ? NEW_FOLDER : folder}
              onChange={(e) => {
                if (e.target.value === NEW_FOLDER) setNewFolder({ parent: folder, name: '' })
                else {
                  setNewFolder(null)
                  setFolder(e.target.value)
                }
              }}
            >
              <option value="">Library</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {'\u2003'.repeat(f.split('/').length - 1)}
                  {f.split('/').pop()}
                </option>
              ))}
              <option value={NEW_FOLDER}>New folder…</option>
            </select>
          </label>
        )}
        {newFolder && (
          <label className="field">
            <span>New folder inside “{newFolder.parent || 'Library'}”</span>
            <input
              className="input"
              value={newFolder.name}
              placeholder="Folder name"
              autoFocus
              onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })}
            />
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => closePrompt(null)}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !value.trim() || (newFolder !== null && !newFolder.name.trim())}>
            {prompt.confirmLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <button key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.message}
        </button>
      ))}
    </div>
  )
}
