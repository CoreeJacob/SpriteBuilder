import { useEffect, useRef, useState } from 'react'
import { useApp } from './store'

export function PromptDialog() {
  const prompt = useApp((s) => s.prompt)
  const closePrompt = useApp((s) => s.closePrompt)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!prompt) return
    setValue(prompt.value)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [prompt])

  if (!prompt) return null
  const submit = (): void => closePrompt(value.trim() ? value.trim() : null)

  return (
    <div className="modal-backdrop" onMouseDown={() => closePrompt(null)}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onKeyDown={(e) => e.key === 'Escape' && closePrompt(null)}
      >
        <h2>{prompt.title}</h2>
        {prompt.label && <p className="muted">{prompt.label}</p>}
        <input ref={inputRef} className="input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => closePrompt(null)}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!value.trim()}>
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
