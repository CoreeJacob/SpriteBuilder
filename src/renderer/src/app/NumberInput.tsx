import { useEffect, useRef, useState } from 'react'

/**
 * A whole-number box. It applies its value on Enter or when it loses focus, or with `live` as soon
 * as what's typed is a number (so previews follow along). Values are kept within min–max.
 * ↑/↓ step by 1 and ⇧↑/⇧↓ by 10; Esc puts back the value it had before.
 */
export function NumberInput({
  value,
  min,
  max,
  onCommit,
  live = false,
  placeholder,
  className = 'input number',
  title
}: {
  value: number | ''
  min: number
  max: number
  onCommit: (value: number) => void
  live?: boolean
  placeholder?: string
  className?: string
  title?: string
}) {
  const [draft, setDraft] = useState(String(value))
  const before = useRef<number | ''>(value)
  useEffect(() => setDraft(String(value)), [value])

  const parse = (text: string): number | null => {
    const n = Number(text)
    return text.trim() !== '' && Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n))) : null
  }
  const apply = (n: number | null): void => {
    if (n !== null && n !== value) onCommit(n)
  }

  return (
    <input
      className={className}
      type="number"
      min={min}
      max={max}
      step={1}
      value={draft}
      placeholder={placeholder}
      title={title}
      onFocus={() => (before.current = value)}
      onChange={(e) => {
        setDraft(e.target.value)
        if (live) apply(parse(e.target.value))
      }}
      onBlur={() => {
        const n = parse(draft)
        apply(n)
        // Tidy what's shown: "013" becomes 13, and anything that isn't a number goes back.
        setDraft(String(n ?? value))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          e.preventDefault()
          if (before.current !== '' && before.current !== value) onCommit(before.current)
          setDraft(String(before.current))
          e.currentTarget.blur()
        } else if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          const n = parse(String((parse(draft) ?? (value === '' ? min : value)) + (e.key === 'ArrowUp' ? 10 : -10)))
          setDraft(String(n))
          if (live) apply(n)
        }
      }}
    />
  )
}
