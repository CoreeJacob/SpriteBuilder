import { useEffect, useState } from 'react'
import { findRecovery, type RecoveryOffer } from '@/studio/autosave'

/** On launch, offers back Pixel Studio work that wasn't saved when the app last closed. */
export function RecoveryDialog() {
  const [offer, setOffer] = useState<RecoveryOffer | null>(null)

  useEffect(() => {
    void findRecovery().then(setOffer)
  }, [])

  if (!offer) return null
  const when = new Date(offer.savedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })

  return (
    <div className="modal-backdrop">
      <div className="modal recovery-dialog" role="alertdialog" aria-labelledby="recovery-title">
        <h2 id="recovery-title">Recover unsaved sprite?</h2>
        <p>
          <strong>{offer.name}</strong> <span className="muted">({offer.summary})</span> wasn’t saved when SpriteBuilder last closed.
        </p>
        <p className="muted small">Last autosaved {when}.</p>
        <div className="modal-actions">
          <button
            className="btn"
            onClick={() => {
              offer.discard()
              setOffer(null)
            }}
          >
            Discard
          </button>
          <button
            className="btn primary"
            autoFocus
            onClick={() => {
              offer.restore()
              setOffer(null)
            }}
          >
            Recover
          </button>
        </div>
      </div>
    </div>
  )
}
