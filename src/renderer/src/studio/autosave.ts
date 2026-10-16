// Crash recovery: keeps a copy of unsaved Pixel Studio work, and offers it back on launch.

import { useEffect } from 'react'
import { useApp } from '@/app/store'
import { parseDoc, serializeDoc } from './model'
import { useStudio, type DocLocation } from './store'

const AUTOSAVE_INTERVAL_MS = 15_000

interface RecoveryContent extends DocLocation {
  doc: string // serialized SpriteDoc
}

let lastWrittenVersion = -1

/** Writes the recovery copy if there is unsaved work that hasn't been written yet. */
function autosaveNow(): void {
  const s = useStudio.getState()
  if (!s.doc || !s.dirty || s.version === lastWrittenVersion) return
  lastWrittenVersion = s.version
  const content: RecoveryContent = { doc: serializeDoc(s.doc), name: s.name, folder: s.folder, savedPath: s.savedPath }
  void window.api.writeRecovery(JSON.stringify(content)).catch(() => undefined)
}

export function useStudioAutosave(): void {
  useEffect(() => {
    const timer = setInterval(autosaveNow, AUTOSAVE_INTERVAL_MS)
    // Saved, or thrown away on purpose (a new or reopened sprite starts clean): nothing to recover.
    const offStudio = useStudio.subscribe((state, prev) => {
      if (prev.dirty && !state.dirty) {
        lastWrittenVersion = -1
        void window.api.clearRecovery().catch(() => undefined)
      }
    })
    // Leaving the Studio or the app is a good moment to save a copy.
    const offApp = useApp.subscribe((state, prev) => {
      if (prev.view === 'studio' && state.view !== 'studio') autosaveNow()
    })
    window.addEventListener('blur', autosaveNow)
    return () => {
      clearInterval(timer)
      offStudio()
      offApp()
      window.removeEventListener('blur', autosaveNow)
    }
  }, [])
}

export interface RecoveryOffer {
  savedAt: number
  name: string
  summary: string
  restore: () => void
  discard: () => void
}

/** Checks for work left over from a crash and describes it, or returns null. */
export async function findRecovery(): Promise<RecoveryOffer | null> {
  const found = await window.api.readRecovery().catch(() => null)
  if (!found) return null
  try {
    const content: RecoveryContent = JSON.parse(found.content)
    const doc = parseDoc(content.doc)
    const frames = doc.frames.length
    return {
      savedAt: found.savedAt,
      name: content.name,
      summary: `${doc.width}×${doc.height}${frames > 1 ? ` · ${frames} frames` : ''}${doc.layers.length > 1 ? ` · ${doc.layers.length} layers` : ''}`,
      restore: () => {
        // Never silently replace other unsaved work that's open right now.
        if (useStudio.getState().dirty && !window.confirm('Replace the unsaved sprite that is open now with the recovered one?')) return
        useStudio.getState().loadDoc(doc, { name: content.name, folder: content.folder, savedPath: content.savedPath })
        useStudio.setState({ dirty: true })
        useApp.getState().setView('studio')
      },
      discard: () => void window.api.clearRecovery()
    }
  } catch {
    await window.api.clearRecovery().catch(() => undefined)
    return null
  }
}
