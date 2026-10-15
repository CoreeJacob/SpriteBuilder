import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/app/Icon'
import { sharedFps } from './frames'
import { compositeFrame, type SpriteDoc } from './model'
import { useStudio } from './store'

const FRAME_DRAG_TYPE = 'application/x-spritebuilder-frame'

/** The gap a dragged frame would drop into: before this frame (left half) or after it. */
const dropSlot = (e: React.DragEvent<HTMLElement>, index: number): number => {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientX < rect.left + rect.width / 2 ? index : index + 1
}

/** The frames strip under the canvas. */
export function Timeline() {
  const doc = useStudio((s) => s.doc)!
  const frame = useStudio((s) => s.frame)
  const playing = useStudio((s) => s.playing)
  const onionSkin = useStudio((s) => s.onionSkin)
  useStudio((s) => s.version) // frames change in place; re-render on every edit
  const [drop, setDrop] = useState<number | null>(null)
  const s = useStudio.getState()

  const count = doc.frames.length
  const fps = sharedFps(doc)
  const current = doc.frames[frame]

  return (
    <div className="timeline">
      <div className="timeline-bar">
        <button className={`icon-btn ${playing ? 'on' : ''}`} onClick={s.togglePlaying} title={playing ? 'Stop the preview' : 'Play the animation in the preview'}>
          <Icon name={playing ? 'stop' : 'play'} />
        </button>
        <button className="icon-btn" onClick={() => s.stepFrame(-1)} disabled={count < 2} title="Previous frame (,)">
          <Icon name="prevFrame" />
        </button>
        <button className="icon-btn" onClick={() => s.stepFrame(1)} disabled={count < 2} title="Next frame (.)">
          <Icon name="nextFrame" />
        </button>
        <span className="frame-counter">
          Frame {frame + 1} / {count}
        </span>

        <div className="timeline-sep" />

        <label className="timeline-field" title="Speed for every frame (frames per second)">
          FPS
          <NumberInput value={fps ?? ''} placeholder="mixed" min={1} max={60} onCommit={(v) => s.setFps(v)} />
        </label>
        <label className="timeline-field" title="How long this frame shows, in milliseconds">
          This frame
          <NumberInput value={current.duration} min={10} max={10000} onCommit={(v) => s.setFrameDuration(frame, v)} />
          ms
        </label>

        <div className="timeline-sep" />

        <button className={`btn small ${onionSkin ? 'on' : ''}`} onClick={s.toggleOnionSkin} title="Show the previous (red) and next (blue) frames faintly while drawing">
          <Icon name="onion" size={14} /> Onion skin
        </button>

        <div className="spacer" />

        <button className="icon-btn" onClick={s.addFrame} title="New empty frame after this one">
          <Icon name="plus" />
        </button>
        <button className="icon-btn" onClick={s.duplicateFrame} title="Duplicate this frame (a good start for the next pose)">
          <Icon name="copy" />
        </button>
        <button
          className="icon-btn"
          onClick={() => window.confirm(`Delete frame ${frame + 1}? (You can undo this.)`) && s.deleteFrame()}
          disabled={count < 2}
          title="Delete this frame"
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="frames" onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrop(null)}>
        {doc.frames.map((f, i) => (
          <div
            key={f.id}
            className={`frame-cell ${i === frame ? 'active' : ''} ${drop === i ? 'drop-before' : ''} ${drop === count && i === count - 1 ? 'drop-after' : ''}`}
            onClick={() => s.setFrame(i)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(FRAME_DRAG_TYPE, String(i))
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(FRAME_DRAG_TYPE)) return
              e.preventDefault()
              const slot = dropSlot(e, i)
              if (slot !== drop) setDrop(slot)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const raw = e.dataTransfer.getData(FRAME_DRAG_TYPE)
              const slot = dropSlot(e, i)
              // A slot is a gap between frames; moving right past yourself shifts the gap by one.
              if (raw !== '') {
                const from = Number(raw)
                s.moveFrame(from, slot > from ? slot - 1 : slot)
              }
              setDrop(null)
            }}
            onDragEnd={() => setDrop(null)}
            title={`Frame ${i + 1} · ${f.duration} ms · drag to reorder`}
          >
            <FrameThumb doc={doc} index={i} />
            <span className="frame-number">{i + 1}</span>
          </div>
        ))}
        <button className="frame-add" onClick={() => (s.setFrame(count - 1), s.addFrame())} title="Add a frame at the end">
          <Icon name="plus" />
        </button>
      </div>
    </div>
  )
}

function FrameThumb({ doc, index }: { doc: SpriteDoc; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const version = useStudio((s) => s.version)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !doc.frames[index]) return
    canvas.width = doc.width
    canvas.height = doc.height
    canvas.getContext('2d')!.putImageData(new ImageData(compositeFrame(doc, index), doc.width, doc.height), 0, 0)
  }, [doc, index, version])
  return <canvas ref={ref} className="frame-thumb checker" />
}

/** A number box that applies its value on Enter or when it loses focus. */
function NumberInput(props: {
  value: number | ''
  min: number
  max: number
  placeholder?: string
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(props.value))
  useEffect(() => setDraft(String(props.value)), [props.value])
  const commit = (): void => {
    const n = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(n) && n !== props.value) props.onCommit(Math.max(props.min, Math.min(props.max, n)))
    else setDraft(String(props.value))
  }
  return (
    <input
      className="input number"
      type="number"
      min={props.min}
      max={props.max}
      value={draft}
      placeholder={props.placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}
