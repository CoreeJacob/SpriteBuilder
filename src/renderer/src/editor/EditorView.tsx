import { Icon } from '@/app/Icon'

const PLANNED = [
  'Crop, resize (pixel-perfect or smooth), rotate and flip',
  'Brightness, contrast, hue and saturation, grayscale, invert',
  'Reduce to N colours and swap one colour for another',
  'Make a colour transparent / remove a background',
  'Slice a sprite sheet into separate frames by grid size'
]

export function EditorView() {
  return (
    <div className="placeholder">
      <Icon name="editor" size={40} />
      <h1>Image Editor</h1>
      <p className="muted">Coming in phase 5. For pixel-level edits now, open a PNG from the Library in Pixel Studio.</p>
      <ul>
        {PLANNED.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  )
}
