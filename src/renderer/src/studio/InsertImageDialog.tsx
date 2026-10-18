import { useState } from 'react'
import { stripExt } from '@shared/paths'
import { itemUrl } from '@/lib/fileUrl'
import { ImageChooser } from '@/library/ImageChooser'
import { insertImage } from './io'
import { useStudio } from './store'

/** Picks a library image to put on a new layer. */
export function InsertImageDialog({ onClose }: { onClose: () => void }) {
  const doc = useStudio((s) => s.doc)!
  const [fit, setFit] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal wide insert-image-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>Insert Image as Layer</h2>
        <p className="muted small">
          It lands on a new layer, centred and selected, so you can drag it into place. Animated images bring their first frame.
        </p>
        <ImageChooser
          onChoose={(item) => {
            if (busy) return
            setBusy(true)
            void insertImage(itemUrl(item), stripExt(item.name), fit).then((ok) => (ok ? onClose() : setBusy(false)))
          }}
        />
        <div className="modal-actions">
          <label className="check">
            <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} />
            Scale down to fit the canvas ({doc.width}×{doc.height})
          </label>
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
