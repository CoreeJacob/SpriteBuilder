import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/app/Icon'
import type { SpriteDoc } from './model'
import { useStudio } from './store'

export function LayersPanel() {
  const doc = useStudio((s) => s.doc)!
  const layerId = useStudio((s) => s.layerId)
  useStudio((s) => s.version) // layers change in place; re-render on every edit
  const [editing, setEditing] = useState<string | null>(null)
  const finishOpacity = useRef<(() => void) | null>(null)
  const s = useStudio.getState()

  const index = doc.layers.findIndex((l) => l.id === layerId)
  const active = doc.layers[index]
  const single = doc.layers.length === 1

  const rename = (id: string, name: string): void => {
    setEditing(null)
    if (name.trim()) s.renameLayer(id, name)
  }

  return (
    <section>
      <div className="panel-heading">
        <span>Layers</span>
        <div className="layer-actions">
          <button className="icon-btn" onClick={s.addLayer} title="New layer above this one">
            <Icon name="plus" size={14} />
          </button>
          <button className="icon-btn" onClick={s.duplicateLayer} title="Duplicate layer">
            <Icon name="copy" size={14} />
          </button>
          <button className="icon-btn" onClick={() => s.moveLayer(1)} disabled={index === doc.layers.length - 1} title="Move layer up">
            <Icon name="arrowUp" size={14} />
          </button>
          <button className="icon-btn" onClick={() => s.moveLayer(-1)} disabled={index <= 0} title="Move layer down">
            <Icon name="arrowDown" size={14} />
          </button>
          <button className="icon-btn" onClick={s.mergeDown} disabled={index <= 0} title="Merge into the layer below">
            <Icon name="merge" size={14} />
          </button>
          <button
            className="icon-btn"
            onClick={() => window.confirm(`Delete "${active?.name}"? (You can undo this.)`) && s.deleteLayer()}
            disabled={single}
            title="Delete layer"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      <div className="layers">
        {[...doc.layers].reverse().map((layer) => (
          <div
            key={layer.id}
            className={`layer-row ${layer.id === layerId ? 'active' : ''} ${layer.visible ? '' : 'hidden-layer'}`}
            onClick={() => s.setActiveLayer(layer.id)}
            onDoubleClick={() => setEditing(layer.id)}
          >
            <button
              className="icon-btn eye"
              onClick={(e) => {
                e.stopPropagation()
                s.toggleLayerVisible(layer.id)
              }}
              title={layer.visible ? 'Hide layer' : 'Show layer'}
            >
              <Icon name={layer.visible ? 'eye' : 'eyeOff'} size={14} />
            </button>
            <LayerThumb doc={doc} layerId={layer.id} />
            {editing === layer.id ? (
              <input
                className="input layer-name-input"
                defaultValue={layer.name}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => rename(layer.id, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditing(null)
                }}
              />
            ) : (
              <span className="layer-name" title="Double-click to rename">
                {layer.name}
              </span>
            )}
            {layer.opacity < 1 && <span className="muted small">{Math.round(layer.opacity * 100)}%</span>}
          </div>
        ))}
      </div>

      {active && (
        <label className="opacity-row">
          <span className="muted small">Opacity</span>
          <input
            className="slider"
            type="range"
            min={0}
            max={100}
            value={Math.round(active.opacity * 100)}
            onPointerDown={() => (finishOpacity.current = s.beginLayerChange())}
            onPointerUp={() => {
              finishOpacity.current?.()
              finishOpacity.current = null
            }}
            onChange={(e) => s.setLayerOpacity(active.id, Number(e.target.value) / 100)}
          />
          <span className="small opacity-value">{Math.round(active.opacity * 100)}%</span>
        </label>
      )}
    </section>
  )
}

function LayerThumb({ doc, layerId }: { doc: SpriteDoc; layerId: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const version = useStudio((s) => s.version)
  useEffect(() => {
    const cel = doc.frames[0]?.cels[layerId]
    const canvas = ref.current
    if (!cel || !canvas) return
    canvas.width = doc.width
    canvas.height = doc.height
    canvas.getContext('2d')!.putImageData(new ImageData(cel.slice() as Uint8ClampedArray<ArrayBuffer>, doc.width, doc.height), 0, 0)
  }, [doc, layerId, version])
  return <canvas ref={ref} className="layer-thumb checker" />
}
